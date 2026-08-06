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

  // APs are fetched ONCE for the whole controller and grouped by site.
  // There is no per-site AP endpoint: /v3/sites/{id}/aps, /v1/sites/{id}/aps and
  // /v3/sites/{id}/accessPoints all 404 on XCC 10.18.1.0-011R. Querying per site
  // therefore failed for every site, which is why ap_health and capacity never
  // produced samples.
  const apsResult = await session.get('/v1/aps/query');
  endpointsTried += 1;
  if (!apsResult.ok) {
    partialFailures.push({
      scope: 'aps',
      errorClass: apsResult.errorClass,
      summary: apsResult.errorSummary,
    });
  }
  const apsBySite = groupApsBySite(
    apsResult.ok ? extractRows(apsResult.data, ['aps', 'accessPoints']) : [],
    sites
  );

  for (const site of sites) {
    const stationsResult = await session.get(
      `/v3/sites/${encodeURIComponent(site.id)}/stations`
    );
    endpointsTried += 1;

    // A site we could not read is a gap for that site, not a zero, and not a
    // reason to abandon the remaining sites.
    if (!stationsResult.ok) {
      partialFailures.push({
        scope: `site:${site.id}`,
        errorClass: stationsResult.errorClass,
        summary: stationsResult.errorSummary,
      });
    }

    const { samples: siteSamples } = normalizeSleSamples(
      stationsResult.ok ? extractRows(stationsResult.data, ['stations', 'clients']) : [],
      apsBySite.get(site.id) ?? [],
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

/**
 * Group controller-wide AP rows by site.
 *
 * AP rows carry no `siteId` — the link is `hostSite`, which holds the site
 * *name*. This mirrors the matching `apiService.getAccessPointsBySite` already
 * does in the browser. An AP whose `hostSite` matches no known site is left out
 * rather than guessed into one.
 *
 * @param {any[]} apRows
 * @param {Array<{id: string, name: string|null}>} sites
 * @returns {Map<string, any[]>} site id -> AP rows
 */
export function groupApsBySite(apRows, sites) {
  const byName = new Map();
  for (const site of sites) {
    if (site.name) byName.set(String(site.name).trim().toLowerCase(), site.id);
  }

  const grouped = new Map(sites.map((site) => [site.id, []]));

  for (const ap of apRows) {
    const candidates = [ap?.hostSite, ap?.siteName, ap?.site, ap?.siteId];
    let siteId = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const key = String(candidate).trim().toLowerCase();
      if (byName.has(key)) {
        siteId = byName.get(key);
        break;
      }
      // An AP may carry the site id directly on other controller versions.
      if (grouped.has(String(candidate).trim())) {
        siteId = String(candidate).trim();
        break;
      }
    }
    if (siteId) grouped.get(siteId).push(ap);
  }

  return grouped;
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
