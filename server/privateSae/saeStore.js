/**
 * Postgres store for AURA Private SAE (WPA3-Personal) credentials and their MAC
 * bindings.
 *
 * Same resilience contract as the PPSK store: without DATABASE_URL, or after a
 * schema failure, isReady() returns false and the router degrades to 503 rather
 * than crashing. DDL is lazy-ensured because deployed images do not carry
 * migrations/ (canonical copy: migrations/0017_private_sae.sql — keep in sync).
 *
 * The passphrase is held encrypted by REUSING server/ppsk/ppskCrypto.js
 * verbatim (AES-256-GCM under PPSK_ENCRYPTION_KEY) — SAE passwords carry the same
 * recoverable-plaintext constraint as PPSK. Nothing in a row is personal data —
 * a SAE credential is an operational credential, so it is always kept.
 */

import crypto from 'crypto';
import { getPool, isDatabaseConfigured } from '../db/pool.js';
import { encryptPassphrase, decryptPassphrase } from '../ppsk/ppskCrypto.js';
import { keyidFor, canonicalMac, DEFAULT_SSID, DEFAULT_AKM } from './saeCredential.js';

const SAE_SCHEMA_LOCK_KEY = '8270119004461017';

const DDL = `
CREATE TABLE IF NOT EXISTS private_sae_credentials (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  description          text,
  email                text,
  ssid                 text NOT NULL DEFAULT 'AURA_PSAE',
  keyid                text NOT NULL,
  passphrase_encrypted text NOT NULL,
  akm                  text NOT NULL DEFAULT 'wpa3-sae',
  role                 text,
  vlan_id              integer,
  usage                text NOT NULL DEFAULT 'multi',
  scope                text NOT NULL DEFAULT 'global',
  scope_ref            text,
  enabled              boolean NOT NULL DEFAULT true,
  expires_at           timestamptz,
  max_devices          integer,
  notify               boolean NOT NULL DEFAULT false,
  store_locally        boolean NOT NULL DEFAULT false,
  last_used_at         timestamptz,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_sae_ssid_keyid ON private_sae_credentials (ssid, keyid);
CREATE INDEX IF NOT EXISTS idx_private_sae_ssid_enabled ON private_sae_credentials (ssid, enabled);
CREATE INDEX IF NOT EXISTS idx_private_sae_created ON private_sae_credentials (created_at DESC);

CREATE TABLE IF NOT EXISTS private_sae_bindings (
  id            text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES private_sae_credentials (id) ON DELETE CASCADE,
  mac           text NOT NULL,
  bound_at      timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz,
  UNIQUE (credential_id, mac)
);
CREATE INDEX IF NOT EXISTS idx_private_sae_bindings_credential ON private_sae_bindings (credential_id);
`;

