/* eslint-disable @typescript-eslint/no-explicit-any */
// Dashboard API responses from Campus Controller are untyped JSON
import { useState, useEffect, useCallback } from 'react';
import { whenAutoRefresh } from '../lib/autoRefresh';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { throughputService, ThroughputSnapshot } from '../services/throughput';
import { getVendor, getVendorIcon } from '../services/oui-lookup';
import { recordNetworkMetrics } from '../services/aiBaselineService';
import { useGlobalFilters } from './useGlobalFilters';
import { useOperationalContext } from './useOperationalContext';
import { controllerDurationFor, type ResolvedTimeRange } from '../lib/timeRange';
import { monitoringHistory } from '../services/monitoringHistory';
import {
  deriveRangedNetworkStats,
  EMPTY_RANGED_STATS,
  RANGED_STAT_METRICS,
  type RangedNetworkStats,
} from '../lib/rangedNetworkStats';
import { BAND_COLORS, SNR_QUALITY_COLORS } from '../config/colorPalette';

/**
 * Band attribution for a station, most-trustworthy source first:
 * controller-reported band → channel number → PHY-rate heuristic.
 * Returns null when nothing usable is present.
 */
function deriveStationBand(station: any): '2.4 GHz' | '5 GHz' | '6 GHz' | null {
  const reported = station.band || station.frequencyBand;
  if (typeof reported === 'string' && reported.length > 0) {
    if (reported.includes('6')) return '6 GHz';
    if (reported.includes('5')) return '5 GHz';
    return '2.4 GHz';
  }
  const channelNum = parseInt(String(station.channel ?? '').split('/')[0], 10);
  if (!Number.isNaN(channelNum) && channelNum > 0) {
    if (channelNum <= 14) return '2.4 GHz';
    if (channelNum <= 177) return '5 GHz';
    return '6 GHz';
  }
  const rate = Math.max(
    station.transmittedRate || station.txRate || 0,
    station.receivedRate || station.rxRate || 0
  );
  if (rate > 0) {
    const rateMbps = rate / 1_000_000;
    if (rateMbps > 1200) return '6 GHz';
    if (rateMbps > 150) return '5 GHz';
    return '2.4 GHz';
  }
  return null;
}

export interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  model?: string;
  hardwareType?: string;
  platformName?: string;
  hwType?: string;
  apModel?: string;
  deviceModel?: string;
  role?: string;
  status?: string;
  connectionState?: string;
  operationalState?: string;
  powerMode?: string;
  lowPower?: boolean;
  siteId?: string;
  siteName?: string;
  ipAddress?: string;
  macAddress?: string;
  uptime?: number;
  lastSeen?: number;
  [key: string]: any;
}

export interface Station {
  macAddress: string;
  hostName?: string;
  ipAddress?: string;
  ssid?: string;
  serviceId?: string;
  serviceName?: string;
  apSerialNumber?: string;
  apName?: string;
  rssi?: number;
  snr?: number;
  txRate?: number;
  rxRate?: number;
  txBytes?: number;
  rxBytes?: number;
  inBytes?: number;
  outBytes?: number;
  transmittedRate?: number;
  receivedRate?: number;
  uptime?: number;
  authenticated?: boolean | number;
  connectionTime?: number;
  // Fields present on the raw controller record but not always surfaced elsewhere.
  // Additive-only — used by ClientProtocolWidget for per-protocol/band breakdown.
  protocol?: string;
  radioId?: number;
  channel?: string | number;
  rss?: number;
  [key: string]: any;
}

export interface Service {
  id: string;
  name: string;
  type?: string;
  ssid?: string;
  serviceName?: string;
  enabled?: boolean;
  vlan?: number;
  bandSteering?: boolean;
  clientCount?: number;
  throughput?: number;
  reliability?: number;
  uptime?: number;
  [key: string]: any;
}

export interface ServiceReport {
  serviceId: string;
  serviceName?: string;
  metrics?: {
    throughput?: number;
    latency?: number;
    jitter?: number;
    packetLoss?: number;
    reliability?: number;
    uptime?: number;
    clientCount?: number;
    averageRssi?: number;
    averageSnr?: number;
  };
  timeSeries?: Array<{
    timestamp: number;
    throughput?: number;
    clientCount?: number;
    latency?: number;
  }>;
}

/**
 * Response of `GET /api/v1/services/summary` — the per-WLAN report and station
 * fan-out, rolled up server-side into one payload.
 */
export interface ServicesSummary {
  services: Service[];
  reports: Record<string, ServiceReport>;
  stationCounts: Record<string, number>;
  meta: {
    serviceCount: number;
    expandedCount: number;
    truncated: boolean;
    /** WLANs whose sub-resources failed; the rest of the summary is still valid. */
    failures: Array<{ id: string; error: string }>;
    assembledAt: string;
  };
}

export interface Notification {
  id: string;
  type: string;
  severity?: string;
  level?: string;
  message: string;
  timestamp: number;
  status?: string;
}

