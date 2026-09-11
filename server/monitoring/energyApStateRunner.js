/**
 * Dedicated fast loop for the measured-power series.
 *
 * WHY THIS IS NOT PART OF THE MAIN COLLECTION TICK (it was, briefly):
 *
 * `startCollector` skips a tick while the previous one is still running. The
 * per-AP report collector issues one request per AP, so on a real fleet a tick
 * comfortably outlasts MONITORING_POLL_INTERVAL_SECONDS. Measured on Integration
 * with 8 APs and a 60s interval, energy samples actually landed every 180-240s.
 *
 * That is fine for a 7-day energy rollup and useless as a measurement
 * instrument: a four-minute experiment produced a single sample per AP, one
 * gap, and therefore no usable treatment window at all. The North/South POC
 * needs a guaranteed cadence, and it is cheap enough to have one — two
 * controller calls per tick for the entire fleet regardless of size.
 *
 * Cross-instance safety is the same advisory-lock pattern the main runner uses,
 * so running this in the worker, in the web process, and in several replicas
 * cannot double-ingest. The identity index on metric_samples makes it idempotent
 * even if it did.
 */

import { withAdvisoryLock } from '../db/pool.js';
import { insertSamples, upsertCurrentState } from './sampleRepository.js';
import { listSources, startRun, finishRun, getSourceCredentials } from './sourceRepository.js';
import { getSession } from './controllerClient.js';
import { sanitizeError } from './errorSanitizer.js';
import { collectEnergyApState, COLLECTOR_NAME } from './collectors/energyApStateCollector.js';

const LOCK_PREFIX = 'aura:energy_ap_state:';

function log(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Controller session from the same durable credentials the main collector uses. */
export async function sessionForSource(source, config) {
  let credentials = null;
  try {
    credentials = await getSourceCredentials(source.id, config.credentialKey);
  } catch {
    credentials = null;
  }
  const username =
    credentials?.username ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerUsername : null);
  const password =
    credentials?.password ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerPassword : null);
  if (!username || !password) return null;
  return getSession(source.id, {
    baseUrl: source.baseUrl,
    username,
    password,
    timeoutMs: config.requestTimeoutSeconds * 1000,
  });
}

/**
 * One pass over every enabled source.
 * Never throws: a failure is recorded and the next tick retries.
 */
export async function runEnergyApStateTick({ config, now = new Date(), deps = {} }) {
  const {
    listSourcesFn = listSources,
    sessionFn = sessionForSource,
    collectFn = collectEnergyApState,
    insertSamplesFn = insertSamples,
    upsertCurrentStateFn = upsertCurrentState,
    startRunFn = startRun,
    finishRunFn = finishRun,
    withLockFn = withAdvisoryLock,
  } = deps;

  const sources = await listSourcesFn({ enabledOnly: true });
  let inserted = 0;
  let failed = 0;
  let skipped = 0;

  for (const source of sources) {
    const outcome = await withLockFn(`${LOCK_PREFIX}${source.id}`, async () => {
      const session = await sessionFn(source, config);
      if (!session) return { skipped: true };

      const run = await startRunFn({ sourceId: source.id, collectorName: COLLECTOR_NAME });
      const started = Date.now();
      try {
        const result = await collectFn({ session, source, config, now });
        if (result.fatal) {
          await finishRunFn(run.id, {
            status: result.fatal.errorClass === 'timeout' ? 'timed_out' : 'failed',
            responseStatus: result.fatal.status ?? null,
            durationMs: Date.now() - started,
            errorClass: result.fatal.errorClass,
            sanitizedErrorMessage: result.fatal.summary,
          });
          return { failed: true };
        }

        let persisted = { inserted: 0, updated: 0, received: result.samples.length };
        if (result.samples.length > 0) {
          persisted = await insertSamplesFn(result.samples, { runId: run.id });
          await upsertCurrentStateFn(result.samples);
        }
        await finishRunFn(run.id, {
          status: 'succeeded',
          responseStatus: 200,
          recordsReceived: persisted.received,
          recordsInserted: persisted.inserted,
          recordsUpdated: persisted.updated,
          durationMs: Date.now() - started,
        });
        for (const note of result.notes ?? []) {
          log('info', 'energy_ap_state.note', { sourceId: source.id, note });
        }
        return { inserted: persisted.inserted };
      } catch (error) {
        const sanitized = sanitizeError(error);
        await finishRunFn(run.id, {
          status: 'failed',
          durationMs: Date.now() - started,
          errorClass: sanitized.errorClass,
          sanitizedErrorMessage: sanitized.summary,
        }).catch(() => undefined);
        return { failed: true };
      }
    });

    if (!outcome.acquired) skipped += 1;
    else if (outcome.result?.failed) failed += 1;
    else if (outcome.result?.skipped) skipped += 1;
    else inserted += outcome.result?.inserted ?? 0;
  }

  return { sources: sources.length, inserted, failed, skipped };
}

/**
 * Start the loop.
 *
 * The interval is deliberately independent of MONITORING_POLL_INTERVAL_SECONDS:
 * this series is the measurement instrument, and its resolution should not
 * change because someone tuned the report collector.
 */
export function startEnergyApStateCollector({ config, deps = {}, unref = false }) {
  const intervalSeconds = config.energyApStateIntervalSeconds ?? 60;
  let timer = null;
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await runEnergyApStateTick({ config, now: new Date(), deps });
    } catch (error) {
      const sanitized = sanitizeError(error);
      log('error', 'energy_ap_state.tick_failed', { errorClass: sanitized.errorClass });
    } finally {
      running = false;
    }
  }

  tick();
  timer = setInterval(tick, intervalSeconds * 1000);
  if (unref && typeof timer.unref === 'function') timer.unref();

  return {
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    triggerNow: tick,
  };
}
