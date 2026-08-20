/**
 * SQL for energy views. Power is integrated in the database with LEAD() so an
 * irregular collection cadence does not over- or under-count: each sample is
 * weighted by the real gap to the next sample for the same AP. The last sample
 * per AP has a NULL gap and is excluded; gaps larger than maxGapSeconds are
 * excluded so a collector pause cannot integrate a stale reading across hours.
 *
 * Everything is parameterized. Power is stored in mW; watts = numeric_value / 1000.
 */

import { query } from '../db/pool.js';

// The AP report collector stores each stat as `${reportKey}.${slugifiedStatName}`
// (reportNormalizer.js), so AP power lands under this compound name — NOT a bare
// 'power_consumption'. Querying the bare name matched zero rows against real data.
const POWER_METRIC_NAME = 'apPowerConsumptionTimeseries.power_consumption';

// Uses $1 sourceIds, $2 start, $3 end. INTEGRATED_CTE extends it with $4 siteId, $5 maxGapSeconds; fetchPowerSamples adds $4 siteId only. Do not add $5 here.
const POWER_FILTER = `
  metric_family = 'ap_report'
  AND metric_name = '${POWER_METRIC_NAME}'
  AND monitored_source_id = ANY($1::uuid[])
  AND observed_at >= $2::timestamptz
  AND observed_at <  $3::timestamptz
  AND numeric_value IS NOT NULL
`;

/** Per-AP integrated CTE shared by the aggregate queries. Bind order: $1 sourceIds, $2 start, $3 end, $4 siteId, $5 maxGapSeconds. */
const INTEGRATED_CTE = `
  WITH samples AS (
    SELECT
      monitored_source_id,
      device_external_id,
      site_id,
      numeric_value / 1000.0 AS watts,
      observed_at,
      EXTRACT(EPOCH FROM (
        LEAD(observed_at) OVER (
          PARTITION BY monitored_source_id, device_external_id ORDER BY observed_at
        ) - observed_at
      )) AS elapsed_seconds
    FROM metric_samples
    WHERE ${POWER_FILTER}
      AND ($4::text IS NULL OR site_id = $4)
      AND ($6::text[] IS NULL OR site_id = ANY($6::text[]))
  ),
  per_ap AS (
    SELECT
      monitored_source_id,
      device_external_id,
      site_id,
      SUM((watts * elapsed_seconds) / 3600000.0)
        FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5) AS kwh,
      SUM(watts * elapsed_seconds)
        FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5)
        / NULLIF(
          SUM(elapsed_seconds)
            FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5),
          0
        ) AS avg_watts,
      MAX(watts) AS peak_watts,
      COUNT(*) FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5) AS sample_count,
      COALESCE(
        SUM(elapsed_seconds)
          FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5),
        0
      ) AS observed_seconds
    FROM samples
    GROUP BY monitored_source_id, device_external_id, site_id
  ),
  latest_per_ap AS (
    SELECT DISTINCT ON (monitored_source_id, device_external_id)
      monitored_source_id,
      device_external_id,
      site_id,
      watts,
      observed_at
    FROM samples
    ORDER BY monitored_source_id, device_external_id, observed_at DESC
  ),
  per_device AS (
    SELECT
      p.monitored_source_id,
      p.device_external_id,
      latest.site_id,
      SUM(p.kwh) AS kwh,
      SUM(p.avg_watts * p.observed_seconds)
        / NULLIF(SUM(p.observed_seconds), 0) AS avg_watts,
      MAX(p.peak_watts) AS peak_watts,
      SUM(p.sample_count) AS sample_count,
      SUM(p.observed_seconds) AS observed_seconds
    FROM per_ap p
    LEFT JOIN latest_per_ap latest
      ON latest.monitored_source_id = p.monitored_source_id
     AND latest.device_external_id = p.device_external_id
    GROUP BY p.monitored_source_id, p.device_external_id, latest.site_id
  ),
  per_ap_minute AS (
    SELECT DISTINCT ON (
      monitored_source_id,
      device_external_id,
      date_trunc('minute', observed_at)
    )
      monitored_source_id,
      device_external_id,
      date_trunc('minute', observed_at) AS sample_minute,
      watts
    FROM samples
    ORDER BY
      monitored_source_id,
      device_external_id,
      date_trunc('minute', observed_at),
      observed_at DESC
  ),
  fleet_by_minute AS (
    SELECT sample_minute, SUM(watts) AS fleet_watts
    FROM per_ap_minute
    GROUP BY sample_minute
  )
`;

