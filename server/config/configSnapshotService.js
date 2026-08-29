/**
 * Configuration snapshots, point-in-time diffs, and compliance history.
 *
 * A snapshot is the controller's key configuration surfaces (WLANs, networks,
 * AAA policies, profiles, sites) captured as JSON with a hash per section.
 * Snapshots are taken nightly (advisory-locked so only one instance takes it)
 * and on demand; diffing two snapshots names what was added, removed, and
 * changed per section. Compliance history stores the Best Practices score so
 * posture is a trend.
 *
 * Same resilience contract as the other repositories: no DATABASE_URL means
 * no-ops, and DDL is lazy-ensured (canonical copy: migrations/0012).
 */

import crypto from 'node:crypto';
import { getPool, isDatabaseConfigured } from '../db/pool.js';

const CONFIG_SCHEMA_LOCK_KEY = '8270119004461012';
const NIGHTLY_LOCK_KEY = '8270119004461013';
const SNAPSHOTS_KEPT = 90;
const COMPLIANCE_KEPT_DAYS = 180;

/** The configuration surfaces a snapshot captures, in display order. */
export const SNAPSHOT_SECTIONS = [
  { key: 'wlans', path: '/v1/services', label: 'WLANs / Services' },
  { key: 'networks', path: '/v1/topologies', label: 'Networks / Topologies' },
  { key: 'aaaPolicies', path: '/v1/aaapolicy', label: 'AAA Policies' },
  { key: 'profiles', path: '/v3/profiles', label: 'Device Profiles' },
  { key: 'sites', path: '/v3/sites', label: 'Sites' },
];

const DDL = `
CREATE TABLE IF NOT EXISTS config_snapshots (
  id             bigserial PRIMARY KEY,
  source_base_url text NOT NULL,
  taken_at       timestamptz NOT NULL DEFAULT now(),
  kind           text NOT NULL DEFAULT 'scheduled',
  taken_by       text,
  sections       jsonb NOT NULL,
  section_hashes jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_snapshots_source_time
  ON config_snapshots (source_base_url, taken_at DESC);
CREATE TABLE IF NOT EXISTS compliance_history (
  id             bigserial PRIMARY KEY,
  source_base_url text NOT NULL,
  at             timestamptz NOT NULL DEFAULT now(),
  good           integer NOT NULL,
  warning        integer NOT NULL,
  error          integer NOT NULL,
  score          numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_history_source_time
  ON compliance_history (source_base_url, at DESC);
`;

let schemaPromise = null;
let disabled = false;

async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [CONFIG_SCHEMA_LOCK_KEY]);
        await client.query(DDL);
      } finally {
        await client
          .query('SELECT pg_advisory_unlock($1)', [CONFIG_SCHEMA_LOCK_KEY])
          .catch(() => undefined);
        client.release();
      }
    })().catch((error) => {
      disabled = true;
      console.warn(`[Config] ⚠  Snapshot persistence disabled: ${error.message}`);
    });
  }
  await schemaPromise;
  return !disabled;
}

// ── Pure helpers (exported for tests) ──

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sectionHash(items) {
  return crypto.createHash('sha256').update(stableStringify(items)).digest('hex').slice(0, 16);
}

function itemKey(item) {
  return String(item?.id ?? item?.name ?? item?.serviceName ?? stableStringify(item).slice(0, 64));
}

export function itemName(item) {
  return String(item?.name ?? item?.serviceName ?? item?.siteName ?? item?.id ?? 'unnamed');
}

/**
 * Which sections have a documented, confirmable write path on the controller
 * (verified against controller-api/openapi-spec.json — see task-5-report.md
 * for the exact paths checked). Restore never writes a section that isn't
 * listed here with the relevant verb set to true.
 */
export const RESTORE_WRITE_SUPPORT = {
  wlans: {
    create: true,
    update: true,
    delete: true,
    evidence: 'openapi-spec.json: POST /v1/services; PUT/DELETE /v1/services/{serviceId}',
  },
  networks: {
    create: true,
    update: true,
    delete: true,
    evidence: 'openapi-spec.json: POST /v1/topologies; PUT/DELETE /v1/topologies/{topologyId}',
  },
  aaaPolicies: {
    create: true,
    update: true,
    delete: true,
    evidence: 'openapi-spec.json: POST /v1/aaapolicy; PUT/DELETE /v1/aaapolicy/{id}',
  },
  profiles: {
    create: true,
    update: true,
    delete: true,
    evidence: 'openapi-spec.json: POST /v3/profiles; PUT/DELETE /v3/profiles/{profileId}',
  },
  sites: {
    create: true,
    update: true,
    delete: true,
    evidence: 'openapi-spec.json: POST /v3/sites; PUT/DELETE /v3/sites/{siteId}',
  },
};

