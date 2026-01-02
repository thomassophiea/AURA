import { campusControllerApi } from './api';

/**
 * Widget Service
 * Handles fetching widget data from Campus Controller report APIs
 */

export interface WidgetRequest {
  siteId?: string; // Optional - if not provided, fetches deployment-wide data
  duration?: string; // e.g., "3H", "24H", "7D", "30D"
  resolution?: string; // e.g., "15" (minutes)
  widgets: string[]; // Array of widget names to fetch
  userGroups?: any[]; // Optional user groups for venue reports
}

export interface WidgetResponse {
  [widgetName: string]: any; // Each widget returns its own data structure
}

/**
 * Fetch widget data from Campus Controller
 */
export async function fetchWidgetData(request: WidgetRequest): Promise<WidgetResponse> {
  const {
    siteId,
    duration = '3H',
    resolution = '15',
    widgets,
    userGroups
  } = request;

  // Build widgetList parameter (pipe-separated for some widgets)
  const widgetList = widgets.join(',');

  const params: any = {
    duration,
    resolution,
    widgetList,
    noCache: Date.now()
  };

  try {
    let endpoint: string;

    if (userGroups && siteId) {
      // Venue report endpoint
      endpoint = `/management/v3/sites/${siteId}/report/venue`;
      params.statType = 'sites';
      params.userGroups = JSON.stringify(userGroups);
    } else if (siteId) {
      // Site-specific report endpoint
      endpoint = `/management/v1/report/sites/${siteId}`;
    } else {
      // Deployment-wide report endpoint
      endpoint = '/management/v1/report/sites';
    }

    const response = await campusControllerApi.get(endpoint, { params });
    return response.data;
  } catch (error) {
    console.error('[WidgetService] Error fetching widget data:', error);
    throw error;
  }
}

/**
 * Fetch system information
 */
export async function fetchSystemInformation(): Promise<any> {
  try {
    const response = await campusControllerApi.get('/platformmanager/v1/reports/systeminformation', {
      params: { noCache: Date.now() }
    });
    return response.data;
  } catch (error) {
    console.error('[WidgetService] Error fetching system information:', error);
    throw error;
  }
}

/**
 * Widget categories for organizing the Network Insights page
 */
export const WIDGET_CATEGORIES = {
  OVERVIEW: {
    name: 'Overview',
    widgets: [
      'throughputReport',
      'countOfUniqueUsersReport',
      'deploymentQoE',
      'systemHealth',
      'networkHealth'
    ]
  },
  THROUGHPUT_USAGE: {
    name: 'Throughput & Usage',
    widgets: [
      'throughputReport',
      'byteUtilization',
      'ulDlThroughputTimeseries',
      'ulDlUsageTimeseries',
      'ulThroughputPeakScorecard',
      'dlThroughputPeakScorecard',
      'ulUsageScorecard',
      'dlUsageScorecard'
    ]
  },
  SITES: {
    name: 'Sites',
    widgets: [
      'topSitesByThroughput',
      'topSitesByClientCount',
      'topSitesByChannelUtil',
      'topSitesBySnr',
      'topSitesByChannelChanges',
      'topSitesByPowerChanges'
    ]
  },
  ACCESS_POINTS: {
    name: 'Access Points',
    widgets: [
      'topAccessPointsByThroughput',
      'topAccessPointsByUserCount',
      'topAccessPointsByConcurrentUserCount',
      'topAccessPointsByRfHealth',
      'topApsByChannelUtil',
      'worstApsByChannelUtil',
      'topApsBySnr',
      'worstApsBySnr',
      'topApsByRetries',
      'worstApsByRetries',
      'topApsByChannelChanges',
      'topApsByPowerChanges',
      'worstApsByRfHealth'
    ]
  },
  CLIENTS: {
    name: 'Clients',
    widgets: [
      'countOfUniqueUsersReport',
      'clientDistributionByRFProtocol',
      'topManufacturersByClientCount',
      'worstManufacturersByClientCount',
      'topOsByClientCountReport',
      'worstOsByClientCountReport',
      'topClientsByUsage',
      'topClientsByRetries',
      'worstClientsByRetries',
      'topClientsBySnr',
      'worstClientsBySnr',
      'uniqueClientsPeakScorecard',
      'uniqueClientsTotalScorecard'
    ]
  },
  RF_ANALYTICS: {
    name: 'RF Analytics',
    widgets: [
      'rfQuality',
      'channelDistributionRadio1',
      'channelDistributionRadio2',
      'channelDistributionRadio3',
      'topApsByChannelChanges',
      'topApsByPowerChanges'
    ]
  },
  APPLICATIONS: {
    name: 'Applications',
    widgets: [
      'topAppGroupsByUsage',
      'topAppGroupsByClientCountReport',
      'topAppGroupsByThroughputReport',
      'worstAppGroupsByUsage',
      'worstAppGroupsByClientCountReport',
      'worstAppGroupsByThroughputReport',
      'topServicesByThroughput',
      'topServicesByClientCount',
      'worstServicesByClientCount'
    ]
  },
  LOCATIONS: {
    name: 'Locations',
    widgets: [
      'dwellTimeReport',
      'topAreaByVisitors',
      'worstAreaByVisitors',
      'topFloorByVisitors',
      'worstFloorByVisitors'
    ]
  },
  GUESTS: {
    name: 'Guests',
    widgets: [
      'guestUsersReport',
      'dwellTimeReport'
    ]
  },
  HEALTH: {
    name: 'System Health',
    widgets: [
      'systemHealth',
      'networkHealth',
      'deploymentQoE',
      'dataPortCongestionEvent',
      'dataPortCongestionDuration',
      'packetCaptureList',
      'pollSitesStats'
    ]
  }
};

/**
 * Helper to parse timeseries data from widget responses
 */
export function parseTimeseriesData(widgetData: any) {
  if (!widgetData || !Array.isArray(widgetData)) return [];

  return widgetData.map((report: any) => ({
    reportName: report.reportName,
    reportType: report.reportType,
    band: report.band,
    fromTime: report.fromTimeInMillis,
    toTime: report.toTimeInMillis,
    statistics: report.statistics?.map((stat: any) => ({
      name: stat.statName,
      type: stat.type,
      unit: stat.unit,
      values: stat.values?.map((v: any) => ({
        timestamp: v.timestamp,
        value: parseFloat(v.value) || 0
      })) || []
    })) || []
  }));
}

/**
 * Helper to parse top/worst ranking data
 */
export function parseRankingData(widgetData: any) {
  if (!widgetData || !Array.isArray(widgetData)) return [];

  const report = widgetData[0];
  if (!report || !report.statistics) return [];

  return report.statistics.map((stat: any) => ({
    name: stat.statName || stat.label || 'Unknown',
    value: parseFloat(stat.value || stat.count || 0),
    unit: stat.unit || '',
    additionalInfo: stat.additionalInfo || {}
  }));
}

/**
 * Helper to parse scorecard data (single metrics)
 */
export function parseScorecardData(widgetData: any) {
  if (!widgetData || typeof widgetData !== 'object') return null;

  // Scorecard data is typically a simple object with key-value pairs
  return widgetData;
}

/**
 * Helper to parse distribution data (pie chart data)
 */
export function parseDistributionData(widgetData: any) {
  if (!widgetData || !Array.isArray(widgetData)) return [];

  const report = widgetData[0];
  if (!report || !report.statistics) return [];

  return report.statistics.map((stat: any) => ({
    label: stat.statName || stat.label || 'Unknown',
    value: parseFloat(stat.value || stat.count || 0),
    percentage: stat.percentage || 0
  }));
}