export async function fetchOverviewAggregate({ sourceIds, siteId, start, end, maxGapSeconds, authorizedSiteIds = null }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
      COUNT(kwh)::int                     AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8       AS period_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts,
       COALESCE((
         SELECT SUM(watts)
         FROM latest_per_ap
         WHERE observed_at >= $3::timestamptz - ($5 * interval '1 second')
       ), 0)::float8 AS current_watts,
       COALESCE((SELECT MAX(fleet_watts) FROM fleet_by_minute), 0)::float8 AS peak_watts,
       COALESCE(
         SUM((kwh / NULLIF(observed_seconds, 0)) * 86400),
         0
       )::float8 AS daily_kwh_projected,
       COALESCE(SUM(observed_seconds), 0)::float8 AS observed_seconds
    FROM per_device`,
    [sourceIds, start, end, siteId, maxGapSeconds, authorizedSiteIds]
  );
  const r = rows[0];
  return {
    apWithDataCount: r.ap_with_data_count,
    periodKwh: r.period_kwh,
    avgWatts: r.avg_watts,
    currentWatts: r.current_watts,
    peakWatts: r.peak_watts,
    dailyKwhProjected: r.daily_kwh_projected,
    observedSeconds: r.observed_seconds,
  };
}

export async function fetchSiteAggregates({ sourceIds, start, end, maxGapSeconds, authorizedSiteIds = null }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       site_id,
       COUNT(DISTINCT (monitored_source_id, device_external_id))
         FILTER (WHERE kwh IS NOT NULL)::int AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts_per_ap,
       COALESCE(
         SUM((kwh / NULLIF(observed_seconds, 0)) * 86400),
         0
       )::float8 AS daily_kwh_projected,
       COALESCE(SUM(observed_seconds), 0)::float8 AS observed_seconds
     FROM per_ap
     GROUP BY site_id
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, null, maxGapSeconds, authorizedSiteIds]
  );
  return rows.map((r) => ({
    siteId: r.site_id,
    apWithDataCount: r.ap_with_data_count,
    totalKwh: r.total_kwh,
    avgWattsPerAp: r.avg_watts_per_ap,
    dailyKwhProjected: r.daily_kwh_projected,
    observedSeconds: r.observed_seconds,
  }));
}

export async function fetchApAggregates({ sourceIds, siteId, start, end, maxGapSeconds, authorizedSiteIds = null }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       device_external_id AS serial,
       site_id,
       COALESCE(
         SUM(avg_watts * observed_seconds) / NULLIF(SUM(observed_seconds), 0),
         0
       )::float8 AS avg_watts,
       COALESCE(MAX(peak_watts), 0)::float8 AS peak_watts,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       SUM(sample_count)::int AS sample_count,
       SUM(observed_seconds)::float8 AS observed_seconds
    FROM per_device
     WHERE kwh IS NOT NULL
     GROUP BY device_external_id, site_id
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, siteId, maxGapSeconds, authorizedSiteIds]
  );
  return rows.map((r) => ({
    serial: r.serial,
    apName: r.serial, // apName enrichment is a later phase; serial is stable identity
    siteId: r.site_id,
    avgWatts: r.avg_watts,
    peakWatts: r.peak_watts,
    totalKwh: r.total_kwh,
    sampleCount: r.sample_count,
    observedSeconds: r.observed_seconds,
  }));
}

export async function fetchPowerSamples({ sourceIds, siteId, start, end, authorizedSiteIds = null }) {
  const { rows } = await query(
    `SELECT
       device_external_id AS device_external_id,
       site_id,
       numeric_value / 1000.0 AS watts,
       observed_at,
       dimensions->>'band' AS band,
       (dimensions->>'channelUtilization')::float8 AS channel_utilization
     FROM metric_samples
     WHERE ${POWER_FILTER}
       AND ($4::text IS NULL OR site_id = $4)
      AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
     ORDER BY device_external_id, observed_at`,
    [sourceIds, start, end, siteId, authorizedSiteIds]
  );
  return rows.map((r) => ({
    deviceExternalId: r.device_external_id,
    siteId: r.site_id,
    watts: r.watts,
    observedAt: r.observed_at.toISOString(),
    band: r.band,
    channelUtilization: r.channel_utilization,
  }));
}

export async function getEarliestPowerSampleAt({ sourceIds, siteId, authorizedSiteIds = null }) {
  const { rows } = await query(
    `SELECT MIN(observed_at) AS earliest
     FROM metric_samples
     WHERE metric_family = 'ap_report' AND metric_name = '${POWER_METRIC_NAME}'
       AND monitored_source_id = ANY($1::uuid[])
       AND ($2::text IS NULL OR site_id = $2)
       AND ($3::text[] IS NULL OR site_id = ANY($3::text[]))`,
     [sourceIds, siteId, authorizedSiteIds]
  );
  return rows[0].earliest ? rows[0].earliest.toISOString() : null;
}

export async function getRatePreferences(sourceId) {
  const { rows } = await query(
    `SELECT currency_code, currency_symbol, rate_per_kwh,
            emissions_factor_kg_per_kwh, emissions_factor_source,
            emissions_factor_region, emissions_factor_year
     FROM energy_rate_preferences WHERE monitored_source_id = $1`,
    [sourceId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: Number(r.rate_per_kwh),
    emissionsFactorKgPerKwh:
      r.emissions_factor_kg_per_kwh == null ? null : Number(r.emissions_factor_kg_per_kwh),
    emissionsFactorSource: r.emissions_factor_source,
    emissionsFactorRegion: r.emissions_factor_region,
    emissionsFactorYear: r.emissions_factor_year,
  };
}

export async function upsertRatePreferences({
  sourceId,
  currencyCode,
  currencySymbol,
  ratePerKwh,
  emissionsFactorKgPerKwh = null,
  emissionsFactorSource = null,
  emissionsFactorRegion = null,
  emissionsFactorYear = null,
}) {
  const { rows } = await query(
    `INSERT INTO energy_rate_preferences
       (monitored_source_id, currency_code, currency_symbol, rate_per_kwh,
        emissions_factor_kg_per_kwh, emissions_factor_source,
        emissions_factor_region, emissions_factor_year, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (monitored_source_id) DO UPDATE
       SET currency_code = EXCLUDED.currency_code,
           currency_symbol = EXCLUDED.currency_symbol,
           rate_per_kwh = EXCLUDED.rate_per_kwh,
           emissions_factor_kg_per_kwh = EXCLUDED.emissions_factor_kg_per_kwh,
           emissions_factor_source = EXCLUDED.emissions_factor_source,
           emissions_factor_region = EXCLUDED.emissions_factor_region,
           emissions_factor_year = EXCLUDED.emissions_factor_year,
           updated_at = now()
     RETURNING currency_code, currency_symbol, rate_per_kwh,
               emissions_factor_kg_per_kwh, emissions_factor_source,
               emissions_factor_region, emissions_factor_year`,
    [
      sourceId,
      currencyCode,
      currencySymbol,
      ratePerKwh,
      emissionsFactorKgPerKwh,
      emissionsFactorSource,
      emissionsFactorRegion,
      emissionsFactorYear,
    ]
  );
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: Number(r.rate_per_kwh),
    emissionsFactorKgPerKwh:
      r.emissions_factor_kg_per_kwh == null ? null : Number(r.emissions_factor_kg_per_kwh),
    emissionsFactorSource: r.emissions_factor_source,
    emissionsFactorRegion: r.emissions_factor_region,
    emissionsFactorYear: r.emissions_factor_year,
  };
}

export async function fetchTelemetryCoverage({ sourceIds, siteId, start, end, authorizedSiteIds = null }) {
  const { rows } = await query(
    `WITH scoped_aps AS (
       SELECT DISTINCT device_external_id
       FROM metric_samples
       WHERE monitored_source_id = ANY($1::uuid[])
         AND metric_family = 'ap_report'
         AND observed_at >= $2::timestamptz
         AND observed_at < $3::timestamptz
         AND ($4::text IS NULL OR site_id = $4)
         AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
     ), power AS (
       SELECT device_external_id, observed_at,
         EXTRACT(EPOCH FROM (
           observed_at - LAG(observed_at) OVER (
             PARTITION BY device_external_id ORDER BY observed_at
           )
         )) AS gap_seconds
       FROM metric_samples
       WHERE monitored_source_id = ANY($1::uuid[])
         AND metric_family = 'ap_report'
         AND metric_name = '${POWER_METRIC_NAME}'
         AND observed_at >= $2::timestamptz
         AND observed_at < $3::timestamptz
         AND ($4::text IS NULL OR site_id = $4)
         AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
     )
     SELECT
       (SELECT COUNT(*) FROM scoped_aps)::int AS total_ap_count,
       COUNT(DISTINCT device_external_id)::int AS reporting_ap_count,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_seconds)
         FILTER (WHERE gap_seconds > 0) AS sampling_interval_seconds
     FROM power`,
    [sourceIds, start, end, siteId, authorizedSiteIds]
  );
  const row = rows[0];
  return {
    totalApCount: row.total_ap_count,
    reportingApCount: row.reporting_ap_count,
    samplingIntervalSeconds:
      row.sampling_interval_seconds == null ? null : Number(row.sampling_interval_seconds),
  };
}

export async function fetchLightAwareEvidence({ sourceIds, siteId, start, end, authorizedSiteIds = null }) {
  const { rows } = await query(
    `WITH dwell AS (
       SELECT
         monitored_source_id,
         ap_serial,
         COALESCE(SUM(dwell_seconds) FILTER (WHERE to_state = 'dark'), 0)::float8 AS dark_seconds,
         COALESCE(SUM(dwell_seconds) FILTER (WHERE to_state = 'dim'), 0)::float8 AS dim_seconds
       FROM light_state_transitions
       WHERE monitored_source_id = ANY($1::uuid[])
         AND entered_at >= $2::timestamptz
         AND entered_at < $3::timestamptz
         AND dwell_seconds IS NOT NULL
       GROUP BY monitored_source_id, ap_serial
     ), latest_power AS (
       SELECT DISTINCT ON (monitored_source_id, device_external_id)
         monitored_source_id,
         device_external_id AS ap_serial,
         numeric_value / 1000.0 AS watts,
         dimensions->>'model' AS model
       FROM metric_samples
       WHERE monitored_source_id = ANY($1::uuid[])
         AND metric_family = 'ap_report'
         AND metric_name = '${POWER_METRIC_NAME}'
         AND numeric_value IS NOT NULL
         AND ($4::text IS NULL OR site_id = $4)
         AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
       ORDER BY monitored_source_id, device_external_id, observed_at DESC
     )
     SELECT
       power.ap_serial,
       power.watts,
       power.model,
       COALESCE(dwell.dark_seconds, 0)::float8 AS dark_seconds,
       COALESCE(dwell.dim_seconds, 0)::float8 AS dim_seconds
     FROM latest_power power
     LEFT JOIN dwell
       ON dwell.monitored_source_id = power.monitored_source_id
      AND dwell.ap_serial = power.ap_serial`,
    [sourceIds, start, end, siteId, authorizedSiteIds]
  );
  return rows.map((row) => ({
    apSerial: row.ap_serial,
    watts: Number(row.watts),
    model: row.model,
    darkSeconds: Number(row.dark_seconds),
    dimSeconds: Number(row.dim_seconds),
  }));
}

export async function insertEnvironmentalReport({ sourceId, generatedBy, report }) {
  await query(
    `INSERT INTO energy_environmental_reports
       (id, monitored_source_id, site_id, window_start, window_end, generated_at,
        generated_by, evidence_status, snapshot, artifact_reference)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      report.reportId,
      sourceId,
      report.scope.siteId,
      report.reportingPeriod.start,
      report.reportingPeriod.end,
      report.generatedAt,
      generatedBy,
      report.evidenceStatus,
      JSON.stringify(report),
      'client-generated-pdf',
    ]
  );
  return report;
}

