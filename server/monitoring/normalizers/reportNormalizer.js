/**
 * Normalizes Campus Controller report payloads into metric samples.
 *
 * Shape produced by /v1/report/aps/{serial}, /v1/report/sites/{id} and
 * /v3/sites/{id}/report/venue (verified against src/test/fixtures/apInsights.fixture.ts,
 * XCC 10.18.1.0-011R):
 *
 *   { <reportKey>: [ { reportName, reportType, band,
 *                      statistics: [ { statName, unit,
 *                                      values: [ { timestamp, value } ] } ] } ] }
 *
 * Two rules matter more than anything else here:
 *
 *  - A null / non-numeric point is DROPPED, never turned into 0. On this
 *    controller build whole series (Interference, ClientData, Available) come
 *    back all-null; storing zeros would fabricate a flat line that reads as a
 *    measurement.
 *  - The source's own timestamp wins. Collection time is used only when the
 *    source supplies none, and that substitution is recorded in quality_state.
 */

import { classifyMetric } from '../metricRegistry.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `'Power Consumption'` -> `'power_consumption'`; `'Rss Base '` -> `'rss_base'`. */
export function slugifyStatName(statName) {
  return String(statName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A report block is an array of objects carrying a `statistics` array. */
function isReportBlockArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => entry && typeof entry === 'object')
  );
}

/**
 * Parse a controller value. The controller sends numbers as strings, and sends
 * absent data as `null`, the literal string `"null"`, or `""`.
 *
 * @returns {{ ok: true, value: number } | { ok: false, reason: 'null'|'nonNumeric' }}
 */
function parseValue(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'null' };
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'null') return { ok: false, reason: 'null' };
  }
  const num = Number(raw);
  if (!Number.isFinite(num)) return { ok: false, reason: 'nonNumeric' };
  return { ok: true, value: num };
}

/**
 * @param {object|null} payload Raw controller report response.
 * @param {object} context
 * @param {string} context.monitoredSourceId
 * @param {string} context.metricFamily
 * @param {Date}   context.collectedAt
 * @param {number} context.retentionDays
 * @param {string} [context.orgId]
 * @param {string} [context.siteGroupId]
 * @param {string} [context.siteId]
 * @param {string} [context.deviceExternalId]
 * @param {number} [context.bucketSeconds] Bucket width, when the request's
 *   resolution is known; sets bucket_start / bucket_end.
 * @returns {{ samples: object[], skipped: { nullValues: number, nonNumeric: number } }}
 */
export function normalizeReportResponse(payload, context) {
  const samples = [];
  const skipped = { nullValues: 0, nonNumeric: 0 };

  if (!payload || typeof payload !== 'object') return { samples, skipped };

  const {
    monitoredSourceId,
    metricFamily,
    collectedAt,
    retentionDays,
    orgId = null,
    siteGroupId = null,
    siteId = null,
    deviceExternalId = null,
    radioExternalId = null,
    wlanExternalId = null,
    bucketSeconds = null,
  } = context;

  const expiresAt = new Date(collectedAt.getTime() + retentionDays * MS_PER_DAY);

  for (const [reportKey, block] of Object.entries(payload)) {
    if (!isReportBlockArray(block)) continue;

    for (const report of block) {
      const statistics = Array.isArray(report.statistics) ? report.statistics : null;
      if (!statistics) continue;

      const band = report.band ?? null;
      const reportType = report.reportType ?? null;
      const dimensions = {};
      if (band !== null) dimensions.band = band;
      if (reportType !== null) dimensions.reportType = reportType;

      for (const stat of statistics) {
        if (!stat || typeof stat !== 'object') continue;
        const values = Array.isArray(stat.values) ? stat.values : null;
        if (!values) continue;

        const metricName = `${reportKey}.${slugifyStatName(stat.statName)}`;
        const unit = stat.unit ?? null;
        const metricKind = classifyMetric({ family: metricFamily, name: metricName, unit });

        for (const point of values) {
          if (!point || typeof point !== 'object') continue;

          const parsed = parseValue(point.value);
          if (!parsed.ok) {
            skipped[parsed.reason === 'null' ? 'nullValues' : 'nonNumeric'] += 1;
            continue;
          }

          const hasSourceTimestamp = Number.isFinite(Number(point.timestamp));
          const observedAt = hasSourceTimestamp
            ? new Date(Number(point.timestamp))
            : new Date(collectedAt.getTime());

          if (Number.isNaN(observedAt.getTime())) {
            skipped.nonNumeric += 1;
            continue;
          }

          samples.push({
            monitoredSourceId,
            orgId,
            siteGroupId,
            siteId,
            deviceExternalId,
            radioExternalId,
            wlanExternalId,
            clientExternalId: null,
            metricFamily,
            metricName,
            observedAt,
            bucketStart: bucketSeconds ? observedAt : null,
            bucketEnd: bucketSeconds
              ? new Date(observedAt.getTime() + bucketSeconds * 1000)
              : null,
            numericValue: parsed.value,
            numerator: null,
            denominator: null,
            sampleCount: null,
            unit,
            metricKind,
            dimensions,
            qualityState: hasSourceTimestamp ? 'observed' : 'collection_timestamped',
            collectedAt,
            expiresAt,
          });
        }
      }
    }
  }

  return { samples, skipped };
}
