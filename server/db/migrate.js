/**
 * Migration runner.
 *
 * Applies every `migrations/NNNN_*.sql` file exactly once, in filename order,
 * recording each in `schema_migrations`. Safe to run concurrently: the whole
 * run is serialized behind a PostgreSQL advisory lock, so several Railway
 * instances booting at the same time cannot double-apply.
 *
 *   npm run migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPool, assertDatabaseConfigured, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

// Arbitrary but fixed: all migration runs contend for this one key.
const MIGRATION_LOCK_KEY = 8_270_119_004_461_001n;

/**
 * List migration files.
 *
 * A missing directory is reported as "nothing to apply" rather than thrown. Some
 * deployment images do not carry `migrations/`, and an absent directory must not
 * be able to fail a process that something else depends on — that turned into a
 * boot crash loop once already. `runMigrations` surfaces it as `missingDir` so
 * callers can still complain loudly.
 */
async function listMigrations(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return entries
    .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Apply all pending migrations.
 *
 * @param {{ dir?: string, logger?: Console }} [options]
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
export async function runMigrations({ dir = MIGRATIONS_DIR, logger = console } = {}) {
  assertDatabaseConfigured();

  const files = await listMigrations(dir);
  if (files === null) {
    logger.warn(
      `[migrate] ⚠  No migrations directory at ${dir}. Nothing was applied. ` +
        'If this is a deployed image, the schema must be migrated separately.'
    );
    return { applied: [], skipped: [], missingDir: true };
  }

  const client = await getPool().connect();
  const applied = [];
  const skipped = [];

  try {
    // Blocking lock, not try-lock: a concurrent booter should wait for the
    // migration to finish rather than start serving against a half-built schema.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY.toString()]);
    await ensureMigrationsTable(client);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((row) => row.name));

    for (const name of files) {
      if (done.has(name)) {
        skipped.push(name);
        continue;
      }
      const sql = await readFile(path.join(dir, name), 'utf8');
      logger.log(`[migrate] applying ${name}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        // Fail the whole run: a partially migrated schema is worse than none.
        throw new Error(`Migration ${name} failed: ${error.message}`);
      }
    }

    return { applied, skipped, missingDir: false };
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY.toString()])
      .catch(() => undefined);
    client.release();
  }
}

// CLI entrypoint: `node server/db/migrate.js`
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(
        `[migrate] done — ${applied.length} applied, ${skipped.length} already present.`
      );
      return closePool();
    })
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error(`[migrate] FAILED: ${error.message}`);
      await closePool();
      process.exit(1);
    });
}
