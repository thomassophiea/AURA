/**
 * Harness for database integration tests.
 *
 * These tests need a real PostgreSQL — the behaviour under test IS the SQL
 * (upsert conflict inference, generated columns, advisory locks). A mocked
 * client would only assert that we send the strings we send.
 *
 * When TEST_DATABASE_URL is absent the suites SKIP LOUDLY rather than passing
 * vacuously, so "green" never means "we did not check".
 *
 *   TEST_DATABASE_URL=postgres://localhost/aura_test npm test
 */

import { runMigrations } from '../../db/migrate.js';
import { query, closePool } from '../../db/pool.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? null;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

/** Reason string shown when suites skip, so the gap is visible in output. */
export const SKIP_REASON =
  'TEST_DATABASE_URL is not set — database integration tests were NOT run. ' +
  'Set it to a disposable PostgreSQL to exercise them.';

/** Point the pool at the test database and apply migrations. */
export async function setupTestDatabase() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  await runMigrations({ logger: { log: () => undefined } });
}

/** Remove all monitoring rows between tests. Order respects foreign keys. */
export async function truncateMonitoringTables() {
  await query(`
    TRUNCATE
      metric_samples,
      current_metric_state,
      collection_cursors,
      collection_runs,
      monitored_source_credentials,
      collector_leases,
      monitored_sources
    RESTART IDENTITY CASCADE
  `);
}

export async function teardownTestDatabase() {
  await closePool();
}

/** Insert a source directly, bypassing the repository under test. */
export async function seedSource(overrides = {}) {
  const {
    baseUrl = `https://ctrl-${Math.random().toString(36).slice(2, 10)}.example.com`,
    orgId = 'org-1',
    siteGroupId = 'sg-1',
    displayName = 'Test Controller',
    enabled = true,
  } = overrides;

  const { rows } = await query(
    `INSERT INTO monitored_sources (org_id, site_group_id, display_name, base_url, enabled)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, base_url`,
    [orgId, siteGroupId, displayName, baseUrl, enabled]
  );
  return { id: rows[0].id, baseUrl: rows[0].base_url };
}

/** Build a well-formed sample; override only what a test cares about. */
export function makeSample(overrides = {}) {
  const collectedAt = overrides.collectedAt ?? new Date('2026-08-05T12:00:00.000Z');
  return {
    monitoredSourceId: overrides.monitoredSourceId,
    orgId: 'org-1',
    siteGroupId: 'sg-1',
    siteId: 'site-1',
    deviceExternalId: null,
    radioExternalId: null,
    wlanExternalId: null,
    clientExternalId: null,
    metricFamily: 'sle',
    metricName: 'coverage',
    observedAt: new Date('2026-08-05T12:00:00.000Z'),
    bucketStart: null,
    bucketEnd: null,
    numericValue: 95,
    numerator: 19,
    denominator: 20,
    sampleCount: 20,
    unit: '%',
    metricKind: 'percentage',
    dimensions: {},
    qualityState: 'observed',
    collectedAt,
    expiresAt: new Date(collectedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}
