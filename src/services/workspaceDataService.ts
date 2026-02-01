/**
 * Workspace Data Service
 *
 * Integrates workspace widgets with existing dashboard API endpoints.
 * No mock data - all data comes from production endpoints.
 * Implements ClientIdentityDisplayPolicy for human-readable client display.
 */

import type { WidgetCatalogItem, WorkspaceContext, WorkspaceWidget } from '@/hooks/useWorkspace';
import { WIDGET_CATALOG } from '@/hooks/useWorkspace';
import {
  resolveClientIdentity,
  getExperienceStateLabel,
  type ClientIdentity,
} from '@/lib/clientIdentity';

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
    // Access Points endpoints
    case 'access_points.list':
      return fetchAccessPointsList(api, effectiveSiteId, catalogItem);
    case 'access_points.timeseries':
      return fetchAccessPointsTimeseries(api, effectiveSiteId, effectiveTimeRange, catalogItem);
    case 'access_points.status_summary':
      return fetchAccessPointsStatusSummary(api, effectiveSiteId);
    case 'access_points.channel_util_timeseries':
      return fetchAccessPointsChannelUtilTimeseries(api, effectiveSiteId, effectiveTimeRange);
    case 'access_points.by_model':
      return fetchAccessPointsByModel(api, effectiveSiteId);

    // Clients endpoints
    case 'clients.list':
      return fetchClientsList(api, effectiveSiteId, catalogItem);
    case 'clients.timeseries':
      return fetchClientsTimeseries(api, effectiveSiteId, effectiveTimeRange, widget.localFilters?.clientId, catalogItem);
    case 'clients.by_device_type':
      return fetchClientsByDeviceType(api, effectiveSiteId);
    case 'clients.by_manufacturer':
      return fetchClientsByManufacturer(api, effectiveSiteId);
    case 'clients.by_band':
      return fetchClientsByBand(api, effectiveSiteId);
    case 'clients.by_ssid':
      return fetchClientsBySSID(api, effectiveSiteId);
    case 'clients.count_summary':
      return fetchClientsCountSummary(api, effectiveSiteId);
    case 'clients.count_timeseries':
      return fetchClientsCountTimeseries(api, effectiveSiteId, effectiveTimeRange);

    // Client Experience endpoints
    case 'client_experience.rfqi':
      return fetchClientExperienceRFQI(api, effectiveSiteId, effectiveTimeRange, catalogItem);
    case 'client_experience.distribution':
      return fetchClientExperienceDistribution(api, effectiveSiteId);
    case 'client_experience.rf_components':
      return fetchClientExperienceRFComponents(api, effectiveSiteId, effectiveTimeRange);
    case 'client_experience.by_ssid':
      return fetchClientExperienceBySSID(api, effectiveSiteId);

    // App Insights endpoints
    case 'app_insights.top_apps':
      return fetchAppInsightsTopApps(api, effectiveSiteId, effectiveTimeRange, catalogItem);
    case 'app_insights.app_timeseries':
      return fetchAppInsightsTimeseries(api, effectiveSiteId, effectiveTimeRange, catalogItem);
    case 'app_insights.by_category':
      return fetchAppInsightsByCategory(api, effectiveSiteId, effectiveTimeRange);
    case 'app_insights.summary':
      return fetchAppInsightsSummary(api, effectiveSiteId, effectiveTimeRange);

    // Contextual Insights endpoints
    case 'contextual_insights.insights_feed':
      return fetchContextualInsights(api, effectiveSiteId, effectiveTimeRange);
    case 'contextual_insights.roaming_events':
      return fetchRoamingEvents(api, effectiveSiteId, effectiveTimeRange);
    case 'contextual_insights.association_events':
      return fetchAssociationEvents(api, effectiveSiteId, effectiveTimeRange);
    case 'contextual_insights.rf_events':
      return fetchRFEvents(api, effectiveSiteId, effectiveTimeRange);
    case 'contextual_insights.failed_associations':
      return fetchFailedAssociations(api, effectiveSiteId, effectiveTimeRange, catalogItem);
    case 'contextual_insights.anomalies':
      return fetchAnomalies(api, effectiveSiteId, effectiveTimeRange);
    case 'contextual_insights.summary':
      return fetchInsightsSummary(api, effectiveSiteId, effectiveTimeRange);

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
 * Implements ClientIdentityDisplayPolicy - human-readable identity is prioritized
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

  // Transform to expected format with identity resolution
  // ClientIdentityDisplayPolicy: MAC is primary key, not primary label
  const transformedData = clients.map((client: any) => {
    // Resolve human-readable identity
    const identity = resolveClientIdentity(client);
    const rfqiScore = calculateClientRfqiScore(client);

    return {
      // Human-readable identity (PRIMARY - first column)
      display_name: identity.displayName,
      identity_source: identity.identitySource,

      // Experience context (required to be visible)
      rfqi_score: rfqiScore,
      experience_state: getExperienceStateLabel(rfqiScore),

      // Device classification
      device_type: identity.deviceType || 'Unknown',
      device_category: identity.deviceCategory,
      manufacturer: identity.manufacturer,
      os_type: identity.osType || 'Unknown',

      // Network context
      ap_name: identity.apName || client.apSerial,
      ssid: identity.ssid || client.network,
      site_name: identity.siteName,
      band: client.band || '5GHz',

      // RF metrics
      rssi_dbm: client.rssi || -70,
      snr_db: client.snr || 25,
      retries_percent: client.retryRate || 0,
      roam_count: client.roamCount || 0,
      throughput_bps: (client.rxBytes || 0) + (client.txBytes || 0),

      // Network metadata (MAC is secondary, not primary label)
      mac_address: identity.macAddress,
      ip_address: identity.ipAddress,
      vlan: identity.vlan,

      // Legacy fields for compatibility
      client_id: client.macAddress,
      hostname: identity.hostname,
      ap_id: client.apSerial,
      site_id: client.siteId,
    };
  });

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

