import { useState, useEffect, memo, useCallback } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { apiService } from '../services/api';
import { throughputService, ThroughputSnapshot } from '../services/throughput';
import { toast } from 'sonner';
import { getVendor, getVendorIcon } from '../services/oui-lookup';
import { formatBitsPerSecond, formatBytes as formatBytesUnit } from '../lib/units';
import { EntityDetailView } from './dashboard/EntityDetailView';
import { DashboardHero } from './dashboard/DashboardHero';
import { AIInsightsBranch } from './dashboard/AIInsightsBranch';
import { ClientDetailDialog } from './dashboard/ClientDetailDialog';
import { ServiceClientsDialog } from './dashboard/ServiceClientsDialog';
import { NetworkDashboardView } from './dashboard/NetworkDashboardView';
import { UnifiedFilterBar, SelectorTab } from './UnifiedFilterBar';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { TimelineCursorControls } from './TimelineCursorControls';
import { recordNetworkMetrics } from '../services/aiBaselineService';
import { usePersonaContext } from '../contexts/PersonaContext';
import {
  isSectionVisible,
  PERSONA_DASHBOARD_CONFIG,
  type DashboardSection,
} from '../config/personaDashboardConfig';

interface AccessPoint {
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

interface Station {
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
  inBytes?: number; // API field for download bytes
  outBytes?: number; // API field for upload bytes
  transmittedRate?: number; // API field for upload rate
  receivedRate?: number; // API field for download rate
  uptime?: number;
  authenticated?: boolean | number;
  connectionTime?: number;
  [key: string]: any;
}

interface Service {
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

interface ServiceReport {
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

interface Notification {
  id: string;
  type: string;
  severity?: string;
  level?: string;
  message: string;
  timestamp: number;
  status?: string;
}

function DashboardEnhancedComponent() {
  // Global filters for site/time filtering
  const { filters, updateFilter } = useGlobalFilters();

  // Persona-aware section visibility (dev mode)
  const { activePersona } = usePersonaContext();
  const personaConfig = PERSONA_DASHBOARD_CONFIG[activePersona];
  const showSection = useCallback(
    (section: DashboardSection) => isSectionVisible(activePersona, section),
    [activePersona]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Operational Context for Contextual Insights
  const { ctx: operationalCtx, setMode: setOperationalMode } = useOperationalContext();

  // AP Data
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

  // Client/Station Data
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

  // Service Data
  const [services, setServices] = useState<Service[]>([]);
  const [serviceReports, setServiceReports] = useState<Map<string, ServiceReport>>(new Map());
  const [poorServices, setPoorServices] = useState<Service[]>([]);

  // Notifications/Alerts
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertCounts, setAlertCounts] = useState({
    critical: 0,
    warning: 0,
    info: 0,
  });

  // Client Detail Dialog (events state is managed inside ClientDetailDialog).
  const [selectedClient, setSelectedClient] = useState<Station | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);

  // Service Filter Dialog
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [isServiceClientsDialogOpen, setIsServiceClientsDialogOpen] = useState(false);

  // Collapsible sections state
  const [isTopClientsCollapsed, setIsTopClientsCollapsed] = useState(true);

  // Dashboard search state (for UnifiedFilterBar)
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Contextual Insights Selector state
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('ai-insights');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);
  const [isConnectedClientsCollapsed, setIsConnectedClientsCollapsed] = useState(true);

  // Sites list for display-name resolution (id → human-readable name)
  const [sites, setSites] = useState<Array<{ id: string; name: string; [key: string]: any }>>([]);

  // AI Insights - Client Health Tracking (inspired by Sunil Jose Kodiyan's design)
  const [aiInsightsDetailPanel, setAiInsightsDetailPanel] = useState(true);
  const [aiActiveHealthTab, setAiActiveHealthTab] = useState<'needsAttention' | 'healthy'>(
    'healthy'
  );

  // RFQI (RF Quality Index) Data for health visualization from controller
  const [rfqiData, setRfqiData] = useState<
    Array<{
      timestamp: number;
      healthy: number;
      needsAttention: number;
      rfqi: number;
    }>
  >([]);

  // RF Metrics for Device Health Overview
  const [bandDistribution, setBandDistribution] = useState<
    { band: string; count: number; color: string }[]
  >([]);
  const [snrDistribution, setSnrDistribution] = useState<
    { category: string; count: number; color: string }[]
  >([]);
  const [avgSnr, setAvgSnr] = useState<number>(0);
  const [avgRssi, setAvgRssi] = useState<number>(0);

  const [selectedNetworkEvent, setSelectedNetworkEvent] = useState<{
    id: string;
    time: string;
    type: 'single' | 'group' | 'infrastructure';
    description: string;
    affectedCount: number;
    aiExplanation: string;
    severity: 'low' | 'medium' | 'high';
    status: 'resolved' | 'in-progress' | 'monitoring' | 'stable' | 'requires-action';
    entityNames?: string[];
  } | null>(null);

  // Sync operational context siteId to global filters on mount/change
  useEffect(() => {
    if (operationalCtx.mode === 'SITE' && operationalCtx.siteId) {
      if (filters.site !== operationalCtx.siteId) {
        updateFilter('site', operationalCtx.siteId);
      }
    }
  }, [operationalCtx.siteId, operationalCtx.mode]);

