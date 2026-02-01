/**
 * Workspace Data Service
 *
 * Integrates workspace widgets with existing dashboard API endpoints.
 * No mock data - all data comes from production endpoints.
 */

import type { WidgetCatalogItem, WorkspaceContext, WorkspaceWidget } from '@/hooks/useWorkspace';
import { WIDGET_CATALOG } from '@/hooks/useWorkspace';

/**
 * Normalized data response from widget data fetching
 */
export interface WidgetDataResponse {
  data: any;
  metadata?: {
    totalCount?: number;
    timeRange?: { start: number; end: number };
    source?: string;
  };
}

/**
 * Fetch widget data using existing dashboard API endpoints
 */
export async function fetchWidgetData(
  widget: WorkspaceWidget,
  context: WorkspaceContext,
  api: any // API service instance
): Promise<WidgetDataResponse> {
  const catalogItem = WIDGET_CATALOG.find(item => item.id === widget.catalogId);
  if (!catalogItem) {
    throw new Error(`Widget catalog item not found: ${widget.catalogId}`);
  }

  const { endpointRef } = catalogItem.dataBinding;
  const effectiveSiteId = widget.localFilters?.siteId || context.siteId;
  const effectiveTimeRange = widget.localFilters?.timeRange || context.timeRange;

  // Route to appropriate data fetcher based on endpoint reference
  switch (endpointRef) {
    case 'access_points.list':
      return fetchAccessPointsList(api, effectiveSiteId, catalogItem);

    case 'access_points.timeseries':
      return fetchAccessPointsTimeseries(api, effectiveSiteId, effectiveTimeRange, catalogItem);

    case 'clients.list':
      return fetchClientsList(api, effectiveSiteId, catalogItem);

    case 'clients.timeseries':
      return fetchClientsTimeseries(api, effectiveSiteId, effectiveTimeRange, widget.localFilters?.clientId, catalogItem);

    case 'app_insights.top_apps':
      return fetchAppInsightsTopApps(api, effectiveSiteId, effectiveTimeRange, catalogItem);

    case 'app_insights.app_timeseries':
      return fetchAppInsightsTimeseries(api, effectiveSiteId, effectiveTimeRange, catalogItem);

    case 'client_experience.rfqi':
      return fetchClientExperienceRFQI(api, effectiveSiteId, effectiveTimeRange, catalogItem);

    case 'contextual_insights.insights_feed':
      return fetchContextualInsights(api, effectiveSiteId, effectiveTimeRange);

    default:
      throw new Error(`Unknown endpoint reference: ${endpointRef}`);
  }
}

/**
 * Fetch access points list
 */
