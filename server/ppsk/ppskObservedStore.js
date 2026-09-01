/**
 * Store for OBSERVED PPSK identity — the live MAC -> keyid binding.
 *
 * Campus OS does not report which PPSK key a station used, so AURA's Clients
 * "Username" is blank for PPSK clients. An out-of-band collector reads the
 * mapping from the APs and posts it here (upsert by MAC); the Clients view
 * overlays it. Rows age out — a mapping older than STALE_MS is not returned, so
 * a client that reconnects with a different key isn't shown under a stale one.
 *
 * This is the observability stopgap; the clean fix is the controller reporting
 * the keyid into the station userName. DDL is lazy-ensured (deployed images do
 * not carry migrations/ — canonical copy: migrations/0016_ppsk_observed.sql).
 */

import { getPool, isDatabaseConfigured } from '../db/pool.js';

const OBSERVED_SCHEMA_LOCK_KEY = '8270119004461016';
const STALE_MS = 30 * 60 * 1000; // 30 minutes

const DDL = `
CREATE TABLE IF NOT EXISTS ppsk_observed (
  mac       text PRIMARY KEY,
  keyid     text NOT NULL,
  ssid      text,
  ap_name   text,
  source    text,
  seen_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppsk_observed_seen ON ppsk_observed (seen_at DESC);
`;

let schemaPromise = null;
let disabled = false;

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [OBSERVED_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [OBSERVED_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[PPSK] ⚠  Observed-identity persistence disabled: ${error.message}`);
    });
  }
  await schemaPromise;
  return !disabled;
}

export async function isReady() {
  return ready();
}

function canonicalMac(mac) {
  return String(mac || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .replace(/(.{2})(?=.)/g, '$1:');
}

/** Upsert a batch of {mac, keyid, ssid, apName} observations. Returns count stored. */
export async function recordObservations(observations, { source = null } = {}) {
  if (!(await ready())) return null;
  let stored = 0;
  for (const o of observations) {
    const mac = canonicalMac(o.mac);
    if (!mac || mac.length !== 17 || !o.keyid) continue;
    await getPool().query(
      `INSERT INTO ppsk_observed (mac, keyid, ssid, ap_name, source, seen_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (mac) DO UPDATE SET
         keyid = EXCLUDED.keyid, ssid = EXCLUDED.ssid, ap_name = EXCLUDED.ap_name,
         source = EXCLUDED.source, seen_at = now()`,
      [mac, String(o.keyid), o.ssid ?? null, o.apName ?? o.ap ?? null, source]
    );
    stored += 1;
  }
  return stored;
}

/** Current non-stale MAC -> observation map. Prunes stale rows as a side effect. */
export async function getObservedMap() {
  if (!(await ready())) return null;
  await getPool()
    .query('DELETE FROM ppsk_observed WHERE seen_at < now() - ($1 || \' milliseconds\')::interval', [
      String(STALE_MS),
    ])
    .catch(() => undefined);
  const { rows } = await getPool().query(
    'SELECT mac, keyid, ssid, ap_name, seen_at FROM ppsk_observed ORDER BY seen_at DESC'
  );
  const map = {};
  for (const r of rows) {
    map[r.mac] = { keyid: r.keyid, ssid: r.ssid, apName: r.ap_name, seenAt: r.seen_at };
  }
  return map;
}
