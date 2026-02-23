import { apiService } from './api';

/**
 * Simplified Widget Service
 * Uses working endpoints to build Network Insights widgets
 * Avoids the problematic /v1/report/sites endpoint
 */

export interface SimplifiedWidgetData {
  clientCount: ClientCountData;
  apHealth: APHealthData;
  networkOverview: NetworkOverviewData;
  siteRankings: SiteRankingsData;
  clientDistribution: ClientDistributionData;
  apRankings: APRankingsData;
}

export interface ClientCountData {
  total: number;
  byProtocol: { protocol: string; count: number }[];
  byManufacturer: { manufacturer: string; count: number }[];
  trend: 'up' | 'down' | 'stable';
}

export interface APHealthData {
  total: number;
  online: number;
  offline: number;
  uptime: number;
  avgClientsPerAP: number;
}

export interface NetworkOverviewData {
  totalSites: number;
  totalAPs: number;
  totalClients: number;
  healthScore: number;
  throughput: {
    upload: number;
    download: number;
  };
}

export interface SiteRankingsData {
  byClientCount: { name: string; value: number }[];
  byAPCount: { name: string; value: number }[];
}

export interface ClientDistributionData {
  byBand: { band: string; count: number; percentage: number }[];
  bySSID: { ssid: string; count: number; percentage: number }[];
}

export interface APRankingsData {
  topByClientCount: { name: string; clients: number; site: string }[];
  topBySignalStrength: { name: string; avgRssi: number; site: string }[];
}

/**
 * Fetch and process all simplified widget data
 */
export async function fetchSimplifiedWidgetData(siteId?: string): Promise<SimplifiedWidgetData> {
  console.log('[SimplifiedWidgetService] Fetching data for widgets...', { siteId });

  try {
    // Fetch data from working endpoints in parallel
    const [apsData, sitesData] = await Promise.all([
      fetchAPs(),
      fetchSites(),
    ]);

    // Fetch stations with retry logic (can be slow)
    const stationsData = await fetchStations();

    console.log('[SimplifiedWidgetService] Fetched raw data:', {
      aps: apsData?.length || 0,
      sites: sitesData?.length || 0,
      stations: stationsData?.length || 0
    });

    // Filter by site if specified
    const filteredAPs = siteId ? apsData.filter((ap: any) => ap.siteId === siteId) : apsData;
    const filteredStations = siteId
      ? stationsData.filter((station: any) => station.siteId === siteId || station.apSiteId === siteId)
      : stationsData;

    // Process data into widget format
    const clientCount = processClientCountData(filteredStations);
    const apHealth = processAPHealthData(filteredAPs);
    const networkOverview = processNetworkOverview(sitesData, filteredAPs, filteredStations);
    const siteRankings = processSiteRankings(sitesData, apsData, stationsData);
    const clientDistribution = processClientDistribution(filteredStations);
    const apRankings = processAPRankings(filteredAPs, filteredStations);

    console.log('[SimplifiedWidgetService] Processed widget data successfully');

    return {
      clientCount,
      apHealth,
      networkOverview,
      siteRankings,
      clientDistribution,
      apRankings
    };
  } catch (error) {
    console.error('[SimplifiedWidgetService] Error fetching widget data:', error);
    throw error;
  }
}

/**
 * Fetch access points from /v1/aps/query
 */
async function fetchAPs(): Promise<any[]> {
  try {
    const response = await apiService.makeAuthenticatedRequest('/v1/aps/query', { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      return data.accessPoints || data.aps || data || [];
    }
    return [];
  } catch (error) {
    console.error('[SimplifiedWidgetService] Error fetching APs:', error);
    return [];
  }
}

/**
 * Fetch sites from /v3/sites
 */
async function fetchSites(): Promise<any[]> {
  try {
    const response = await apiService.makeAuthenticatedRequest('/v3/sites', { method: 'GET' });
    if (response.ok) {
      const data = await response.json();
      return data.sites || data || [];
    }
    return [];
  } catch (error) {
    console.error('[SimplifiedWidgetService] Error fetching sites:', error);
    return [];
  }
}

/**
 * Fetch stations (clients) - this endpoint can be slow
 */
async function fetchStations(): Promise<any[]> {
  try {
    const response = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 15000);
    if (response.ok) {
      const data = await response.json();
      return data.stations || data || [];
    }
    return [];
  } catch (error) {
    console.error('[SimplifiedWidgetService] Error fetching stations:', error);
    return [];
  }
}

