/* eslint-disable @typescript-eslint/no-explicit-any */
// Dashboard API responses from Campus Controller are untyped JSON
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { throughputService, ThroughputSnapshot } from '../services/throughput';
import { getVendor, getVendorIcon } from '../services/oui-lookup';
import { recordNetworkMetrics } from '../services/aiBaselineService';
import { useGlobalFilters } from './useGlobalFilters';
import { useOperationalContext } from './useOperationalContext';

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
  reload: (isRefresh?: boolean) => void;
}

export function useDashboardData(): DashboardData {
  const { filters } = useGlobalFilters();
  const { ctx: operationalCtx } = useOperationalContext();

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

  const fetchRFQIData = useCallback(async () => {
    const siteId = getActiveSiteFilter();
    try {
      if (siteId) {
        const rfData = await apiService.fetchRFQualityData(siteId, '24H');
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
          return;
        }
      }
      setRfqiData([]);
    } catch (error) {
      console.error('[Dashboard] Error fetching RFQI data:', error);
      setRfqiData([]);
    }
  }, [getActiveSiteFilter]);

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
    });

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

  const loadHistoricalThroughput = useCallback(async () => {
    try {
      const snapshots = await throughputService.getSnapshotsForLastMinutes(60);

      if (snapshots.length > 0) {
        const trend = snapshots.map((snapshot) => {
          const date = new Date(snapshot.timestamp);
          const timeStr = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          return {
            time: timeStr,
            upload: Math.round(snapshot.totalUpload),
            download: Math.round(snapshot.totalDownload),
            total: Math.round(snapshot.totalTraffic),
          };
        });
        setThroughputTrend(trend);
      } else {
        setThroughputTrend([]);
      }
    } catch (error) {
      console.error('[Dashboard] ✗ Failed to load historical throughput:', error);
      setThroughputTrend([]);
    }
  }, []);

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

        let band = 'Unknown';
        if (station.txRate || station.rxRate) {
          const rate = Math.max(station.txRate || 0, station.rxRate || 0);
          band = rate > 200 ? '5 GHz' : '2.4 GHz';
        }

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
        const channel = (station as any).channel || '';
        const channelNum = parseInt(channel.toString().split('/')[0], 10);
        const stationBand = (station as any).band || (station as any).frequencyBand;
        const rate = Math.max(
          (station as any).transmittedRate || station.txRate || 0,
          (station as any).receivedRate || station.rxRate || 0
        );

        if (stationBand) {
          if (stationBand.includes('6') || stationBand.includes('6E')) {
            bandCounts['6 GHz']++;
          } else if (stationBand.includes('5')) {
            bandCounts['5 GHz']++;
          } else {
            bandCounts['2.4 GHz']++;
          }
        } else if (!isNaN(channelNum) && channelNum > 0) {
          if (channelNum >= 1 && channelNum <= 14) {
            bandCounts['2.4 GHz']++;
          } else if (channelNum >= 36 && channelNum <= 177) {
            bandCounts['5 GHz']++;
          } else if (channelNum > 177) {
            bandCounts['6 GHz']++;
          }
        } else if (rate > 0) {
          const rateMbps = rate / 1000000;
          if (rateMbps > 1200) {
            bandCounts['6 GHz']++;
          } else if (rateMbps > 150) {
            bandCounts['5 GHz']++;
          } else {
            bandCounts['2.4 GHz']++;
          }
        }

        const rssi = station.rssi || (station as any).rss || 0;
        if (rssi < 0) {
          totalRssi += rssi;
          rssiCount++;
          const estimatedSnr = rssi - -95;
          if (estimatedSnr > 0) {
            totalSnr += estimatedSnr;
            snrCount++;
            if (estimatedSnr >= 40) snrCounts['Excellent']++;
            else if (estimatedSnr >= 25) snrCounts['Good']++;
            else if (estimatedSnr >= 15) snrCounts['Fair']++;
            else snrCounts['Poor']++;
          }
        }
      });

      setBandDistribution(
        [
          { band: '2.4 GHz', count: bandCounts['2.4 GHz'], color: '#f59e0b' },
          { band: '5 GHz', count: bandCounts['5 GHz'], color: '#3b82f6' },
          { band: '6 GHz', count: bandCounts['6 GHz'], color: '#8b5cf6' },
        ].filter((b) => b.count > 0)
      );

      setSnrDistribution(
        [
          { category: 'Excellent', count: snrCounts['Excellent'], color: '#10b981' },
          { category: 'Good', count: snrCounts['Good'], color: '#22d3ee' },
          { category: 'Fair', count: snrCounts['Fair'], color: '#f59e0b' },
          { category: 'Poor', count: snrCounts['Poor'], color: '#ef4444' },
        ].filter((s) => s.count > 0)
      );

      setAvgSnr(snrCount > 0 ? Math.round(totalSnr / snrCount) : 0);
      setAvgRssi(rssiCount > 0 ? Math.round(totalRssi / rssiCount) : 0);

      loadHistoricalThroughput();
    },
    [performVendorLookups, storeThroughputSnapshot, loadHistoricalThroughput]
  );

  const processServices = useCallback(async (svcs: Service[]) => {
    setServices(svcs);
    const reports = new Map<string, ServiceReport>();
    const poor: Service[] = [];
    const servicesToFetch = svcs.slice(0, 10);

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

          const reliability = reportData.metrics?.reliability ?? service.reliability;
          const uptime = reportData.metrics?.uptime ?? service.uptime;
          const reliabilityKnown = Number.isFinite(reliability);
          const uptimeKnown = Number.isFinite(uptime);

          if (
            (reliabilityKnown && (reliability as number) < 95) ||
            (uptimeKnown && (uptime as number) < 95)
          ) {
            poor.push(service);
          }
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
  }, []);

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
        } else {
          setLoading(true);
        }

        const [apsResult, stationsResult, servicesResult] = await Promise.allSettled([
          fetchAccessPoints(),
          fetchStations(),
          fetchServices(),
        ]);

        let servicesData: Service[] = [];
        if (servicesResult.status === 'fulfilled' && servicesResult.value) {
          servicesData = servicesResult.value;
          await processServices(servicesData);
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
    loadHistoricalThroughput();

    const onCommandRefresh = () => loadDashboardData(true);
    window.addEventListener('aura:dashboard-refresh', onCommandRefresh);

    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 60000);

    const historyInterval = setInterval(() => {
      loadHistoricalThroughput();
    }, 300000);

    return () => {
      clearInterval(interval);
      clearInterval(historyInterval);
      window.removeEventListener('aura:dashboard-refresh', onCommandRefresh);
    };
  }, [filters.site, operationalCtx.siteId, operationalCtx.mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    reload: loadDashboardData,
  };
}
