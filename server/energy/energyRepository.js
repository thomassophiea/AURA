/**
 * SQL for energy views.
 *
 * POWER SOURCE SELECTION
 *
 * Two collectors store AP power in metric_samples, and they are not equal:
 *
 *   1. `energy_ap_state` / `ap.power_watts` — the AP's measured PoE draw in
 *      WATTS, read from `/v1/aps/query` for the whole fleet in one call every
 *      ~60s. Fast and reliable: the PRIMARY source.
 *   2. `ap_report` / `apPowerConsumptionTimeseries.power_consumption` — the
 *      per-AP report timeseries in MILLIWATTS. One request per AP; on a real
 *      Gateway that can outlast the collector timeout, so it goes stale. It is
 *      used only as a FALLBACK.
 *
 * The merge is per AP and per instant: an ap_report sample is used only when no
 * measured sample exists for the same AP within ±FALLBACK_COVER_SECONDS of it.
 * An AP — or a stretch of history — the measured collector never saw still
 * counts, and nothing is double-counted where both exist.
 *
 * INTEGRATION
 *
 * Power is integrated in the database with LEAD() so an irregular cadence does
 * not over- or under-count: each sample is weighted by the real gap to the next
 * sample for the same AP. The last sample per AP has a NULL gap and is excluded.
 * A gap longer than the starting sample's limit is EXCLUDED — never integrated
 * as a flat line and never as zero. The limit is source-specific: measured
 * samples arrive every ~60s, so a gap over MEASURED_MAX_GAP_SECONDS is an
 * outage; the sparser report series keeps the caller's maxGapSeconds.
 *
 * Units: everything leaves this module in WATTS and kWh. ap_report mW are
 * divided by 1000 where they are read; measured values are already W.
 *
 * Every aggregate carries which source(s) its numbers came from — see
 * `describePowerSource` — so the UI can label provenance honestly.
 */

import { query } from '../db/pool.js';

// The AP report collector stores each stat as `${reportKey}.${slugifiedStatName}`
// (reportNormalizer.js), so AP power lands under this compound name — NOT a bare
// 'power_consumption'. Querying the bare name matched zero rows against real data.
const POWER_METRIC_NAME = 'apPowerConsumptionTimeseries.power_consumption';

// energyApStateCollector.js — METRIC.POWER_WATTS / UPTIME_SECONDS / RADIO_OCCUPANCY.
export const MEASURED_FAMILY = 'energy_ap_state';
export const MEASURED_POWER_METRIC = 'ap.power_watts';
const MEASURED_UPTIME_METRIC = 'ap.uptime_seconds';
const MEASURED_OCCUPANCY_METRIC = 'radio.channel_occupancy';

export const POWER_SOURCE = Object.freeze({
  MEASURED: 'measured_ap_state',
  AP_REPORT: 'ap_report',
});

/** An ap_report sample within this many seconds of a measured one is redundant. */
export const FALLBACK_COVER_SECONDS = 300;
/** Five missed 60s polls: beyond this a measured gap is an outage, not a reading. */
export const MEASURED_MAX_GAP_SECONDS = 300;

/**
 * The provenance summary every energy aggregate carries.
 *
 * `source` is the primary label: measured whenever ANY measured sample
 * contributed, ap_report only when the numbers rest entirely on the fallback,
 * and null when there was nothing at all. `mixed` says both contributed.
 */
export function describePowerSource({ measuredSampleCount = 0, apReportSampleCount = 0 } = {}) {
  const measured = Number(measuredSampleCount) || 0;
  const report = Number(apReportSampleCount) || 0;
  return {
    source: measured > 0 ? POWER_SOURCE.MEASURED : report > 0 ? POWER_SOURCE.AP_REPORT : null,
    mixed: measured > 0 && report > 0,
    measuredSampleCount: measured,
    apReportSampleCount: report,
  };
}