/**
 * Process client count data from stations
 */
function processClientCountData(stations: any[]): ClientCountData {
  const total = stations.length;

  // Count by protocol (extract from station data)
  const protocolCounts: { [key: string]: number } = {};
  stations.forEach(station => {
    const protocol = station.protocol || station.wirelessProtocol || '802.11ax';
    protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
  });

  const byProtocol = Object.entries(protocolCounts).map(([protocol, count]) => ({
    protocol,
    count
  })).sort((a, b) => b.count - a.count);

  // Count by manufacturer (from MAC OUI or manufacturer field)
  const manufacturerCounts: { [key: string]: number } = {};
  stations.forEach(station => {
    const manufacturer = station.manufacturer || station.vendor || 'Unknown';
    manufacturerCounts[manufacturer] = (manufacturerCounts[manufacturer] || 0) + 1;
  });

  const byManufacturer = Object.entries(manufacturerCounts).map(([manufacturer, count]) => ({
    manufacturer,
    count
  })).sort((a, b) => b.count - a.count).slice(0, 10); // Top 10

  return {
    total,
    byProtocol,
    byManufacturer,
    trend: 'stable' as const // Trend calculation requires historical data snapshots (not yet available)
  };
}

/**
 * Process AP health data from APs
 */
function processAPHealthData(aps: any[]): APHealthData {
  const total = aps.length;
  const online = aps.filter(ap => ap.status === 'ONLINE' || ap.connected === true).length;
  const offline = total - online;
  const uptime = total > 0 ? (online / total) * 100 : 0;

  // Calculate average clients per AP
  const totalClients = aps.reduce((sum, ap) => sum + (ap.numClients || ap.clientCount || 0), 0);
  const avgClientsPerAP = total > 0 ? totalClients / total : 0;

  return {
    total,
    online,
    offline,
    uptime: Math.round(uptime * 10) / 10,
    avgClientsPerAP: Math.round(avgClientsPerAP * 10) / 10
  };
}

/**
 * Process network overview data
 */
function processNetworkOverview(sites: any[], aps: any[], stations: any[]): NetworkOverviewData {
  const totalSites = sites.length;
  const totalAPs = aps.length;
  const totalClients = stations.length;

  // Calculate health score based on AP uptime and client connectivity
  const onlineAPs = aps.filter(ap => ap.status === 'ONLINE' || ap.connected === true).length;
  const apHealth = totalAPs > 0 ? (onlineAPs / totalAPs) * 100 : 0;
  const healthScore = Math.round(apHealth);

  // Calculate throughput from station data (sum of rx/tx rates)
  let uploadBps = 0;
  let downloadBps = 0;

  stations.forEach(station => {
    uploadBps += station.txRate || station.uploadRate || 0;
    downloadBps += station.rxRate || station.downloadRate || 0;
  });

  // Convert to Mbps
  const upload = Math.round((uploadBps / 1000000) * 10) / 10;
  const download = Math.round((downloadBps / 1000000) * 10) / 10;

  return {
    totalSites,
    totalAPs,
    totalClients,
    healthScore,
    throughput: { upload, download }
  };
}

/**
 * Process site rankings
 */
