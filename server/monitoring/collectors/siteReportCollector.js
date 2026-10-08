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
import { normalizeSiteList, extractRows } from './sleCollector.js';

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
/**
 * Names of sites that host at least one AP, from the controller-wide AP query
 * (APs link to a site by NAME via `hostSite`). Null when the query failed — the
 * caller then collects every site rather than guessing.
 */
export function sitesWithAps(apsPayload) {
  const names = new Set();
  for (const row of extractRows(apsPayload, ['aps', 'accessPoints'])) {
    const name = row?.hostSite ?? row?.site?.name ?? null;
    if (name) names.add(name);
  }
  return names;
}

export async function collectSiteReports({
  session,
  source,
  config,
  now = new Date(),
  getCursor,
  breaker = null,
}) {
  const partialFailures = [];
  const samples = [];
  const cursorAdvances = [];
  const unrecoverableGaps = [];
  const notes = [];
  let endpointsTried = 1;
  const reportTimeoutMs = (config.reportTimeoutSeconds ?? 45) * 1000;

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

  // A venue report costs the Gateway 15-30 s whether or not the site has any
  // radios. A site with no AP can only ever answer NoData, so asking is pure
  // load. The AP query is a 20 ms read, so the filter is nearly free.
  const apsResponse = await session.get('/v1/aps/query');
  endpointsTried += 1;
  const populated = apsResponse.ok ? sitesWithAps(apsResponse.data) : null;

  const allSites = normalizeSiteList(sitesResponse.data);
  const sites = populated
    ? allSites.filter((site) => populated.has(site.name) || populated.has(site.id))
    : allSites;
  if (sites.length < allSites.length) {
    notes.push(`${allSites.length - sites.length} site(s) without APs skipped (venue report would be NoData).`);
  }

  for (const site of sites) {
    const scopeKey = `${source.id}:site_report:${site.id}`;
    if (breaker?.isOpen(scopeKey, now.getTime())) {
      notes.push(`site ${site.name ?? site.id} skipped: cooling down after repeated Gateway failures.`);
      continue;
    }

    const cursor = getCursor ? await getCursor(METRIC_FAMILIES.SITE_REPORT, site.id) : null;
    const plan = planCollectionWindow({
      cursor: cursor?.lastObservedAt ?? null,
      now,
      capabilities: source.capabilities,
      retentionDays: config.retentionDays,
    });

    const endpoint = buildVenueEndpoint(site.id, plan.duration, plan.resolution);
    const response = await session.get(endpoint, { timeoutMs: reportTimeoutMs });
    endpointsTried += 1;

    if (!response.ok) {
      breaker?.recordFailure(scopeKey, now.getTime());
      partialFailures.push({
        scope: `site:${site.id}`,
        errorClass: response.errorClass,
        summary: response.errorSummary,
      });
      continue;
    }
    breaker?.recordSuccess(scopeKey);

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

  return { samples, partialFailures, cursorAdvances, unrecoverableGaps, notes, endpointsTried, fatal: null };
}