  // Sync operational context (driven by UnifiedFilterBar selections) to the
  // local selectorTab/selectedEntityId state that controls which Insights
  // sub-view renders. Without this, clicking a site/AP/client in the filter
  // bar silently updates the shared context but never routes the page.
  useEffect(() => {
    if (operationalCtx.mode === 'AI_INSIGHTS') {
      setSelectorTab('ai-insights');
      setSelectedEntityId(null);
      setSelectedEntityName(null);
      return;
    }
    if (operationalCtx.mode === 'SITE') {
      setSelectorTab('site');
      setSelectedEntityId(operationalCtx.siteId);
      const site = sites.find((s) => s.id === operationalCtx.siteId);
      setSelectedEntityName(site?.name || site?.siteName || operationalCtx.siteId);
      return;
    }
    if (operationalCtx.mode === 'AP') {
      setSelectorTab('access-point');
      setSelectedEntityId(operationalCtx.apId);
      const ap = accessPoints.find((a) => a.serialNumber === operationalCtx.apId);
      setSelectedEntityName(
        ap?.displayName || ap?.hostname || ap?.serialNumber || operationalCtx.apId
      );
      return;
    }
    if (operationalCtx.mode === 'CLIENT') {
      setSelectorTab('client');
      setSelectedEntityId(operationalCtx.clientId);
      const st = stations.find((s) => s.macAddress === operationalCtx.clientId);
      setSelectedEntityName(st?.hostName || operationalCtx.clientId);
      return;
    }
  }, [
    operationalCtx.mode,
    operationalCtx.siteId,
    operationalCtx.apId,
    operationalCtx.clientId,
    accessPoints,
    stations,
    sites,
  ]);

  // On mount: always start at the AI Insights overview regardless of what was
  // persisted in localStorage. The user can navigate into a specific site/AP/client
  // from there. Without this, a previous session's "SITE" mode would immediately
  // route into a site UUID view on every fresh page load.
  useEffect(() => {
    setOperationalMode('AI_INSIGHTS');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDashboardData();
    loadHistoricalThroughput();

    // Listen for the global "aura:dashboard-refresh" event dispatched by
    // the CommandPalette (Wave 4B) so cmd+shift+P → "Refresh dashboard"
    // actually reloads here.
    const onCommandRefresh = () => loadDashboardData(true);
    window.addEventListener('aura:dashboard-refresh', onCommandRefresh);

    // Auto-refresh every 60 seconds (optimized for performance)
    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 60000);

    // Reload historical data every 5 minutes
    const historyInterval = setInterval(() => {
      loadHistoricalThroughput();
    }, 300000);

    return () => {
      clearInterval(interval);
      clearInterval(historyInterval);
      window.removeEventListener('aura:dashboard-refresh', onCommandRefresh);
    };
  }, [filters.site, operationalCtx.siteId, operationalCtx.mode]); // Reload when site filter or operational context changes

  // Record metrics for AI Baseline calculation when data is loaded
  useEffect(() => {
    // Only record when we have both AP and client data
    if (apStats.total > 0 && clientStats.total > 0 && rfqiData.length > 0) {
      const latestRfqi = rfqiData[rfqiData.length - 1];
      recordNetworkMetrics({
        rfqi: latestRfqi?.rfqi ?? 0,
        clientCount: clientStats.total,
        apOnlineCount: apStats.online,
        siteId: getActiveSiteFilter(),
      });
    }
  }, [apStats.online, clientStats.total, rfqiData, filters.site]);

  // Station events: loaded inside ClientDetailDialog when it opens.

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log('[Dashboard] Loading comprehensive dashboard data...');

      // Fetch critical data in parallel for faster initial load
      // Notifications are loaded separately to not block dashboard rendering
      const [apsResult, stationsResult, servicesResult] = await Promise.allSettled([
        fetchAccessPoints(),
        fetchStations(),
        fetchServices(),
      ]);

      // Get services first to create a lookup map
      let servicesData: Service[] = [];
      if (servicesResult.status === 'fulfilled' && servicesResult.value) {
        servicesData = servicesResult.value;
        await processServices(servicesData);
      } else {
        console.log(
          '[Dashboard] Failed to load services:',
          servicesResult.status === 'rejected' ? servicesResult.reason : 'No data'
        );
      }

      // Process Access Points
      if (apsResult.status === 'fulfilled' && apsResult.value) {
        processAccessPoints(apsResult.value);
      } else {
        console.log(
          '[Dashboard] Failed to load APs:',
          apsResult.status === 'rejected' ? apsResult.reason : 'No data'
        );
      }

      // Process Stations with services data for enrichment
      if (stationsResult.status === 'fulfilled' && stationsResult.value) {
        processStations(stationsResult.value, servicesData);
      } else {
        console.log(
          '[Dashboard] Failed to load stations:',
          stationsResult.status === 'rejected' ? stationsResult.reason : 'No data'
        );
      }

      setLastUpdate(new Date());

      // Load notifications asynchronously after main data (non-blocking)
      if (!isRefresh) {
        fetchNotifications()
          .then((notifications) => {
            if (notifications) {
              processNotifications(notifications);
            }
          })
          .catch((err) => {
            console.log('[Dashboard] Failed to load notifications:', err);
          });
      }

      // Load RFQI data for health visualization (non-blocking)
      fetchRFQIData().catch((err) => {
        console.log('[Dashboard] Failed to load RFQI data:', err);
      });

