/**
 * Collector orchestration.
 *
 * Per tick:
 *   load enabled sources -> for each, in parallel up to maxConcurrency:
 *     take a PostgreSQL advisory lock (cross-instance, not an in-process mutex,
 *       because Railway may run several collectors)
 *     -> run each collector
 *     -> persist samples transactionally, upsert current state
 *     -> advance cursors, record the run, update source health
 *
 * Failure containment is the point: one unreachable gateway must not stop the
 * others, and a failed poll must write no samples at all — a gap is correct, a
 * zero is a lie.
 */

import { withAdvisoryLock } from '../db/pool.js';
import { insertSamples, upsertCurrentState } from './sampleRepository.js';
import {
  listSources,
  recordAttempt,
  recordSuccess,
  recordFailure,
  startRun,
  finishRun,
  recordSkippedRun,
  getCursor,
  advanceCursor,
  mergeCapabilities,
  getSourceCredentials,
} from './sourceRepository.js';
import { getSession } from './controllerClient.js';
import { sanitizeError } from './errorSanitizer.js';
import { collectSle, COLLECTOR_NAME as SLE_COLLECTOR } from './collectors/sleCollector.js';
import {
  collectSiteReports,
  COLLECTOR_NAME as SITE_COLLECTOR,
  buildVenueEndpoint,
} from './collectors/siteReportCollector.js';
import {
  collectApReports,
  COLLECTOR_NAME as AP_COLLECTOR,
} from './collectors/apReportCollector.js';
import { probeDurations, capabilitiesAreStale } from './backfill.js';

const LOCK_PREFIX = 'aura:monitoring:source:';

/**
 * Bounded exponential backoff with full jitter.
 *
 * Jitter matters with several sources failing at once (a whole site down):
 * without it they all retry in lockstep and hammer the network on recovery.
 */
export function computeBackoffSeconds(consecutiveFailures, { baseSeconds, maxSeconds, random = Math.random }) {
  if (consecutiveFailures <= 0) return 0;
  const exponential = baseSeconds * 2 ** Math.min(consecutiveFailures - 1, 16);
  const capped = Math.min(exponential, maxSeconds);
  return Math.round(capped * (0.5 + random() * 0.5));
}

/** True when a source is still inside its backoff window. */
export function shouldSkipForBackoff(source, { now, baseSeconds, maxSeconds, random = Math.random }) {
  if (!source.consecutiveFailures || source.consecutiveFailures <= 0) return false;
  if (!source.lastFailureAt) return false;
  const waitSeconds = computeBackoffSeconds(source.consecutiveFailures, {
    baseSeconds,
    maxSeconds,
    random,
  });
  const readyAt = new Date(source.lastFailureAt).getTime() + waitSeconds * 1000;
  return now.getTime() < readyAt;
}