export async function getLatestEnvironmentalReport({ sourceIds, siteId }) {
  const { rows } = await query(
    `SELECT snapshot FROM energy_environmental_reports
     WHERE monitored_source_id = ANY($1::uuid[])
       AND site_id IS NOT DISTINCT FROM $2::text
     ORDER BY generated_at DESC LIMIT 1`,
    [sourceIds, siteId]
  );
  return rows[0]?.snapshot ?? null;
}

export async function getEnvironmentalReportById({ sourceIds, reportId }) {
  const { rows } = await query(
    `SELECT snapshot FROM energy_environmental_reports
     WHERE id = $1 AND monitored_source_id = ANY($2::uuid[])`,
    [reportId, sourceIds]
  );
  return rows[0]?.snapshot ?? null;
}

export async function insertScenario({ sourceId, name, policy }) {
  const { rows } = await query(
    `INSERT INTO energy_scenarios (monitored_source_id, name, policy)
     VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [sourceId, name, JSON.stringify(policy)]
  );
  return { id: rows[0].id };
}

export async function insertScenarioResult(result) {
  await query(
    `INSERT INTO energy_scenario_results
       (scenario_id, site_id, window_start, window_end, baseline_kwh, simulated_kwh,
        savings_kwh, savings_percent, ap_count, ap_with_data_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      result.scenarioId,
      result.siteId,
      result.windowStart,
      result.windowEnd,
      result.baselineKwh,
      result.simulatedKwh,
      result.savingsKwh,
      result.savingsPercent,
      result.apCount,
      result.apWithDataCount,
    ]
  );
}
