/**
 * Refuse to operate on another environment's database.
 *
 * Integration and Production Demo run the same image and differ only by
 * variables, so the realistic accident is not a bug in this repository — it is
 * a `DATABASE_URL` service reference pointed at the wrong Postgres. Nothing
 * else catches that: the connection succeeds, the schema matches, `/health`
 * reports green, and the retention sweep deletes seven days of the *other*
 * environment's history on its next tick.
 *
 * The database carries a stamp (`environment_identity`, migration 0003). Every
 * destructive path checks it against the environment this process declares
 * itself to be. A mismatch throws; it is never downgraded to a warning, because
 * a warning in a cron job that nobody reads is the same as no check at all.
 */

import { query } from './pool.js';
import { resolveEnvironmentName } from '../system/environment.js';

export class EnvironmentMismatchError extends Error {
  constructor(expected, actual) {
    super(
      `Database environment mismatch: this process declares AURA_ENVIRONMENT="${expected}" ` +
        `but the connected database is stamped "${actual}". Refusing to proceed. ` +
        'Check the DATABASE_URL service reference — it is almost certainly pointed at the wrong Postgres.'
    );
    this.name = 'EnvironmentMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Read the stamp.
 *
 * A database with no `environment_identity` table has not been migrated past
 * 0002. That is reported as `{ stamped: false }` rather than thrown: the guard's
 * job is to catch *wrong* environments, and refusing to boot against an
 * un-migrated database would make the migration itself impossible to run.
 *
 * @returns {Promise<{ stamped: boolean, environment: string|null, stampedAt: Date|null, reason?: string }>}
 */
export async function readDatabaseEnvironment({ queryFn = query } = {}) {
  try {
    const { rows } = await queryFn(
      'SELECT environment, stamped_at FROM environment_identity WHERE singleton = true'
    );
    if (rows.length === 0) {
      return { stamped: false, environment: null, stampedAt: null, reason: 'no_row' };
    }
    return {
      stamped: true,
      environment: rows[0].environment,
      stampedAt: rows[0].stamped_at,
    };
  } catch (error) {
    // 42P01 = undefined_table. Anything else is a real database problem and
    // must not be mistaken for "not stamped yet".
    if (error.code === '42P01') {
      return { stamped: false, environment: null, stampedAt: null, reason: 'not_migrated' };
    }
    throw error;
  }
}

/**
 * Throw unless the connected database belongs to this environment.
 *
 * @param {{ expected?: string, queryFn?: Function }} [options]
 * @returns {Promise<{ ok: true, environment: string, stamped: boolean }>}
 * @throws {EnvironmentMismatchError}
 */
export async function assertDatabaseEnvironment({ expected = null, queryFn = query } = {}) {
  const declared = expected ?? resolveEnvironmentName();
  const stamp = await readDatabaseEnvironment({ queryFn });

  if (!stamp.stamped) {
    // Un-migrated: allowed through so `npm run migrate` can create the stamp.
    return { ok: true, environment: declared, stamped: false };
  }

  if (stamp.environment !== declared) {
    throw new EnvironmentMismatchError(declared, stamp.environment);
  }

  return { ok: true, environment: stamp.environment, stamped: true };
}

/**
 * Non-throwing variant for health reporting.
 *
 * `/api/v1/system/dependencies` needs to *show* a mismatch rather than crash on
 * one — an operator diagnosing a misconfigured deploy needs the endpoint to
 * keep answering.
 */
export async function describeDatabaseEnvironment({ queryFn = query } = {}) {
  const declared = resolveEnvironmentName();
  try {
    const stamp = await readDatabaseEnvironment({ queryFn });
    return {
      declared,
      stamped: stamp.stamped,
      databaseEnvironment: stamp.environment,
      stampedAt: stamp.stampedAt ? new Date(stamp.stampedAt).toISOString() : null,
      matches: !stamp.stamped || stamp.environment === declared,
      reason: stamp.reason ?? null,
    };
  } catch (error) {
    return {
      declared,
      stamped: false,
      databaseEnvironment: null,
      stampedAt: null,
      matches: null,
      reason: 'unreachable',
      message: error.message,
    };
  }
}