let schemaPromise = null;
let disabled = false;

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [SAE_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [SAE_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[PrivateSAE] ⚠  Persistence disabled — schema setup failed: ${error.message}`);
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
 * Public shape of a credential. The passphrase is NEVER included here — it is
 * revealed only through the audited reveal path. `bindingCount` is the number of
 * enrolled MACs, surfaced so the grid can show Bound Devices without a second
 * query.
 */
function rowToCredential(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    email: row.email ?? null,
    ssid: row.ssid,
    keyid: row.keyid,
    hasPassphrase: Boolean(row.passphrase_encrypted),
    akm: row.akm ?? DEFAULT_AKM,
    role: row.role ?? null,
    vlanId: row.vlan_id,
    usage: row.usage ?? 'multi',
    scope: row.scope,
    scopeRef: row.scope_ref ?? null,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    maxDevices: row.max_devices,
    notify: row.notify ?? false,
    storeLocally: row.store_locally ?? false,
    bindingCount: row.binding_count != null ? Number(row.binding_count) : 0,
    lastUsedAt: row.last_used_at,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_COUNT = `
  SELECT c.*, (SELECT count(*) FROM private_sae_bindings b WHERE b.credential_id = c.id) AS binding_count
  FROM private_sae_credentials c`;

export async function listCredentials({ ssid = null } = {}) {
  if (!(await ready())) return null; // null == persistence unavailable (→ 503)
  const { rows } = ssid
    ? await getPool().query(`${SELECT_WITH_COUNT} WHERE c.ssid = $1 ORDER BY c.created_at DESC`, [ssid])
    : await getPool().query(`${SELECT_WITH_COUNT} ORDER BY c.created_at DESC`);
  return rows.map(rowToCredential);
}

export async function getCredential(id) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(`${SELECT_WITH_COUNT} WHERE c.id = $1`, [id]);
  return rows[0] ? rowToCredential(rows[0]) : null;
}

/** Decrypt and return the plaintext passphrase for one credential (audited caller). */
export async function revealPassphrase(id) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    'SELECT passphrase_encrypted FROM private_sae_credentials WHERE id = $1',
    [id]
  );
  if (!rows[0]) return null;
  return decryptPassphrase(rows[0].passphrase_encrypted);
}

function newId() {
  return `psae_${crypto.randomBytes(9).toString('base64url')}`;
}
function newBindingId() {
  return `psaeb_${crypto.randomBytes(9).toString('base64url')}`;
}

export async function createCredential(input) {
  if (!(await ready())) return null;
  const id = newId();
  const keyid = keyidFor(input.keyid || input.name);
  const { rows } = await getPool().query(
    `INSERT INTO private_sae_credentials
       (id, name, description, email, ssid, keyid, passphrase_encrypted, akm, role, vlan_id,
        usage, scope, scope_ref, enabled, expires_at, max_devices, notify, store_locally, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      id,
      input.name,
      input.description ?? null,
      input.email ?? null,
      input.ssid ?? DEFAULT_SSID,
      keyid,
      encryptPassphrase(input.passphrase),
      input.akm ?? DEFAULT_AKM,
      input.role ?? null,
      input.vlanId ?? null,
      input.usage ?? 'multi',
      input.scope ?? 'global',
      input.scopeRef ?? null,
      input.enabled ?? true,
      input.expiresAt ?? null,
      input.maxDevices ?? null,
      input.notify ?? false,
      input.storeLocally ?? false,
      input.createdBy ?? null,
    ]
  );
  return rowToCredential({ ...rows[0], binding_count: 0 });
}

/**
 * Partial update. Only the passphrase re-encrypts (when a new one is supplied);
 * every other field is COALESCE-guarded so an omitted field is left untouched.
 * `enabled` is passed explicitly (not COALESCE) so it can be toggled to false.
 */