export interface DashboardData {
  loading: boolean;
  refreshing: boolean;
  lastUpdate: Date | null;
  accessPoints: AccessPoint[];
  apStats: {
    total: number;
    online: number;
    offline: number;
    primary: number;
    backup: number;
    standby: number;
    lowPower: number;
    normalPower: number;
    models: Record<string, number>;
    avgChannelUtil: number;
  };
  stations: Station[];
  clientStats: {
    total: number;
    authenticated: number;
    throughputUpload: number;
    throughputDownload: number;
    avgRfqi: number;
  };
  throughputTrend: Array<{ time: string; upload: number; download: number; total: number }>;
  topClients: Array<{
    name: string;
    mac: string;
    throughput: number;
    upload: number;
    download: number;
    network: string;
    ap: string;
    rssi: number;
    band: string;
    ipAddress: string;
    vendor?: string;
    vendorIcon?: string;
  }>;
  clientDistribution: Array<{ service: string; count: number; percentage: number }>;
  networkThroughput: Array<{ network: string; upload: number; download: number; total: number }>;
  vendorLookupsInProgress: boolean;
  serviceIdToNameMap: Map<string, string>;
  services: Service[];
  serviceReports: Map<string, ServiceReport>;
  poorServices: Service[];
  notifications: Notification[];
  alertCounts: { critical: number; warning: number; info: number };
  sites: Array<{ id: string; name: string; [key: string]: any }>;
  rfqiData: Array<{ timestamp: number; healthy: number; needsAttention: number; rfqi: number }>;
  bandDistribution: { band: string; count: number; color: string }[];
  snrDistribution: { category: string; count: number; color: string }[];
  avgSnr: number;
  avgRssi: number;
  activeSiteId: string | undefined;
  /**
   * Headline counts computed over the *selected window* from stored history,
   * rather than from the instantaneous controller snapshot in `apStats` /
   * `clientStats`.
   *
   * These are what make the KPI tiles respond to the time control at all: the
   * live snapshot is identical for every selection, which made the selector look
   * broken. `available: false` means nothing was stored for the window, and the
   * tiles fall back to the snapshot.
   */
  rangedStats: RangedNetworkStats;
  /**
   * True when the selected window is entirely in the past, so the controller
   * cannot answer for it and the time-series below come from stored history.
   *
   * The device and client *lists* are unavoidably current state — the controller
   * exposes no "who was connected last Tuesday" endpoint and AURA does not store
   * per-client history by default. Consumers must label those sections rather
   * than presenting today's roster as the selected day's.
   */
  isHistorical: boolean;
  /**
   * Metrics the controller cannot supply for the selected window, so they are
   * withheld instead of being filled with a live reading under a past date.
   */
  unavailableForRange: string[];
  reload: (isRefresh?: boolean) => void;
}

export interface UseDashboardDataOptions {
  /**
   * The window every figure is computed over. Supplied rather than read from the
   * global filter directly so the dashboard, its header and its charts are
   * guaranteed to be describing the same window on the same render.
   */
  range: ResolvedTimeRange;
}

