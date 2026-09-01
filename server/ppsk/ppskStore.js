/**
 * Postgres store for AURA PPSK / MPSK identities.
 *
 * Same resilience contract as the identity store: without DATABASE_URL, or after
 * a schema failure, ready() returns false and the router degrades to 503 rather
 * than crashing. DDL is lazy-ensured because deployed images do not carry
 * migrations/ (canonical copy: migrations/0014_ppsk.sql — keep in sync).
 *
 * The passphrase is held encrypted (ppskCrypto). Nothing in a row is personal
 * data — a PPSK identity is an operational credential, so it is always kept.
 */

import crypto from 'crypto';
import { getPool, isDatabaseConfigured } from '../db/pool.js';
import { encryptPassphrase, decryptPassphrase } from './ppskCrypto.js';
import { keyidFor } from './pmk.js';

const PPSK_SCHEMA_LOCK_KEY = '8270119004461014';

const DDL = `
CREATE TABLE IF NOT EXISTS ppsk_identities (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  description          text,
  ssid                 text NOT NULL,
  keyid                text NOT NULL,
  passphrase_encrypted text NOT NULL,
  role                 text,
  vlan_id              integer,
  scope                text NOT NULL DEFAULT 'global',
  scope_ref            text,
  enabled              boolean NOT NULL DEFAULT true,
  expires_at           timestamptz,
  max_devices          integer,
  last_used_at         timestamptz,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- 0015 fields (twin of migrations/0015_ppsk_identity_fields.sql)
ALTER TABLE ppsk_identities
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS usage         text NOT NULL DEFAULT 'multi',
  ADD COLUMN IF NOT EXISTS mac_mode      text,
  ADD COLUMN IF NOT EXISTS mac           text,
  ADD COLUMN IF NOT EXISTS notify        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_locally boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppsk_ssid_keyid ON ppsk_identities (ssid, keyid);
CREATE INDEX IF NOT EXISTS idx_ppsk_ssid_enabled ON ppsk_identities (ssid, enabled);
CREATE INDEX IF NOT EXISTS idx_ppsk_created ON ppsk_identities (created_at DESC);
`;

let schemaPromise = null;
let disabled = false;

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [PPSK_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [PPSK_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[PPSK] ⚠  Persistence disabled — schema setup failed: ${error.message}`);
    });
  }
  await schemaPromise;
  return !disabled;
}

/** True when persistence is available (used by the router to answer 503). */
export async function isReady() {
  return ready();
}

/**
 * Public shape of an identity. The passphrase is NEVER included here — it is
 * revealed only through the audited reveal path. `hasPassphrase` is always true
 * (the column is NOT NULL) but is surfaced so the UI need not special-case it.
 */
function rowToIdentity(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    email: row.email ?? null,
    ssid: row.ssid,
    keyid: row.keyid,
    hasPassphrase: Boolean(row.passphrase_encrypted),
    role: row.role,
    vlanId: row.vlan_id,
    usage: row.usage ?? 'multi',
    macMode: row.mac_mode ?? null,
    mac: row.mac ?? null,
    notify: row.notify ?? false,
    storeLocally: row.store_locally ?? false,
    scope: row.scope,
    scopeRef: row.scope_ref,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    maxDevices: row.max_devices,
    lastUsedAt: row.last_used_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listIdentities({ ssid = null } = {}) {
  if (!(await ready())) return null; // null == persistence unavailable (→ 503)
  const { rows } = ssid
    ? await getPool().query(
        'SELECT * FROM ppsk_identities WHERE ssid = $1 ORDER BY created_at DESC',
        [ssid]
      )
    : await getPool().query('SELECT * FROM ppsk_identities ORDER BY created_at DESC');
  return rows.map(rowToIdentity);
}

export async function getIdentity(id) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query('SELECT * FROM ppsk_identities WHERE id = $1', [id]);
  return rows[0] ? rowToIdentity(rows[0]) : null;
}

/** Decrypt and return the plaintext passphrase for one identity (audited caller). */
export async function revealPassphrase(id) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    'SELECT passphrase_encrypted FROM ppsk_identities WHERE id = $1',
    [id]
  );
  if (!rows[0]) return null;
  return decryptPassphrase(rows[0].passphrase_encrypted);
}

function newId() {
  return `ppsk_${crypto.randomBytes(9).toString('base64url')}`;
}

export async function createIdentity(input) {
  if (!(await ready())) return null;
  const id = newId();
  const keyid = keyidFor(input.keyid || input.name);
  const { rows } = await getPool().query(
    `INSERT INTO ppsk_identities
       (id, name, description, email, ssid, keyid, passphrase_encrypted, role, vlan_id,
        usage, mac_mode, mac, notify, store_locally,
        scope, scope_ref, enabled, expires_at, max_devices, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      id,
      input.name,
      input.description ?? null,
      input.email ?? null,
      input.ssid,
      keyid,
      encryptPassphrase(input.passphrase),
      input.role ?? null,
      input.vlanId ?? null,
      input.usage ?? 'multi',
      input.macMode ?? null,
      input.mac ?? null,
      input.notify ?? false,
      input.storeLocally ?? false,
      input.scope ?? 'global',
      input.scopeRef ?? null,
      input.enabled ?? true,
      input.expiresAt ?? null,
      input.maxDevices ?? null,
      input.createdBy ?? null,
    ]
  );
  return rowToIdentity(rows[0]);
}

