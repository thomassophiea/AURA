// server/energy/lightAware/lightRepository.js
/** SQL for light samples, transitions, observed distribution, and policies. */
import { query, withTransaction } from '../../db/pool.js';

export async function insertSample({
  sourceId,
  apSerial,
  lux,
  reportedState,
  normalizedState,
  observedAt,
  sampleSource = 'live',
}) {
  await query(
    `INSERT INTO light_sensor_samples
       (monitored_source_id, ap_serial, lux, reported_state, normalized_state, observed_at, sample_source)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()), $7)`,
    [
      sourceId,
      apSerial,
      Number.isFinite(lux) ? lux : null,
      reportedState ?? null,
      normalizedState,
      observedAt ?? null,
      sampleSource === 'simulated' ? 'simulated' : 'live',
    ]
  );
}

export async function getOpenTransition({ sourceId, apSerial }) {
  const { rows } = await query(
    `SELECT * FROM light_state_transitions
     WHERE monitored_source_id = $1 AND ap_serial = $2 AND dwell_seconds IS NULL
     ORDER BY entered_at DESC LIMIT 1`,
    [sourceId, apSerial]
  );
  return rows[0] ?? null;
}

export async function closeAndOpenTransition({ sourceId, apSerial, fromState, toState, enteredAt }) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE light_state_transitions
         SET dwell_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($3::timestamptz - entered_at))::int)
       WHERE monitored_source_id = $1 AND ap_serial = $2 AND dwell_seconds IS NULL`,
      [sourceId, apSerial, enteredAt]
    );
    await client.query(
      `INSERT INTO light_state_transitions
         (monitored_source_id, ap_serial, from_state, to_state, entered_at)
       VALUES ($1,$2,$3,$4,$5::timestamptz)`,
      [sourceId, apSerial, fromState ?? null, toState, enteredAt]
    );
  });
}

export async function getObservedDistribution({ sourceId, siteId, start, end }) {
  // Sum dwell per state for closed transitions within the window.
  const { rows } = await query(
    `WITH scoped AS (
       SELECT to_state, dwell_seconds, ap_serial
       FROM light_state_transitions
       WHERE monitored_source_id = $1
         AND entered_at >= $2::timestamptz AND entered_at < $3::timestamptz
         AND dwell_seconds IS NOT NULL
         ${siteId ? 'AND ap_serial IN (SELECT DISTINCT device_external_id FROM metric_samples WHERE site_id = $4)' : ''}
     )
     SELECT
       to_state,
       COALESCE(SUM(dwell_seconds),0)::bigint AS secs,
       (SELECT COUNT(DISTINCT ap_serial)::int FROM scoped) AS observed_ap_count
     FROM scoped
     GROUP BY to_state`,
    siteId ? [sourceId, start, end, siteId] : [sourceId, start, end]
  );
  const by = { bright: 0, dim: 0, dark: 0, unknown: 0 };
  for (const r of rows) by[r.to_state] = Number(r.secs);
  const days = Math.max((new Date(end) - new Date(start)) / 86_400_000, 0);
  return {
    brightSeconds: by.bright,
    dimSeconds: by.dim,
    darkSeconds: by.dark,
    unknownSeconds: by.unknown,
    days,
    observedApCount: Number(rows[0]?.observed_ap_count ?? 0),
  };
}

export async function getPolicy({ sourceId, siteId }) {
  if (siteId) {
    const { rows } = await query(
      `SELECT * FROM light_aware_policies WHERE monitored_source_id=$1 AND site_id=$2 AND ap_serial IS NULL LIMIT 1`,
      [sourceId, siteId]
    );
    if (rows[0]) return rows[0];
  }
  const { rows } = await query(
    `SELECT * FROM light_aware_policies WHERE monitored_source_id=$1 AND site_id IS NULL AND ap_serial IS NULL LIMIT 1`,
    [sourceId]
  );
  return rows[0] ?? null;
}

export async function upsertPolicy({ sourceId, siteId, enabled, policy }) {
  const { rows } = await query(
    `INSERT INTO light_aware_policies (monitored_source_id, site_id, enabled, policy, updated_at)
     VALUES ($1,$2,$3,$4::jsonb, now())
     ON CONFLICT (monitored_source_id, COALESCE(site_id,''), COALESCE(ap_serial,''))
     DO UPDATE SET enabled = EXCLUDED.enabled, policy = EXCLUDED.policy, updated_at = now()
     RETURNING *`,
    [sourceId, siteId ?? null, !!enabled, JSON.stringify(policy ?? {})]
  );
  return rows[0];
}

/**
 * One row per AP with a RECENT power reading, LEFT JOINed to its open
 * light-state transition.
 *
 * Power is measured-first: the latest `energy_ap_state` `ap.power_watts`
 * sample (W, which also carries the AP model and site name) within
 * `measuredSinceSeconds`; an AP with no recent measured sample falls back to the
 * latest `ap_report` power sample (mW / 1000) within `reportSinceSeconds`.
 *
 * Both reads are time-bounded. This runs on the experiment page's poll, and the
 * unbounded DISTINCT ON it replaced walked every power row ever retained. An AP
 * with no recent reading is absent rather than shown at a stale wattage.
 *
 * `apName` is the serial here; the router resolves real names.
 *
 * Bind order: $1 sourceId, $2 optional siteId, $3 measuredSinceSeconds,
 * $4 reportSinceSeconds.
 */
export const LIGHT_LIST_MEASURED_SINCE_SECONDS = 15 * 60;
export const LIGHT_LIST_REPORT_SINCE_SECONDS = 2 * 60 * 60;

export async function listApLightStates({
  sourceId,
  siteId,
  measuredSinceSeconds = LIGHT_LIST_MEASURED_SINCE_SECONDS,
  reportSinceSeconds = LIGHT_LIST_REPORT_SINCE_SECONDS,
} = {}) {
  const { rows } = await query(
    `WITH measured AS (
       SELECT DISTINCT ON (device_external_id)
         device_external_id,
         site_id,
         numeric_value::float8      AS watts,
         dimensions->>'model'       AS model,
         dimensions->>'siteName'    AS site_name,
         'measured_ap_state'::text  AS source
       FROM metric_samples
       WHERE monitored_source_id = $1
         AND metric_family = 'energy_ap_state'
         AND metric_name = 'ap.power_watts'
         AND observed_at >= now() - ($3::int * interval '1 second')
         AND numeric_value IS NOT NULL
         AND device_external_id IS NOT NULL
         AND ($2::text IS NULL OR site_id = $2)
       ORDER BY device_external_id, observed_at DESC
     ), report AS (
       SELECT DISTINCT ON (device_external_id)
         device_external_id,
         site_id,
         numeric_value / 1000.0     AS watts,
         dimensions->>'model'       AS model,
         NULL::text                 AS site_name,
         'ap_report'::text          AS source
       FROM metric_samples
       WHERE monitored_source_id = $1
         AND metric_family = 'ap_report'
         AND metric_name = 'apPowerConsumptionTimeseries.power_consumption'
         AND observed_at >= now() - ($4::int * interval '1 second')
         AND numeric_value IS NOT NULL
         AND device_external_id IS NOT NULL
         AND ($2::text IS NULL OR site_id = $2)
         AND device_external_id NOT IN (SELECT device_external_id FROM measured)
       ORDER BY device_external_id, observed_at DESC
     ), ms AS (
       SELECT * FROM measured
       UNION ALL
       SELECT * FROM report
     )
     SELECT
       ms.device_external_id                        AS serial,
       ms.device_external_id                        AS "apName",
       COALESCE(ms.model, ms.device_external_id)    AS model,
       ms.site_id                                   AS "siteId",
       ms.site_name                                 AS "siteName",
       ms.watts,
       ms.source,
       row_to_json(lst)                             AS "openTransition"
     FROM ms
     LEFT JOIN LATERAL (
       SELECT *
       FROM light_state_transitions lst
       WHERE lst.monitored_source_id = $1
         AND lst.ap_serial = ms.device_external_id
         AND lst.dwell_seconds IS NULL
       ORDER BY lst.entered_at DESC
       LIMIT 1
     ) lst ON true`,
    [sourceId, siteId ?? null, measuredSinceSeconds, reportSinceSeconds]
  );
  return rows;
}