// ========================================
// ADDITIONAL ACCESS POINTS FETCHERS
// ========================================

async function fetchAccessPointsStatusSummary(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let accessPoints = await api.getAccessPoints();

  if (siteId) {
    accessPoints = accessPoints.filter((ap: any) =>
      ap.hostSite === siteId || ap.siteId === siteId
    );
  }

  const online = accessPoints.filter((ap: any) => ap.status === 'online' || ap.status === 'up').length;
  const offline = accessPoints.filter((ap: any) => ap.status === 'offline' || ap.status === 'down').length;
  const degraded = accessPoints.filter((ap: any) => ap.status === 'degraded' || ap.status === 'warning').length;

  return {
    data: {
      online_count: online,
      offline_count: offline,
      degraded_count: degraded,
      total_count: accessPoints.length,
    },
    metadata: { source: 'access_points.status_summary' },
  };
}

async function fetchAccessPointsChannelUtilTimeseries(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  if (!siteId) {
    const sites = await api.getSites();
    siteId = sites[0]?.id;
  }
  if (!siteId) {
    return { data: {}, metadata: { source: 'access_points.channel_util_timeseries' } };
  }

  try {
    const widgetData = await api.fetchWidgetData(siteId, ['channelUtilization5', 'channelUtilization2_4'], timeRange);
    return {
      data: {
        channel_util_5ghz: extractTimeseries(widgetData.channelUtilization5),
        channel_util_2_4ghz: extractTimeseries(widgetData.channelUtilization2_4),
      },
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'access_points.channel_util_timeseries' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch channel utilization timeseries:', error);
    return { data: {}, metadata: { source: 'access_points.channel_util_timeseries' } };
  }
}

async function fetchAccessPointsByModel(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let accessPoints = await api.getAccessPoints();

  if (siteId) {
    accessPoints = accessPoints.filter((ap: any) =>
      ap.hostSite === siteId || ap.siteId === siteId
    );
  }

  // Group by model
  const byModel = new Map<string, { count: number; online: number; clients: number; throughput: number }>();

  for (const ap of accessPoints) {
    const model = ap.model || 'Unknown';
    const existing = byModel.get(model) || { count: 0, online: 0, clients: 0, throughput: 0 };
    existing.count++;
    if (ap.status === 'online' || ap.status === 'up') existing.online++;
    existing.clients += ap.clientCount || 0;
    existing.throughput += ap.throughput || 0;
    byModel.set(model, existing);
  }

  const data = Array.from(byModel.entries()).map(([model, stats]) => ({
    model,
    count: stats.count,
    online_count: stats.online,
    avg_clients: Math.round(stats.clients / stats.count),
    avg_throughput: Math.round(stats.throughput / stats.count),
  }));

  data.sort((a, b) => b.count - a.count);

  return {
    data,
    metadata: { totalCount: data.length, source: 'access_points.by_model' },
  };
}

// ========================================
// ADDITIONAL CLIENTS FETCHERS
// ========================================

async function fetchClientsByDeviceType(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const byType = new Map<string, { count: number; rssi: number; snr: number; throughput: number }>();

  for (const client of clients) {
    const identity = resolveClientIdentity(client);
    const deviceType = identity.deviceType || 'Unknown';
    const existing = byType.get(deviceType) || { count: 0, rssi: 0, snr: 0, throughput: 0 };
    existing.count++;
    existing.rssi += client.rssi || -70;
    existing.snr += client.snr || 25;
    existing.throughput += (client.rxBytes || 0) + (client.txBytes || 0);
    byType.set(deviceType, existing);
  }

  const data = Array.from(byType.entries()).map(([deviceType, stats]) => ({
    device_type: deviceType,
    count: stats.count,
    avg_rssi: Math.round(stats.rssi / stats.count),
    avg_snr: Math.round(stats.snr / stats.count),
    avg_throughput: Math.round(stats.throughput / stats.count),
  }));

  data.sort((a, b) => b.count - a.count);

  return {
    data,
    metadata: { totalCount: data.length, source: 'clients.by_device_type' },
  };
}

async function fetchClientsByManufacturer(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const byManufacturer = new Map<string, { count: number; rssi: number; rfqi: number }>();

  for (const client of clients) {
    const identity = resolveClientIdentity(client);
    const manufacturer = identity.manufacturer || 'Unknown';
    const existing = byManufacturer.get(manufacturer) || { count: 0, rssi: 0, rfqi: 0 };
    existing.count++;
    existing.rssi += client.rssi || -70;
    existing.rfqi += calculateClientRfqiScore(client);
    byManufacturer.set(manufacturer, existing);
  }

  const data = Array.from(byManufacturer.entries()).map(([manufacturer, stats]) => ({
    manufacturer,
    count: stats.count,
    avg_rssi: Math.round(stats.rssi / stats.count),
    avg_experience: Math.round(stats.rfqi / stats.count),
  }));

  data.sort((a, b) => b.count - a.count);

  return {
    data,
    metadata: { totalCount: data.length, source: 'clients.by_manufacturer' },
  };
}

async function fetchClientsByBand(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const byBand = new Map<string, { count: number; rssi: number; throughput: number; rfqi: number }>();

  for (const client of clients) {
    const band = client.band || client.radioBand || '5GHz';
    const existing = byBand.get(band) || { count: 0, rssi: 0, throughput: 0, rfqi: 0 };
    existing.count++;
    existing.rssi += client.rssi || -70;
    existing.throughput += (client.rxBytes || 0) + (client.txBytes || 0);
    existing.rfqi += calculateClientRfqiScore(client);
    byBand.set(band, existing);
  }

  const data = Array.from(byBand.entries()).map(([band, stats]) => ({
    band,
    count: stats.count,
    avg_rssi: Math.round(stats.rssi / stats.count),
    avg_throughput: Math.round(stats.throughput / stats.count),
    avg_experience: Math.round(stats.rfqi / stats.count),
  }));

  data.sort((a, b) => b.count - a.count);

  return {
    data,
    metadata: { totalCount: data.length, source: 'clients.by_band' },
  };
}

async function fetchClientsBySSID(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const bySSID = new Map<string, { count: number; rssi: number; throughput: number; rfqi: number }>();

  for (const client of clients) {
    const ssid = client.network || client.ssid || 'Unknown';
    const existing = bySSID.get(ssid) || { count: 0, rssi: 0, throughput: 0, rfqi: 0 };
    existing.count++;
    existing.rssi += client.rssi || -70;
    existing.throughput += (client.rxBytes || 0) + (client.txBytes || 0);
    existing.rfqi += calculateClientRfqiScore(client);
    bySSID.set(ssid, existing);
  }

  const data = Array.from(bySSID.entries()).map(([ssid, stats]) => ({
    ssid,
    count: stats.count,
    avg_rssi: Math.round(stats.rssi / stats.count),
    avg_throughput: Math.round(stats.throughput / stats.count),
    avg_experience: Math.round(stats.rfqi / stats.count),
  }));

  data.sort((a, b) => b.count - a.count);

  return {
    data,
    metadata: { totalCount: data.length, source: 'clients.by_ssid' },
  };
}

async function fetchClientsCountSummary(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const uniqueMacs = new Set(clients.map((c: any) => c.macAddress));
  const activeClients = clients.filter((c: any) => {
    const throughput = (c.rxBytes || 0) + (c.txBytes || 0);
    return throughput > 0;
  });

  return {
    data: {
      total_count: clients.length,
      unique_count: uniqueMacs.size,
      active_count: activeClients.length,
      idle_count: clients.length - activeClients.length,
    },
    metadata: { source: 'clients.count_summary' },
  };
}

async function fetchClientsCountTimeseries(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  if (!siteId) {
    const sites = await api.getSites();
    siteId = sites[0]?.id;
  }
  if (!siteId) {
    return { data: {}, metadata: { source: 'clients.count_timeseries' } };
  }

  try {
    const widgetData = await api.fetchWidgetData(siteId, ['countOfUniqueUsersReport'], timeRange);
    return {
      data: {
        client_count: extractTimeseries(widgetData.countOfUniqueUsersReport),
      },
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'clients.count_timeseries' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch client count timeseries:', error);
    return { data: {}, metadata: { source: 'clients.count_timeseries' } };
  }
}

// ========================================
// ADDITIONAL CLIENT EXPERIENCE FETCHERS
// ========================================

async function fetchClientExperienceDistribution(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  let good = 0, fair = 0, poor = 0;

  for (const client of clients) {
    const score = calculateClientRfqiScore(client);
    if (score >= 70) good++;
    else if (score >= 40) fair++;
    else poor++;
  }

  return {
    data: {
      good_count: good,
      fair_count: fair,
      poor_count: poor,
      total_clients: clients.length,
    },
    metadata: { source: 'client_experience.distribution' },
  };
}

async function fetchClientExperienceRFComponents(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  if (!siteId) {
    const sites = await api.getSites();
    siteId = sites[0]?.id;
  }
  if (!siteId) {
    return { data: {}, metadata: { source: 'client_experience.rf_components' } };
  }

  try {
    const widgetData = await api.fetchWidgetData(siteId, [
      'rfQuality',
      'channelUtilization5',
      'noisePerRadio',
      'retransmittedPackets',
    ], timeRange);

    return {
      data: {
        rf_quality: extractTimeseries(widgetData.rfQuality),
        channel_utilization: extractTimeseries(widgetData.channelUtilization5),
        noise_floor: extractTimeseries(widgetData.noisePerRadio),
        retry_rate: extractTimeseries(widgetData.retransmittedPackets),
      },
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'client_experience.rf_components' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch RF components:', error);
    return { data: {}, metadata: { source: 'client_experience.rf_components' } };
  }
}

async function fetchClientExperienceBySSID(
  api: any,
  siteId: string | null
): Promise<WidgetDataResponse> {
  let clients = await api.getStationsWithSiteCorrelation();

  if (siteId) {
    clients = clients.filter((c: any) => c.siteId === siteId);
  }

  const bySSID = new Map<string, { count: number; rfqi: number; rssi: number; snr: number; retries: number }>();

  for (const client of clients) {
    const ssid = client.network || client.ssid || 'Unknown';
    const existing = bySSID.get(ssid) || { count: 0, rfqi: 0, rssi: 0, snr: 0, retries: 0 };
    existing.count++;
    existing.rfqi += calculateClientRfqiScore(client);
    existing.rssi += client.rssi || -70;
    existing.snr += client.snr || 25;
    existing.retries += client.retryRate || 0;
    bySSID.set(ssid, existing);
  }

  const data = Array.from(bySSID.entries()).map(([ssid, stats]) => ({
    ssid,
    client_count: stats.count,
    avg_rfqi: Math.round(stats.rfqi / stats.count),
    avg_rssi: Math.round(stats.rssi / stats.count),
    avg_snr: Math.round(stats.snr / stats.count),
    avg_retries: Math.round((stats.retries / stats.count) * 10) / 10,
  }));

  data.sort((a, b) => a.avg_rfqi - b.avg_rfqi);

  return {
    data,
    metadata: { totalCount: data.length, source: 'client_experience.by_ssid' },
  };
}

// ========================================
// ADDITIONAL APP INSIGHTS FETCHERS
// ========================================

async function fetchAppInsightsByCategory(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const appInsights = await api.getAppInsights(timeRange, siteId || undefined);
    const apps = appInsights.topAppGroupsByUsage || [];

    const byCategory = new Map<string, { apps: number; bytes: number; clients: number; latency: number }>();

    for (const app of apps) {
      const category = app.category || 'Uncategorized';
      const existing = byCategory.get(category) || { apps: 0, bytes: 0, clients: 0, latency: 0 };
      existing.apps++;
      existing.bytes += app.value || 0;
      existing.clients += app.clientCount || 0;
      existing.latency += app.latency || 0;
      byCategory.set(category, existing);
    }

    const data = Array.from(byCategory.entries()).map(([category, stats]) => ({
      category,
      app_count: stats.apps,
      bytes: stats.bytes,
      clients_impacted: stats.clients,
      avg_latency_ms: stats.apps > 0 ? Math.round(stats.latency / stats.apps) : 0,
    }));

    data.sort((a, b) => b.bytes - a.bytes);

    return {
      data,
      metadata: { totalCount: data.length, source: 'app_insights.by_category' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch app insights by category:', error);
    return { data: [], metadata: { source: 'app_insights.by_category' } };
  }
}

async function fetchAppInsightsSummary(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const appInsights = await api.getAppInsights(timeRange, siteId || undefined);
    const apps = appInsights.topAppGroupsByUsage || [];

    let totalBytes = 0, totalFlows = 0, totalLatency = 0;
    for (const app of apps) {
      totalBytes += app.value || 0;
      totalFlows += app.flows || 0;
      totalLatency += app.latency || 0;
    }

    return {
      data: {
        app_count: apps.length,
        total_flows: totalFlows,
        total_bytes: totalBytes,
        avg_latency_ms: apps.length > 0 ? Math.round(totalLatency / apps.length) : 0,
      },
      metadata: { source: 'app_insights.summary' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch app insights summary:', error);
    return { data: { app_count: 0, total_flows: 0, total_bytes: 0, avg_latency_ms: 0 }, metadata: { source: 'app_insights.summary' } };
  }
}

// ========================================
// ADDITIONAL CONTEXTUAL INSIGHTS FETCHERS
// ========================================

async function fetchRoamingEvents(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const events = siteId
      ? await api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange))
      : [];

    const roamingEvents = events
      .filter((e: any) => e.type === 'roam' || e.eventType === 'roaming' || e.category === 'roaming')
      .map((e: any) => ({
        event_id: e.id || `roam-${Date.now()}-${Math.random()}`,
        timestamp: e.timestamp || e.startTime,
        client_mac: e.clientMac || e.stationMac,
        from_ap: e.fromAp || e.previousAp,
        to_ap: e.toAp || e.currentAp || e.apSerial,
        roam_type: e.roamType || 'standard',
        duration_ms: e.duration || 0,
      }))
      .slice(0, 100);

    return {
      data: roamingEvents,
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'contextual_insights.roaming_events' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch roaming events:', error);
    return { data: [], metadata: { source: 'contextual_insights.roaming_events' } };
  }
}

async function fetchAssociationEvents(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const events = siteId
      ? await api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange))
      : [];

    const assocEvents = events
      .filter((e: any) =>
        e.type === 'associate' || e.type === 'disassociate' ||
        e.eventType === 'association' || e.eventType === 'disassociation'
      )
      .map((e: any) => ({
        event_id: e.id || `assoc-${Date.now()}-${Math.random()}`,
        timestamp: e.timestamp || e.startTime,
        event_type: e.type || e.eventType,
        client_mac: e.clientMac || e.stationMac,
        ap_name: e.apName || e.apSerial,
        ssid: e.ssid || e.network,
        reason: e.reason || '',
      }))
      .slice(0, 100);

    return {
      data: assocEvents,
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'contextual_insights.association_events' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch association events:', error);
    return { data: [], metadata: { source: 'contextual_insights.association_events' } };
  }
}

async function fetchRFEvents(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const events = siteId
      ? await api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange))
      : [];

    const rfEvents = events
      .filter((e: any) =>
        e.type === 'channelChange' || e.type === 'powerChange' ||
        e.eventType === 'channel_change' || e.eventType === 'power_change' ||
        e.category === 'rf'
      )
      .map((e: any) => ({
        event_id: e.id || `rf-${Date.now()}-${Math.random()}`,
        timestamp: e.timestamp || e.startTime,
        event_type: e.type || e.eventType,
        ap_name: e.apName || e.apSerial,
        radio: e.radio || e.band,
        old_value: e.oldValue || e.previousChannel || e.previousPower,
        new_value: e.newValue || e.currentChannel || e.currentPower,
        reason: e.reason || '',
      }))
      .slice(0, 100);

    return {
      data: rfEvents,
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'contextual_insights.rf_events' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch RF events:', error);
    return { data: [], metadata: { source: 'contextual_insights.rf_events' } };
  }
}