async function fetchAccessPointsList(
  api: any,
  siteId: string | null,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  let accessPoints = await api.getAccessPoints();

  // Filter by site if specified
  if (siteId) {
    accessPoints = accessPoints.filter((ap: any) =>
      ap.hostSite === siteId || ap.siteId === siteId || ap.siteName === siteId
    );
  }

  // Transform to expected format
  const transformedData = accessPoints.map((ap: any) => ({
    ap_id: ap.serialNumber,
    ap_name: ap.displayName || ap.serialNumber,
    site_id: ap.siteId || ap.hostSite,
    site_name: ap.siteName || ap.hostSite,
    model: ap.model,
    serial: ap.serialNumber,
    status: ap.status,
    uptime_seconds: ap.uptime ? parseUptime(ap.uptime) : 0,
    client_count: ap.clientCount || ap.associatedClients || 0,
    throughput_bps: ap.throughput || 0,
    channel_utilization_percent: ap.channelUtilization || 0,
    noise_floor_dbm: ap.noiseFloor || -95,
    retries_percent: ap.retryRate || 0,
    tx_power_dbm: ap.txPower || 0,
    channel: ap.channel || 0,
    band: ap.band || '5GHz',
    rfqi_score: calculateApRfqiScore(ap),
  }));

  // Sort if specified
  if (catalogItem.dataBinding.sortField) {
    const field = catalogItem.dataBinding.sortField;
    const direction = catalogItem.dataBinding.sortDirection || 'desc';
    transformedData.sort((a: any, b: any) => {
      const aVal = a[field] ?? 0;
      const bVal = b[field] ?? 0;
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  // Limit if specified
  const limit = catalogItem.dataBinding.limit || 50;
  const limitedData = transformedData.slice(0, limit);

  return {
    data: limitedData,
    metadata: {
      totalCount: transformedData.length,
      source: 'access_points.list',
    },
  };
}

/**
 * Fetch access points timeseries data
 */
async function fetchAccessPointsTimeseries(
  api: any,
  siteId: string | null,
  timeRange: string,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  // Get site report with timeseries widgets
  if (!siteId) {
    // For global scope, aggregate across all sites
    const sites = await api.getSites();
    if (sites.length === 0) {
      return { data: [], metadata: { source: 'access_points.timeseries' } };
    }
    // Use first site as representative for now
    siteId = sites[0]?.id;
  }

  try {
    const widgetData = await api.fetchWidgetData(siteId, [
      'throughputReport',
      'countOfUniqueUsersReport',
      'channelUtilization5',
      'channelUtilization2_4',
      'noisePerRadio',
    ], timeRange);

    const timeseriesData = {
      throughput_bps: extractTimeseries(widgetData.throughputReport),
      client_count: extractTimeseries(widgetData.countOfUniqueUsersReport),
      channel_utilization_percent: mergeTimeseries(
        extractTimeseries(widgetData.channelUtilization5),
        extractTimeseries(widgetData.channelUtilization2_4)
      ),
      noise_floor_dbm: extractTimeseries(widgetData.noisePerRadio),
    };

    return {
      data: timeseriesData,
      metadata: {
        timeRange: getTimeRangeMs(timeRange),
        source: 'access_points.timeseries',
      },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch AP timeseries:', error);
    return { data: {}, metadata: { source: 'access_points.timeseries' } };
  }
}

/**
 * Fetch clients list
 */
async function fetchClientsList(
  api: any,
  siteId: string | null,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  // Filter by site if specified
  if (siteId) {
    clients = clients.filter((client: any) =>
      client.siteId === siteId || client.siteName === siteId
    );
  }

  // Transform to expected format
  const transformedData = clients.map((client: any) => ({
    client_id: client.macAddress,
    mac: client.macAddress,
    hostname: client.hostName || client.hostname || 'Unknown',
    device_type: client.deviceType || 'Unknown',
    os_type: client.osType || client.os || 'Unknown',
    ap_id: client.apSerial,
    ap_name: client.apName || client.apSerial,
    site_id: client.siteId,
    ssid: client.ssid || client.network,
    band: client.band || '5GHz',
    rssi_dbm: client.rssi || -70,
    snr_db: client.snr || 25,
    tx_rate_mbps: client.txRate || 0,
    rx_rate_mbps: client.rxRate || 0,
    retries_percent: client.retryRate || 0,
    roam_count: client.roamCount || 0,
    ip: client.ipAddress,
    vlan: client.vlan,
    throughput_bps: (client.rxBytes || 0) + (client.txBytes || 0),
    rfqi_score: calculateClientRfqiScore(client),
  }));

  // Sort if specified
  if (catalogItem.dataBinding.sortField) {
    const field = catalogItem.dataBinding.sortField;
    const direction = catalogItem.dataBinding.sortDirection || 'desc';
    transformedData.sort((a: any, b: any) => {
      const aVal = a[field] ?? 0;
      const bVal = b[field] ?? 0;
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  // Limit if specified
  const limit = catalogItem.dataBinding.limit || 50;
  const limitedData = transformedData.slice(0, limit);

  return {
    data: limitedData,
    metadata: {
      totalCount: transformedData.length,
      source: 'clients.list',
    },
  };
}

/**
 * Fetch clients timeseries data
 */
async function fetchClientsTimeseries(
  api: any,
  siteId: string | null,
  timeRange: string,
  clientId: string | undefined,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  if (clientId) {
    // Fetch specific client's timeseries
    try {
      const stationReport = await api.getStationReport(clientId, timeRange);
      return {
        data: stationReport,
        metadata: {
          timeRange: getTimeRangeMs(timeRange),
          source: 'clients.timeseries',
        },
      };
    } catch (error) {
      console.warn('[WorkspaceDataService] Failed to fetch client timeseries:', error);
    }
  }

  // Return aggregate client metrics for site
  return {
    data: {},
    metadata: {
      timeRange: getTimeRangeMs(timeRange),
      source: 'clients.timeseries',
    },
  };
}

/**
 * Fetch app insights top apps
 */
async function fetchAppInsightsTopApps(
  api: any,
  siteId: string | null,
  timeRange: string,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  try {
    const appInsights = await api.getAppInsights(timeRange, siteId || undefined);

    // Combine and transform app data
    const topApps = (appInsights.topAppGroupsByUsage || []).map((app: any) => ({
      app_id: app.id,
      app_name: app.name,
      category: app.category || 'Uncategorized',
      bytes: app.value || 0,
      flows: app.flows || 0,
      clients_impacted: app.clientCount || 0,
      latency_ms: app.latency || 0,
      packet_loss_percent: app.packetLoss || 0,
      jitter_ms: app.jitter || 0,
    }));

    // Sort if specified
    if (catalogItem.dataBinding.sortField) {
      const field = catalogItem.dataBinding.sortField;
      const direction = catalogItem.dataBinding.sortDirection || 'desc';
      topApps.sort((a: any, b: any) => {
        const aVal = a[field] ?? 0;
        const bVal = b[field] ?? 0;
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    const limit = catalogItem.dataBinding.limit || 25;
    return {
      data: topApps.slice(0, limit),
      metadata: {
        totalCount: topApps.length,
        source: 'app_insights.top_apps',
      },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch app insights:', error);
    return { data: [], metadata: { source: 'app_insights.top_apps' } };
  }
}

/**
 * Fetch app insights timeseries
 */
async function fetchAppInsightsTimeseries(
  api: any,
  siteId: string | null,
  timeRange: string,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  // App timeseries data typically comes from site reports
  if (!siteId) {
    return { data: {}, metadata: { source: 'app_insights.app_timeseries' } };
  }

  try {
    const widgetData = await api.fetchWidgetData(siteId, [
      'topAppGroupsByUsage',
      'topAppGroupsByThroughputReport',
    ], timeRange);

    return {
      data: widgetData,
      metadata: {
        timeRange: getTimeRangeMs(timeRange),
        source: 'app_insights.app_timeseries',
      },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch app timeseries:', error);
    return { data: {}, metadata: { source: 'app_insights.app_timeseries' } };
  }
}

/**
 * Fetch client experience RFQI data
 */
async function fetchClientExperienceRFQI(
  api: any,
  siteId: string | null,
  timeRange: string,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  try {
    // Fetch RF Quality data from site report
    if (siteId) {
      const rfqData = await api.fetchRFQualityData(siteId, timeRange);

      // Calculate aggregate RFQI score
      const score = calculateAggregateRfqiScore(rfqData);

      return {
        data: {
          score,
          score_components: {
            rssi: rfqData.rssi || 0,
            snr: rfqData.snr || 0,
            retries: rfqData.retryRate || 0,
            channel_utilization: rfqData.channelUtilization || 0,
            noise: rfqData.noiseFloor || 0,
            roaming: rfqData.roamingRate || 0,
            latency: rfqData.latency || 0,
            packet_loss: rfqData.packetLoss || 0,
          },
          time_window: timeRange,
        },
        metadata: {
          timeRange: getTimeRangeMs(timeRange),
          source: 'client_experience.rfqi',
        },
      };
    }

    // Global aggregate - combine all sites
    const sites = await api.getSites();
    let totalScore = 0;
    let siteCount = 0;

    for (const site of sites.slice(0, 10)) { // Limit to avoid too many requests
      try {
        const rfqData = await api.fetchRFQualityData(site.id, timeRange);
        const siteScore = calculateAggregateRfqiScore(rfqData);
        if (siteScore > 0) {
          totalScore += siteScore;
          siteCount++;
        }
      } catch {
        // Skip sites with errors
      }
    }

    const avgScore = siteCount > 0 ? Math.round(totalScore / siteCount) : 0;

    return {
      data: {
        score: avgScore,
        score_components: {},
        time_window: timeRange,
      },
      metadata: {
        source: 'client_experience.rfqi',
      },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch RFQI data:', error);
    return {
      data: { score: 0, score_components: {} },
      metadata: { source: 'client_experience.rfqi' },
    };
  }
}

/**
 * Fetch contextual insights
 */
async function fetchContextualInsights(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    // Fetch events that serve as insights
    const [apEvents, clientEvents] = await Promise.all([
      siteId ? api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange)) : Promise.resolve([]),
      Promise.resolve([]), // Client events can be added if needed
    ]);

    // Transform events to insights format
    const insights = transformEventsToInsights(apEvents, clientEvents);

    return {
      data: insights,
      metadata: {
        timeRange: getTimeRangeMs(timeRange),
        source: 'contextual_insights.insights_feed',
      },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch contextual insights:', error);
    return { data: [], metadata: { source: 'contextual_insights.insights_feed' } };
  }
}

// Helper functions

function parseUptime(uptime: string): number {
  // Parse uptime string like "5d 12h 30m" to seconds
  const days = uptime.match(/(\d+)d/)?.[1] || 0;
  const hours = uptime.match(/(\d+)h/)?.[1] || 0;
  const minutes = uptime.match(/(\d+)m/)?.[1] || 0;
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60;
}

function calculateApRfqiScore(ap: any): number {
  // Calculate RFQI score based on AP metrics
  let score = 100;

  // Channel utilization penalty (high utilization = lower score)
  const utilization = ap.channelUtilization || 0;
  if (utilization > 80) score -= 30;
  else if (utilization > 60) score -= 20;
  else if (utilization > 40) score -= 10;

  // Noise floor penalty
  const noise = ap.noiseFloor || -95;
  if (noise > -80) score -= 20;
  else if (noise > -85) score -= 10;

  // Retry rate penalty
  const retries = ap.retryRate || 0;
  if (retries > 20) score -= 25;
  else if (retries > 10) score -= 15;
  else if (retries > 5) score -= 5;

  // Client count consideration (high client count with good metrics = bonus)
  const clients = ap.clientCount || 0;
  if (clients > 50 && score > 70) score = Math.min(100, score + 5);

  return Math.max(0, Math.min(100, score));
}

function calculateClientRfqiScore(client: any): number {
  // Calculate RFQI score based on client metrics
  let score = 100;

  // RSSI penalty
  const rssi = client.rssi || -70;
  if (rssi < -80) score -= 30;
  else if (rssi < -75) score -= 20;
  else if (rssi < -70) score -= 10;

  // SNR penalty
  const snr = client.snr || 25;
  if (snr < 15) score -= 25;
  else if (snr < 20) score -= 15;
  else if (snr < 25) score -= 5;

  // Retry rate penalty
  const retries = client.retryRate || 0;
  if (retries > 20) score -= 20;
  else if (retries > 10) score -= 10;

  // Roaming penalty (frequent roaming may indicate issues)
  const roams = client.roamCount || 0;
  if (roams > 10) score -= 15;
  else if (roams > 5) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function calculateAggregateRfqiScore(rfqData: any): number {
  // Calculate aggregate RFQI score from RF quality data
  let score = 100;

  if (rfqData.channelUtilization > 70) score -= 20;
  if (rfqData.retryRate > 15) score -= 20;
  if (rfqData.noiseFloor > -85) score -= 15;
  if (rfqData.interference > 30) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function extractTimeseries(reportData: any): any[] {
  if (!reportData) return [];
  if (Array.isArray(reportData)) return reportData;
  if (reportData.data) return reportData.data;
  if (reportData.timeSeries) return reportData.timeSeries;
  return [];
}

function mergeTimeseries(series1: any[], series2: any[]): any[] {
  // Merge two timeseries by averaging values at same timestamps
  const merged = new Map();

  for (const point of series1) {
    const ts = point.timestamp || point.time;
    merged.set(ts, { timestamp: ts, value: point.value });
  }

  for (const point of series2) {
    const ts = point.timestamp || point.time;
    if (merged.has(ts)) {
      const existing = merged.get(ts);
      existing.value = (existing.value + point.value) / 2;
    } else {
      merged.set(ts, { timestamp: ts, value: point.value });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function getTimeRangeMs(timeRange: string): { start: number; end: number } {
  const now = Date.now();
  const durations: Record<string, number> = {
    '1H': 60 * 60 * 1000,
    '3H': 3 * 60 * 60 * 1000,
    '24H': 24 * 60 * 60 * 1000,
    '7D': 7 * 24 * 60 * 60 * 1000,
    '30D': 30 * 24 * 60 * 60 * 1000,
  };
  const duration = durations[timeRange] || durations['24H'];
  return { start: now - duration, end: now };
}

function getTimeRangeDays(timeRange: string): number {
  const days: Record<string, number> = {
    '1H': 1,
    '3H': 1,
    '24H': 1,
    '7D': 7,
    '30D': 30,
  };
  return days[timeRange] || 1;
}

function transformEventsToInsights(apEvents: any[], clientEvents: any[]): any[] {
  const insights: any[] = [];

  // Transform AP events to insights
  for (const event of apEvents) {
    if (event.severity === 'critical' || event.severity === 'warning') {
      insights.push({
        insight_id: `ap-${event.id || Date.now()}`,
        severity: event.severity,
        category: 'wireless',
        title: event.title || event.type || 'AP Event',
        description: event.description || event.message || '',
        start_time: event.timestamp || event.startTime,
        end_time: event.endTime,
        affected_entities: [event.apSerial || event.apName],
        recommended_actions: event.actions || [],
      });
    }
  }

  // Sort by timestamp descending
  insights.sort((a, b) => (b.start_time || 0) - (a.start_time || 0));

  return insights.slice(0, 50);
}