      // Load sites list for display-name resolution (non-blocking, cached after first load)
      if (sites.length === 0) {
        apiService
          .getSites()
          .then(setSites)
          .catch(() => {});
      }

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
  };

  // Returns the currently active site ID for API calls.
  // Prefers the operational context (updated synchronously on site selection)
  // over the debounced global filter to avoid a 300ms stale-data window.
  const getActiveSiteFilter = (): string | undefined => {
    if (operationalCtx.mode === 'SITE' && operationalCtx.siteId) {
      return operationalCtx.siteId;
    }
    return filters.site !== 'all' ? filters.site : undefined;
  };

  const fetchAccessPoints = async (): Promise<AccessPoint[]> => {
    const siteFilter = getActiveSiteFilter();
    console.log(
      '[Dashboard] Fetching access points' + (siteFilter ? ` for site: ${siteFilter}` : '')
    );

    try {
      // Use site-specific API if site is selected
      const aps = await apiService.getAccessPointsBySite(siteFilter);

      console.log(
        '[Dashboard] Fetched',
        aps.length,
        'access points' + (siteFilter ? ' (filtered by site)' : '')
      );
      return aps;
    } catch (error) {
      console.error('[Dashboard] Error fetching APs:', error);
      return [];
    }
  };

  const fetchStations = async (): Promise<Station[]> => {
    const siteFilter = getActiveSiteFilter();
    console.log('[Dashboard] Fetching stations' + (siteFilter ? ` for site: ${siteFilter}` : ''));

    try {
      // If site is selected, use site-specific endpoint with client-side fallback
      if (siteFilter) {
        // Try site-scoped API first
        try {
          const response = await apiService.makeAuthenticatedRequest(
            `/v3/sites/${siteFilter}/stations`,
            { method: 'GET' },
            15000
          );
          if (response.ok) {
            const data = await response.json();
            const safe = data ?? {};
            const stations = Array.isArray(data)
              ? data
              : safe.stations || safe.clients || safe.data || [];
            console.log('[Dashboard] Fetched', stations.length, 'stations for site (API-scoped)');
            return stations;
          }
        } catch {
          /* fall through to client-side filter */
        }

        // STRICT: Client-side fallback - filter all stations by site name/ID
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
            console.log(
              '[Dashboard] Filtered',
              filtered.length,
              '/',
              allStations.length,
              'stations for site (client-side)'
            );
            return filtered;
          }
        } catch {
          /* fall through */
        }

        console.warn('[Dashboard] Station fetch failed for site, returning empty (strict mode)');
        return []; // STRICT: empty on failure when site-scoped
      } else {
        // Get all stations
        const response = await apiService.makeAuthenticatedRequest(
          '/v1/stations',
          { method: 'GET' },
          15000
        );

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const safe = data ?? {};
        const stations = Array.isArray(data)
          ? data
          : safe.stations || safe.clients || safe.data || [];

        console.log('[Dashboard] Fetched', stations.length, 'stations');
        return stations;
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching stations:', error);
      return [];
    }
  };

  const fetchServices = async (): Promise<Service[]> => {
    const siteFilter = getActiveSiteFilter();
    console.log('[Dashboard] Fetching services' + (siteFilter ? ` for site: ${siteFilter}` : ''));

    try {
      // STRICT: Use site-specific services if site is selected
      if (siteFilter) {
        try {
          const services = await apiService.getServicesBySite(siteFilter);
          if (services.length > 0) {
            console.log('[Dashboard] Fetched', services.length, 'services for site');
            return services;
          }
        } catch {
          // Fall through to client-side filter only
        }

        // STRICT: Client-side filter as last resort, but NEVER return unfiltered global data
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
            console.log('[Dashboard] Filtered', filtered.length, 'services for site (client-side)');
            return filtered; // STRICT: return filtered even if empty
          }
        } catch {
          // Fall through
        }

        console.warn('[Dashboard] Service fetch failed for site, returning empty (strict mode)');
        return []; // STRICT: empty on failure when site-scoped
      }

      // No site filter: return all services
      const response = await apiService.makeAuthenticatedRequest(
        '/v1/services',
        { method: 'GET' },
        15000
      );
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = await response.json();
      const safe = data ?? {};
      const services = Array.isArray(data) ? data : safe.services || safe.data || [];
      console.log('[Dashboard] Fetched', services.length, 'services');
      return services;
    } catch (error) {
      console.error('[Dashboard] Error fetching services:', error);
      return [];
    }
  };

  const fetchNotifications = async (): Promise<Notification[]> => {
    const siteFilter = getActiveSiteFilter();
    console.log(
      '[Dashboard] Fetching notifications' + (siteFilter ? ` for site: ${siteFilter}` : '')
    );

    try {
      const response = await apiService.makeAuthenticatedRequest(
        '/v1/notifications',
        { method: 'GET' },
        10000
      );

      if (!response.ok) {
        // Try alternative endpoint
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

      // STRICT: filter by site device correlation when site-scoped
      const notifications = siteFilter
        ? await filterNotificationsBySite(allNotifs, siteFilter)
        : allNotifs;
      console.log(
        '[Dashboard] Fetched',
        notifications.length,
        'notifications' + (siteFilter ? ' (site-scoped)' : '')
      );
      return notifications;
    } catch (error) {
      console.log('[Dashboard] Notifications not available:', error);
      return [];
    }
  };

  // STRICT: Filter notifications by AP-site device correlation
  const filterNotificationsBySite = async (
    notifications: Notification[],
    siteId: string
  ): Promise<Notification[]> => {
    try {
      const siteAPs = await apiService.getAccessPointsBySite(siteId);
      const deviceIds = new Set<string>();
      siteAPs.forEach((ap) => {
        if (ap.name) deviceIds.add(ap.name.toLowerCase());
        if (ap.serialNumber) deviceIds.add(ap.serialNumber.toLowerCase());
        if ((ap as any).hostname) deviceIds.add((ap as any).hostname.toLowerCase());
        if ((ap as any).macAddress) deviceIds.add((ap as any).macAddress.toLowerCase());
      });
      if (deviceIds.size === 0) return []; // STRICT: no devices = no notifications
      return notifications.filter((n) => {
        const source = ((n as any).source || '').toLowerCase();
        const device = ((n as any).deviceName || (n as any).device || '').toLowerCase();
        return deviceIds.has(source) || deviceIds.has(device);
      });
    } catch {
      return []; // STRICT: empty on failure
    }
  };

  // Compute composite RFQI score from per-radio ifstats.
  // Formula (all fields from /v1/aps/ifstats?rfStats=true, per radio):
  //   score = rfqi_component(40%) + utilization_component(25%) + interference_component(20%) + cochannel_component(15%)
  // Each component is normalized 0-100 before weighting.
  // Result clamped to [0, 100].
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
      // rfqi is 1-5 scale → normalize to 0-100
      const rfqiNorm = Math.min(100, Math.max(0, (rfqiRaw / 5) * 100));
      // chUtil: 0-100% → inverted (lower util = better signal health)
      const chUtilNorm = Math.min(100, Math.max(0, 100 - (r.chUtil ?? 0)));
      // interference: 0-100% → inverted
      const intfNorm = Math.min(100, Math.max(0, 100 - (r.interference ?? 0)));
      // cochannel: 0-100% → inverted
      const cochNorm = Math.min(100, Math.max(0, 100 - (r.cochannel ?? 0)));
      const radioScore = rfqiNorm * 0.4 + chUtilNorm * 0.25 + intfNorm * 0.2 + cochNorm * 0.15;
      totalScore += radioScore;
      count++;
    }
    return count > 0 ? Math.round(totalScore / count) : 0;
  };

  // Fetch RFQI (RF Quality Index) data from controller for health visualization
  const fetchRFQIData = async () => {
    const siteId = getActiveSiteFilter();
    console.log(
      '[Dashboard] Fetching RFQI data' + (siteId ? ` for site: ${siteId}` : ' for all sites')
    );

    try {
      // --- Path 1: Site report time-series (site selected) ---
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
            console.log(
              '[Dashboard] RFQI: loaded',
              sortedData.length,
              'time-series points from site report'
            );
            return;
          }
        }
      }

      // --- Path 2: Composite score from per-radio ifstats ---
      // Used when no site-report data is available (or no site selected).
      const ifstats = await apiService.getAPInterfaceStatsWithRF();

      if (ifstats && ifstats.length > 0) {
        // Collect all radio objects, optionally scoped to the selected site
        const allRadios: Array<{
          rfqi?: number;
          chUtil?: number;
          interference?: number;
          cochannel?: number;
          noise?: number;
          clientCount?: number;
        }> = [];

        for (const ap of ifstats) {
          // Filter by site if selected — match siteId field on the AP object
          if (siteId && ap.siteId && ap.siteId !== siteId) continue;

          const radios = ap.wirelessRf || ap.radioStats || ap.radios || [];
          if (Array.isArray(radios)) {
            allRadios.push(...radios);
          } else if (ap.rfqi !== undefined) {
            // AP-level (not per-radio) fallback
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
          // Synthesize a single current-time data point (no historical trend available)
          const now = Date.now();
          const point = {
            timestamp: now,
            rfqi: compositeScore / 20, // back to 1-5 scale for display
            healthy: compositeScore,
            needsAttention: 100 - compositeScore,
          };
          setRfqiData([point]);
          console.log(
            '[Dashboard] RFQI composite score:',
            compositeScore,
            'from',
            allRadios.length,
            'radios'
          );
          return;
        }
      }

      // No real RFQI data available — show empty state
      console.log('[Dashboard] No RFQI data available from controller; showing empty state');
      setRfqiData([]);
    } catch (error) {
      console.error('[Dashboard] Error fetching RFQI data:', error);
      setRfqiData([]);
    }
  };

  const processAccessPoints = (aps: AccessPoint[]) => {
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
      // Determine online status - check multiple possible fields and values
      const status = (
        ap.status ||
        ap.connectionState ||
        ap.operationalState ||
        (ap as any).state ||
        ''
      ).toLowerCase();
      const isUp = (ap as any).isUp;
      const isOnline = (ap as any).online;

      // DEBUG: Log AP status fields to understand data structure
      console.log('[Dashboard] AP Status Debug:', {
        name: ap.name || ap.hostname || ap.serialNumber,
        status: ap.status,
        connectionState: ap.connectionState,
        operationalState: ap.operationalState,
        state: (ap as any).state,
        isUp: isUp,
        online: isOnline,
        computedStatus: status,
        allKeys: Object.keys(ap).filter(
          (k) =>
            k.toLowerCase().includes('status') ||
            k.toLowerCase().includes('state') ||
            k.toLowerCase().includes('connect') ||
            k === 'online' ||
            k === 'isUp'
        ),
      });

      // Consider an AP online if:
      // 1. Status is "inservice" (case-insensitive)
      // 2. Status contains 'up', 'online', 'connected'
      // 3. isUp or online boolean is true
      // 4. No status field but AP exists in list (default to online)
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
        console.log('[Dashboard] ✓ AP marked ONLINE:', ap.name || ap.hostname || ap.serialNumber);
      } else {
        stats.offline++;
        console.log('[Dashboard] ✗ AP marked OFFLINE:', ap.name || ap.hostname || ap.serialNumber);
      }

      // Determine role
      const role = (ap.role || '').toLowerCase();
      if (role.includes('primary') || role.includes('master')) {
        stats.primary++;
      } else if (role.includes('backup') || role.includes('secondary')) {
        stats.backup++;
      } else if (role.includes('standby')) {
        stats.standby++;
      }

      // Determine power mode
      const powerMode = (ap.powerMode || '').toLowerCase();
      if (ap.lowPower || powerMode.includes('low') || powerMode.includes('reduced')) {
        stats.lowPower++;
      } else {
        stats.normalPower++;
      }

      // Track AP models - check multiple possible field names
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
    console.log('[Dashboard] AP Stats:', stats);
    console.log(
      `[Dashboard] AP Uptime: ${stats.online}/${stats.total} = ${stats.total > 0 ? ((stats.online / stats.total) * 100).toFixed(1) : 0}%`
    );
  };

  const storeThroughputSnapshot = async (
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
          // Count clients per network
          const clientsInNetwork = stationsData.filter((s) => {
            const serviceName =
              s.ssid ||
              s.serviceName ||
              (s.serviceId && servicesData.find((svc) => svc.id === s.serviceId)?.ssid);
            return serviceName === network;
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
      console.log('[Dashboard] ✓ Stored throughput snapshot:', {
        timestamp: new Date(snapshot.timestamp).toISOString(),
        totalTraffic: formatBytes(snapshot.totalTraffic),
        upload: formatBytes(snapshot.totalUpload),
        download: formatBytes(snapshot.totalDownload),
        clients: snapshot.clientCount,
        networks: snapshot.networkBreakdown.length,
      });
    } catch (error) {
      console.error('[Dashboard] Failed to store throughput snapshot:', error);
      // Don't throw - we don't want to break the dashboard if storage fails
    }
  };

  const loadHistoricalThroughput = async () => {
    try {
      console.log('[Dashboard] Loading historical throughput data...');

      // Load last 60 minutes of data for the chart
      const snapshots = await throughputService.getSnapshotsForLastMinutes(60);

      if (snapshots.length > 0) {
        // Convert bytes to bits per second (if needed) and format for chart
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
        console.log('[Dashboard] ✓ Loaded historical throughput data:', {
          snapshots: trend.length,
          timeRange:
            trend.length > 0 ? `${trend[0].time} - ${trend[trend.length - 1].time}` : 'N/A',
          avgTotal:
            trend.length > 0
              ? formatBytes(trend.reduce((sum, t) => sum + t.total, 0) / trend.length)
              : '0 B',
        });
      } else {
        console.log(
          '[Dashboard] ⚠ No historical throughput data available yet. Data will accumulate over time.'
        );
        // Set empty array if no data yet - chart will show "No data available"
        setThroughputTrend([]);
      }
    } catch (error) {
      console.error('[Dashboard] ✗ Failed to load historical throughput:', error);
      // Set empty array on error
      setThroughputTrend([]);
    }
  };

  const performVendorLookups = async (
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
    // Perform vendor lookups in the background
    if (clients.length === 0) return;

    try {
      setVendorLookupsInProgress(true);
      console.log('[Dashboard] Starting vendor lookups for', clients.length, 'clients');

      const enrichedClients = await Promise.all(
        clients.map(async (client) => {
          const vendor = await getVendor(client.mac);
          const vendorIcon = getVendorIcon(vendor);

          return {
            ...client,
            vendor,
            vendorIcon,
          };
        })
      );

      setTopClients(enrichedClients);
      console.log('[Dashboard] ✓ Vendor lookups complete');
    } catch (error) {
      console.error('[Dashboard] Failed to lookup vendors:', error);
      // Keep the clients without vendor info if lookup fails
    } finally {
      setVendorLookupsInProgress(false);
    }
  };

  const processStations = (stations: Station[], servicesData: Service[] = []) => {
    setStations(stations);

    // Create a lookup map from servicesData for quick service name resolution
    const serviceIdToNameMapLocal = new Map<string, string>();
    servicesData.forEach((service) => {
      if (service.id) {
        // Prefer SSID over name, then serviceName, then name, as SSID is most recognizable
        const displayName = service.ssid || service.serviceName || service.name || service.id;
        serviceIdToNameMapLocal.set(service.id, displayName);
      }
    });

    // Store in state for use in other functions
    setServiceIdToNameMap(serviceIdToNameMapLocal);

    // Calculate statistics
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

    stations.forEach((station) => {
      // Count authenticated/successful clients
      // If a client is in the connected stations list, they've successfully connected
      // Default to true unless explicitly set to false
      const isAuthenticated =
        station.authenticated === undefined ||
        station.authenticated === true ||
        station.authenticated === 1 ||
        station.authenticated === null;
      if (isAuthenticated) {
        authenticated++;
      }

      // Sum throughput - try multiple rate field names, then estimate from cumulative bytes
      let tx = 0;
      let rx = 0;

      // Try to get upload rate with smart unit detection
      // API may return bps or Mbps depending on controller version
      // Real data analysis: Extreme Platform ONE returns bps (values like 149610, 28375512)
      // Threshold: > 1000 = bps, ≤ 1000 = Mbps
      if (
        station.transmittedRate !== undefined &&
        station.transmittedRate !== null &&
        station.transmittedRate > 0
      ) {
        // If value > 1000, assume it's already in bps (e.g., 612612 bps)
        // If value ≤ 1000, assume it's in Mbps and convert (e.g., 28.4 Mbps)
        tx =
          station.transmittedRate > 1000
            ? station.transmittedRate
            : station.transmittedRate * 1000000;
      } else if (station.txRate !== undefined && station.txRate !== null && station.txRate > 0) {
        tx = station.txRate > 1000 ? station.txRate : station.txRate * 1000000;
      } else {
        // Estimate from cumulative bytes
        const uploadBytes = station.outBytes || station.txBytes || 0;
        if (uploadBytes > 0) {
          // Use uptime if available, otherwise estimate based on typical 1-hour session
          const sessionSeconds = station.uptime && station.uptime > 0 ? station.uptime : 3600;
          tx = (uploadBytes * 8) / sessionSeconds;
        }
      }

      // Try to get download rate with smart unit detection
      if (
        station.receivedRate !== undefined &&
        station.receivedRate !== null &&
        station.receivedRate > 0
      ) {
        // If value > 1000, assume it's already in bps (e.g., 4521356 bps)
        // If value ≤ 1000, assume it's in Mbps and convert (e.g., 5.2 Mbps)
        rx = station.receivedRate > 1000 ? station.receivedRate : station.receivedRate * 1000000;
      } else if (station.rxRate !== undefined && station.rxRate !== null && station.rxRate > 0) {
        rx = station.rxRate > 1000 ? station.rxRate : station.rxRate * 1000000;
      } else {
        // Estimate from cumulative bytes
        const downloadBytes = station.inBytes || station.rxBytes || 0;
        if (downloadBytes > 0) {
          // Use uptime if available, otherwise estimate based on typical 1-hour session
          const sessionSeconds = station.uptime && station.uptime > 0 ? station.uptime : 3600;
          rx = (downloadBytes * 8) / sessionSeconds;
        }
      }

      totalUpload += tx;
      totalDownload += rx;

      // Track by service - try multiple fields to identify the service/network
      // Priority: 1) SSID, 2) essid, 3) serviceName, 4) network/networkName/profileName, 5) lookup serviceId, 6) 'Unknown'
      let serviceName =
        station.ssid ||
        station.essid ||
        station.serviceName ||
        station.network ||
        station.networkName ||
        station.profileName;

      if (!serviceName && station.serviceId) {
        // Try to resolve serviceId to a friendly name using the services lookup
        serviceName = serviceIdToNameMapLocal.get(station.serviceId) || undefined;
      }

      // If still no name and we have a UUID-like serviceId, show 'Unknown Service' instead
      if (!serviceName && station.serviceId) {
        serviceName = station.serviceId.length > 20 ? 'Unknown Service' : station.serviceId;
      }

      serviceName = serviceName || 'Unknown';

      serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + 1);

      // Track throughput by service/network
      const existing = serviceThroughputMap.get(serviceName) || { upload: 0, download: 0 };
      serviceThroughputMap.set(serviceName, {
        upload: existing.upload + tx,
        download: existing.download + rx,
      });

      // Determine band based on tx/rx rate or channel info
      let band = 'Unknown';
      if (station.txRate || station.rxRate) {
        const rate = Math.max(station.txRate || 0, station.rxRate || 0);
        // Rough heuristic: 5GHz typically has higher max rates
        band = rate > 200 ? '5 GHz' : '2.4 GHz';
      }

      // Track individual client throughput with comprehensive details
      clientThroughput.push({
        name: station.hostName || station.macAddress,
        mac: station.macAddress,
        throughput: tx + rx,
        upload: tx,
        download: rx,
        network: serviceName,
        ap: station.apName || station.apSerialNumber || 'Unknown',
        rssi: station.rssi || 0,
        band: band,
        ipAddress: station.ipAddress || 'N/A',
      });
    });

    setClientStats((prev) => ({
      ...prev,
      total: stations.length,
      authenticated,
      throughputUpload: totalUpload,
      throughputDownload: totalDownload,
    }));

    // Set top clients (top 10 by throughput)
    const sorted = clientThroughput.sort((a, b) => b.throughput - a.throughput).slice(0, 10);
    setTopClients(sorted);

    // Perform vendor lookups asynchronously for top clients
    performVendorLookups(sorted);

    // Set client distribution by service
    const distribution = Array.from(serviceMap.entries())
      .map(([service, count]) => ({
        service,
        count,
        percentage: Math.round((count / stations.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);
    setClientDistribution(distribution);

    // Set network throughput distribution
    const networkThroughputData = Array.from(serviceThroughputMap.entries())
      .map(([network, throughput]) => ({
        network,
        upload: throughput.upload,
        download: throughput.download,
        total: throughput.upload + throughput.download,
      }))
      .sort((a, b) => b.total - a.total);
    setNetworkThroughput(networkThroughputData);

    // Store throughput snapshot in database
    storeThroughputSnapshot(
      totalUpload,
      totalDownload,
      stations.length,
      serviceThroughputMap,
      stations,
      servicesData
    );

    // Calculate RF metrics for Device Health Overview
    const bandCounts: Record<string, number> = { '2.4 GHz': 0, '5 GHz': 0, '6 GHz': 0 };
    const snrCounts: Record<string, number> = { Excellent: 0, Good: 0, Fair: 0, Poor: 0 };
    let totalSnr = 0;
    let totalRssi = 0;
    let snrCount = 0;
    let rssiCount = 0;

    stations.forEach((station) => {
      // Band distribution - detect from channel first, then fallback to rate heuristic
      const channel = (station as any).channel || '';
      const channelNum = parseInt(channel.toString().split('/')[0], 10);
      const stationBand = (station as any).band || (station as any).frequencyBand;
      // Use transmittedRate/receivedRate (API field names) with fallback to txRate/rxRate
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
        // Detect band from channel number
        // 2.4 GHz: channels 1-14
        // 5 GHz: channels 36-177 (UNII-1 through UNII-4)
        // 6 GHz: channels 1-233 but in 6GHz band (typically indicated by protocol or high rates)
        if (channelNum >= 1 && channelNum <= 14) {
          bandCounts['2.4 GHz']++;
        } else if (channelNum >= 36 && channelNum <= 177) {
          bandCounts['5 GHz']++;
        } else if (channelNum > 177) {
          bandCounts['6 GHz']++;
        }
      } else if (rate > 0) {
        // Heuristic based on max rate (rates are in bps from API)
        const rateMbps = rate / 1000000;
        if (rateMbps > 1200) {
          bandCounts['6 GHz']++;
        } else if (rateMbps > 150) {
          bandCounts['5 GHz']++;
        } else {
          bandCounts['2.4 GHz']++;
        }
      }

      // SNR calculation - estimate from RSSI using typical noise floor (-95 dBm)
      // SNR = RSSI - Noise Floor
      const rssi = station.rssi || (station as any).rss || 0;
      if (rssi < 0) {
        // Valid RSSI is negative
        totalRssi += rssi;
        rssiCount++;

        // Estimate SNR using typical noise floor of -95 dBm
        const noiseFloor = -95;
        const estimatedSnr = rssi - noiseFloor;
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

    // Set band distribution
    const bandData = [
      { band: '2.4 GHz', count: bandCounts['2.4 GHz'], color: '#f59e0b' },
      { band: '5 GHz', count: bandCounts['5 GHz'], color: '#3b82f6' },
      { band: '6 GHz', count: bandCounts['6 GHz'], color: '#8b5cf6' },
    ].filter((b) => b.count > 0);
    setBandDistribution(bandData);

    // Set SNR distribution
    const snrData = [
      { category: 'Excellent', count: snrCounts['Excellent'], color: '#10b981' },
      { category: 'Good', count: snrCounts['Good'], color: '#22d3ee' },
      { category: 'Fair', count: snrCounts['Fair'], color: '#f59e0b' },
      { category: 'Poor', count: snrCounts['Poor'], color: '#ef4444' },
    ].filter((s) => s.count > 0);
    setSnrDistribution(snrData);

    // Set averages
    setAvgSnr(snrCount > 0 ? Math.round(totalSnr / snrCount) : 0);
    setAvgRssi(rssiCount > 0 ? Math.round(totalRssi / rssiCount) : 0);

    console.log('[Dashboard] Client Stats:', {
      total: stations.length,
      authenticated,
      totalUploadBps: totalUpload,
      totalDownloadBps: totalDownload,
      distribution: distribution,
    });

    // Log RF metrics for debugging
    console.log('[Dashboard] RF Metrics:', {
      bandDistribution: bandData,
      snrDistribution: snrData,
      avgSnr: snrCount > 0 ? Math.round(totalSnr / snrCount) : 0,
      avgRssi: rssiCount > 0 ? Math.round(totalRssi / rssiCount) : 0,
      clientsWithRssi: rssiCount,
      clientsWithSnr: snrCount,
    });

    // Log sample station data to debug
    if (stations.length > 0) {
      console.log('[Dashboard] Sample station data:', {
        serviceName: stations[0].serviceName,
        ssid: stations[0].ssid,
        serviceId: stations[0].serviceId,
        txRate: stations[0].txRate,
        rxRate: stations[0].rxRate,
        transmittedRate: stations[0].transmittedRate,
        receivedRate: stations[0].receivedRate,
        txBytes: stations[0].txBytes,
        rxBytes: stations[0].rxBytes,
        outBytes: stations[0].outBytes,
        inBytes: stations[0].inBytes,
        uptime: stations[0].uptime,
        allFields: Object.keys(stations[0]),
      });
    }

    // Load real throughput trend data from database
    loadHistoricalThroughput();
  };

  // DEPRECATED: No longer used - we now load real throughput data from database
  // const generateThroughputTrend = (totalUpload: number, totalDownload: number) => {
  //   // This function has been replaced by loadHistoricalThroughput()
  //   // which loads actual time-series data from the database
  // };

  const processServices = async (services: Service[]) => {
    setServices(services);

    // Fetch detailed reports for each service IN PARALLEL (not sequentially)
    const reports = new Map<string, ServiceReport>();
    const poor: Service[] = [];
    const servicesToFetch = services.slice(0, 10); // Limit to first 10 to avoid too many requests

    // Create parallel fetch promises for all services
    const servicePromises = servicesToFetch.map(async (service) => {
      try {
        // Fetch report and stations in parallel for this service
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

          // Check if service has poor metrics. If both reliability and uptime are
          // unreported, do NOT silently mark the service as healthy — leave it out
          // of the poor list (we don't know) and let the dashboard surface the
          // gap separately if needed.
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

          // Update service with client count
          service.clientCount = stationList.length;
        }
      } catch (error) {
        console.log(`[Dashboard] Could not fetch report for service ${service.id}:`, error);
      }
    });

    // Wait for all service fetches to complete in parallel
    await Promise.allSettled(servicePromises);

    setServiceReports(reports);
    setPoorServices(poor);

    console.log(
      '[Dashboard] Processed',
      services.length,
      'services,',
      poor.length,
      'with poor metrics'
    );
  };

  const processNotifications = (notifications: Notification[]) => {
    // Filter to recent notifications (last 24 hours)
    const oneDayAgo = Date.now() - 86400000;
    const recent = notifications.filter((n) => (n.timestamp || 0) >= oneDayAgo);

    setNotifications(recent);

    // Count by severity
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

    console.log('[Dashboard] Alerts:', { critical, warning, info });
  };

  // Using formatBitsPerSecond and formatBytesUnit from src/lib/units.ts
  // These implement the cloud console spec for auto-scaling units
  const formatBytes = formatBytesUnit;
  const formatBps = formatBitsPerSecond;

  // Helper function to get service name for a station (must match logic in processStations)
  const getServiceNameForStation = (station: Station): string => {
    let serviceName =
      station.ssid ||
      station.essid ||
      station.serviceName ||
      station.network ||
      station.networkName ||
      station.profileName;

    if (!serviceName && station.serviceId) {
      serviceName = serviceIdToNameMap.get(station.serviceId) || undefined;
    }

    if (!serviceName && station.serviceId) {
      serviceName = station.serviceId.length > 20 ? 'Unknown Service' : station.serviceId;
    }

    return serviceName || 'Unknown';
  };

  // Handle clicking on a service to show its clients
  const handleServiceClick = (serviceName: string) => {
    setSelectedService(serviceName);
    setIsServiceClientsDialogOpen(true);
  };

  // Get clients for the selected service
  const getClientsForService = () => {
    if (!selectedService) return [];
    return stations.filter((station) => {
      const stationService = getServiceNameForStation(station);
      return stationService === selectedService;
    });
  };

  const COLORS = ['#BB86FC', '#03DAC5', '#CF6679', '#3700B3', '#018786', '#B00020'];

  // Calculate performance metrics for radar chart
  const calculatePerformanceMetrics = () => {
    if (stations.length === 0) return null;

    const stationsWithRssi = stations.filter((s) => Number.isFinite(s.rssi) && s.rssi !== 0);
    const avgRssi =
      stationsWithRssi.length > 0
        ? stationsWithRssi.reduce((sum, s) => sum + (s.rssi as number), 0) / stationsWithRssi.length
        : NaN;
    const stationsWithSnr = stations.filter((s) => Number.isFinite(s.snr) && (s.snr as number) > 0);
    const avgSnr =
      stationsWithSnr.length > 0
        ? stationsWithSnr.reduce((sum, s) => sum + (s.snr as number), 0) / stationsWithSnr.length
        : NaN;
    const authenticatedRate = (clientStats.authenticated / Math.max(clientStats.total, 1)) * 100;
    const apUptime = apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 100;
    const channelUtil = apStats.avgChannelUtil;
    const rfqi = clientStats.avgRfqi;
    const totalThroughputMbps =
      (clientStats.throughputUpload + clientStats.throughputDownload) / 1_000_000;

    return {
      avgRssi,
      avgSnr,
      authenticatedRate,
      apUptime,
      channelUtil,
      rfqi,
      totalThroughputMbps,
    };
  };

  const performanceMetrics = calculatePerformanceMetrics();

  // Prepare radar chart data for multi-dimensional performance view
  // All 5 axes are backed by real API data.
  const radarData = performanceMetrics
    ? [
        {
          metric: 'Reliability',
          value: Math.round(performanceMetrics.authenticatedRate) || 0,
          fullMark: 100,
        },
        {
          metric: 'AP Uptime',
          value: Math.round(performanceMetrics.apUptime) || 0,
          fullMark: 100,
        },
        {
          metric: 'Signal (SNR)',
          value: Math.min(100, Math.round((performanceMetrics.avgSnr / 50) * 100)) || 0,
          fullMark: 100,
        },
        {
          metric: 'Signal (RSSI)',
          // -100 dBm → 0, -50 dBm → 62, -30 dBm → 87, 0 dBm → 100
          value: Math.max(0, Math.min(100, Math.round((performanceMetrics.avgRssi + 100) * 1.25))),
          fullMark: 100,
        },
        {
          metric: 'RF Quality',
          value: Math.round(performanceMetrics.rfqi) || 0,
          fullMark: 100,
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        {/* Metric cards skeleton — matches the 4-col grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Chart area skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardHero
        activePersona={activePersona}
        personaConfig={personaConfig}
        lastUpdate={lastUpdate}
        refreshing={refreshing}
        onRefresh={() => loadDashboardData(true)}
      />

      {/* Filter Bar with Context Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnifiedFilterBar
          searchPlaceholder="Search widgets, metrics..."
          searchValue={dashboardSearch}
          onSearchChange={setDashboardSearch}
          defaultContextTab="site"
          showEnvironment={true}
          showTimeRange={true}
        />

        {/* Timeline Cursor Controls - visible when exploring data */}
        <TimelineCursorControls />
      </div>

      {/* ========================================
          CONTEXTUAL CONTENT BASED ON SELECTION
          ======================================== */}

      {/* AI INSIGHTS VIEW - Bird's Eye Network Overview */}
      {selectorTab === 'ai-insights' && (
        <AIInsightsBranch
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          poorServices={poorServices}
          lastUpdate={lastUpdate}
          siteScope={filters.site}
          rfqiData={rfqiData}
          avgRssi={avgRssi}
          avgSnr={avgSnr}
          bandDistribution={bandDistribution}
          snrDistribution={snrDistribution}
          aiInsightsDetailPanel={aiInsightsDetailPanel}
          aiActiveHealthTab={aiActiveHealthTab}
          setAiActiveHealthTab={setAiActiveHealthTab}
          selectedNetworkEvent={selectedNetworkEvent}
          setSelectedNetworkEvent={setSelectedNetworkEvent}
          onCloseDetailPanel={() => setAiInsightsDetailPanel(false)}
          setSelectorTab={setSelectorTab}
        />
      )}

      {/* ACCESS POINT DETAIL VIEW */}
      {selectorTab === 'access-point' && selectedEntityId && (
        <EntityDetailView
          kind="access-point"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {selectorTab === 'client' && selectedEntityId && (
        <EntityDetailView
          kind="client"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {selectorTab === 'switch' && selectedEntityId && (
        <EntityDetailView
          kind="switch"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {(selectorTab === 'site' ||
        (selectorTab === 'access-point' && !selectedEntityId) ||
        (selectorTab === 'client' && !selectedEntityId) ||
        (selectorTab === 'switch' && !selectedEntityId)) && (
        <NetworkDashboardView
          showSection={showSection}
          selectorTab={selectorTab}
          selectedEntityId={selectedEntityId}
          selectedEntityName={selectedEntityName}
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          throughputTrend={throughputTrend}
          performanceMetrics={performanceMetrics}
          radarData={radarData}
          clientDistribution={clientDistribution}
          colors={COLORS}
          onServiceClick={handleServiceClick}
          topClients={topClients}
          stations={stations}
          isTopClientsCollapsed={isTopClientsCollapsed}
          onToggleTopClientsCollapsed={() => setIsTopClientsCollapsed(!isTopClientsCollapsed)}
          vendorLookupsInProgress={vendorLookupsInProgress}
          setSelectedClient={setSelectedClient}
          setIsClientDialogOpen={setIsClientDialogOpen}
          poorServices={poorServices}
          notifications={notifications}
          activeSiteId={getActiveSiteFilter() ?? null}
          venueDuration={
            filters.timeRange === '15m'
              ? '15M'
              : filters.timeRange === '1h'
                ? '1H'
                : filters.timeRange === '7d'
                  ? '7D'
                  : filters.timeRange === '30d'
                    ? '30D'
                    : '24H'
          }
        />
      )}

      <ClientDetailDialog
        isOpen={isClientDialogOpen}
        onClose={() => setIsClientDialogOpen(false)}
        selectedClient={selectedClient}
      />

      <ServiceClientsDialog
        isOpen={isServiceClientsDialogOpen}
        onClose={() => setIsServiceClientsDialogOpen(false)}
        selectedService={selectedService}
        clients={getClientsForService()}
        onSelectClient={(client) => {
          setSelectedClient(client);
          setIsServiceClientsDialogOpen(false);
          setIsClientDialogOpen(true);
        }}
      />
    </div>
  );
}

// Export memoized component to prevent unnecessary re-renders
export const DashboardEnhanced = memo(DashboardEnhancedComponent);
