/**
 * Retention sweep.
 *
 * Deletes samples past `expires_at`, which the collector stamps from
 * MONITORING_RETENTION_DAYS at write time. Using a stored per-row expiry rather
 * than "now() - N days" at delete time means changing the retention setting
 * only affects newly collected data, so a config typo cannot retroactively
 * destroy history.
 *
 * Idempotent and safe to run while collection is in flight: it batches, and it
 * holds an advisory lock so two cleanup runs never fight.
 */

import { withAdvisoryLock } from '../db/pool.js';
import {
  deleteExpiredSamples,
  deleteOldCollectionRuns,
  deleteOrphanedCurrentState,
} from './sampleRepository.js';

export const CLEANUP_LOCK_KEY = 'aura:monitoring:cleanup';

/** Keep run diagnostics a little longer than samples, then drop them too. */
const RUN_RETENTION_MULTIPLIER = 2;

function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...fields }));
}

/**
 * Schedule the retention sweep on a timer inside a long-running process.
 *
 * For deployments that cannot add a scheduled Railway service. Safe to run
 * alongside a real cron service — the sweep is advisory-locked, so whichever
 * starts second returns `{ ran: false, reason: 'locked' }` and does nothing.
 *
 * @returns {{ stop: () => void, triggerNow: () => Promise<void> }}
 */
export function startRetentionSchedule({ config, deps = {} }) {
  let timer = null;
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      await runRetentionCleanup({ config, now: new Date(), deps });
    } catch (error) {
      // A failed sweep must never take the host process down; the next tick
      // retries, and expired rows simply persist until then.
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'monitoring.cleanup_failed',
          message: error.message,
        })
      );
    } finally {
      running = false;
    }
  }

  // Deliberately not run immediately: boot is the busiest moment, and expired
  // rows can wait one interval.
  timer = setInterval(tick, config.cleanupIntervalSeconds * 1000);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    triggerNow: tick,
  };
}

/**
 * Run one cleanup pass.
 *
 * @returns {Promise<{ ran: boolean, reason?: string, samplesDeleted?: number,
 *                     runsDeleted?: number, orphanedStateDeleted?: number, durationMs?: number }>}
 */
export async function runRetentionCleanup({ config, now = new Date(), deps = {} } = {}) {
  const {
    withLockFn = withAdvisoryLock,
    deleteExpiredSamplesFn = deleteExpiredSamples,
    deleteOldCollectionRunsFn = deleteOldCollectionRuns,
    deleteOrphanedCurrentStateFn = deleteOrphanedCurrentState,
  } = deps;

  if (!config.cleanupEnabled) {
    log('monitoring.cleanup_disabled', {});
    return { ran: false, reason: 'disabled' };
  }

  const started = Date.now();
  const outcome = await withLockFn(CLEANUP_LOCK_KEY, async () => {
    const samples = await deleteExpiredSamplesFn({
      now,
      batchSize: config.cleanupBatchSize,
    });

    const runsCutoff = new Date(
      now.getTime() - config.retentionDays * RUN_RETENTION_MULTIPLIER * 24 * 60 * 60 * 1000
    );
    const runs = await deleteOldCollectionRunsFn({ olderThan: runsCutoff });

    // current_metric_state is NOT expiry-pruned: "last value we ever saw" is
    // what lets the UI say "offline since X" rather than "never collected".
    // Only rows whose source no longer exists are removed.
    const orphaned = await deleteOrphanedCurrentStateFn();

    return {
      samplesDeleted: samples.deleted,
      batches: samples.batches,
      runsDeleted: runs.deleted,
      orphanedStateDeleted: orphaned.deleted,
    };
  });

  if (!outcome.acquired) {
    log('monitoring.cleanup_skipped_locked', {});
    return { ran: false, reason: 'locked' };
  }

  const result = { ran: true, ...outcome.result, durationMs: Date.now() - started };
  log('monitoring.cleanup_complete', result);
  return result;
}
