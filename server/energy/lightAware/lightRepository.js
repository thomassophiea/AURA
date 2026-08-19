// server/energy/lightAware/lightRepository.js
/** SQL for light samples, transitions, observed distribution, and policies. */
import { query, withTransaction } from '../../db/pool.js';

export async function insertSample({ sourceId, apSerial, lux, reportedState, normalizedState, observedAt }) {
  await query(
    `INSERT INTO light_sensor_samples
       (monitored_source_id, ap_serial, lux, reported_state, normalized_state, observed_at)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()))`,
    [sourceId, apSerial, Number.isFinite(lux) ? lux : null, reportedState ?? null, normalizedState, observedAt ?? null]
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
    `SELECT to_state, COALESCE(SUM(dwell_seconds),0)::bigint AS secs
     FROM light_state_transitions
     WHERE monitored_source_id = $1
       AND entered_at >= $2::timestamptz AND entered_at < $3::timestamptz
       AND dwell_seconds IS NOT NULL
       ${siteId ? 'AND ap_serial IN (SELECT DISTINCT device_external_id FROM metric_samples WHERE site_id = $4)' : ''}
     GROUP BY to_state`,
    siteId ? [sourceId, start, end, siteId] : [sourceId, start, end]
  );
  const by = { bright: 0, dim: 0, dark: 0, unknown: 0 };
  for (const r of rows) by[r.to_state] = Number(r.secs);
  const days = Math.max((new Date(end) - new Date(start)) / 86_400_000, 0);
  return { brightSeconds: by.bright, dimSeconds: by.dim, darkSeconds: by.dark, unknownSeconds: by.unknown, days };
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
 * Returns one row per AP that has power data, LEFT JOINed to its open
 * light-state transition. model/apName fall back to the serial when the
 * controller inventory is not mirrored in Postgres.
 *
 * NOTE: This SQL is unverified locally — there is no local Postgres. Tested
 * via injected fakes in router.test.js; real validation needs Integration env.
 *
 * Bind order: $1 sourceId, $2 optional siteId.
 */
export async function listApLightStates({ sourceId, siteId } = {}) {
  const { rows } = await query(
    `SELECT
       ms.device_external_id                        AS serial,
       COALESCE(ms.device_external_id, ms.device_external_id) AS "apName",
       COALESCE(ms.model, ms.device_external_id)   AS model,
       ms.site_id                                   AS "siteId",
       latest.watts,
       row_to_json(lst)                             AS "openTransition"
     FROM (
       SELECT DISTINCT ON (device_external_id)
         device_external_id,
         site_id,
         numeric_value / 1000.0 AS watts,
         model
       FROM metric_samples
       WHERE monitored_source_id = $1
         AND metric_family = 'ap_report'
         AND metric_name = 'apPowerConsumptionTimeseries.power_consumption'
         AND numeric_value IS NOT NULL
         AND ($2::text IS NULL OR site_id = $2)
       ORDER BY device_external_id, observed_at DESC
     ) ms
     CROSS JOIN LATERAL (SELECT ms.device_external_id AS serial, ms.site_id) latest
     LEFT JOIN LATERAL (
       SELECT *
       FROM light_state_transitions lst
       WHERE lst.monitored_source_id = $1
         AND lst.ap_serial = ms.device_external_id
         AND lst.dwell_seconds IS NULL
       ORDER BY lst.entered_at DESC
       LIMIT 1
     ) lst ON true`,
    [sourceId, siteId ?? null]
  );
  return rows;
}
