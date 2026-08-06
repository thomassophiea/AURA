/**
 * AURA monitoring collector worker.
 *
 * Runs as its own Railway service from the same repository and the same
 * DATABASE_URL as the web service:
 *
 *   npm run collector
 *
 * It holds a PostgreSQL advisory lock per source, so running several replicas —
 * or running this alongside MONITORING_COLLECTOR_IN_PROCESS=true on the web
 * service — cannot double-ingest.
 */

import { loadMonitoringConfig, assertPersistenceReady, describeMonitoringConfig } from './monitoring/config.js';
import { startCollector } from './monitoring/collectorRunner.js';
import { seedDefaultSource } from './monitoring/bootstrap.js';
import { checkDatabaseHealth, closePool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

function log(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

async function main() {
  let config;
  try {
    config = loadMonitoringConfig();
    assertPersistenceReady(config);
  } catch (error) {
    // Fail visibly. A collector with nowhere durable to write is worse than no
    // collector, because the UI would show a running collector and lose data.
    log('error', 'collector.config_invalid', { message: error.message });
    process.exit(1);
    return;
  }

  log('info', 'collector.starting', describeMonitoringConfig(config));

  if (process.env.MONITORING_RUN_MIGRATIONS_ON_BOOT === 'true') {
    const { applied } = await runMigrations();
    log('info', 'collector.migrations_applied', { count: applied.length });
  }

  const health = await checkDatabaseHealth();
  if (!health.ok) {
    log('error', 'collector.database_unavailable', { reason: health.reason });
    process.exit(1);
    return;
  }

  try {
    const seeded = await seedDefaultSource(config);
    if (seeded) log('info', 'collector.default_source_seeded', { sourceId: seeded.id });
  } catch (error) {
    // Seeding is a convenience; a source registered through the API still works.
    log('error', 'collector.seed_failed', { message: error.message });
  }

  if (!config.collectorEnabled) {
    log('info', 'collector.disabled', {
      note: 'MONITORING_COLLECTOR_ENABLED is false; no polling will occur. Stored history is untouched.',
    });
    // Stay alive so Railway does not treat a deliberate pause as a crash loop.
    setInterval(() => undefined, 60_000);
    return;
  }

  const collector = startCollector({ config });
  log('info', 'collector.started', { pollIntervalSeconds: config.pollIntervalSeconds });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', 'collector.shutting_down', { signal });
    await collector.stop();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection must not silently kill collection.
  process.on('unhandledRejection', (reason) => {
    log('error', 'collector.unhandled_rejection', { message: String(reason?.message ?? reason) });
  });
}

main().catch(async (error) => {
  log('error', 'collector.fatal', { message: error.message });
  await closePool();
  process.exit(1);
});
