/**
 * Postgres persistence for the Sentinel engine.
 *
 * Every function here is best-effort: without DATABASE_URL (dev), or after a
 * schema failure, calls become no-ops so persistence problems can never take
 * down polling. The engine treats this module as a mirror of its in-memory
 * state — the in-memory store stays authoritative within a process lifetime.
 *
 * The DDL is applied lazily (advisory-locked, idempotent) because deployed
 * images do not carry `migrations/` (see railway.toml); the canonical copy of
 * the schema lives in server/db/migrations/0007_sentinel.sql. Keep in sync.
 */

import { getPool, isDatabaseConfigured } from '../db/pool.js';

// Distinct from the migration runner's lock key.
const SENTINEL_SCHEMA_LOCK_KEY = '8270119004461007';
const TREND_POINTS_KEPT = 100;
// The engine's working set only re-loads recently resolved alerts; the table
// keeps resolved rows far longer so MTTA/MTTR analytics have history.
const HYDRATE_RESOLVED_WINDOW = "interval '30 minutes'";
const RESOLVED_RETENTION = "interval '90 days'";

const DDL = `
CREATE TABLE IF NOT EXISTS sentinel_alerts (
  id            text PRIMARY KEY,
  severity      text NOT NULL,
  check_name    text NOT NULL,
  message       text NOT NULL,
  target        text,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  resolved_at   timestamptz,
  occurrences   integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_active
  ON sentinel_alerts (check_name) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS sentinel_trends (
  id          bigserial PRIMARY KEY,
  check_name  text NOT NULL,
  ts          timestamptz NOT NULL,
  alert_count integer NOT NULL,
  status      text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sentinel_trends_check_ts
  ON sentinel_trends (check_name, ts DESC);
CREATE TABLE IF NOT EXISTS sentinel_config (
  singleton   boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  interval_ms integer,
  site_id     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sentinel_alerts ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE sentinel_alerts ADD COLUMN IF NOT EXISTS acknowledged_by text;
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_min_severity text NOT NULL DEFAULT 'warning';
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_quiet_hours jsonb;
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_escalation jsonb;
`;

let schemaPromise = null;
let disabled = false;

async function ensureSchema() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SENTINEL_SCHEMA_LOCK_KEY]);
    await client.query(DDL);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [SENTINEL_SCHEMA_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}

/**
 * Gate for every operation. Resolves true when the schema is usable. A failed
 * ensure disables persistence for the rest of the process (and logs once)
 * rather than retrying on every poll.
 */
async function ready() {
  if (disabled || !isDatabaseConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = ensureSchema().catch((error) => {
      disabled = true;
      console.warn(`[Sentinel] ⚠  Persistence disabled — schema setup failed: ${error.message}`);
      return null;
    });
  }
  await schemaPromise;
  return !disabled;
}

function rowToAlert(row) {
  return {
    id: row.id,
    severity: row.severity,
    checkName: row.check_name,
    message: row.message,
    target: row.target,
    context: row.context ?? {},
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
    acknowledgedBy: row.acknowledged_by ?? null,
    occurrences: row.occurrences,
  };
}

/**
 * Load everything the engine needs to resume: unpruned alerts, the last trend
 * points per check, and the configured schedule. Returns null when persistence
 * is unavailable.
 */
export async function loadSentinelState() {
  if (!(await ready())) return null;
  const pool = getPool();

  const [alertRows, trendRows, configRows] = await Promise.all([
    pool.query(
      `SELECT * FROM sentinel_alerts
       WHERE resolved_at IS NULL OR resolved_at > now() - ${HYDRATE_RESOLVED_WINDOW}`
    ),
    pool.query(
      `SELECT check_name, ts, alert_count, status FROM (
         SELECT *, row_number() OVER (PARTITION BY check_name ORDER BY ts DESC) AS rn
         FROM sentinel_trends
       ) ranked WHERE rn <= $1 ORDER BY ts ASC`,
      [TREND_POINTS_KEPT]
    ),
    pool.query(
      `SELECT interval_ms, site_id, webhook_url, webhook_min_severity,
              webhook_quiet_hours, webhook_escalation
       FROM sentinel_config WHERE singleton`
    ),
  ]);

  const trends = {};
  for (const row of trendRows.rows) {
    (trends[row.check_name] ??= []).push({
      ts: row.ts.toISOString(),
      alertCount: row.alert_count,
      status: row.status,
    });
  }

  const config = configRows.rows[0]
    ? {
        intervalMs: configRows.rows[0].interval_ms,
        siteId: configRows.rows[0].site_id,
        webhookUrl: configRows.rows[0].webhook_url ?? null,
        webhookMinSeverity: configRows.rows[0].webhook_min_severity ?? 'warning',
        quietHours: configRows.rows[0].webhook_quiet_hours ?? null,
        escalation: configRows.rows[0].webhook_escalation ?? null,
      }
    : null;

  return { alerts: alertRows.rows.map(rowToAlert), trends, config };
}