/**
 * Compute what would change if `currentSections` were restored to match
 * `targetSections` — the same item keying diffSections uses (id ?? name ??
 * serviceName), so an item that only reordered keys is never reported as a
 * change. Pure: no I/O, deterministic for a given input.
 *
 * `items` on each section carries the raw objects an apply step needs: the
 * target's version of every create/update, and the current version of every
 * delete (its id is what a DELETE call needs — the target no longer has it).
 */
export function computeRestorePlan(currentSections, targetSections, { sections: sectionFilter } = {}) {
  const wanted =
    Array.isArray(sectionFilter) && sectionFilter.length > 0 ? new Set(sectionFilter) : null;
  const plan = [];
  for (const { key, label } of SNAPSHOT_SECTIONS) {
    if (wanted && !wanted.has(key)) continue;
    const currentItems = Array.isArray(currentSections?.[key]) ? currentSections[key] : [];
    const targetItems = Array.isArray(targetSections?.[key]) ? targetSections[key] : [];
    const currentByKey = new Map(currentItems.map((i) => [itemKey(i), i]));
    const targetByKey = new Map(targetItems.map((i) => [itemKey(i), i]));

    const toCreate = [];
    const toUpdate = [];
    const toDelete = [];
    const createItems = [];
    const updateItems = [];
    const deleteItems = [];

    for (const [k, item] of targetByKey) {
      if (!currentByKey.has(k)) {
        toCreate.push(itemName(item));
        createItems.push(item);
      } else if (stableStringify(currentByKey.get(k)) !== stableStringify(item)) {
        toUpdate.push(itemName(item));
        updateItems.push(item);
      }
    }
    for (const [k, item] of currentByKey) {
      if (!targetByKey.has(k)) {
        toDelete.push(itemName(item));
        deleteItems.push(item);
      }
    }

    plan.push({
      section: key,
      label,
      toCreate,
      toUpdate,
      toDelete,
      items: { create: createItems, update: updateItems, delete: deleteItems },
    });
  }
  return plan;
}

/**
 * Diff two snapshots' sections. For each section: which items appeared,
 * vanished, or changed (same key, different content) — by name.
 */
export function diffSections(fromSections, toSections) {
  const result = [];
  for (const { key, label } of SNAPSHOT_SECTIONS) {
    const fromItems = Array.isArray(fromSections?.[key]) ? fromSections[key] : [];
    const toItems = Array.isArray(toSections?.[key]) ? toSections[key] : [];
    const fromByKey = new Map(fromItems.map((i) => [itemKey(i), i]));
    const toByKey = new Map(toItems.map((i) => [itemKey(i), i]));

    const added = [];
    const removed = [];
    const changed = [];
    for (const [k, item] of toByKey) {
      if (!fromByKey.has(k)) added.push(itemName(item));
      else if (stableStringify(fromByKey.get(k)) !== stableStringify(item)) {
        changed.push(itemName(item));
      }
    }
    for (const [k, item] of fromByKey) {
      if (!toByKey.has(k)) removed.push(itemName(item));
    }
    result.push({
      section: key,
      label,
      added,
      removed,
      changed,
      unchanged: toItems.length - added.length - changed.length,
    });
  }
  return result;
}

// ── Capture ──

function toArray(data) {
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}

/**
 * Read every SNAPSHOT_SECTIONS surface live through an authenticated
 * controller session, without persisting anything. Shared by the nightly/
 * on-demand snapshot capture and by restore (which needs "current" as a plan
 * input, never stored as a snapshot in its own right).
 */
export async function captureCurrentSections(session) {
  const sections = {};
  const failures = [];
  for (const { key, path } of SNAPSHOT_SECTIONS) {
    const result = await session.get(path);
    if (!result.ok) {
      failures.push(`${key} (${result.errorSummary ?? result.status})`);
      continue;
    }
    sections[key] = toArray(result.data);
  }
  return { sections, failures };
}

/**
 * Capture and store a snapshot through an authenticated controller session
 * (server/monitoring/controllerClient.js ControllerSession).
 */
