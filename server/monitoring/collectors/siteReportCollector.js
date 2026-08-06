/**
 * Site venue-report collector.
 *
 * `/v3/sites/{siteId}/report/venue` returns source-timestamped, pre-bucketed
 * timeseries, so this is the collector that can genuinely backfill: after an
 * outage it re-requests the window covering the gap and the deterministic
 * uniqueness key makes the overlap a no-op.
 *
 * Widget list matches `apiService.getVenueStatistics` so the persisted series
 * are the same ones the UI already renders.
 */

import { normalizeReportResponse } from '../normalizers/reportNormalizer.js';
import { METRIC_FAMILIES } from '../metricRegistry.js';
import { planCollectionWindow } from '../backfill.js';
import { normalizeSiteList } from './sleCollector.js';

export const COLLECTOR_NAME = 'site_report';

const WIDGETS = [
  'ulDlUsageTimeseries',
  'ulDlThroughputTimeseries',
  'uniqueClientsTotalScorecard',
  'uniqueClientsPeakScorecard',
  'totalTrafficScorecard',
  'averageThroughputScorecard',
];

export function buildVenueEndpoint(siteId, duration, resolution) {
  const widgetList = encodeURIComponent(WIDGETS.join(','));
  return (
    `/v3/sites/${encodeURIComponent(siteId)}/report/venue` +
    `?duration=${duration}&resolution=${resolution}&statType=sites&widgetList=${widgetList}`
  );
}

/** Newest observation in a batch — used to advance the per-site cursor. */
export function latestObservedAt(samples) {
  let latest = null;
  for (const sample of samples) {
    if (!latest || sample.observedAt > latest) latest = sample.observedAt;
  }
  return latest;
}

/**
 * @param {object} params
 * @param {import('../controllerClient.js').ControllerSession} params.session
 * @param {object} params.source
 * @param {object} params.config
 * @param {Date} params.now
 * @param {(family: string, scope: string) => Promise<{lastObservedAt: Date}|null>} params.getCursor
 */
export async function collectSiteReports({ session, source, config, now = new Date(), getCursor }) {
  const partialFailures = [];
  const samples = [];
  const cursorAdvances = [];
  const unrecoverableGaps = [];
  let endpointsTried = 1;

  const sitesResponse = await session.get('/v3/sites');
  if (!sitesResponse.ok) {
    return {
      samples: [],
      partialFailures,
      cursorAdvances,
      unrecoverableGaps,
      endpointsTried,
      fatal: {
        errorClass: sitesResponse.errorClass,
        summary: sitesResponse.errorSummary,
        status: sitesResponse.status,
      },
    };
  }

  for (const site of normalizeSiteList(sitesResponse.data)) {
    const cursor = getCursor ? await getCursor(METRIC_FAMILIES.SITE_REPORT, site.id) : null;
    const plan = planCollectionWindow({
      cursor: cursor?.lastObservedAt ?? null,
      now,
      capabilities: source.capabilities,
      retentionDays: config.retentionDays,
    });

    const endpoint = buildVenueEndpoint(site.id, plan.duration, plan.resolution);
    const response = await session.get(endpoint);
    endpointsTried += 1;

    if (!response.ok) {
      partialFailures.push({
        scope: `site:${site.id}`,
        errorClass: response.errorClass,
        summary: response.errorSummary,
      });
      continue;
    }

    const { samples: siteSamples } = normalizeReportResponse(response.data, {
      monitoredSourceId: source.id,
      metricFamily: METRIC_FAMILIES.SITE_REPORT,
      orgId: source.orgId,
      siteGroupId: source.siteGroupId,
      siteId: site.id,
      collectedAt: now,
      retentionDays: config.retentionDays,
      bucketSeconds: plan.resolution * 60,
    });

    samples.push(...siteSamples);

    const latest = latestObservedAt(siteSamples);
    if (latest) {
      cursorAdvances.push({
        metricFamily: METRIC_FAMILIES.SITE_REPORT,
        scopeKey: site.id,
        lastObservedAt: latest,
      });
    }

    // The window could not reach back to the cursor: the remainder is a real
    // gap and is reported rather than quietly forgotten.
    if (!plan.fullyCovered && cursor?.lastObservedAt) {
      unrecoverableGaps.push({
        scope: `site:${site.id}`,
        from: cursor.lastObservedAt,
        to: plan.coversFrom,
      });
    }
  }

  return { samples, partialFailures, cursorAdvances, unrecoverableGaps, endpointsTried, fatal: null };
}
