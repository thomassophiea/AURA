/**
 * Postgres store for the AURA identity layer: users, audit trail, settings.
 *
 * Same resilience contract as the sentinel repository: without DATABASE_URL,
 * or after a schema failure, everything degrades to safe in-memory behavior —
 * users resolve to an implicit admin (the pre-identity behavior), audit writes
 * are dropped with a warning, and settings fall back to an in-process map so a
 * dev environment still works. DDL is lazy-ensured because deployed images do
 * not carry migrations/ (canonical copy: migrations/0010_identity.sql).
 */

import { getPool, isDatabaseConfigured } from '../db/pool.js';

const IDENTITY_SCHEMA_LOCK_KEY = '8270119004461010';

export const ROLES = ['viewer', 'operator', 'admin'];

export function roleAtLeast(role, minRole) {
  return ROLES.indexOf(role) >= ROLES.indexOf(minRole);
}

const DDL = `
CREATE TABLE IF NOT EXISTS aura_users (
  username      text PRIMARY KEY,
  display_name  text,
  email         text,
  role          text NOT NULL DEFAULT 'viewer',
  source        text NOT NULL DEFAULT 'controller',
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS aura_audit_log (
  id       bigserial PRIMARY KEY,
  actor    text,
  source   text,
  action   text NOT NULL,
  target   text,
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aura_audit_at ON aura_audit_log (at DESC);
CREATE TABLE IF NOT EXISTS aura_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
`;

let schemaPromise = null;
let disabled = false;

// In-memory fallbacks for environments without a database.
const memorySettings = new Map();

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [IDENTITY_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [IDENTITY_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[Identity] ⚠  Persistence disabled — schema setup failed: ${error.message}`);
    });
  }
  await schemaPromise;
  return !disabled;
}

// ── Users ──

function rowToUser(row) {
  return {
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    source: row.source,
    disabled: row.disabled,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/**
 * Record a login and return the user's AURA identity, creating it on first
 * sight. A first-seen controller-authenticated user defaults to admin — they
 * hold the controller's own credentials, so pretending they are less would be
 * theater. SSO users default to the configured default role.
 */
export async function upsertLogin({ username, source, displayName, email, defaultRole }) {
  if (!(await ready())) {
    return { username, displayName, email, role: defaultRole ?? 'admin', source, disabled: false };
  }
  const { rows } = await getPool().query(
    `INSERT INTO aura_users (username, display_name, email, role, source, last_login_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (username) DO UPDATE SET
       display_name = COALESCE(EXCLUDED.display_name, aura_users.display_name),
       email = COALESCE(EXCLUDED.email, aura_users.email),
       last_login_at = now()
     RETURNING *`,
    [username, displayName ?? null, email ?? null, defaultRole ?? 'admin', source]
  );
  return rowToUser(rows[0]);
}

export async function getUser(username) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query('SELECT * FROM aura_users WHERE username = $1', [
    username,
  ]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function listUsers() {
  if (!(await ready())) return [];
  const { rows } = await getPool().query('SELECT * FROM aura_users ORDER BY username');
  return rows.map(rowToUser);
}

export async function updateUser(username, { role, disabled: userDisabled }) {
  if (!(await ready())) return null;
  if (role !== undefined && !ROLES.includes(role)) throw new Error(`invalid role: ${role}`);
  const { rows } = await getPool().query(
    `UPDATE aura_users SET
       role = COALESCE($2, role),
       disabled = COALESCE($3, disabled)
     WHERE username = $1 RETURNING *`,
    [username, role ?? null, userDisabled ?? null]
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

// ── Audit ──

/** Fire-and-forget audit write; identity problems never fail the audited action. */
export function audit(action, { actor = null, source = null, target = null, detail = {} } = {}) {
  ready()
    .then((ok) => {
      if (!ok) return;
      return getPool().query(
        'INSERT INTO aura_audit_log (actor, source, action, target, detail) VALUES ($1,$2,$3,$4,$5)',
        [actor, source, action, target, JSON.stringify(detail ?? {})]
      );
    })
    .catch((e) => console.warn(`[Identity] audit write failed: ${e.message}`));
}

export async function listAudit({ limit = 100, action = null } = {}) {
  if (!(await ready())) return [];
  const capped = Math.min(Math.max(1, limit), 500);
  const { rows } = action
    ? await getPool().query(
        'SELECT * FROM aura_audit_log WHERE action = $2 ORDER BY at DESC LIMIT $1',
        [capped, action]
      )
    : await getPool().query('SELECT * FROM aura_audit_log ORDER BY at DESC LIMIT $1', [capped]);
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    source: r.source,
    action: r.action,
    target: r.target,
    detail: r.detail,
    at: r.at,
  }));
}

// ── Settings ──

export async function getSetting(key) {
  if (!(await ready())) return memorySettings.get(key) ?? null;
  const { rows } = await getPool().query('SELECT value FROM aura_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value, updatedBy = null) {
  if (!(await ready())) {
    memorySettings.set(key, value);
    return;
  }
  await getPool().query(
    `INSERT INTO aura_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy]
  );
}