/**
 * Mirror one completed check cycle: upsert the alerts it produced, resolve the
 * check's rows that were absent this cycle, and prune long-resolved rows.
 */
export async function syncCheckAlerts(checkName, alerts) {
  if (!(await ready())) return;
  const pool = getPool();

  for (const a of alerts) {
    await pool.query(
      `INSERT INTO sentinel_alerts
         (id, severity, check_name, message, target, context,
          first_seen_at, last_seen_at, resolved_at, occurrences,
          acknowledged_at, acknowledged_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         severity = EXCLUDED.severity,
         message = EXCLUDED.message,
         target = EXCLUDED.target,
         context = EXCLUDED.context,
         last_seen_at = EXCLUDED.last_seen_at,
         resolved_at = EXCLUDED.resolved_at,
         occurrences = EXCLUDED.occurrences,
         acknowledged_at = EXCLUDED.acknowledged_at,
         acknowledged_by = EXCLUDED.acknowledged_by`,
      [
        a.id,
        a.severity,
        a.checkName,
        a.message,
        a.target ?? null,
        JSON.stringify(a.context ?? {}),
        a.firstSeenAt,
        a.lastSeenAt,
        a.resolvedAt,
        a.occurrences,
        a.acknowledgedAt ?? null,
        a.acknowledgedBy ?? null,
      ]
    );
  }

  const activeIds = alerts.map((a) => a.id);
  await pool.query(
    `UPDATE sentinel_alerts SET resolved_at = now()
     WHERE check_name = $1 AND resolved_at IS NULL AND NOT (id = ANY($2::text[]))`,
    [checkName, activeIds]
  );
  await pool.query(
    `DELETE FROM sentinel_alerts WHERE resolved_at < now() - ${RESOLVED_RETENTION}`
  );
}

export async function clearAllAlerts() {
  if (!(await ready())) return;
  await getPool().query('DELETE FROM sentinel_alerts');
}

/** Append one trend point and keep only the newest N per check. */
export async function recordTrend(checkName, entry) {
  if (!(await ready())) return;
  const pool = getPool();
  await pool.query(
    'INSERT INTO sentinel_trends (check_name, ts, alert_count, status) VALUES ($1,$2,$3,$4)',
    [checkName, entry.ts, entry.alertCount, entry.status]
  );
  await pool.query(
    `DELETE FROM sentinel_trends WHERE check_name = $1 AND id NOT IN (
       SELECT id FROM sentinel_trends WHERE check_name = $1 ORDER BY ts DESC LIMIT $2
     )`,
    [checkName, TREND_POINTS_KEPT]
  );
}

export async function saveSchedule(intervalMs, siteId) {
  if (!(await ready())) return;
  await getPool().query(
    `INSERT INTO sentinel_config (singleton, interval_ms, site_id, updated_at)
     VALUES (true, $1, $2, now())
     ON CONFLICT (singleton) DO UPDATE SET
       interval_ms = EXCLUDED.interval_ms,
       site_id = EXCLUDED.site_id,
       updated_at = now()`,
    [intervalMs, siteId ?? null]
  );
}

export async function clearSchedule() {
  if (!(await ready())) return;
  // Only the schedule is being forgotten — the webhook survives a stop.
  await getPool().query(
    'UPDATE sentinel_config SET interval_ms = NULL, site_id = NULL, updated_at = now()'
  );
}

/** Persist an acknowledgement change (both directions). */
export async function setAcknowledged(id, acknowledgedAt, acknowledgedBy) {
  if (!(await ready())) return;
  await getPool().query(
    'UPDATE sentinel_alerts SET acknowledged_at = $2, acknowledged_by = $3 WHERE id = $1',
    [id, acknowledgedAt, acknowledgedBy ?? null]
  );
}

