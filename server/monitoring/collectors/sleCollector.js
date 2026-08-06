/**
 * SLE collector.
 *
 * Fetches the live station and AP inventory per site and turns it into
 * persistable SLE samples with numerator/denominator counts.
 *
 * Site-by-site rather than controller-wide: an SLE score is only meaningful
 * within a site, and per-site rows are what the UI filters on. A site that
 * fails is skipped and reported as partial — the others still get collected.
 */

import { normalizeSleSamples } from '../normalizers/sleNormalizer.js';
import { METRIC_FAMILIES } from '../metricRegistry.js';

export const COLLECTOR_NAME = 'sle';

/**
 * @param {object} params
 * @param {import('../controllerClient.js').ControllerSession} params.session
 * @param {object} params.source Monitored source row.
 * @param {object} params.config Monitoring config.
 * @param {Date} params.now
 * @returns {Promise<{ samples: object[], partialFailures: object[],
 *                     endpointsTried: number, fatal: object|null }>}
 */
export async function collectSle({ session, source, config, now = new Date() }) {
  const partialFailures = [];
  const samples = [];
  let endpointsTried = 0;

  endpointsTried += 1;
  const sitesResponse = await session.get('/v3/sites');
  if (!sitesResponse.ok) {
    // Without the site list there is nothing to scope SLEs to. This is fatal
    // for this collector, not for the whole source.
    return {
      samples: [],
      partialFailures,
      endpointsTried,
      fatal: {
        errorClass: sitesResponse.errorClass,
        summary: sitesResponse.errorSummary,
        status: sitesResponse.status,
      },
    };
  }

  const sites = normalizeSiteList(sitesResponse.data);
  if (sites.length === 0) {
    return { samples: [], partialFailures, endpointsTried, fatal: null };
  }

  for (const site of sites) {
    const [stationsResult, apsResult] = await Promise.all([
      session.get(`/v3/sites/${encodeURIComponent(site.id)}/stations`),
      session.get(`/v3/sites/${encodeURIComponent(site.id)}/aps`),
    ]);
    endpointsTried += 2;

    // A site we could not read is a gap for that site, not a zero, and not a
    // reason to abandon the remaining sites.
    if (!stationsResult.ok && !apsResult.ok) {
      partialFailures.push({
        scope: `site:${site.id}`,
        errorClass: stationsResult.errorClass ?? apsResult.errorClass,
        summary: stationsResult.errorSummary ?? apsResult.errorSummary,
      });
      continue;
    }
    if (!stationsResult.ok || !apsResult.ok) {
      const failed = stationsResult.ok ? apsResult : stationsResult;
      partialFailures.push({
        scope: `site:${site.id}`,
        errorClass: failed.errorClass,
        summary: failed.errorSummary,
      });
    }

    const { samples: siteSamples } = normalizeSleSamples(
      stationsResult.ok ? extractRows(stationsResult.data, ['stations', 'clients']) : [],
      apsResult.ok ? extractRows(apsResult.data, ['aps', 'accessPoints']) : [],
      {
        monitoredSourceId: source.id,
        orgId: source.orgId,
        siteGroupId: source.siteGroupId,
        siteId: site.id,
        collectedAt: now,
        retentionDays: config.retentionDays,
      }
    );
    samples.push(...siteSamples);
  }

  return { samples, partialFailures, endpointsTried, fatal: null };
}

export const SLE_METRIC_FAMILY = METRIC_FAMILIES.SLE;

/** Controllers return either a bare array or an envelope; accept both. */
export function extractRows(payload, keys) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of [...keys, 'data', 'items']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

export function normalizeSiteList(payload) {
  const rows = extractRows(payload, ['sites']);
  return rows
    .map((row) => ({
      id: row?.id ?? row?.siteId ?? row?.uuid ?? null,
      name: row?.siteName ?? row?.name ?? null,
    }))
    .filter((site) => site.id !== null);
}
