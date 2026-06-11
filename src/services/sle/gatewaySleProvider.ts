/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gateway / Controller SLE Provider
 *
 * Wraps the existing Campus Controller / Gateway SLE data flow. This is the
 * primary, pre-existing experience — the logic here is a faithful extraction of
 * what `SLEDashboard.loadData()` previously did inline, so behavior is preserved.
 *
 * Fetches stations + access points from the controller (single site, single
 * controller, or aggregated across all controllers in org scope), pulls
 * historical SLE points from the collection service, and computes the wireless
 * SLEs with the active thresholds.
 */

import { apiService } from '../api';
import { sleDataCollectionService } from '../sleDataCollection';
import { computeAllWirelessSLEs, setActiveThresholds } from '../sleCalculationEngine';
import type { SLESiteContext } from '../../types/sleContext';
import type { SLELoadOptions, SLEPageModel, SLEProvider } from '../../types/slePageModel';

function timeRangeToMs(timeRange: string): number {
  return timeRange === '1h' ? 3600000 : timeRange === '7d' ? 604800000 : 86400000;
}

async function loadControllerData(
  context: SLESiteContext,
  options: SLELoadOptions
): Promise<SLEPageModel> {
  const { timeRange, thresholds, siteGroups } = options;
  const selectedSite = context.siteId || 'all';
  const siteFilter = selectedSite !== 'all' ? selectedSite : undefined;
  const isOrgScope = context.isOrgScope && siteGroups.length > 0;

  let stationsArr: any[] = [];
  let apsArr: any[] = [];

  if (isOrgScope) {
    // Org scope: fetch from all controllers and aggregate
    const originalBaseUrl = apiService.getBaseUrl();
    for (const sg of siteGroups) {
      try {
        apiService.setBaseUrl(`${sg.controller_url}/management`);
        const [sgStations, sgAps] = await Promise.all([
          apiService.getStations(),
          apiService.getAccessPoints(),
        ]);
        stationsArr.push(...(Array.isArray(sgStations) ? sgStations : []));
        apsArr.push(...(Array.isArray(sgAps) ? sgAps : []));
      } catch (err) {
        console.warn(`[gatewaySleProvider] Failed to fetch from ${sg.name}:`, err);
      }
    }
    apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
  } else {
    // Single controller
    const [stationsData, apsData] = await Promise.all([
      siteFilter
        ? apiService
            .makeAuthenticatedRequest(`/v3/sites/${siteFilter}/stations`, { method: 'GET' }, 15000)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => (d ? (Array.isArray(d) ? d : d.stations || d.clients || d.data || []) : []))
            .catch(() =>
              apiService
                .getStations()
                .then((all) => {
                  return apiService.getSiteById(siteFilter!).then((site) => {
                    const name = site?.name || site?.siteName || siteFilter;
                    return all.filter(
                      (s: any) =>
                        s.siteName === name ||
                        s.siteId === siteFilter ||
                        s.siteName === siteFilter
                    );
                  });
                })
                .catch(() => [])
            )
        : apiService.getStations(),
      siteFilter ? apiService.getAccessPointsBySite(siteFilter) : apiService.getAccessPoints(),
    ]);
    stationsArr = Array.isArray(stationsData) ? stationsData : [];
    apsArr = Array.isArray(apsData) ? apsData : [];
  }

  // Historical data from the SLE collection service
  const historicalData = sleDataCollectionService.getFilteredData({
    siteId: selectedSite,
    scope: 'wireless',
    startTimestamp: Date.now() - timeRangeToMs(timeRange),
  });

  // Set active thresholds before computing SLEs
  setActiveThresholds(thresholds);

  const sles = computeAllWirelessSLEs(stationsArr, apsArr, historicalData);

  return {
    source: 'controller',
    context,
    sles,
    stations: stationsArr,
    aps: apsArr,
    generatedAt: Date.now(),
    unavailableMetrics: [],
    warnings: [],
  };
}

export const gatewaySleProvider: SLEProvider = {
  source: 'controller',
  load: loadControllerData,
};