export function useDashboardData({ range }: UseDashboardDataOptions): DashboardData {
  const { filters } = useGlobalFilters();
  const { ctx: operationalCtx } = useOperationalContext();
  const isHistorical = !range.isLive;
  const [unavailableForRange, setUnavailableForRange] = useState<string[]>([]);
  const [rangedStats, setRangedStats] = useState<RangedNetworkStats>(EMPTY_RANGED_STATS);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [apStats, setApStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    primary: 0,
    backup: 0,
    standby: 0,
    lowPower: 0,
    normalPower: 0,
    models: {} as Record<string, number>,
    avgChannelUtil: 0,
  });

  const [stations, setStations] = useState<Station[]>([]);
  const [clientStats, setClientStats] = useState({
    total: 0,
    authenticated: 0,
    throughputUpload: 0,
    throughputDownload: 0,
    avgRfqi: 0,
  });
  const [throughputTrend, setThroughputTrend] = useState<
    Array<{ time: string; upload: number; download: number; total: number }>
  >([]);
  const [topClients, setTopClients] = useState<
    Array<{
      name: string;
      mac: string;
      throughput: number;
      upload: number;
      download: number;
      network: string;
      ap: string;
      rssi: number;
      band: string;
      ipAddress: string;
      vendor?: string;
      vendorIcon?: string;
    }>
  >([]);
  const [clientDistribution, setClientDistribution] = useState<
    Array<{ service: string; count: number; percentage: number }>
  >([]);
  const [networkThroughput, setNetworkThroughput] = useState<
    Array<{ network: string; upload: number; download: number; total: number }>
  >([]);
  const [vendorLookupsInProgress, setVendorLookupsInProgress] = useState(false);
  const [serviceIdToNameMap, setServiceIdToNameMap] = useState<Map<string, string>>(new Map());

  const [services, setServices] = useState<Service[]>([]);
  const [serviceReports, setServiceReports] = useState<Map<string, ServiceReport>>(new Map());
  const [poorServices, setPoorServices] = useState<Service[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertCounts, setAlertCounts] = useState({ critical: 0, warning: 0, info: 0 });

  const [sites, setSites] = useState<Array<{ id: string; name: string; [key: string]: any }>>([]);

  const [rfqiData, setRfqiData] = useState<
    Array<{ timestamp: number; healthy: number; needsAttention: number; rfqi: number }>
  >([]);
  const [bandDistribution, setBandDistribution] = useState<
    { band: string; count: number; color: string }[]
  >([]);
  const [snrDistribution, setSnrDistribution] = useState<
    { category: string; count: number; color: string }[]
  >([]);
  const [avgSnr, setAvgSnr] = useState<number>(0);
  const [avgRssi, setAvgRssi] = useState<number>(0);

  const getActiveSiteFilter = useCallback((): string | undefined => {
    if (operationalCtx.mode === 'SITE' && operationalCtx.siteId) {
      return operationalCtx.siteId;
    }
    return filters.site !== 'all' ? filters.site : undefined;
  }, [operationalCtx.mode, operationalCtx.siteId, filters.site]);

  const fetchAccessPoints = useCallback(async (): Promise<AccessPoint[]> => {
    const siteFilter = getActiveSiteFilter();
    try {
      const aps = await apiService.getAccessPointsBySite(siteFilter);
      return aps;
    } catch (error) {
      console.error('[Dashboard] Error fetching APs:', error);
      return [];
    }
  }, [getActiveSiteFilter]);

  const fetchStations = useCallback(async (): Promise<Station[]> => {
    const siteFilter = getActiveSiteFilter();
    try {
      if (siteFilter) {
        try {
          const response = await apiService.makeAuthenticatedRequest(
            `/v3/sites/${siteFilter}/stations`,
            { method: 'GET' },
            15000
          );
          if (response.ok) {
            const data = await response.json();
            const safe = data ?? {};
            const stns = Array.isArray(data)
              ? data
              : safe.stations || safe.clients || safe.data || [];
            return stns;
          }
        } catch {
          /* fall through */
        }

        try {
          const site = await apiService.getSiteById(siteFilter);
          const siteName = site?.name || site?.siteName || siteFilter;
          const response = await apiService.makeAuthenticatedRequest(
            '/v1/stations',
            { method: 'GET' },
            15000
          );
          if (response.ok) {
            const data = await response.json();
            const safe = data ?? {};
            const allStations = Array.isArray(data)
              ? data
              : safe.stations || safe.clients || safe.data || [];
            const filtered = allStations.filter(
              (s: any) =>
                s.siteName === siteName || s.siteId === siteFilter || s.siteName === siteFilter
            );
            return filtered;
          }
        } catch {
          /* fall through */
        }

        console.warn('[Dashboard] Station fetch failed for site, returning empty (strict mode)');
        return [];
      }

      const response = await apiService.makeAuthenticatedRequest(
        '/v1/stations',
        { method: 'GET' },
        15000
      );
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      const safe = data ?? {};
      const stns = Array.isArray(data) ? data : safe.stations || safe.clients || safe.data || [];
      return stns;
    } catch (error) {
      console.error('[Dashboard] Error fetching stations:', error);
      return [];
    }
  }, [getActiveSiteFilter]);

  const fetchServices = useCallback(async (): Promise<Service[]> => {
    const siteFilter = getActiveSiteFilter();
    try {
      if (siteFilter) {
        try {
          const svcs = await apiService.getServicesBySite(siteFilter);
          if (svcs.length > 0) {
            return svcs;
          }
        } catch {
          /* fall through */
        }

        try {
          const response = await apiService.makeAuthenticatedRequest(
            '/v1/services',
            { method: 'GET' },
            15000
          );
          if (response.ok) {
            const data = await response.json();
            const safe = data ?? {};
            const allServices = Array.isArray(data) ? data : safe.services || safe.data || [];
            const site = await apiService.getSiteById(siteFilter);
            const siteName = site?.name || site?.siteName || siteFilter;
            const filtered = allServices.filter(
              (s: any) =>
                s.siteName === siteName ||
                s.site === siteFilter ||
                s.site === siteName ||
                s.location === siteName
            );
            return filtered;
          }
        } catch {
          /* fall through */
        }

        console.warn('[Dashboard] Service fetch failed for site, returning empty (strict mode)');
        return [];
      }

      const response = await apiService.makeAuthenticatedRequest(
        '/v1/services',
        { method: 'GET' },
        15000
      );
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      const safe = data ?? {};
      const svcs = Array.isArray(data) ? data : safe.services || safe.data || [];
      return svcs;
    } catch (error) {
      console.error('[Dashboard] Error fetching services:', error);
      return [];
    }
  }, [getActiveSiteFilter]);

  const filterNotificationsBySite = useCallback(
    async (notifs: Notification[], siteId: string): Promise<Notification[]> => {
      try {
        const siteAPs = await apiService.getAccessPointsBySite(siteId);
        const deviceIds = new Set<string>();
        siteAPs.forEach((ap) => {
          if (ap.name) deviceIds.add(ap.name.toLowerCase());
          if (ap.serialNumber) deviceIds.add(ap.serialNumber.toLowerCase());
          if ((ap as any).hostname) deviceIds.add((ap as any).hostname.toLowerCase());
          if ((ap as any).macAddress) deviceIds.add((ap as any).macAddress.toLowerCase());
        });
        if (deviceIds.size === 0) return [];
        return notifs.filter((n) => {
          const source = ((n as any).source || '').toLowerCase();
          const device = ((n as any).deviceName || (n as any).device || '').toLowerCase();
          return deviceIds.has(source) || deviceIds.has(device);
        });
      } catch {
        return [];
      }
    },
    []
  );

  const fetchNotifications = useCallback(async (): Promise<Notification[]> => {
    const siteFilter = getActiveSiteFilter();
    try {
      const response = await apiService.makeAuthenticatedRequest(
        '/v1/notifications',
        { method: 'GET' },
        10000
      );

      if (!response.ok) {
        const altResponse = await apiService.makeAuthenticatedRequest(
          '/v1/alerts',
          { method: 'GET' },
          10000
        );
        if (altResponse.ok) {
          const altData = await altResponse.json();
          const altSafe = altData ?? {};
          const allNotifs = Array.isArray(altData) ? altData : altSafe.alerts || altSafe.data || [];
          return siteFilter ? await filterNotificationsBySite(allNotifs, siteFilter) : allNotifs;
        }
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const notifSafe = data ?? {};
      const allNotifs = Array.isArray(data)
        ? data
        : notifSafe.notifications || notifSafe.data || [];
      const notifs = siteFilter
        ? await filterNotificationsBySite(allNotifs, siteFilter)
        : allNotifs;
      return notifs;
    } catch {
      return [];
    }
  }, [getActiveSiteFilter, filterNotificationsBySite]);

  // Formula: rfqi(40%) + utilization(25%) + interference(20%) + cochannel(15%), each normalized 0-100
  const computeCompositeRFQI = (
    radios: Array<{
      rfqi?: number;
      chUtil?: number;
      interference?: number;
      cochannel?: number;
      noise?: number;
      clientCount?: number;
    }>
  ): number => {
    if (!radios.length) return 0;
    let totalScore = 0;
    let count = 0;
    for (const r of radios) {
      const rfqiRaw = typeof r.rfqi === 'number' ? r.rfqi : 0;
      const rfqiNorm = Math.min(100, Math.max(0, (rfqiRaw / 5) * 100));
      const chUtilNorm = Math.min(100, Math.max(0, 100 - (r.chUtil ?? 0)));
      const intfNorm = Math.min(100, Math.max(0, 100 - (r.interference ?? 0)));
      const cochNorm = Math.min(100, Math.max(0, 100 - (r.cochannel ?? 0)));
      totalScore += rfqiNorm * 0.4 + chUtilNorm * 0.25 + intfNorm * 0.2 + cochNorm * 0.15;
      count++;
    }
    return count > 0 ? Math.round(totalScore / count) : 0;
  };

  /**
   * RF quality trend.
   *
   * The controller's report API takes a duration back from now, so it cannot
   * answer for a past calendar day, and RF quality is not one of the families
   * the collector persists. For a historical window the series is therefore
   * withheld and named in `unavailableForRange` — showing the live 24-hour curve
   * under a past date would be a fabrication, and a plausible-looking one.
   */
  const fetchRFQIData = useCallback(async () => {
    const siteId = getActiveSiteFilter();
    const duration = controllerDurationFor(range);

    if (duration === null) {
      setRfqiData([]);
      setUnavailableForRange((prev) =>
        prev.includes('RF quality trend') ? prev : [...prev, 'RF quality trend']
      );
      return;
    }
    setUnavailableForRange((prev) => prev.filter((entry) => entry !== 'RF quality trend'));

    try {
      if (siteId) {
        const rfData = await apiService.fetchRFQualityData(siteId, duration);
        if (rfData && Array.isArray(rfData)) {
          const processedData = rfData.flatMap((report: any) => {
            if (report.statistics && Array.isArray(report.statistics)) {
              const rfqiStat = report.statistics.find(
                (s: any) =>
                  s.statName?.toLowerCase().includes('rfqi') ||
                  s.statName?.toLowerCase().includes('quality')
              );
              if (rfqiStat?.values) {
                return rfqiStat.values.map((v: any) => {
                  const rfqi = parseFloat(v.value) || 0;
                  const rfqiPercent = rfqi > 5 ? rfqi : rfqi * 20;
                  const healthyPct = Math.min(100, Math.max(0, rfqiPercent));
                  return {
                    timestamp: v.timestamp,
                    rfqi,
                    healthy: healthyPct,
                    needsAttention: 100 - healthyPct,
                  };
                });
              }
            }
            return [];
          });

          if (processedData.length > 0) {
            const sortedData = processedData
              .sort((a: any, b: any) => a.timestamp - b.timestamp)
              .slice(-24);
            setRfqiData(sortedData);
            // Surface the newest sample as the headline RFQI — this field was
            // initialised to 0 and never written, leaving a permanent NoData cell.
            const latest = sortedData[sortedData.length - 1];
            if (latest && Number.isFinite(latest.healthy)) {
              setClientStats((prev) => ({ ...prev, avgRfqi: Math.round(latest.healthy) }));
            }
            return;
          }
        }
      }

      const ifstats = await apiService.getAPInterfaceStatsWithRF();
      if (ifstats && ifstats.length > 0) {
        const allRadios: Array<{
          rfqi?: number;
          chUtil?: number;
          interference?: number;
          cochannel?: number;
          noise?: number;
          clientCount?: number;
        }> = [];

        for (const ap of ifstats) {
          if (siteId && ap.siteId && ap.siteId !== siteId) continue;
          const radios = ap.wirelessRf || ap.radioStats || ap.radios || [];
          if (Array.isArray(radios)) {
            allRadios.push(...radios);
          } else if (ap.rfqi !== undefined) {
            allRadios.push({
              rfqi: ap.rfqi,
              chUtil: ap.chUtil,
              interference: ap.interference,
              cochannel: ap.cochannel,
              noise: ap.noise,
              clientCount: ap.clientCount,
            });
          }
        }

        if (allRadios.length > 0) {
          const compositeScore = computeCompositeRFQI(allRadios);
          const now = Date.now();
          setRfqiData([
            {
              timestamp: now,
              rfqi: compositeScore / 20,
              healthy: compositeScore,
              needsAttention: 100 - compositeScore,
            },
          ]);
          setClientStats((prev) => ({ ...prev, avgRfqi: Math.round(compositeScore) }));
          return;
        }
      }
      setRfqiData([]);
    } catch (error) {
      console.error('[Dashboard] Error fetching RFQI data:', error);
      setRfqiData([]);
    }
  }, [getActiveSiteFilter, range]);

  const processAccessPoints = useCallback((aps: AccessPoint[]) => {
    setAccessPoints(aps);
    const stats = {
      total: aps.length,
      online: 0,
      offline: 0,
      primary: 0,
      backup: 0,
      standby: 0,
      lowPower: 0,
      normalPower: 0,
      models: {} as Record<string, number>,
      avgChannelUtil: 0,
    };
    let chUtilSum = 0;
    let chUtilCount = 0;

    aps.forEach((ap) => {
      const status = (
        ap.status ||
        ap.connectionState ||
        ap.operationalState ||
        (ap as any).state ||
        ''
      ).toLowerCase();
      const isUp = (ap as any).isUp;
      const isOnline = (ap as any).online;

      const apIsOnline =
        status === 'inservice' ||
        status.includes('up') ||
        status.includes('online') ||
        status.includes('connected') ||
        isUp === true ||
        isOnline === true ||
        (!status && isUp !== false && isOnline !== false);

      if (apIsOnline) {
        stats.online++;
      } else {
        stats.offline++;
      }

      const role = (ap.role || '').toLowerCase();
      if (role.includes('primary') || role.includes('master')) {
        stats.primary++;
      } else if (role.includes('backup') || role.includes('secondary')) {
        stats.backup++;
      } else if (role.includes('standby')) {
        stats.standby++;
      }

      const powerMode = (ap.powerMode || '').toLowerCase();
      if (ap.lowPower || powerMode.includes('low') || powerMode.includes('reduced')) {
        stats.lowPower++;
      } else {
        stats.normalPower++;
      }

      const model =
        (ap as any).hardwareType ||
        (ap as any).platformName ||
        (ap as any).hwType ||
        ap.model ||
        (ap as any).apModel ||
        (ap as any).deviceModel ||
        'Unknown Model';
      stats.models[model] = (stats.models[model] || 0) + 1;

      // channelUtilization arrives on the /v1/aps/query row; it was previously
      // fetched and dropped, leaving avgChannelUtil permanently 0 (a NoData cell).
      const chUtil = Number((ap as any).channelUtilization);
      if (Number.isFinite(chUtil) && chUtil > 0) {
        chUtilSum += chUtil;
        chUtilCount++;
      }
    });

    stats.avgChannelUtil = chUtilCount > 0 ? Math.round(chUtilSum / chUtilCount) : 0;

    setApStats(stats);
  }, []);

  const storeThroughputSnapshot = useCallback(
    async (
      totalUpload: number,
      totalDownload: number,
      clientCount: number,
      serviceThroughputMap: Map<string, { upload: number; download: number }>,
      stationsData: Station[],
      servicesData: Service[]
    ) => {
      try {
        const totalTraffic = totalUpload + totalDownload;
        const avgPerClient = clientCount > 0 ? totalTraffic / clientCount : 0;

        const networkBreakdown = Array.from(serviceThroughputMap.entries()).map(
          ([network, throughput]) => {
            const clientsInNetwork = stationsData.filter((s) => {
              const svcName =
                s.ssid ||
                s.serviceName ||
                (s.serviceId && servicesData.find((svc) => svc.id === s.serviceId)?.ssid);
              return svcName === network;
            }).length;
            return {
              network,
              upload: throughput.upload,
              download: throughput.download,
              total: throughput.upload + throughput.download,
              clients: clientsInNetwork,
            };
          }
        );

        const snapshot: ThroughputSnapshot = {
          timestamp: Date.now(),
          totalUpload,
          totalDownload,
          totalTraffic,
          clientCount,
          avgPerClient,
          networkBreakdown,
        };

        await throughputService.storeSnapshot(snapshot);
      } catch (error) {
        console.error('[Dashboard] Failed to store throughput snapshot:', error);
      }
    },
    []
  );

  /**
   * Throughput history for the selected window, read from PostgreSQL.
   *
   * Always queried with explicit bounds. It used to ask for "the last 60
   * minutes" regardless of the selected range, which meant the chart showed the
   * last hour whatever the header said — and could not show a past day at all.
   *
   * The controller is never consulted here: this series is entirely persisted, so
   * it answers for a finished day with the gateway disconnected.
   */
  const loadHistoricalThroughput = useCallback(async () => {
    try {
      const snapshots = await throughputService.getSnapshotsForRange(range.start, range.end);

      if (snapshots.length === 0) {
        setThroughputTrend([]);
        return;
      }

      // A multi-day window needs the date on the axis; within a single day the
      // clock alone is unambiguous and much less cluttered.
      const spansMultipleDays = range.durationMs > 24 * 60 * 60 * 1000;
      const trend = snapshots.map((snapshot) => {
        const date = new Date(snapshot.timestamp);
        const time = spansMultipleDays
          ? date.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          : date.toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
        return {
          time,
          upload: Math.round(snapshot.totalUpload),
          download: Math.round(snapshot.totalDownload),
          total: Math.round(snapshot.totalTraffic),
        };
      });
      setThroughputTrend(trend);
    } catch (error) {
      console.error('[Dashboard] ✗ Failed to load historical throughput:', error);
      // Cleared rather than left showing another window's data under this
      // window's label.
      setThroughputTrend([]);
    }
  }, [range.start, range.end, range.durationMs]);

  const performVendorLookups = useCallback(
    async (
      clients: Array<{
        name: string;
        mac: string;
        throughput: number;
        upload: number;
        download: number;
        network: string;
        ap: string;
        rssi: number;
        band: string;
        ipAddress: string;
      }>
    ) => {
      if (clients.length === 0) return;
      try {
        setVendorLookupsInProgress(true);
        const enrichedClients = await Promise.all(
          clients.map(async (client) => {
            const vendor = await getVendor(client.mac);
            const vendorIcon = getVendorIcon(vendor);
            return { ...client, vendor, vendorIcon };
          })
        );
        setTopClients(enrichedClients);
      } catch (error) {
        console.error('[Dashboard] Failed to lookup vendors:', error);
      } finally {
        setVendorLookupsInProgress(false);
      }
    },
    []
  );

  const processStations = useCallback(
    (stns: Station[], servicesData: Service[] = []) => {
      setStations(stns);

      const serviceIdToNameMapLocal = new Map<string, string>();
      servicesData.forEach((service) => {
        if (service.id) {
          const displayName = service.ssid || service.serviceName || service.name || service.id;
          serviceIdToNameMapLocal.set(service.id, displayName);
        }
      });
      setServiceIdToNameMap(serviceIdToNameMapLocal);

      let totalUpload = 0;
      let totalDownload = 0;
      let authenticated = 0;

      const serviceMap = new Map<string, number>();
      const serviceThroughputMap = new Map<string, { upload: number; download: number }>();
      const clientThroughput: Array<{
        name: string;
        mac: string;
        throughput: number;
        upload: number;
        download: number;
        network: string;
        ap: string;
        rssi: number;
        band: string;
        ipAddress: string;
      }> = [];

      stns.forEach((station) => {
        const isAuthenticated =
          station.authenticated === undefined ||
          station.authenticated === true ||
          station.authenticated === 1 ||
          station.authenticated === null;
        if (isAuthenticated) authenticated++;

        let tx = 0;
        let rx = 0;

        if (
          station.transmittedRate !== undefined &&
          station.transmittedRate !== null &&
          station.transmittedRate > 0
        ) {
          tx =
            station.transmittedRate > 1000
              ? station.transmittedRate
              : station.transmittedRate * 1000000;
        } else if (station.txRate !== undefined && station.txRate !== null && station.txRate > 0) {
          tx = station.txRate > 1000 ? station.txRate : station.txRate * 1000000;
        } else {
          const uploadBytes = station.outBytes || station.txBytes || 0;
          if (uploadBytes > 0) {
            const sessionSeconds = station.uptime && station.uptime > 0 ? station.uptime : 3600;
            tx = (uploadBytes * 8) / sessionSeconds;
          }
        }

        if (
          station.receivedRate !== undefined &&
          station.receivedRate !== null &&
          station.receivedRate > 0
        ) {
          rx = station.receivedRate > 1000 ? station.receivedRate : station.receivedRate * 1000000;
        } else if (station.rxRate !== undefined && station.rxRate !== null && station.rxRate > 0) {
          rx = station.rxRate > 1000 ? station.rxRate : station.rxRate * 1000000;
        } else {
          const downloadBytes = station.inBytes || station.rxBytes || 0;
          if (downloadBytes > 0) {
            const sessionSeconds = station.uptime && station.uptime > 0 ? station.uptime : 3600;
            rx = (downloadBytes * 8) / sessionSeconds;
          }
        }

        totalUpload += tx;
        totalDownload += rx;

        let serviceName =
          station.ssid ||
          station.essid ||
          station.serviceName ||
          station.network ||
          station.networkName ||
          station.profileName;
        if (!serviceName && station.serviceId) {
          serviceName = serviceIdToNameMapLocal.get(station.serviceId) || undefined;
        }
        if (!serviceName && station.serviceId) {
          serviceName = station.serviceId.length > 20 ? 'Unknown Service' : station.serviceId;
        }
        serviceName = serviceName || 'Unknown';

        serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + 1);
        const existing = serviceThroughputMap.get(serviceName) || { upload: 0, download: 0 };
        serviceThroughputMap.set(serviceName, {
          upload: existing.upload + tx,
          download: existing.download + rx,
        });

        // Prefer the band the controller reports over guessing from rates.
        const band = deriveStationBand(station) ?? 'Unknown';

        clientThroughput.push({
          name: station.hostName || station.macAddress,
          mac: station.macAddress,
          throughput: tx + rx,
          upload: tx,
          download: rx,
          network: serviceName,
          ap: station.apName || station.apSerialNumber || 'Unknown',
          rssi: station.rssi || 0,
          band,
          ipAddress: station.ipAddress || 'N/A',
        });
      });

      setClientStats((prev) => ({
        ...prev,
        total: stns.length,
        authenticated,
        throughputUpload: totalUpload,
        throughputDownload: totalDownload,
      }));

      const sorted = clientThroughput.sort((a, b) => b.throughput - a.throughput).slice(0, 10);
      setTopClients(sorted);
      performVendorLookups(sorted);

      const distribution = Array.from(serviceMap.entries())
        .map(([service, count]) => ({
          service,
          count,
          percentage: Math.round((count / stns.length) * 100),
        }))
        .sort((a, b) => b.count - a.count);
      setClientDistribution(distribution);

      const networkThroughputData = Array.from(serviceThroughputMap.entries())
        .map(([network, throughput]) => ({
          network,
          upload: throughput.upload,
          download: throughput.download,
          total: throughput.upload + throughput.download,
        }))
        .sort((a, b) => b.total - a.total);
      setNetworkThroughput(networkThroughputData);

      storeThroughputSnapshot(
        totalUpload,
        totalDownload,
        stns.length,
        serviceThroughputMap,
        stns,
        servicesData
      );

      // RF metrics for Device Health Overview
      const bandCounts: Record<string, number> = { '2.4 GHz': 0, '5 GHz': 0, '6 GHz': 0 };
      const snrCounts: Record<string, number> = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
      let totalSnr = 0;
      let totalRssi = 0;
      let snrCount = 0;
      let rssiCount = 0;

      stns.forEach((station) => {
        const band = deriveStationBand(station);
        if (band) bandCounts[band]++;

        const rssi = station.rssi || (station as any).rss || 0;
        if (rssi < 0) {
          totalRssi += rssi;
          rssiCount++;
        }
        // Prefer the SNR the controller reports; only estimate from RSSI
        // (assumed -95 dBm noise floor) when the field is absent.
        const reportedSnr = Number((station as any).snr);
        const snr =
          Number.isFinite(reportedSnr) && reportedSnr > 0
            ? reportedSnr
            : rssi < 0
              ? rssi + 95
              : 0;
        if (snr > 0) {
          totalSnr += snr;
          snrCount++;
          if (snr >= 40) snrCounts['Excellent']++;
          else if (snr >= 25) snrCounts['Good']++;
          else if (snr >= 15) snrCounts['Fair']++;
          else snrCounts['Poor']++;
        }
      });

      // Colors come from the contrast-tested palette (dark base values);
      // OrgSiteHealthOverview re-resolves per theme at render time.
      setBandDistribution(
        [
          { band: '2.4 GHz', count: bandCounts['2.4 GHz'], color: BAND_COLORS['2.4'] },
          { band: '5 GHz', count: bandCounts['5 GHz'], color: BAND_COLORS['5'] },
          { band: '6 GHz', count: bandCounts['6 GHz'], color: BAND_COLORS['6'] },
        ].filter((b) => b.count > 0)
      );

      setSnrDistribution(
        [
          { category: 'Excellent', count: snrCounts['Excellent'], color: SNR_QUALITY_COLORS.excellent },
          { category: 'Good', count: snrCounts['Good'], color: SNR_QUALITY_COLORS.good },
          { category: 'Fair', count: snrCounts['Fair'], color: SNR_QUALITY_COLORS.fair },
          { category: 'Poor', count: snrCounts['Poor'], color: SNR_QUALITY_COLORS.poor },
        ].filter((s) => s.count > 0)
      );

      setAvgSnr(snrCount > 0 ? Math.round(totalSnr / snrCount) : 0);
      setAvgRssi(rssiCount > 0 ? Math.round(totalRssi / rssiCount) : 0);

      loadHistoricalThroughput();
    },
    [performVendorLookups, storeThroughputSnapshot, loadHistoricalThroughput]
  );

  /**
   * Fetch the aggregated WLAN summary.
   *
   * Resolves to null rather than throwing, so a backend that predates the
   * endpoint simply falls through to the per-service fan-out.
   */
  const fetchServicesSummary = useCallback(async (): Promise<ServicesSummary | null> => {
    try {
      const response = await fetch('/api/v1/services/summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
      });
      return response.ok ? ((await response.json()) as ServicesSummary) : null;
    } catch {
      return null;
    }
  }, []);

  const processServices = useCallback(
    async (svcs: Service[], summaryPromise?: Promise<ServicesSummary | null>) => {
      setServices(svcs);
      const reports = new Map<string, ServiceReport>();
      const poor: Service[] = [];
      const servicesToFetch = svcs.slice(0, 10);

    /** Classify a WLAN as poor from its report figures. Shared by both paths. */
    const classify = (service: Service, reportData: ServiceReport) => {
      const reliability = (reportData as any).metrics?.reliability ?? service.reliability;
      const uptime = (reportData as any).metrics?.uptime ?? service.uptime;
      const reliabilityKnown = Number.isFinite(reliability);
      const uptimeKnown = Number.isFinite(uptime);
      if (
        (reliabilityKnown && (reliability as number) < 95) ||
        (uptimeKnown && (uptime as number) < 95)
      ) {
        poor.push(service);
      }
    };

      // Preferred path: one aggregated request, already in flight.
      //
      // The per-WLAN fan-out below issues two gateway calls per service, and the
      // browser will only run six at a time against one origin — measured as the
      // largest single contributor to Dashboard load. `/api/v1/services/summary`
      // performs the same fan-out server-side over pooled connections and
      // returns it in one response. The fan-out is kept as a fallback so a
      // deployment whose backend predates the endpoint still renders.
      const summary = summaryPromise ? await summaryPromise : null;
      if (summary) {
        for (const service of servicesToFetch) {
          const reportData = summary.reports?.[service.id];
          if (reportData) {
            reports.set(service.id, reportData);
            classify(service, reportData);
          }
          const count = summary.stationCounts?.[service.id];
          if (typeof count === 'number') service.clientCount = count;
        }
        setServiceReports(reports);
        setPoorServices(poor);
        return;
      }

      const servicePromises = servicesToFetch.map(async (service) => {
        try {
          const [reportResponse, stationsResponse] = await Promise.all([
            apiService.makeAuthenticatedRequest(
              `/v1/services/${service.id}/report`,
              { method: 'GET' },
              8000
            ),
            apiService.makeAuthenticatedRequest(
              `/v1/services/${service.id}/stations`,
              { method: 'GET' },
              8000
            ),
          ]);

          if (reportResponse.ok) {
            const reportData = await reportResponse.json();
            reports.set(service.id, reportData);
            classify(service, reportData);
          }

          if (stationsResponse.ok) {
            const stationsData = await stationsResponse.json();
            const stationList = Array.isArray(stationsData)
              ? stationsData
              : (stationsData ?? {}).stations || [];
            service.clientCount = stationList.length;
          }
        } catch {
          /* station fetch failed, skip */
        }
      });

      await Promise.allSettled(servicePromises);
      setServiceReports(reports);
      setPoorServices(poor);
    },
    []
  );

  const processNotifications = useCallback((notifs: Notification[]) => {
    const oneDayAgo = Date.now() - 86400000;
    const recent = notifs.filter((n) => (n.timestamp || 0) >= oneDayAgo);
    setNotifications(recent);

    let critical = 0;
    let warning = 0;
    let info = 0;
    recent.forEach((n) => {
      const severity = (n.severity || n.level || '').toLowerCase();
      if (
        severity.includes('critical') ||
        severity.includes('high') ||
        severity.includes('error')
      ) {
        critical++;
      } else if (
        severity.includes('warning') ||
        severity.includes('warn') ||
        severity.includes('medium')
      ) {
        warning++;
      } else {
        info++;
      }
    });

    setAlertCounts({ critical, warning, info });
  }, []);

  const loadDashboardData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
          // A deliberate refresh must reach the controller rather than replay
          // the burst cache, which exists to collapse navigation storms.
          apiService.clearBurstCache();
        } else {
          setLoading(true);
        }

        // The WLAN summary does not depend on this page's own /v1/services call
        // — it resolves the collection server-side — so it starts here, in
        // parallel with everything else, rather than after `fetchServices()`
        // resolves. Awaiting it inside `processServices` made the two the
        // dashboard's critical path back to back (~212ms then ~981ms) when they
        // could overlap.
        const summaryPromise = fetchServicesSummary();

        const [apsResult, stationsResult, servicesResult] = await Promise.allSettled([
          fetchAccessPoints(),
          fetchStations(),
          fetchServices(),
        ]);

        let servicesData: Service[] = [];
        if (servicesResult.status === 'fulfilled' && servicesResult.value) {
          servicesData = servicesResult.value;
          await processServices(servicesData, summaryPromise);
        } else {
          // Nothing will consume it; make sure a rejection cannot go unhandled.
          void summaryPromise.catch(() => null);
        }

        if (apsResult.status === 'fulfilled' && apsResult.value) {
          processAccessPoints(apsResult.value);
        }

        if (stationsResult.status === 'fulfilled' && stationsResult.value) {
          processStations(stationsResult.value, servicesData);
        }

        setLastUpdate(new Date());

        if (!isRefresh) {
          fetchNotifications()
            .then((notifs) => {
              if (notifs) processNotifications(notifs);
            })
            .catch(() => {});
        }

        fetchRFQIData().catch(() => {});

        // setSites is guarded against re-fetching via sites.length check inside the effect
        apiService
          .getSites()
          .then((s) => setSites((prev) => (prev.length > 0 ? prev : s)))
          .catch(() => {});

        if (isRefresh) {
          toast.success('Dashboard refreshed');
        }
      } catch (error) {
        console.error('[Dashboard] Error loading dashboard:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      fetchAccessPoints,
      fetchStations,
      fetchServices,
      fetchServicesSummary,
      processServices,
      processAccessPoints,
      processStations,
      fetchNotifications,
      processNotifications,
      fetchRFQIData,
    ]
  );

  useEffect(() => {
    loadDashboardData();

    const onCommandRefresh = () => loadDashboardData(true);
    window.addEventListener('aura:dashboard-refresh', onCommandRefresh);

    // A finished calendar day does not change, so polling the controller for it
    // is pure waste — and worse, it would keep replacing the view with fresh
    // current-state data while the header says the range is historical. Manual
    // refresh still works.
    const interval = isHistorical
      ? null
      : setInterval(
          whenAutoRefresh(() => {
            loadDashboardData(true);
          }),
          60000
        );

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('aura:dashboard-refresh', onCommandRefresh);
    };
  }, [filters.site, operationalCtx.siteId, operationalCtx.mode, isHistorical]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stored history is a separate concern from the controller fetch above: it is
  // keyed on the selected window, so changing the range reloads it without
  // re-pulling the whole dashboard, and it needs no gateway connection.
  useEffect(() => {
    loadHistoricalThroughput();
    if (isHistorical) return undefined;

    const historyInterval = setInterval(
      whenAutoRefresh(() => {
        loadHistoricalThroughput();
      }),
      300000
    );
    return () => clearInterval(historyInterval);
  }, [loadHistoricalThroughput, isHistorical]);

  // Window-scoped headline counts. Without these the KPI tiles show the same
  // instantaneous snapshot for every selection, which is what made the time
  // control appear to do nothing.
  useEffect(() => {
    let active = true;
    const siteId = getActiveSiteFilter();

    (async () => {
      try {
        const response = await monitoringHistory.getHistory({
          start: range.startIso,
          end: range.endIso,
          siteId,
          metricNames: [...RANGED_STAT_METRICS],
          resolutionMinutes: range.bucketMinutes,
        });
        if (!active) return;
        setRangedStats(deriveRangedNetworkStats(response.series));
      } catch (error) {
        if (!active) return;
        // Non-fatal: the tiles fall back to the live snapshot and say so. A
        // monitoring outage must not blank the dashboard's headline numbers.
        console.warn('[Dashboard] Window stats unavailable, using live snapshot:', error);
        setRangedStats(EMPTY_RANGED_STATS);
      }
    })();

    return () => {
      active = false;
    };
  }, [range.startIso, range.endIso, range.bucketMinutes, getActiveSiteFilter]);

  useEffect(() => {
    if (apStats.total > 0 && clientStats.total > 0 && rfqiData.length > 0) {
      const latestRfqi = rfqiData[rfqiData.length - 1];
      recordNetworkMetrics({
        rfqi: latestRfqi?.rfqi ?? 0,
        clientCount: clientStats.total,
        apOnlineCount: apStats.online,
        siteId: getActiveSiteFilter(),
      });
    }
  }, [apStats.online, clientStats.total, rfqiData, filters.site]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loading,
    refreshing,
    lastUpdate,
    accessPoints,
    apStats,
    stations,
    clientStats,
    throughputTrend,
    topClients,
    clientDistribution,
    networkThroughput,
    vendorLookupsInProgress,
    serviceIdToNameMap,
    services,
    serviceReports,
    poorServices,
    notifications,
    alertCounts,
    sites,
    rfqiData,
    bandDistribution,
    snrDistribution,
    avgSnr,
    avgRssi,
    activeSiteId: getActiveSiteFilter(),
    rangedStats,
    isHistorical,
    unavailableForRange,
    reload: loadDashboardData,
  };
}