export async function takeSnapshot(session, { kind = 'scheduled', takenBy = null } = {}) {
  if (!(await ready())) return { ok: false, error: 'persistence unavailable' };

  const { sections, failures } = await captureCurrentSections(session);
  if (Object.keys(sections).length === 0) {
    return { ok: false, error: `no sections captured: ${failures.join(', ')}` };
  }
  const hashes = {};
  for (const key of Object.keys(sections)) {
    hashes[key] = sectionHash(sections[key]);
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO config_snapshots (source_base_url, kind, taken_by, sections, section_hashes)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, taken_at`,
    [session.baseUrl, kind, takenBy, JSON.stringify(sections), JSON.stringify(hashes)]
  );
  // Rolling window per source.
  await pool.query(
    `DELETE FROM config_snapshots WHERE source_base_url = $1 AND id NOT IN (
       SELECT id FROM config_snapshots WHERE source_base_url = $1
       ORDER BY taken_at DESC LIMIT $2
     )`,
    [session.baseUrl, SNAPSHOTS_KEPT]
  );
  return { ok: true, id: rows[0].id, takenAt: rows[0].taken_at, failures };
}

/** Record the current Best Practices posture. */
export async function recordCompliance(session) {
  if (!(await ready())) return { ok: false, error: 'persistence unavailable' };
  const result = await session.get('/v1/bestpractices/evaluate');
  if (!result.ok) return { ok: false, error: result.errorSummary ?? `HTTP ${result.status}` };

  const conditions = Array.isArray(result.data?.conditions) ? result.data.conditions : [];
  let good = 0;
  let warning = 0;
  let error = 0;
  for (const c of conditions) {
    const s = String(c.status ?? '').toLowerCase();
    if (s.includes('error') || s.includes('fail') || s.includes('critical')) error += 1;
    else if (s.includes('warn')) warning += 1;
    else good += 1;
  }
  const total = good + warning + error;
  // Warnings cost half; errors cost full.
  const score = total > 0 ? Math.round(((good + warning * 0.5) / total) * 1000) / 10 : 100;

  await getPool().query(
    `INSERT INTO compliance_history (source_base_url, good, warning, error, score)
     VALUES ($1,$2,$3,$4,$5)`,
    [session.baseUrl, good, warning, error, score]
  );
  await getPool().query(
    `DELETE FROM compliance_history WHERE at < now() - ($1 || ' days')::interval`,
    [COMPLIANCE_KEPT_DAYS]
  );
  return { ok: true, good, warning, error, score };
}

// ── Reads ──

export async function listSnapshots({ limit = 30 } = {}) {
  if (!(await ready())) return [];
  const { rows } = await getPool().query(
    `SELECT id, source_base_url, taken_at, kind, taken_by, section_hashes
     FROM config_snapshots ORDER BY taken_at DESC LIMIT $1`,
    [Math.min(Math.max(1, limit), SNAPSHOTS_KEPT)]
  );
  return rows.map((r) => ({
    id: r.id,
    sourceBaseUrl: r.source_base_url,
    takenAt: r.taken_at,
    kind: r.kind,
    takenBy: r.taken_by,
    sectionHashes: r.section_hashes,
  }));
}

export async function getSnapshot(id) {
  if (!(await ready())) return null;
  const { rows } = await getPool().query('SELECT * FROM config_snapshots WHERE id = $1', [id]);
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    sourceBaseUrl: rows[0].source_base_url,
    takenAt: rows[0].taken_at,
    kind: rows[0].kind,
    takenBy: rows[0].taken_by,
    sections: rows[0].sections,
    sectionHashes: rows[0].section_hashes,
  };
}

export async function getComplianceHistory({ days = 90 } = {}) {
  if (!(await ready())) return [];
  const { rows } = await getPool().query(
    `SELECT source_base_url, at, good, warning, error, score FROM compliance_history
     WHERE at > now() - ($1 || ' days')::interval ORDER BY at ASC`,
    [Math.min(Math.max(1, days), COMPLIANCE_KEPT_DAYS)]
  );
  return rows.map((r) => ({
    sourceBaseUrl: r.source_base_url,
    at: r.at,
    good: r.good,
    warning: r.warning,
    error: r.error,
    score: Number(r.score),
  }));
}

/**
 * Nightly capture: at most one snapshot+compliance run per 20 hours per
 * deployment, guarded by an advisory try-lock so parallel instances don't
 * double-capture. `sessionFactory` returns an authenticated ControllerSession
 * or null.
 */
export function startNightlyCapture(sessionFactory, { intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  const tick = async () => {
    if (!(await ready())) return;
    const client = await getPool().connect();
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [NIGHTLY_LOCK_KEY]);
      if (!lock.rows[0].ok) return;
      try {
        const { rows } = await client.query(
          `SELECT max(taken_at) AS last FROM config_snapshots WHERE kind = 'scheduled'`
        );
        const last = rows[0]?.last ? new Date(rows[0].last).getTime() : 0;
        if (Date.now() - last < 20 * 60 * 60 * 1000) return;

        const session = sessionFactory();
        if (!session) return;
        const snap = await takeSnapshot(session, { kind: 'scheduled' });
        const comp = await recordCompliance(session);
        console.log(
          `[Config] nightly capture: snapshot ${snap.ok ? `#${snap.id}` : `failed (${snap.error})`}, ` +
            `compliance ${comp.ok ? `${comp.score}%` : `failed (${comp.error})`}`
        );
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [NIGHTLY_LOCK_KEY]).catch(() => undefined);
      }
    } catch (error) {
      console.warn(`[Config] nightly capture failed: ${error.message}`);
    } finally {
      client.release();
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  // First capture shortly after boot (give the service account time to mint).
  setTimeout(tick, 30_000).unref?.();
  return () => clearInterval(timer);
}
