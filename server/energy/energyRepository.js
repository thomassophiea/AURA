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
      device_external_id,
      site_id,
      numeric_value / 1000.0 AS watts,
      observed_at,
      EXTRACT(EPOCH FROM (
        LEAD(observed_at) OVER (PARTITION BY device_external_id ORDER BY observed_at) - observed_at
      )) AS elapsed_seconds
    FROM metric_samples
    WHERE ${POWER_FILTER}
      AND ($4::text IS NULL OR site_id = $4)
  ),
  per_ap AS (
    SELECT
      device_external_id,
      site_id,
      SUM((watts * elapsed_seconds) / 3600000.0)
        FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5) AS kwh,
      AVG(watts) AS avg_watts,
      MAX(watts) AS peak_watts,
      COUNT(*) AS sample_count
    FROM samples
    GROUP BY device_external_id, site_id
  )
`;

export async function fetchOverviewAggregate({ sourceIds, siteId, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       COUNT(*)::int                       AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8       AS period_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts,
       COALESCE(SUM(avg_watts), 0)::float8 AS current_watts,
       COALESCE(SUM(peak_watts), 0)::float8 AS peak_watts
     FROM per_ap`,
    [sourceIds, start, end, siteId, maxGapSeconds]
  );
  const r = rows[0];
  return {
    apWithDataCount: r.ap_with_data_count,
    periodKwh: r.period_kwh,
    avgWatts: r.avg_watts,
    currentWatts: r.current_watts,
    peakWatts: r.peak_watts,
  };
}

export async function fetchSiteAggregates({ sourceIds, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       site_id,
       COUNT(*)::int                 AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts_per_ap
     FROM per_ap
     GROUP BY site_id
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, null, maxGapSeconds]
  );
  return rows.map((r) => ({
    siteId: r.site_id,
    apWithDataCount: r.ap_with_data_count,
    totalKwh: r.total_kwh,
    avgWattsPerAp: r.avg_watts_per_ap,
  }));
}

export async function fetchApAggregates({ sourceIds, siteId, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       device_external_id AS serial,
       site_id,
       COALESCE(avg_watts, 0)::float8  AS avg_watts,
       COALESCE(peak_watts, 0)::float8 AS peak_watts,
       COALESCE(kwh, 0)::float8        AS total_kwh,
       sample_count::int               AS sample_count
     FROM per_ap
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, siteId, maxGapSeconds]
  );
  return rows.map((r) => ({
    serial: r.serial,
    apName: r.serial, // apName enrichment is a later phase; serial is stable identity
    siteId: r.site_id,
    avgWatts: r.avg_watts,
    peakWatts: r.peak_watts,
    totalKwh: r.total_kwh,
    sampleCount: r.sample_count,
  }));
}

export async function fetchPowerSamples({ sourceIds, siteId, start, end }) {
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
     ORDER BY device_external_id, observed_at`,
    [sourceIds, start, end, siteId]
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

export async function getEarliestPowerSampleAt({ sourceIds, siteId }) {
  const { rows } = await query(
    `SELECT MIN(observed_at) AS earliest
     FROM metric_samples
     WHERE metric_family = 'ap_report' AND metric_name = '${POWER_METRIC_NAME}'
       AND monitored_source_id = ANY($1::uuid[])
       AND ($2::text IS NULL OR site_id = $2)`,
    [sourceIds, siteId]
  );
  return rows[0].earliest ? rows[0].earliest.toISOString() : null;
}

export async function getRatePreferences(sourceId) {
  const { rows } = await query(
    `SELECT currency_code, currency_symbol, rate_per_kwh
     FROM energy_rate_preferences WHERE monitored_source_id = $1`,
    [sourceId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: Number(r.rate_per_kwh),
  };
}

export async function upsertRatePreferences({ sourceId, currencyCode, currencySymbol, ratePerKwh }) {
  const { rows } = await query(
    `INSERT INTO energy_rate_preferences
       (monitored_source_id, currency_code, currency_symbol, rate_per_kwh, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (monitored_source_id) DO UPDATE
       SET currency_code = EXCLUDED.currency_code,
           currency_symbol = EXCLUDED.currency_symbol,
           rate_per_kwh = EXCLUDED.rate_per_kwh,
           updated_at = now()
     RETURNING currency_code, currency_symbol, rate_per_kwh`,
    [sourceId, currencyCode, currencySymbol, ratePerKwh]
  );
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: Number(r.rate_per_kwh),
  };
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
