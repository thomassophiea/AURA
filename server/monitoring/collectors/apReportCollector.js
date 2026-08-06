/**
 * Per-AP report collector.
 *
 * `/v1/report/aps/{serial}` is the richest source AURA has — throughput, unique
 * clients, RSS baselines, power (in mW), channel utilization, noise — and it is
 * also by far the largest volume driver: roughly 18 series per AP. It is
 * therefore OFF by default (MONITORING_AP_REPORTS_ENABLED) and collected at a
 * coarser resolution than the site reports.
 */

import { normalizeReportResponse } from '../normalizers/reportNormalizer.js';
import { METRIC_FAMILIES } from '../metricRegistry.js';
import { planCollectionWindow } from '../backfill.js';
import { extractRows } from './sleCollector.js';
import { latestObservedAt } from './siteReportCollector.js';

export const COLLECTOR_NAME = 'ap_report';

const WIDGETS = [
  'throughputReport',
  'countOfUniqueUsersReport',
  'baseliningAPRss',
  'apPowerConsumptionTimeseries',
  'channelUtilization5',
  'channelUtilization2_4',
  'noisePerRadio',
];

export function buildApReportEndpoint(serial, duration, resolution) {
  const widgetList = encodeURIComponent(WIDGETS.join(','));
  return (
    `/v1/report/aps/${encodeURIComponent(serial)}` +
    `?duration=${duration}&resolution=${resolution}&widgetList=${widgetList}`
  );
}

/** Serial + site for each AP; APs with no serial cannot be keyed and are dropped. */
export function normalizeApList(payload) {
  return extractRows(payload, ['aps', 'accessPoints'])
    .map((row) => ({
      serial: row?.serialNumber ?? row?.serial ?? row?.apSerialNumber ?? null,
      siteId: row?.siteId ?? row?.site?.id ?? null,
    }))
    .filter((ap) => ap.serial);
}

export async function collectApReports({
  session,
  source,
  config,
  now = new Date(),
  getCursor,
  maxAps = 500,
}) {
  const partialFailures = [];
  const samples = [];
  const cursorAdvances = [];
  const notes = [];
  let endpointsTried = 1;

  const apsResponse = await session.get('/v1/aps/query');
  if (!apsResponse.ok) {
    return {
      samples: [],
      partialFailures,
      cursorAdvances,
      notes,
      endpointsTried,
      fatal: {
        errorClass: apsResponse.errorClass,
        summary: apsResponse.errorSummary,
        status: apsResponse.status,
      },
    };
  }

  const allAps = normalizeApList(apsResponse.data);
  const aps = allAps.slice(0, maxAps);
  if (allAps.length > aps.length) {
    // Never let a cap look like full coverage.
    notes.push(
      `AP report collection capped at ${maxAps} of ${allAps.length} APs; the remainder was not collected this run.`
    );
  }

  for (const ap of aps) {
    const cursor = getCursor ? await getCursor(METRIC_FAMILIES.AP_REPORT, ap.serial) : null;
    const plan = planCollectionWindow({
      cursor: cursor?.lastObservedAt ?? null,
      now,
      capabilities: source.capabilities,
      retentionDays: config.retentionDays,
    });

    const response = await session.get(
      buildApReportEndpoint(ap.serial, plan.duration, plan.resolution)
    );
    endpointsTried += 1;

    if (!response.ok) {
      partialFailures.push({
        scope: `ap:${ap.serial}`,
        errorClass: response.errorClass,
        summary: response.errorSummary,
      });
      continue;
    }

    const { samples: apSamples } = normalizeReportResponse(response.data, {
      monitoredSourceId: source.id,
      metricFamily: METRIC_FAMILIES.AP_REPORT,
      orgId: source.orgId,
      siteGroupId: source.siteGroupId,
      siteId: ap.siteId,
      deviceExternalId: ap.serial,
      collectedAt: now,
      retentionDays: config.retentionDays,
      bucketSeconds: plan.resolution * 60,
    });

    samples.push(...apSamples);

    const latest = latestObservedAt(apSamples);
    if (latest) {
      cursorAdvances.push({
        metricFamily: METRIC_FAMILIES.AP_REPORT,
        scopeKey: ap.serial,
        lastObservedAt: latest,
      });
    }
  }

  return { samples, partialFailures, cursorAdvances, notes, endpointsTried, fatal: null };
}