/**
 * Merged, unit-normalized power samples. Binds: $1 sourceIds, $2 start, $3 end,
 * $4 siteId, $5 authorizedSiteIds, $6 fallbackCoverSeconds. Defines CTEs
 * `measured`, `report_fallback` and `power_samples`, each with columns
 * monitored_source_id, device_external_id, site_id, watts, observed_at, src,
 * model, site_name.
 */
const POWER_SAMPLES_CTES = `
  measured AS (
    SELECT
      monitored_source_id,
      device_external_id,
      site_id,
      numeric_value::float8 AS watts,
      observed_at,
      '${POWER_SOURCE.MEASURED}'::text AS src,
      dimensions->>'model'    AS model,
      dimensions->>'siteName' AS site_name
    FROM metric_samples
    WHERE metric_family = '${MEASURED_FAMILY}'
      AND metric_name = '${MEASURED_POWER_METRIC}'
      AND monitored_source_id = ANY($1::uuid[])
      AND observed_at >= $2::timestamptz
      AND observed_at <  $3::timestamptz
      AND numeric_value IS NOT NULL
      AND device_external_id IS NOT NULL
      AND ($4::text IS NULL OR site_id = $4)
      AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
  ),
  report_fallback AS (
    SELECT
      r.monitored_source_id,
      r.device_external_id,
      r.site_id,
      r.numeric_value / 1000.0 AS watts,
      r.observed_at,
      '${POWER_SOURCE.AP_REPORT}'::text AS src,
      NULL::text AS model,
      NULL::text AS site_name
    FROM metric_samples r
    WHERE r.metric_family = 'ap_report'
      AND r.metric_name = '${POWER_METRIC_NAME}'
      AND r.monitored_source_id = ANY($1::uuid[])
      AND r.observed_at >= $2::timestamptz
      AND r.observed_at <  $3::timestamptz
      AND r.numeric_value IS NOT NULL
      AND r.device_external_id IS NOT NULL
      AND ($4::text IS NULL OR r.site_id = $4)
      AND ($5::text[] IS NULL OR r.site_id = ANY($5::text[]))
      -- Served by idx_metric_samples_device_observed (device_external_id, observed_at).
      AND NOT EXISTS (
        SELECT 1
        FROM metric_samples m
        WHERE m.device_external_id = r.device_external_id
          AND m.observed_at > r.observed_at - ($6::int * interval '1 second')
          AND m.observed_at < r.observed_at + ($6::int * interval '1 second')
          AND m.monitored_source_id = r.monitored_source_id
          AND m.metric_family = '${MEASURED_FAMILY}'
          AND m.metric_name = '${MEASURED_POWER_METRIC}'
          AND m.numeric_value IS NOT NULL
      )
  ),
  power_samples AS (
    SELECT * FROM measured
    UNION ALL
    SELECT * FROM report_fallback
  )
`;

/**
 * Per-AP integrated CTE shared by the aggregate queries. Binds $1-$6 as above,
 * plus $7 maxGapSeconds (fallback series) and $8 measuredMaxGapSeconds.
 */