export async function saveWebhookUrl(url, minSeverity = 'warning') {
  if (!(await ready())) return;
  await getPool().query(
    `INSERT INTO sentinel_config (singleton, webhook_url, webhook_min_severity, updated_at)
     VALUES (true, $1, $2, now())
     ON CONFLICT (singleton) DO UPDATE SET
       webhook_url = EXCLUDED.webhook_url,
       webhook_min_severity = EXCLUDED.webhook_min_severity,
       updated_at = now()`,
    [url, minSeverity]
  );
}

export async function saveRoutingPolicy(quietHours, escalation) {
  if (!(await ready())) return;
  await getPool().query(
    `INSERT INTO sentinel_config (singleton, webhook_quiet_hours, webhook_escalation, updated_at)
     VALUES (true, $1, $2, now())
     ON CONFLICT (singleton) DO UPDATE SET
       webhook_quiet_hours = EXCLUDED.webhook_quiet_hours,
       webhook_escalation = EXCLUDED.webhook_escalation,
       updated_at = now()`,
    [quietHours ? JSON.stringify(quietHours) : null, escalation ? JSON.stringify(escalation) : null]
  );
}

/**
 * Alert analytics over the retained history: volumes, MTTA (first seen →
 * acknowledged) and MTTR (first seen → resolved), and the noisiest checks and
 * targets. Null when persistence is unavailable.
 */
export async function getAlertAnalytics({ days = 30 } = {}) {
  if (!(await ready())) return null;
  const pool = getPool();
  const window = Math.min(Math.max(1, Number(days) || 30), 90);

  const [totals, timing, byCheck, byTarget] = await Promise.all([
    pool.query(
      `SELECT severity, count(*)::int AS count,
              count(*) FILTER (WHERE resolved_at IS NULL)::int AS open
       FROM sentinel_alerts
       WHERE first_seen_at > now() - ($1 || ' days')::interval AND severity <> 'info'
       GROUP BY severity`,
      [window]
    ),
    pool.query(
      `SELECT
         avg(EXTRACT(EPOCH FROM (acknowledged_at - first_seen_at)))
           FILTER (WHERE acknowledged_at IS NOT NULL) AS mtta_seconds,
         avg(EXTRACT(EPOCH FROM (resolved_at - first_seen_at)))
           FILTER (WHERE resolved_at IS NOT NULL) AS mttr_seconds,
         count(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int AS acknowledged,
         count(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved
       FROM sentinel_alerts
       WHERE first_seen_at > now() - ($1 || ' days')::interval AND severity <> 'info'`,
      [window]
    ),
    pool.query(
      `SELECT check_name, count(*)::int AS count, sum(occurrences)::int AS occurrences
       FROM sentinel_alerts
       WHERE first_seen_at > now() - ($1 || ' days')::interval AND severity <> 'info'
       GROUP BY check_name ORDER BY count DESC LIMIT 5`,
      [window]
    ),
    pool.query(
      `SELECT target, count(*)::int AS count
       FROM sentinel_alerts
       WHERE first_seen_at > now() - ($1 || ' days')::interval
         AND severity <> 'info' AND target IS NOT NULL
       GROUP BY target ORDER BY count DESC LIMIT 5`,
      [window]
    ),
  ]);

  const severityCounts = { critical: 0, warning: 0 };
  let open = 0;
  for (const row of totals.rows) {
    severityCounts[row.severity] = row.count;
    open += row.open;
  }
  const t = timing.rows[0] ?? {};
  return {
    windowDays: window,
    total: (severityCounts.critical ?? 0) + (severityCounts.warning ?? 0),
    bySeverity: severityCounts,
    open,
    acknowledged: t.acknowledged ?? 0,
    resolved: t.resolved ?? 0,
    mttaSeconds: t.mtta_seconds !== null && t.mtta_seconds !== undefined ? Number(t.mtta_seconds) : null,
    mttrSeconds: t.mttr_seconds !== null && t.mttr_seconds !== undefined ? Number(t.mttr_seconds) : null,
    noisiestChecks: byCheck.rows,
    noisiestTargets: byTarget.rows,
  };
}
