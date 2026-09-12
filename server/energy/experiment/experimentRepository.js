/**
 * SQL for the Treatment-vs-Control energy experiment.
 *
 * Postgres is the system of record. Every question the UI asks — what happened,
 * when, how much was saved, which APs were touched, what still needs restoring —
 * is answerable from here with no browser state and no in-memory cache.
 *
 * Power is integrated with the same LEAD() gap method energyRepository.js uses,
 * so a 60s cadence and a 300s cadence produce the same kWh and a collector
 * pause is excluded rather than smeared across the gap.
 */

import { query, withTransaction } from '../../db/pool.js';
import { METRIC } from '../../monitoring/collectors/energyApStateCollector.js';

const FAMILY = 'energy_ap_state';

/* ------------------------------------------------------------------ config */

export async function getConfig(sourceId) {
  const { rows } = await query(
    `SELECT * FROM energy_experiment_config WHERE monitored_source_id = $1`,
    [sourceId]
  );
  return rows[0] ?? null;
}

export async function upsertConfig({
  sourceId,
  treatmentSiteId,
  treatmentSiteName,
  controlSiteId,
  controlSiteName,
  darknessThresholdRaw = 3,
  darknessPersistenceSeconds = 120,
  recoveryThresholdRaw = 6,
  recoveryPersistenceSeconds = 60,
  action = { kind: 'disableRadios', radioIndexes: [3], requireZeroClients: true },
  enabled = false,
}) {
  const { rows } = await query(
    `INSERT INTO energy_experiment_config
       (monitored_source_id, treatment_site_id, treatment_site_name, control_site_id, control_site_name,
        darkness_threshold_raw, darkness_persistence_seconds,
        recovery_threshold_raw, recovery_persistence_seconds, action, enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11, now())
     ON CONFLICT (monitored_source_id) DO UPDATE SET
       treatment_site_id = EXCLUDED.treatment_site_id,
       treatment_site_name = EXCLUDED.treatment_site_name,
       control_site_id = EXCLUDED.control_site_id,
       control_site_name = EXCLUDED.control_site_name,
       darkness_threshold_raw = EXCLUDED.darkness_threshold_raw,
       darkness_persistence_seconds = EXCLUDED.darkness_persistence_seconds,
       recovery_threshold_raw = EXCLUDED.recovery_threshold_raw,
       recovery_persistence_seconds = EXCLUDED.recovery_persistence_seconds,
       action = EXCLUDED.action,
       enabled = EXCLUDED.enabled,
       updated_at = now()
     RETURNING *`,
    [
      sourceId, treatmentSiteId ?? null, treatmentSiteName ?? null, controlSiteId ?? null, controlSiteName ?? null,
      darknessThresholdRaw, darknessPersistenceSeconds, recoveryThresholdRaw, recoveryPersistenceSeconds,
      JSON.stringify(action ?? {}), !!enabled,
    ]
  );
  return rows[0];
}

/* -------------------------------------------------------------- experiments */

const ACTIVE_STATES = [
  'collecting_baseline',
  'baseline_established',
  'darkness_detected',
  'optimization_active',
  'recovering',
];

export async function getActiveExperiment(sourceId) {
  const { rows } = await query(
    `SELECT * FROM energy_experiments
     WHERE monitored_source_id = $1 AND state = ANY($2::text[])
     ORDER BY created_at DESC LIMIT 1`,
    [sourceId, ACTIVE_STATES]
  );
  return rows[0] ?? null;
}