const INTEGRATED_CTE = `
  WITH ${POWER_SAMPLES_CTES},
  samples AS (
    SELECT
      monitored_source_id,
      device_external_id,
      site_id,
      watts,
      observed_at,
      src,
      model,
      site_name,
      CASE WHEN src = '${POWER_SOURCE.MEASURED}'
           THEN LEAST($7::float8, $8::float8)
           ELSE $7::float8 END AS gap_limit,
      EXTRACT(EPOCH FROM (
        LEAD(observed_at) OVER (
          PARTITION BY monitored_source_id, device_external_id ORDER BY observed_at
        ) - observed_at
      )) AS elapsed_seconds
    FROM power_samples
  ),
  weighted AS (
    SELECT
      *,
      (elapsed_seconds IS NOT NULL AND elapsed_seconds <= gap_limit) AS usable
    FROM samples
  ),
  per_ap AS (
    SELECT
      monitored_source_id,
      device_external_id,
      site_id,
      SUM((watts * elapsed_seconds) / 3600000.0) FILTER (WHERE usable) AS kwh,
      SUM(watts * elapsed_seconds) FILTER (WHERE usable)
        / NULLIF(SUM(elapsed_seconds) FILTER (WHERE usable), 0) AS avg_watts,
      MAX(watts) AS peak_watts,
      COUNT(*) FILTER (WHERE usable) AS sample_count,
      COALESCE(SUM(elapsed_seconds) FILTER (WHERE usable), 0) AS observed_seconds,
      COUNT(*) FILTER (WHERE src = '${POWER_SOURCE.MEASURED}') AS measured_count,
      COUNT(*) FILTER (WHERE src = '${POWER_SOURCE.AP_REPORT}') AS report_count,
      MAX(model) AS model,
      MAX(site_name) AS site_name
    FROM weighted
    GROUP BY monitored_source_id, device_external_id, site_id
  ),
  latest_per_ap AS (
    SELECT DISTINCT ON (monitored_source_id, device_external_id)
      monitored_source_id,
      device_external_id,
      site_id,
      watts,
      observed_at,
      gap_limit
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
      SUM(p.observed_seconds) AS observed_seconds,
      SUM(p.measured_count) AS measured_count,
      SUM(p.report_count) AS report_count,
      MAX(p.model) AS model,
      MAX(p.site_name) AS site_name
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

function integratedParams({
  sourceIds,
  start,
  end,
  siteId,
  authorizedSiteIds,
  maxGapSeconds,
  measuredMaxGapSeconds,
}) {
  return [
    sourceIds,
    start,
    end,
    siteId ?? null,
    authorizedSiteIds ?? null,
    FALLBACK_COVER_SECONDS,
    maxGapSeconds,
    measuredMaxGapSeconds ?? MEASURED_MAX_GAP_SECONDS,
  ];
}

export async function fetchOverviewAggregate({
  sourceIds,
  siteId,
  start,
  end,
  maxGapSeconds,
  measuredMaxGapSeconds,
  authorizedSiteIds = null,
}) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       COUNT(kwh)::int                     AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8       AS period_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts,
       COALESCE((
         SELECT SUM(watts)
         FROM latest_per_ap
         WHERE observed_at >= $3::timestamptz - (gap_limit * interval '1 second')
       ), 0)::float8 AS current_watts,
       COALESCE((SELECT MAX(fleet_watts) FROM fleet_by_minute), 0)::float8 AS peak_watts,
       COALESCE(
         SUM((kwh / NULLIF(observed_seconds, 0)) * 86400),
         0
       )::float8 AS daily_kwh_projected,
       COALESCE(SUM(observed_seconds), 0)::float8 AS observed_seconds,
       COALESCE(SUM(measured_count), 0)::int AS measured_sample_count,
       COALESCE(SUM(report_count), 0)::int AS report_sample_count,
       COUNT(*) FILTER (WHERE measured_count > 0)::int AS measured_ap_count,
       COUNT(*) FILTER (WHERE measured_count = 0 AND report_count > 0)::int AS report_only_ap_count
    FROM per_device`,
    integratedParams({
      sourceIds,
      start,
      end,
      siteId,
      authorizedSiteIds,
      maxGapSeconds,
      measuredMaxGapSeconds,
    })
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
    ...describePowerSource({
      measuredSampleCount: r.measured_sample_count,
      apReportSampleCount: r.report_sample_count,
    }),
    measuredApCount: r.measured_ap_count,
    apReportOnlyApCount: r.report_only_ap_count,
  };
}