/**
 * Partial update. Only the passphrase re-encrypts (when a new one is supplied);
 * every other field is COALESCE-guarded so an omitted field is left untouched.
 * `enabled` is passed explicitly (not COALESCE) so it can be toggled to false.
 */
export async function updateIdentity(id, patch) {
  if (!(await ready())) return null;
  const encrypted = patch.passphrase != null ? encryptPassphrase(patch.passphrase) : null;
  const keyid = patch.keyid != null || patch.name != null
    ? keyidFor(patch.keyid || patch.name)
    : null;
  const { rows } = await getPool().query(
    `UPDATE ppsk_identities SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       ssid = COALESCE($4, ssid),
       keyid = COALESCE($5, keyid),
       passphrase_encrypted = COALESCE($6, passphrase_encrypted),
       role = COALESCE($7, role),
       vlan_id = COALESCE($8, vlan_id),
       scope = COALESCE($9, scope),
       scope_ref = COALESCE($10, scope_ref),
       enabled = COALESCE($11, enabled),
       -- An explicit expiresAt in the patch (including null) replaces the
       -- stored value; an absent one keeps it. COALESCE alone made expiry
       -- impossible to clear.
       expires_at = CASE WHEN $20 THEN $12 ELSE expires_at END,
       max_devices = COALESCE($13, max_devices),
       email = COALESCE($14, email),
       usage = COALESCE($15, usage),
       mac_mode = COALESCE($16, mac_mode),
       mac = COALESCE($17, mac),
       notify = COALESCE($18, notify),
       store_locally = COALESCE($19, store_locally),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name ?? null,
      patch.description ?? null,
      patch.ssid ?? null,
      keyid,
      encrypted,
      patch.role ?? null,
      patch.vlanId ?? null,
      patch.scope ?? null,
      patch.scopeRef ?? null,
      patch.enabled ?? null,
      patch.expiresAt ?? null,
      patch.maxDevices ?? null,
      patch.email ?? null,
      patch.usage ?? null,
      patch.macMode ?? null,
      patch.mac ?? null,
      patch.notify ?? null,
      patch.storeLocally ?? null,
      'expiresAt' in patch,
    ]
  );
  return rows[0] ? rowToIdentity(rows[0]) : null;
}

export async function deleteIdentity(id) {
  if (!(await ready())) return null;
  const { rowCount } = await getPool().query('DELETE FROM ppsk_identities WHERE id = $1', [id]);
  return rowCount > 0;
}

/**
 * The live entries to render into a wpa_psk_file for one SSID: enabled and
 * unexpired, with their decrypted passphrases. This is the only other place a
 * passphrase is decrypted, and it never returns it to a browser — it feeds
 * renderPskFile server-side.
 */
export async function liveEntriesForSsid(ssid) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    `SELECT keyid, passphrase_encrypted, vlan_id FROM ppsk_identities
     WHERE ssid = $1 AND enabled = true
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY keyid`,
    [ssid]
  );
  return rows.map((r) => ({
    keyid: r.keyid,
    passphrase: decryptPassphrase(r.passphrase_encrypted),
    vlanId: r.vlan_id,
  }));
}