async function fetchFailedAssociations(
  api: any,
  siteId: string | null,
  timeRange: string,
  catalogItem: WidgetCatalogItem
): Promise<WidgetDataResponse> {
  try {
    // Fetch from site report widget if available
    if (siteId) {
      const widgetData = await api.fetchWidgetData(siteId, ['usersFailedAssociation'], timeRange);
      const failedData = widgetData.usersFailedAssociation || [];

      const transformed = failedData.map((f: any) => {
        const identity = resolveClientIdentity({ macAddress: f.macAddress || f.clientMac });
        return {
          display_name: identity.displayName,
          mac_address: f.macAddress || f.clientMac,
          failure_count: f.count || f.failureCount || 1,
          last_failure_reason: f.reason || f.failureReason || 'Unknown',
          target_ap: f.apName || f.apSerial,
          target_ssid: f.ssid || f.network,
        };
      });

      const limit = catalogItem.dataBinding.limit || 25;
      transformed.sort((a: any, b: any) => b.failure_count - a.failure_count);

      return {
        data: transformed.slice(0, limit),
        metadata: { totalCount: transformed.length, source: 'contextual_insights.failed_associations' },
      };
    }

    return { data: [], metadata: { source: 'contextual_insights.failed_associations' } };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch failed associations:', error);
    return { data: [], metadata: { source: 'contextual_insights.failed_associations' } };
  }
}