function processSiteRankings(sites: any[], aps: any[], stations: any[]): SiteRankingsData {
  // Count clients per site
  const siteClientCounts: { [siteId: string]: { name: string; count: number } } = {};
  stations.forEach(station => {
    const siteId = station.siteId || station.apSiteId;
    if (siteId) {
      if (!siteClientCounts[siteId]) {
        const site = sites.find(s => s.id === siteId);
        siteClientCounts[siteId] = { name: site?.name || siteId, count: 0 };
      }
      siteClientCounts[siteId].count++;
    }
  });

  const byClientCount = Object.values(siteClientCounts)
    .map(({ name, count }) => ({ name, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Count APs per site
  const siteAPCounts: { [siteId: string]: { name: string; count: number } } = {};
  aps.forEach(ap => {
    const siteId = ap.siteId;
    if (siteId) {
      if (!siteAPCounts[siteId]) {
        const site = sites.find(s => s.id === siteId);
        siteAPCounts[siteId] = { name: site?.name || siteId, count: 0 };
      }
      siteAPCounts[siteId].count++;
    }
  });

  const byAPCount = Object.values(siteAPCounts)
    .map(({ name, count }) => ({ name, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    byClientCount,
    byAPCount
  };
}

/**
 * Process client distribution data
 */
function processClientDistribution(stations: any[]): ClientDistributionData {
  const total = stations.length;

  // Distribution by band (2.4GHz, 5GHz, 6GHz)
  const bandCounts: { [band: string]: number } = {};
  stations.forEach(station => {
    let band = 'Unknown';
    const channel = station.channel || 0;

    if (channel >= 1 && channel <= 14) band = '2.4 GHz';
    else if (channel >= 36 && channel <= 165) band = '5 GHz';
    else if (channel >= 1 && channel <= 233) band = '6 GHz';

    bandCounts[band] = (bandCounts[band] || 0) + 1;
  });

  const byBand = Object.entries(bandCounts).map(([band, count]) => ({
    band,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  }));

  // Distribution by SSID
  const ssidCounts: { [ssid: string]: number } = {};
  stations.forEach(station => {
    const ssid = station.ssid || 'Unknown';
    ssidCounts[ssid] = (ssidCounts[ssid] || 0) + 1;
  });

  const bySSID = Object.entries(ssidCounts).map(([ssid, count]) => ({
    ssid,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    byBand,
    bySSID
  };
}

/**
 * Process AP rankings
 */
function processAPRankings(aps: any[], stations: any[]): APRankingsData {
  // Count clients per AP
  const apClientCounts: { [apMac: string]: number } = {};
  stations.forEach(station => {
    const apMac = station.apMac || station.bssid;
    if (apMac) {
      apClientCounts[apMac] = (apClientCounts[apMac] || 0) + 1;
    }
  });

  const topByClientCount = aps
    .map(ap => ({
      name: ap.name || ap.hostname || ap.mac,
      clients: apClientCounts[ap.mac] || 0,
      site: ap.siteName || 'Unknown'
    }))
    .sort((a, b) => b.clients - a.clients)
    .slice(0, 10);

  // Calculate average RSSI per AP
  const apRssiData: { [apMac: string]: { sum: number; count: number } } = {};
  stations.forEach(station => {
    const apMac = station.apMac || station.bssid;
    const rssi = station.rssi || station.signalStrength || 0;
    if (apMac && rssi) {
      if (!apRssiData[apMac]) {
        apRssiData[apMac] = { sum: 0, count: 0 };
      }
      apRssiData[apMac].sum += rssi;
      apRssiData[apMac].count++;
    }
  });

  const topBySignalStrength = aps
    .map(ap => {
      const rssiData = apRssiData[ap.mac];
      const avgRssi = rssiData ? Math.round(rssiData.sum / rssiData.count) : -100;
      return {
        name: ap.name || ap.hostname || ap.mac,
        avgRssi,
        site: ap.siteName || 'Unknown'
      };
    })
    .filter(ap => ap.avgRssi > -100)
    .sort((a, b) => b.avgRssi - a.avgRssi)
    .slice(0, 10);

  return {
    topByClientCount,
    topBySignalStrength
  };
}