/** Run `tasks` with at most `limit` in flight. Never rejects. */
export async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function log(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/**
 * Re-probe which `duration` windows a source supports, at most daily.
 * Failures here are non-fatal — the source keeps its previous capabilities.
 */
async function refreshCapabilities(session, source, now) {
  if (!capabilitiesAreStale(source.capabilities, now)) return source.capabilities;

  const probeSiteId = source.capabilities?.probeSiteId ?? null;
  if (!probeSiteId) return source.capabilities;

  const probed = await probeDurations(async (duration) => {
    const result = await session.get(buildVenueEndpoint(probeSiteId, duration, 60));
    return { ok: result.ok, status: result.status };
  });

  const merged = { ...probed, durationsProbedAt: now.toISOString() };
  await mergeCapabilities(source.id, merged);
  log('info', 'monitoring.capabilities_probed', {
    sourceId: source.id,
    durations: probed.durations,
  });
  return { ...source.capabilities, ...merged };
}

/**
 * Poll one source. Never throws: every outcome is recorded and returned.
 *
 * @returns {Promise<{ sourceId: string, status: string, inserted: number,
 *                     updated: number, partialFailures: number }>}
 */
export async function collectSource({ source, config, now = new Date(), deps = {} }) {
  const {
    getSessionFn = getSession,
    getCredentialsFn = getSourceCredentials,
    insertSamplesFn = insertSamples,
    upsertCurrentStateFn = upsertCurrentState,
    getCursorFn = getCursor,
    advanceCursorFn = advanceCursor,
    startRunFn = startRun,
    finishRunFn = finishRun,
    recordAttemptFn = recordAttempt,
    recordSuccessFn = recordSuccess,
    recordFailureFn = recordFailure,
    refreshCapabilitiesFn = refreshCapabilities,
  } = deps;

  const startedAt = Date.now();
  await recordAttemptFn(source.id, now);

  let credentials = null;
  try {
    credentials = await getCredentialsFn(source.id, config.credentialKey);
  } catch (error) {
    const { errorClass, summary } = sanitizeError(error);
    await recordFailureFn(source.id, { errorCode: errorClass, summary, failedAt: now });
    log('error', 'monitoring.credentials_unreadable', { sourceId: source.id, errorClass });
    return { sourceId: source.id, status: 'failed', inserted: 0, updated: 0, partialFailures: 0 };
  }

  // Fall back to the env service account for the default controller.
  const username =
    credentials?.username ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerUsername : null);
  const password =
    credentials?.password ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerPassword : null);

  if (!username || !password) {
    await recordFailureFn(source.id, {
      errorCode: 'not_configured',
      summary: 'No credentials are configured for this source; collection cannot run.',
      failedAt: now,
    });
    log('error', 'monitoring.source_not_configured', { sourceId: source.id });
    return { sourceId: source.id, status: 'failed', inserted: 0, updated: 0, partialFailures: 0 };
  }

  const session = getSessionFn(source.id, {
    baseUrl: source.baseUrl,
    username,
    password,
    timeoutMs: config.requestTimeoutSeconds * 1000,
  });

  let capabilities = source.capabilities;
  try {
    capabilities = await refreshCapabilitiesFn(session, source, now);
  } catch {
    // Probing is best-effort; keep whatever we knew before.
  }
  const sourceWithCapabilities = { ...source, capabilities };

  const readCursor = (family, scope) => getCursorFn(source.id, family, scope);

  const collectors = [
    { name: SLE_COLLECTOR, run: () => collectSle({ session, source: sourceWithCapabilities, config, now }) },
    {
      name: SITE_COLLECTOR,
      run: () =>
        collectSiteReports({
          session,
          source: sourceWithCapabilities,
          config,
          now,
          getCursor: readCursor,
        }),
    },
  ];

  if (config.apReportsEnabled) {
    collectors.push({
      name: AP_COLLECTOR,
      run: () =>
        collectApReports({
          session,
          source: sourceWithCapabilities,
          config,
          now,
          getCursor: readCursor,
        }),
    });
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalPartial = 0;
  let anySucceeded = false;
  let anyFailed = false;
  let lastError = null;

  for (const collector of collectors) {
    const run = await startRunFn({ sourceId: source.id, collectorName: collector.name });
    const collectorStarted = Date.now();

    try {
      const result = await collector.run();

      if (result.fatal) {
        anyFailed = true;
        lastError = result.fatal;
        await finishRunFn(run.id, {
          status: result.fatal.errorClass === 'timeout' ? 'timed_out' : 'failed',
          responseStatus: result.fatal.status ?? null,
          durationMs: Date.now() - collectorStarted,
          errorClass: result.fatal.errorClass,
          sanitizedErrorMessage: result.fatal.summary,
        });
        log('error', 'monitoring.collector_failed', {
          sourceId: source.id,
          collector: collector.name,
          errorClass: result.fatal.errorClass,
        });
        continue;
      }

      const samples = result.samples ?? [];
      let persisted = { inserted: 0, updated: 0, received: samples.length };
      if (samples.length > 0) {
        persisted = await insertSamplesFn(samples, { runId: run.id });
        await upsertCurrentStateFn(samples);
      }

      for (const advance of result.cursorAdvances ?? []) {
        await advanceCursorFn(
          source.id,
          advance.metricFamily,
          advance.scopeKey,
          advance.lastObservedAt
        );
      }

      totalInserted += persisted.inserted;
      totalUpdated += persisted.updated;
      totalPartial += (result.partialFailures ?? []).length;
      anySucceeded = true;

      const partialCount = (result.partialFailures ?? []).length;
      await finishRunFn(run.id, {
        status: partialCount > 0 ? 'partial' : 'succeeded',
        responseStatus: 200,
        recordsReceived: persisted.received,
        recordsInserted: persisted.inserted,
        recordsUpdated: persisted.updated,
        durationMs: Date.now() - collectorStarted,
        errorClass: partialCount > 0 ? 'partial' : null,
        sanitizedErrorMessage:
          partialCount > 0 ? `${partialCount} scope(s) failed within this collection.` : null,
      });

      for (const gap of result.unrecoverableGaps ?? []) {
        log('info', 'monitoring.unrecoverable_gap', {
          sourceId: source.id,
          scope: gap.scope,
          from: gap.from,
          to: gap.to,
        });
      }
      for (const note of result.notes ?? []) {
        log('info', 'monitoring.collector_note', {
          sourceId: source.id,
          collector: collector.name,
          note,
        });
      }
    } catch (error) {
      anyFailed = true;
      const sanitized = sanitizeError(error);
      lastError = sanitized;
      await finishRunFn(run.id, {
        status: 'failed',
        durationMs: Date.now() - collectorStarted,
        errorClass: sanitized.errorClass,
        sanitizedErrorMessage: sanitized.summary,
      }).catch(() => undefined);
      log('error', 'monitoring.collector_threw', {
        sourceId: source.id,
        collector: collector.name,
        errorClass: sanitized.errorClass,
      });
    }
  }

  if (anySucceeded) {
    await recordSuccessFn(source.id, now);
  } else {
    await recordFailureFn(source.id, {
      errorCode: lastError?.errorClass ?? 'unknown',
      summary: lastError?.summary ?? 'All collectors failed for this source.',
      failedAt: now,
    });
  }

  const status = anySucceeded ? (anyFailed || totalPartial > 0 ? 'partial' : 'succeeded') : 'failed';

  log(anySucceeded ? 'info' : 'error', 'monitoring.source_collected', {
    sourceId: source.id,
    status,
    inserted: totalInserted,
    updated: totalUpdated,
    partialFailures: totalPartial,
    durationMs: Date.now() - startedAt,
  });

  return {
    sourceId: source.id,
    status,
    inserted: totalInserted,
    updated: totalUpdated,
    partialFailures: totalPartial,
  };
}