export async function fetchSiteAggregates({
  sourceIds,
  start,
  end,
  maxGapSeconds,
  measuredMaxGapSeconds,
  authorizedSiteIds = null,
}) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       site_id,
       MAX(site_name) AS site_name,
       COUNT(DISTINCT (monitored_source_id, device_external_id))
         FILTER (WHERE kwh IS NOT NULL)::int AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts_per_ap,
       COALESCE(
         SUM((kwh / NULLIF(observed_seconds, 0)) * 86400),
         0
       )::float8 AS daily_kwh_projected,
       COALESCE(SUM(observed_seconds), 0)::float8 AS observed_seconds,
       COALESCE(SUM(measured_count), 0)::int AS measured_sample_count,
       COALESCE(SUM(report_count), 0)::int AS report_sample_count
     FROM per_ap
     GROUP BY site_id
     ORDER BY total_kwh DESC`,
    integratedParams({
      sourceIds,
      start,
      end,
      siteId: null,
      authorizedSiteIds,
      maxGapSeconds,
      measuredMaxGapSeconds,
    })
  );
  return rows.map((r) => ({
    siteId: r.site_id,
    siteName: r.site_name ?? null,
    apWithDataCount: r.ap_with_data_count,
    totalKwh: r.total_kwh,
    avgWattsPerAp: r.avg_watts_per_ap,
    dailyKwhProjected: r.daily_kwh_projected,
    observedSeconds: r.observed_seconds,
    ...describePowerSource({
      measuredSampleCount: r.measured_sample_count,
      apReportSampleCount: r.report_sample_count,
    }),
  }));
}

export async function fetchApAggregates({
  sourceIds,
  siteId,
  start,
  end,
  maxGapSeconds,
  measuredMaxGapSeconds,
  authorizedSiteIds = null,
}) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       device_external_id AS serial,
       site_id,
       MAX(site_name) AS site_name,
       MAX(model) AS model,
       COALESCE(
         SUM(avg_watts * observed_seconds) / NULLIF(SUM(observed_seconds), 0),
         0
       )::float8 AS avg_watts,
       COALESCE(MAX(peak_watts), 0)::float8 AS peak_watts,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       SUM(sample_count)::int AS sample_count,
       SUM(observed_seconds)::float8 AS observed_seconds,
       COALESCE(SUM(measured_count), 0)::int AS measured_sample_count,
       COALESCE(SUM(report_count), 0)::int AS report_sample_count
    FROM per_device
     WHERE kwh IS NOT NULL
     GROUP BY device_external_id, site_id
     ORDER BY total_kwh DESC`,
    integratedParams({
      sourceIds,
      start,
      end,
      siteId,
      authorizedSiteIds,
      maxGapSeconds,
      measuredMaxGapSeconds,
    })
  );
  return rows.map((r) => ({
    serial: r.serial,
    // The serial until the router resolves a real name; never an empty cell.
    apName: r.serial,
    model: r.model ?? null,
    siteId: r.site_id,
    siteName: r.site_name ?? null,
    avgWatts: r.avg_watts,
    peakWatts: r.peak_watts,
    totalKwh: r.total_kwh,
    sampleCount: r.sample_count,
    observedSeconds: r.observed_seconds,
    ...describePowerSource({
      measuredSampleCount: r.measured_sample_count,
      apReportSampleCount: r.report_sample_count,
    }),
  }));
}

/**
 * Raw merged samples for the scenario replay and the recommendation rules.
 *
 * `channelUtilization` is real or absent, never assumed: for a measured sample
 * it is the 6 GHz radio's `channelOccupancy` from the SAME collection tick (same
 * observed_at), and the sample is then tagged band '6'. A sample with no 6 GHz
 * reading carries null, which the 6 GHz idle rule treats as "cannot judge"
 * rather than as idle.
 */