async function fetchAnomalies(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const events = siteId
      ? await api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange))
      : [];

    const anomalies = events
      .filter((e: any) =>
        e.severity === 'critical' || e.severity === 'warning' ||
        e.type === 'anomaly' || e.category === 'anomaly'
      )
      .map((e: any) => ({
        anomaly_id: e.id || `anomaly-${Date.now()}-${Math.random()}`,
        timestamp: e.timestamp || e.startTime,
        severity: e.severity || 'warning',
        category: e.category || 'wireless',
        title: e.title || e.type || 'Network Anomaly',
        description: e.description || e.message || '',
        affected_entity: e.apName || e.apSerial || e.entityName,
        metric: e.metric || '',
        threshold: e.threshold || '',
        actual_value: e.actualValue || e.value || '',
      }))
      .slice(0, 50);

    return {
      data: anomalies,
      metadata: { timeRange: getTimeRangeMs(timeRange), source: 'contextual_insights.anomalies' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch anomalies:', error);
    return { data: [], metadata: { source: 'contextual_insights.anomalies' } };
  }
}

async function fetchInsightsSummary(
  api: any,
  siteId: string | null,
  timeRange: string
): Promise<WidgetDataResponse> {
  try {
    const events = siteId
      ? await api.getAccessPointEvents(siteId, getTimeRangeDays(timeRange))
      : [];

    let critical = 0, warning = 0, info = 0;

    for (const event of events) {
      if (event.severity === 'critical') critical++;
      else if (event.severity === 'warning') warning++;
      else info++;
    }

    return {
      data: {
        critical_count: critical,
        warning_count: warning,
        info_count: info,
        total_count: events.length,
      },
      metadata: { source: 'contextual_insights.summary' },
    };
  } catch (error) {
    console.warn('[WorkspaceDataService] Failed to fetch insights summary:', error);
    return { data: { critical_count: 0, warning_count: 0, info_count: 0, total_count: 0 }, metadata: { source: 'contextual_insights.summary' } };
  }
}