/**
 * One collection tick across all enabled sources.
 *
 * @returns {Promise<{ sources: number, collected: number, skipped: number, failed: number }>}
 */
export async function runCollectionTick({ config, now = new Date(), deps = {} }) {
  const {
    listSourcesFn = listSources,
    collectSourceFn = collectSource,
    withLockFn = withAdvisoryLock,
    recordSkippedRunFn = recordSkippedRun,
    random = Math.random,
  } = deps;

  const sources = await listSourcesFn({ enabledOnly: true });
  if (sources.length === 0) {
    log('info', 'monitoring.tick_no_sources', {});
    return { sources: 0, collected: 0, skipped: 0, failed: 0 };
  }

  let collected = 0;
  let skipped = 0;
  let failed = 0;

  const tasks = sources.map((source) => async () => {
    if (
      shouldSkipForBackoff(source, {
        now,
        baseSeconds: config.failureBackoffSeconds,
        maxSeconds: config.maxBackoffSeconds,
        random,
      })
    ) {
      skipped += 1;
      log('info', 'monitoring.source_backoff', {
        sourceId: source.id,
        consecutiveFailures: source.consecutiveFailures,
      });
      return;
    }

    // Cross-instance mutual exclusion. A duplicate worker gets `acquired: false`
    // and records the skip instead of double-ingesting.
    const outcome = await withLockFn(`${LOCK_PREFIX}${source.id}`, async () =>
      collectSourceFn({ source, config, now })
    );

    if (!outcome.acquired) {
      skipped += 1;
      await recordSkippedRunFn({ sourceId: source.id, collectorName: 'runner' }).catch(
        () => undefined
      );
      log('info', 'monitoring.source_locked_elsewhere', { sourceId: source.id });
      return;
    }

    if (outcome.result?.status === 'failed') failed += 1;
    else collected += 1;
  });

  const results = await runWithConcurrency(tasks, config.maxConcurrency);

  // A task that threw is a bug in the runner, not a source failure — surface it
  // rather than swallowing it, but never let it stop the other sources.
  for (const result of results) {
    if (result?.status === 'rejected') {
      failed += 1;
      const sanitized = sanitizeError(result.reason);
      log('error', 'monitoring.tick_task_threw', { errorClass: sanitized.errorClass });
    }
  }

  log('info', 'monitoring.tick_complete', {
    sources: sources.length,
    collected,
    skipped,
    failed,
  });
  return { sources: sources.length, collected, skipped, failed };
}

/**
 * Long-running collector loop. Used by worker.js and by the optional
 * in-process collector in server.js.
 */
export function startCollector({ config, deps = {} }) {
  let timer = null;
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await runCollectionTick({ config, now: new Date(), deps });
    } catch (error) {
      // The loop must survive anything, including the database being down.
      const sanitized = sanitizeError(error);
      log('error', 'monitoring.tick_failed', { errorClass: sanitized.errorClass });
    } finally {
      running = false;
    }
  }

  tick();
  timer = setInterval(tick, config.pollIntervalSeconds * 1000);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    triggerNow: tick,
  };
}