export async function fetchPowerSamples({ sourceIds, siteId, start, end, authorizedSiteIds = null }) {
  const { rows } = await query(
    `WITH ${POWER_SAMPLES_CTES},
     occupancy_6ghz AS (
       SELECT monitored_source_id, device_external_id, observed_at,
              AVG(numeric_value)::float8 AS occupancy
       FROM metric_samples
       WHERE metric_family = '${MEASURED_FAMILY}'
         AND metric_name = '${MEASURED_OCCUPANCY_METRIC}'
         AND monitored_source_id = ANY($1::uuid[])
         AND observed_at >= $2::timestamptz
         AND observed_at <  $3::timestamptz
         AND numeric_value IS NOT NULL
         AND dimensions->>'band' = '6'
       GROUP BY monitored_source_id, device_external_id, observed_at
     )
     SELECT
       p.device_external_id,
       p.site_id,
       p.watts,
       p.observed_at,
       p.src,
       p.model,
       CASE
         WHEN p.src = '${POWER_SOURCE.MEASURED}'
           THEN CASE WHEN o.occupancy IS NULL THEN NULL ELSE '6' END
         ELSE rep.band
       END AS band,
       CASE
         WHEN p.src = '${POWER_SOURCE.MEASURED}' THEN o.occupancy
         ELSE rep.channel_utilization
       END AS channel_utilization
     FROM power_samples p
     LEFT JOIN occupancy_6ghz o
       ON p.src = '${POWER_SOURCE.MEASURED}'
      AND o.monitored_source_id = p.monitored_source_id
      AND o.device_external_id = p.device_external_id
      AND o.observed_at = p.observed_at
     LEFT JOIN LATERAL (
       SELECT d.dimensions->>'band' AS band,
              (d.dimensions->>'channelUtilization')::float8 AS channel_utilization
       FROM metric_samples d
       WHERE p.src = '${POWER_SOURCE.AP_REPORT}'
         AND d.device_external_id = p.device_external_id
         AND d.observed_at = p.observed_at
         AND d.monitored_source_id = p.monitored_source_id
         AND d.metric_family = 'ap_report'
         AND d.metric_name = '${POWER_METRIC_NAME}'
       LIMIT 1
     ) rep ON true
     ORDER BY p.device_external_id, p.observed_at`,
    [sourceIds, start, end, siteId ?? null, authorizedSiteIds ?? null, FALLBACK_COVER_SECONDS]
  );
  return rows.map((r) => ({
    deviceExternalId: r.device_external_id,
    siteId: r.site_id,
    watts: Number(r.watts),
    observedAt: r.observed_at.toISOString(),
    band: r.band ?? null,
    channelUtilization: r.channel_utilization == null ? null : Number(r.channel_utilization),
    source: r.src,
    model: r.model ?? null,
  }));
}