export async function getExperiment(id) {
  const { rows } = await query(`SELECT * FROM energy_experiments WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listExperiments(sourceId, limit = 20) {
  const { rows } = await query(
    `SELECT * FROM energy_experiments WHERE monitored_source_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [sourceId, Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return rows;
}

/**
 * Create an experiment and enroll its devices in one transaction. Either the
 * whole allowlist exists or the experiment does not — a half-enrolled
 * experiment would have an incomplete safety boundary.
 */
export async function createExperiment({
  sourceId, name, treatment, control, treatmentDevices, controlDevices, action, startedBy, baselineStart,
}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO energy_experiments
         (monitored_source_id, name, state, treatment_site_id, treatment_site_name,
          control_site_id, control_site_name, baseline_start, action, started_by)
       VALUES ($1,$2,'collecting_baseline',$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING *`,
      [
        sourceId, name, treatment.siteId, treatment.siteName, control.siteId, control.siteName,
        baselineStart ?? new Date().toISOString(), JSON.stringify(action ?? {}), startedBy ?? null,
      ]
    );
    const experiment = rows[0];

    for (const [side, devices] of [['treatment', treatmentDevices], ['control', controlDevices]]) {
      for (const d of devices) {
        await client.query(
          `INSERT INTO energy_experiment_devices
             (experiment_id, side, ap_serial, ap_name, model, site_id, site_name, status_at_enrollment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (experiment_id, ap_serial) DO NOTHING`,
          [
            experiment.id, side, d.serial, d.apName ?? null, d.model ?? null,
            side === 'treatment' ? treatment.siteId : control.siteId,
            d.siteName ?? (side === 'treatment' ? treatment.siteName : control.siteName),
            d.status ?? null,
          ]
        );
      }
    }
    return experiment;
  });
}

export async function updateExperiment(id, patch) {
  const allowed = new Set([
    'state', 'baseline_start', 'baseline_end', 'treatment_start', 'treatment_end',
    'recovery_start', 'ended_at', 'trigger_source', 'controller_writes_applied',
    'baseline_metrics', 'treatment_metrics', 'savings', 'telemetry_quality', 'error_summary',
  ]);
  const sets = [];
  const params = [id];
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    params.push(
      ['baseline_metrics', 'treatment_metrics', 'savings', 'telemetry_quality'].includes(key)
        ? JSON.stringify(value)
        : value
    );
    sets.push(`${key} = $${params.length}${key.endsWith('_metrics') || key === 'savings' || key === 'telemetry_quality' ? '::jsonb' : ''}`);
  }
  if (sets.length === 0) return getExperiment(id);
  const { rows } = await query(
    `UPDATE energy_experiments SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

/**
 * Every period in which this controller had an energy action applied.
 *
 * Used to keep those periods OUT of a baseline: a baseline that overlaps a
 * previous treatment describes the treated state, not normal operation.
 * `recovery_start` is preferred as the end bound because the radios were still
 * down until the restore actually ran.
 */
export async function listTreatmentWindows(sourceId, { excludeExperimentId = null } = {}) {
  const { rows } = await query(
    `SELECT treatment_start AS start,
            COALESCE(treatment_end, ended_at, now()) AS "end"
     FROM energy_experiments
     WHERE monitored_source_id = $1
       AND treatment_start IS NOT NULL
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     ORDER BY treatment_start`,
    [sourceId, excludeExperimentId]
  );
  return rows.map((r) => ({
    start: r.start.toISOString(),
    end: r.end instanceof Date ? r.end.toISOString() : new Date(r.end).toISOString(),
  }));
}

export async function listDevices(experimentId) {
  const { rows } = await query(
    `SELECT side, ap_serial AS "apSerial", ap_name AS "apName", model,
            site_id AS "siteId", site_name AS "siteName",
            status_at_enrollment AS "statusAtEnrollment"
     FROM energy_experiment_devices WHERE experiment_id = $1
     ORDER BY side, ap_serial`,
    [experimentId]
  );
  return rows;
}

/* ----------------------------------------------------------------- rollback */

export async function captureRollback({ experimentId, serial, original, intended }) {
  await query(
    `INSERT INTO energy_experiment_rollback (experiment_id, ap_serial, original, intended)
     VALUES ($1,$2,$3::jsonb,$4::jsonb)
     ON CONFLICT (experiment_id, ap_serial) DO UPDATE
       SET intended = EXCLUDED.intended
     -- The ORIGINAL is never overwritten. A second apply within one experiment
     -- must still roll back to the pre-experiment state, not to the state the
     -- first apply left behind.
     `,
    [experimentId, serial, JSON.stringify(original), JSON.stringify(intended ?? null)]
  );
}

export async function recordApplyResult({ experimentId, serial, verified, error }) {
  await query(
    `UPDATE energy_experiment_rollback
        SET applied_at = now(), apply_verified = $3, apply_error = $4
      WHERE experiment_id = $1 AND ap_serial = $2`,
    [experimentId, serial, !!verified, error ?? null]
  );
}

export async function recordRestoreResult({ experimentId, serial, verified, error }) {
  await query(
    `UPDATE energy_experiment_rollback
        SET restore_attempted_at = now(), restore_verified = $3, restore_error = $4
      WHERE experiment_id = $1 AND ap_serial = $2`,
    [experimentId, serial, !!verified, error ?? null]
  );
}

export async function listRollback(experimentId) {
  const { rows } = await query(
    `SELECT ap_serial AS "apSerial", captured_at AS "capturedAt", original, intended,
            applied_at AS "appliedAt", apply_verified AS "applyVerified", apply_error AS "applyError",
            restore_attempted_at AS "restoreAttemptedAt", restore_verified AS "restoreVerified",
            restore_error AS "restoreError"
     FROM energy_experiment_rollback WHERE experiment_id = $1 ORDER BY ap_serial`,
    [experimentId]
  );
  return rows;
}

/**
 * APs anywhere in this source that were changed and are not confirmed restored,
 * across ALL experiments. This is the query that answers "is any lab AP still
 * left in a state we put it in?" after a restart, and it deliberately ignores
 * experiment state — a 'complete' experiment with an unrestored AP is worse,
 * not better.
 */
export async function listOutstandingRestores(sourceId) {
  const { rows } = await query(
    `SELECT r.experiment_id AS "experimentId", r.ap_serial AS "apSerial", r.original,
            r.applied_at AS "appliedAt", r.restore_attempted_at AS "restoreAttemptedAt",
            r.restore_error AS "restoreError", e.name AS "experimentName", e.state
     FROM energy_experiment_rollback r
     JOIN energy_experiments e ON e.id = r.experiment_id
     WHERE e.monitored_source_id = $1
       AND r.applied_at IS NOT NULL
       AND r.restore_verified = false
     ORDER BY r.applied_at DESC`,
    [sourceId]
  );
  return rows;
}

/* ------------------------------------------------------------------- events */

export async function insertEvent({
  experimentId, sourceId, kind, message, severity = 'info', side = null,
  apSerial = null, detail = {}, provenance = 'live', occurredAt = null,
}) {
  const { rows } = await query(
    `INSERT INTO energy_experiment_events
       (experiment_id, monitored_source_id, occurred_at, kind, severity, side, ap_serial,
        message, detail, provenance)
     VALUES ($1,$2, COALESCE($3::timestamptz, now()), $4,$5,$6,$7,$8,$9::jsonb,$10)
     RETURNING id, occurred_at`,
    [
      experimentId ?? null, sourceId, occurredAt, kind, severity, side, apSerial,
      message, JSON.stringify(detail ?? {}), provenance,
    ]
  );
  return rows[0];
}

export async function listEvents(experimentId, limit = 500) {
  const { rows } = await query(
    `SELECT id, occurred_at AS "occurredAt", kind, severity, side, ap_serial AS "apSerial",
            message, detail, provenance
     FROM energy_experiment_events WHERE experiment_id = $1
     ORDER BY occurred_at ASC, id ASC LIMIT $2`,
    [experimentId, Math.min(Math.max(Number(limit) || 500, 1), 2000)]
  );
  return rows;
}

/* ---------------------------------------------------------------- telemetry */

/**
 * Integrated per-site energy over a window, using the gap-weighted method.
 *
 * Returns per-site totals AND per-AP detail, because a site total alone cannot
 * answer "did Treatment look better only because it has fewer APs?".
 */
export async function fetchSiteEnergy({ sourceId, siteIds, start, end, maxGapSeconds = 900 }) {
  const { rows } = await query(
    `WITH samples AS (
       SELECT site_id, device_external_id, numeric_value AS watts, observed_at,
              dimensions->>'model' AS model,
              EXTRACT(EPOCH FROM (
                LEAD(observed_at) OVER (PARTITION BY device_external_id ORDER BY observed_at) - observed_at
              )) AS elapsed_seconds
       FROM metric_samples
       WHERE monitored_source_id = $1
         AND metric_family = '${FAMILY}'
         AND metric_name = '${METRIC.POWER_WATTS}'
         AND site_id = ANY($2::text[])
         AND observed_at >= $3::timestamptz AND observed_at < $4::timestamptz
         AND numeric_value IS NOT NULL
     ), per_ap AS (
       SELECT site_id, device_external_id, MIN(model) AS model,
              SUM((watts * elapsed_seconds) / 3600000.0)
                FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5) AS kwh,
              SUM(watts * elapsed_seconds) FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5)
                / NULLIF(SUM(elapsed_seconds) FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5), 0)
                AS avg_watts,
              COALESCE(SUM(elapsed_seconds) FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5), 0)
                AS observed_seconds,
              COUNT(*) AS sample_count,
              MIN(observed_at) AS first_at, MAX(observed_at) AS last_at
       FROM samples GROUP BY site_id, device_external_id
     )
     SELECT site_id AS "siteId", device_external_id AS "apSerial", model,
            COALESCE(kwh,0)::float8 AS kwh, avg_watts::float8 AS "avgWatts",
            observed_seconds::float8 AS "observedSeconds", sample_count::int AS "sampleCount",
            first_at AS "firstAt", last_at AS "lastAt"
     FROM per_ap ORDER BY site_id, device_external_id`,
    [sourceId, siteIds, start, end, maxGapSeconds]
  );
  return rows;
}

/** Raw power series for the comparison chart, bucketed server-side. */
export async function fetchSiteSeries({ sourceId, siteIds, start, end, bucketSeconds = 300 }) {
  const { rows } = await query(
    `SELECT site_id AS "siteId",
            to_timestamp(floor(extract(epoch FROM observed_at) / $5) * $5) AS "bucketStart",
            (AVG(numeric_value) * COUNT(DISTINCT device_external_id))::float8 AS "siteWatts",
            AVG(numeric_value)::float8 AS "wattsPerAp",
            COUNT(DISTINCT device_external_id)::int AS "apCount"
     FROM metric_samples
     WHERE monitored_source_id = $1
       AND metric_family = '${FAMILY}'
       AND metric_name = '${METRIC.POWER_WATTS}'
       AND site_id = ANY($2::text[])
       AND observed_at >= $3::timestamptz AND observed_at < $4::timestamptz
       AND numeric_value IS NOT NULL
     GROUP BY 1, 2
     ORDER BY 2 ASC`,
    [sourceId, siteIds, start, end, bucketSeconds]
  );
  return rows;
}

/** Earliest energy sample per site — how much history actually exists. */
export async function fetchHistoryCoverage({ sourceId, siteIds }) {
  const { rows } = await query(
    `SELECT site_id AS "siteId",
            MIN(observed_at) AS "earliest", MAX(observed_at) AS "latest",
            COUNT(*)::bigint AS "sampleCount",
            COUNT(DISTINCT device_external_id)::int AS "apCount"
     FROM metric_samples
     WHERE monitored_source_id = $1
       AND metric_family = '${FAMILY}'
       AND metric_name = '${METRIC.POWER_WATTS}'
       AND site_id = ANY($2::text[])
     GROUP BY site_id`,
    [sourceId, siteIds]
  );
  return rows;
}

/** Per-AP latest measured watts + radio tx power, for the drill-down. */
export async function fetchApCurrentState({ sourceId, siteIds }) {
  const { rows } = await query(
    `SELECT DISTINCT ON (device_external_id, metric_name, COALESCE(radio_external_id,''))
            device_external_id AS "apSerial", site_id AS "siteId", metric_name AS "metricName",
            radio_external_id AS "radioIndex", numeric_value AS "value", unit,
            observed_at AS "observedAt", dimensions
     FROM metric_samples
     WHERE monitored_source_id = $1
       AND metric_family = '${FAMILY}'
       AND site_id = ANY($2::text[])
     ORDER BY device_external_id, metric_name, COALESCE(radio_external_id,''), observed_at DESC`,
    [sourceId, siteIds]
  );
  return rows;
}