export async function updateCredential(id, patch) {
  if (!(await ready())) return null;
  const encrypted = patch.passphrase != null ? encryptPassphrase(patch.passphrase) : null;
  const keyid = patch.keyid != null || patch.name != null ? keyidFor(patch.keyid || patch.name) : null;
  const { rows } = await getPool().query(
    `UPDATE private_sae_credentials SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       ssid = COALESCE($4, ssid),
       keyid = COALESCE($5, keyid),
       passphrase_encrypted = COALESCE($6, passphrase_encrypted),
       akm = COALESCE($7, akm),
       role = COALESCE($8, role),
       vlan_id = COALESCE($9, vlan_id),
       usage = COALESCE($10, usage),
       scope = COALESCE($11, scope),
       scope_ref = COALESCE($12, scope_ref),
       enabled = COALESCE($13, enabled),
       -- Explicit expiresAt (including null) replaces; absent keeps.
       expires_at = CASE WHEN $19 THEN $14 ELSE expires_at END,
       max_devices = COALESCE($15, max_devices),
       email = COALESCE($16, email),
       notify = COALESCE($17, notify),
       store_locally = COALESCE($18, store_locally),
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
      patch.akm ?? null,
      patch.role ?? null,
      patch.vlanId ?? null,
      patch.usage ?? null,
      patch.scope ?? null,
      patch.scopeRef ?? null,
      patch.enabled ?? null,
      patch.expiresAt ?? null,
      patch.maxDevices ?? null,
      patch.email ?? null,
      patch.notify ?? null,
      patch.storeLocally ?? null,
      'expiresAt' in patch,
    ]
  );
  if (!rows[0]) return null;
  return getCredential(id);
}

export async function deleteCredential(id) {
  if (!(await ready())) return null;
  const { rowCount } = await getPool().query('DELETE FROM private_sae_credentials WHERE id = $1', [id]);
  return rowCount > 0;
}

// ── Bindings (the MAC→credential selector from enrollment) ──

/** List the MAC bindings for one credential, newest first. */
export async function listBindings(credentialId) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    'SELECT id, credential_id, mac, bound_at, last_seen FROM private_sae_bindings WHERE credential_id = $1 ORDER BY bound_at DESC',
    [credentialId]
  );
  return rows.map((r) => ({
    id: r.id,
    credentialId: r.credential_id,
    mac: r.mac,
    boundAt: r.bound_at,
    lastSeen: r.last_seen,
  }));
}

export async function countBindings(credentialId) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    'SELECT count(*)::int AS n FROM private_sae_bindings WHERE credential_id = $1',
    [credentialId]
  );
  return rows[0]?.n ?? 0;
}

/**
 * Upsert a MAC binding onto a credential. Idempotent by (credential_id, mac):
 * re-enrolling the same MAC refreshes last_seen rather than duplicating. Returns
 * { binding, created } or null if persistence is unavailable.
 */
export async function upsertBinding(credentialId, mac) {
  if (!(await ready())) return null;
  const canonical = canonicalMac(mac);
  if (!canonical) throw Object.assign(new Error('invalid mac'), { code: 'INVALID_MAC' });
  const id = newBindingId();
  const { rows } = await getPool().query(
    `INSERT INTO private_sae_bindings (id, credential_id, mac, bound_at, last_seen)
     VALUES ($1,$2,$3, now(), now())
     ON CONFLICT (credential_id, mac) DO UPDATE SET last_seen = now()
     RETURNING id, credential_id, mac, bound_at, last_seen, (xmax = 0) AS inserted`,
    [id, credentialId, canonical]
  );
  const r = rows[0];
  return {
    created: Boolean(r.inserted),
    binding: { id: r.id, credentialId: r.credential_id, mac: r.mac, boundAt: r.bound_at, lastSeen: r.last_seen },
  };
}

/** Remove one MAC binding from a credential. Returns true if a row was removed. */
export async function deleteBinding(credentialId, mac) {
  if (!(await ready())) return null;
  const canonical = canonicalMac(mac);
  if (!canonical) return false;
  const { rowCount } = await getPool().query(
    'DELETE FROM private_sae_bindings WHERE credential_id = $1 AND mac = $2',
    [credentialId, canonical]
  );
  return rowCount > 0;
}

/**
 * The live entries to render into a sae_password file for one SSID: enabled and
 * unexpired credentials, with their decrypted passphrases and bound MACs. This
 * is the only other place a passphrase is decrypted, and it never returns it to
 * a browser — it feeds renderSaePasswordFile server-side.
 */
export async function liveEntriesForSsid(ssid) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query(
    `SELECT c.id, c.keyid, c.passphrase_encrypted, c.vlan_id,
            COALESCE(array_agg(b.mac ORDER BY b.bound_at) FILTER (WHERE b.mac IS NOT NULL), '{}') AS macs
     FROM private_sae_credentials c
     LEFT JOIN private_sae_bindings b ON b.credential_id = c.id
     WHERE c.ssid = $1 AND c.enabled = true
       AND (c.expires_at IS NULL OR c.expires_at > now())
     GROUP BY c.id
     ORDER BY c.keyid`,
    [ssid]
  );
  return rows.map((r) => ({
    keyid: r.keyid,
    passphrase: decryptPassphrase(r.passphrase_encrypted),
    vlanId: r.vlan_id,
    macs: Array.isArray(r.macs) ? r.macs : [],
  }));
}
