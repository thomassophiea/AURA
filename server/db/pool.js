/**
 * PostgreSQL connection pool for AURA monitoring persistence.
 *
 * PostgreSQL is the authoritative store for the 7-day monitoring/SLE history.
 * There is deliberately no in-memory fallback: in production a missing
 * DATABASE_URL is a hard failure, because silently degrading to volatile
 * storage is exactly the bug this module exists to fix.
 */

import pg from 'pg';

const { Pool } = pg;

/**
 * Timestamps come back as JS Date objects by default, which is what we want.
 * int8 (bigserial ids, COUNT(*)) comes back as a string to avoid precision
 * loss; parse it to a number since our ids and counts stay well under 2^53.
 */
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

let pool = null;
let poolConnectionString = null;

/** True when a DATABASE_URL is available in this process. */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Assert the database is configured. Called at boot by both the web service and
 * the collector worker so a misconfigured production deploy fails visibly
 * instead of running with no persistence.
 */
export function assertDatabaseConfigured({ required = true } = {}) {
  if (isDatabaseConfigured()) return true;
  const message =
    'DATABASE_URL is not set. Monitoring history cannot be persisted. ' +
    'Attach a Railway PostgreSQL service and expose DATABASE_URL to this service.';
  if (required) throw new Error(message);
  console.warn(`[DB] ⚠  ${message}`);
  return false;
}

/**
 * TLS settings for the pool.
 *
 * Certificate verification is never silently disabled. Railway's private
 * network (`*.railway.internal`) and a local Postgres do not speak TLS at all,
 * so those get plain connections over a private link rather than a verified-off
 * TLS session. Anything else keeps pg's verifying defaults; an operator who
 * genuinely needs a relaxed handshake must opt in with PGSSLMODE=no-verify.
 */
function resolveSsl(connectionString) {
  if (process.env.PGSSLMODE === 'disable') return false;
  if (process.env.PGSSLMODE === 'no-verify') {
    console.warn('[DB] ⚠  PGSSLMODE=no-verify — certificate verification is disabled.');
    return { rejectUnauthorized: false };
  }
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const isRailwayInternal = connectionString.includes('.railway.internal');
  if (isLocal || isRailwayInternal) return false;
  return undefined; // let pg/libpq verifying defaults apply
}

/** Lazily create (and memoize) the process-wide pool. */
export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; cannot open a PostgreSQL pool.');
  }

  // Reconnect if the connection string changed (tests swap it per-suite).
  if (pool && poolConnectionString !== connectionString) {
    const stale = pool;
    pool = null;
    stale.end().catch(() => undefined);
  }

  if (!pool) {
    const ssl = resolveSsl(connectionString);
    pool = new Pool({
      connectionString,
      ...(ssl === undefined ? {} : { ssl }),
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 10_000,
      application_name: process.env.DATABASE_APP_NAME || 'aura',
    });
    poolConnectionString = connectionString;

    // An idle client erroring must not take the process down.
    pool.on('error', (err) => {
      console.error('[DB] Idle client error:', err.message);
    });
  }

  return pool;
}

/** Run a parameterized query. Never interpolate values into SQL text. */
export function query(text, params) {
  return getPool().query(text, params);
}

/** Run `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Stable 64-bit key for a PostgreSQL advisory lock.
 *
 * hashtextextended is stable across sessions and servers, which an in-process
 * hash would not be — and cross-instance stability is the whole point, since
 * Railway may run several collectors at once.
 */
async function advisoryKey(client, name) {
  const { rows } = await client.query('SELECT hashtextextended($1, 0) AS key', [name]);
  return rows[0].key;
}

/**
 * Run `fn` while holding an exclusive advisory lock named `name`.
 *
 * Returns `{ acquired: false, result: undefined }` immediately if another
 * process (or instance) already holds it — callers record that as
 * `skipped_due_to_lock` rather than treating it as a failure.
 */
export async function withAdvisoryLock(name, fn) {
  const client = await getPool().connect();
  let acquired = false;
  let key;
  try {
    key = await advisoryKey(client, name);
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [key]);
    acquired = rows[0].locked === true;
    if (!acquired) return { acquired: false, result: undefined };
    const result = await fn(client);
    return { acquired: true, result };
  } finally {
    if (acquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => undefined);
    }
    client.release();
  }
}

/** Cheap readiness probe for /health. Does not touch any controller. */
export async function checkDatabaseHealth() {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const started = Date.now();
    await query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, reason: 'unreachable', message: error.message };
  }
}

/** Close the pool. Used by worker shutdown and test teardown. */
export async function closePool() {
  if (!pool) return;
  const stale = pool;
  pool = null;
  poolConnectionString = null;
  await stale.end().catch(() => undefined);
}
