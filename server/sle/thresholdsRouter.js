/**
 * Per-site SLE threshold persistence.
 *
 * Thresholds define what a service level MEANS — they were localStorage-only,
 * so two people looking at the same site could see different SLE scores.
 * Stored per site key ('all' or a site id) in Postgres, they become an
 * organizational fact every browser shares.
 *
 * Same resilience contract as the sentinel repository: without DATABASE_URL,
 * or after a schema failure, routes answer 503 and the frontend falls back to
 * its local copy. DDL is lazy-ensured because deployed images carry no
 * migrations/ (canonical copy: server/db/migrations/0009_sle_thresholds.sql).
 */

import { Router, json as expressJson } from 'express';
import { getPool, isDatabaseConfigured } from '../db/pool.js';
import { requireRole } from '../identity/identityRouter.js';
import { audit } from '../identity/identityStore.js';

const THRESHOLDS_SCHEMA_LOCK_KEY = '8270119004461009';
const SITE_KEY_RE = /^[A-Za-z0-9:_-]{1,128}$/;

// The SLE metric families the dashboard defines — nothing else is stored.
const ALLOWED_THRESHOLD_KEYS = new Set([
  'timeToConnect',
  'successfulConnects',
  'coverage',
  'roaming',
  'throughput',
  'capacity',
  'apHealth',
]);

/**
 * Thresholds are a flat map of known metric keys to small objects of finite
 * numbers (e.g. { coverage: { rssiMin: -70 } }). Anything else is rejected —
 * this is shared state served back to every browser.
 */
export function validateThresholds(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const entries = Object.entries(body);
  if (entries.length === 0 || entries.length > ALLOWED_THRESHOLD_KEYS.size) return false;
  for (const [key, value] of entries) {
    if (!ALLOWED_THRESHOLD_KEYS.has(key)) return false;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const fields = Object.entries(value);
    if (fields.length > 8) return false;
    for (const [field, fieldValue] of fields) {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(field)) return false;
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) return false;
    }
  }
  return true;
}

const DDL = `
CREATE TABLE IF NOT EXISTS sle_thresholds (
  site_key   text PRIMARY KEY,
  thresholds jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

let schemaPromise = null;
let disabled = false;

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [THRESHOLDS_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [THRESHOLDS_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[SLE] ⚠  Threshold persistence disabled: ${error.message}`);
    });
  }
  await schemaPromise;
  return !disabled;
}

export function createSleThresholdsRouter() {
  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });

  // GET /sle/thresholds/:siteKey — stored thresholds, or null when unset
  router.get('/sle/thresholds/:siteKey', async (req, res) => {
    const { siteKey } = req.params;
    if (!SITE_KEY_RE.test(siteKey)) return res.status(400).json({ error: 'invalid site key' });
    if (!(await ready())) return res.status(503).json({ error: 'persistence unavailable' });
    try {
      const { rows } = await getPool().query(
        'SELECT thresholds, updated_at FROM sle_thresholds WHERE site_key = $1',
        [siteKey]
      );
      res.json({
        siteKey,
        thresholds: rows[0]?.thresholds ?? null,
        updatedAt: rows[0]?.updated_at ?? null,
      });
    } catch (error) {
      // Internal detail stays in the server log, not the response.
      console.warn(`[SLE] threshold read failed: ${error.message}`);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // PUT /sle/thresholds/:siteKey — replace stored thresholds for the site
  router.put('/sle/thresholds/:siteKey', requireRole('operator'), jsonBody, async (req, res) => {
    const { siteKey } = req.params;
    if (!SITE_KEY_RE.test(siteKey)) return res.status(400).json({ error: 'invalid site key' });
    const thresholds = req.body?.thresholds;
    if (!validateThresholds(thresholds)) {
      return res
        .status(400)
        .json({ error: 'thresholds must map known SLE metric keys to objects of finite numbers' });
    }
    if (!(await ready())) return res.status(503).json({ error: 'persistence unavailable' });
    try {
      await getPool().query(
        `INSERT INTO sle_thresholds (site_key, thresholds, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (site_key) DO UPDATE SET
           thresholds = EXCLUDED.thresholds,
           updated_at = now()`,
        [siteKey, JSON.stringify(thresholds)]
      );
      audit('sle.thresholds', {
        actor: req.auraActor,
        source: req.auraActorSource,
        target: siteKey,
      });
      res.json({ ok: true, siteKey });
    } catch (error) {
      // Internal detail stays in the server log, not the response.
      console.warn(`[SLE] threshold write failed: ${error.message}`);
      res.status(500).json({ error: 'internal error' });
    }
  });

  return router;
}