export async function getEarliestPowerSampleAt({ sourceIds, siteId, authorizedSiteIds = null }) {
  // Two independent MINs so each rides the (source, family, observed_at) index.
  const { rows } = await query(
    `SELECT LEAST(
       (SELECT MIN(observed_at) FROM metric_samples
         WHERE metric_family = '${MEASURED_FAMILY}' AND metric_name = '${MEASURED_POWER_METRIC}'
           AND monitored_source_id = ANY($1::uuid[])
           AND ($2::text IS NULL OR site_id = $2)
           AND ($3::text[] IS NULL OR site_id = ANY($3::text[]))),
       (SELECT MIN(observed_at) FROM metric_samples
         WHERE metric_family = 'ap_report' AND metric_name = '${POWER_METRIC_NAME}'
           AND monitored_source_id = ANY($1::uuid[])
           AND ($2::text IS NULL OR site_id = $2)
           AND ($3::text[] IS NULL OR site_id = ANY($3::text[])))
     ) AS earliest`,
    [sourceIds, siteId ?? null, authorizedSiteIds]
  );
  return rows[0].earliest ? new Date(rows[0].earliest).toISOString() : null;
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
  // The AP population is every AP either collector saw in the window. The
  // measured collector writes `ap.uptime_seconds` even for an AP that is not in
  // service, so it counts APs that reported no power — exactly the ones a
  // coverage figure exists to expose.
  const { rows } = await query(
    `WITH ${POWER_SAMPLES_CTES},
     scoped_aps AS (
       SELECT device_external_id
       FROM metric_samples
       WHERE monitored_source_id = ANY($1::uuid[])
         AND metric_family = '${MEASURED_FAMILY}'
         AND metric_name IN ('${MEASURED_UPTIME_METRIC}', '${MEASURED_POWER_METRIC}')
         AND observed_at >= $2::timestamptz
         AND observed_at < $3::timestamptz
         AND device_external_id IS NOT NULL
         AND ($4::text IS NULL OR site_id = $4)
         AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
       UNION
       SELECT device_external_id
       FROM metric_samples
       WHERE monitored_source_id = ANY($1::uuid[])
         AND metric_family = 'ap_report'
         AND observed_at >= $2::timestamptz
         AND observed_at < $3::timestamptz
         AND device_external_id IS NOT NULL
         AND ($4::text IS NULL OR site_id = $4)
         AND ($5::text[] IS NULL OR site_id = ANY($5::text[]))
     ), power AS (
       SELECT device_external_id, src,
         EXTRACT(EPOCH FROM (
           observed_at - LAG(observed_at) OVER (
             PARTITION BY monitored_source_id, device_external_id ORDER BY observed_at
           )
         )) AS gap_seconds
       FROM power_samples
     )
     SELECT
       (SELECT COUNT(*) FROM scoped_aps)::int AS total_ap_count,
       COUNT(DISTINCT device_external_id)::int AS reporting_ap_count,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_seconds)
         FILTER (WHERE gap_seconds > 0) AS sampling_interval_seconds,
       COUNT(*) FILTER (WHERE src = '${POWER_SOURCE.MEASURED}')::int AS measured_sample_count,
       COUNT(*) FILTER (WHERE src = '${POWER_SOURCE.AP_REPORT}')::int AS report_sample_count
     FROM power`,
    [sourceIds, start, end, siteId ?? null, authorizedSiteIds ?? null, FALLBACK_COVER_SECONDS]
  );
  const row = rows[0];
  return {
    totalApCount: row.total_ap_count,
    reportingApCount: row.reporting_ap_count,
    samplingIntervalSeconds:
      row.sampling_interval_seconds == null ? null : Number(row.sampling_interval_seconds),
    ...describePowerSource({
      measuredSampleCount: row.measured_sample_count,
      apReportSampleCount: row.report_sample_count,
    }),
  };
}

/**
 * Per-AP latest power and model, joined to light-state dwell, for the
 * light-aware recommendation.
 *
 * The model comes from the measured series' dimensions (the AP report series
 * carries none), which is what makes the sensor-capability check answerable at
 * all — without it this rule could never fire. Power is the latest merged
 * sample IN THE WINDOW; it used to scan every power row ever stored.
 */
export async function fetchLightAwareEvidence({ sourceIds, siteId, start, end, authorizedSiteIds = null }) {
  const { rows } = await query(
    `WITH ${POWER_SAMPLES_CTES},
     dwell AS (
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
         watts,
         src
       FROM power_samples
       ORDER BY monitored_source_id, device_external_id, observed_at DESC
     ), models AS (
       SELECT monitored_source_id, device_external_id AS ap_serial, MAX(model) AS model
       FROM measured
       GROUP BY monitored_source_id, device_external_id
     )
     SELECT
       power.ap_serial,
       power.watts,
       power.src,
       models.model,
       COALESCE(dwell.dark_seconds, 0)::float8 AS dark_seconds,
       COALESCE(dwell.dim_seconds, 0)::float8 AS dim_seconds
     FROM latest_power power
     LEFT JOIN models
       ON models.monitored_source_id = power.monitored_source_id
      AND models.ap_serial = power.ap_serial
     LEFT JOIN dwell
       ON dwell.monitored_source_id = power.monitored_source_id
      AND dwell.ap_serial = power.ap_serial`,
    [sourceIds, start, end, siteId ?? null, authorizedSiteIds ?? null, FALLBACK_COVER_SECONDS]
  );
  return rows.map((row) => ({
    apSerial: row.ap_serial,
    watts: Number(row.watts),
    model: row.model ?? null,
    source: row.src,
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
