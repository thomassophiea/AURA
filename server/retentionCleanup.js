#!/usr/bin/env node
/**
 * Retention cleanup, as a one-shot command.
 *
 * Intended for a Railway scheduled service:
 *
 *   Start command:  npm run monitoring:cleanup
 *   Cron schedule:  17 * * * *      (hourly at :17 — avoids midnight pile-ups)
 *
 * Exits 0 on success, including when there was nothing to delete or when
 * another instance held the lock — a scheduled job that legitimately did
 * nothing must not report as failed.
 */

import { loadMonitoringConfig, assertPersistenceReady } from './monitoring/config.js';
import { runRetentionCleanup } from './monitoring/retention.js';
import { closePool } from './db/pool.js';

async function main() {
  const config = loadMonitoringConfig();
  assertPersistenceReady(config);

  const result = await runRetentionCleanup({ config, now: new Date() });

  if (!result.ran) {
    console.log(`[cleanup] no-op (${result.reason}).`);
    return;
  }
  console.log(
    `[cleanup] removed ${result.samplesDeleted} expired sample(s), ` +
      `${result.runsDeleted} old run record(s), ` +
      `${result.orphanedStateDeleted} orphaned state row(s) in ${result.durationMs}ms.`
  );
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`[cleanup] FAILED: ${error.message}`);
    await closePool();
    process.exit(1);
  });
