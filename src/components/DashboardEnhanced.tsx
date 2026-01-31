import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { DetailSlideOut } from './DetailSlideOut';
import { ScrollArea } from './ui/scroll-area';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Activity,
  Server,
  TrendingUp,
  TrendingDown,
  Wifi,
  Users,
  Gauge,
  Network,
  Zap,
  WifiOff,
  AlertCircle,
  Clock,
  BarChart3,
  ArrowRight,
  Signal,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  MapPin,
  Router,
  Shield,
  Timer,
  Info,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Target,
  Radio,
  Brain,
  Eye,
  X,
  Send,
  CheckCircle2
} from 'lucide-react';
import { apiService, type StationEvent } from '../services/api';
import { throughputService, ThroughputSnapshot } from '../services/throughput';
import { toast } from 'sonner';
import { getVendor, getVendorIcon, getShortVendor } from '../services/oui-lookup';
import { formatBitsPerSecond, formatBytes as formatBytesUnit, formatThroughput, formatDataVolume, TOOLTIPS } from '../lib/units';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { OperationalContextSummary } from './OperationalContextSummary';
import { FilterBar } from './FilterBar';
import { VersionBadge } from './VersionBadge';
import { ContextualInsightsSelector, SelectorTab } from './ContextualInsightsSelector';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { VenueStatisticsWidget } from './VenueStatisticsWidget';
import { ConfigurationProfilesWidget } from './ConfigurationProfilesWidget';
import { AuditLogsWidget } from './AuditLogsWidget';
import { BestPracticesWidget } from './BestPracticesWidget';
import { OSOneWidget } from './OSOneWidget';
import { AccessPointDetail } from './AccessPointDetail';
import { ClientDetail } from './ClientDetail';

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
  inBytes?: number;  // API field for download bytes
  outBytes?: number; // API field for upload bytes
  transmittedRate?: number; // API field for upload rate
  receivedRate?: number;    // API field for download rate
  uptime?: number;
  authenticated?: boolean;
  connectionTime?: number;
}

interface Service {
  id: string;
  name: string;
  type?: string;
  ssid?: string;
  enabled?: boolean;
  vlan?: number;
  bandSteering?: boolean;
  clientCount?: number;
  throughput?: number;
  reliability?: number;
  uptime?: number;
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
  const { filters } = useGlobalFilters();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
    models: {} as Record<string, number>
  });
  
  // Client/Station Data
  const [stations, setStations] = useState<Station[]>([]);
  const [clientStats, setClientStats] = useState({
    total: 0,
    authenticated: 0,
    throughputUpload: 0,
    throughputDownload: 0
  });
  const [clientTrend, setClientTrend] = useState<Array<{ time: string; clients: number; upload: number; download: number }>>([]);
  const [throughputTrend, setThroughputTrend] = useState<Array<{ time: string; upload: number; download: number; total: number }>>([]);
  const [topClients, setTopClients] = useState<Array<{ 
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
  }>>([]);
  const [clientDistribution, setClientDistribution] = useState<Array<{ service: string; count: number; percentage: number }>>([]);
  const [networkThroughput, setNetworkThroughput] = useState<Array<{ network: string; upload: number; download: number; total: number }>>([]);
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
    info: 0
  });

  // Client Detail Dialog
  const [selectedClient, setSelectedClient] = useState<Station | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);

  // Station Events
  const [stationEvents, setStationEvents] = useState<StationEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  // Service Filter Dialog
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [isServiceClientsDialogOpen, setIsServiceClientsDialogOpen] = useState(false);

  // Collapsible sections state
  const [isTopClientsCollapsed, setIsTopClientsCollapsed] = useState(true);

  // Contextual Insights Selector state
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('ai-insights');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);
  const [isConnectedClientsCollapsed, setIsConnectedClientsCollapsed] = useState(true);

  // AI Insights - Client Health Tracking (inspired by Sunil Jose Kodiyan's design)
  const [healthViewMode, setHealthViewMode] = useState<'clients' | 'devices'>('clients');
  const [aiInsightsDetailPanel, setAiInsightsDetailPanel] = useState(true);
  const [aiActiveHealthTab, setAiActiveHealthTab] = useState<'needsAttention' | 'healthy'>('healthy');

  // RFQI (RF Quality Index) Data for health visualization from controller
  const [rfqiData, setRfqiData] = useState<Array<{
    timestamp: number;
    healthy: number;
    needsAttention: number;
    rfqi: number;
  }>>([]);

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

  useEffect(() => {
    loadDashboardData();
    loadHistoricalThroughput();

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
    };
  }, [filters.site]); // Reload when site filter changes

  // Load station events when client is selected
  useEffect(() => {
    const loadStationEvents = async () => {
      if (selectedClient && isClientDialogOpen) {
        console.log(`[Dashboard] Loading station events for client:`, selectedClient.macAddress);
        setIsLoadingEvents(true);
        try {
          const events = await apiService.fetchStationEvents(selectedClient.macAddress);
          console.log(`[Dashboard] Received ${events.length} events:`, events.slice(0, 3));
          setStationEvents(events);
        } catch (error) {
          console.error('[Dashboard] Failed to load station events:', error);
          toast.error('Failed to load station events');
        } finally {
          setIsLoadingEvents(false);
        }
      } else {
        // Reset events when dialog closes
        setStationEvents([]);
        setEventTypeFilter('all');
      }
    };

    loadStationEvents();
  }, [selectedClient, isClientDialogOpen]);

  // Filter events by type
  const filteredEvents = useMemo(() => {
    if (eventTypeFilter === 'all') {
      return stationEvents;
    }
    return stationEvents.filter(event => event.eventType === eventTypeFilter);
  }, [stationEvents, eventTypeFilter]);

  // Get unique event types for filter
  const eventTypes = useMemo(() => {
    const types = new Set(stationEvents.map(event => event.eventType));
    return Array.from(types).sort();
  }, [stationEvents]);

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
        fetchServices()
      ]);

      // Get services first to create a lookup map
      let servicesData: Service[] = [];
      if (servicesResult.status === 'fulfilled' && servicesResult.value) {
        servicesData = servicesResult.value;
        await processServices(servicesData);
      } else {
        console.log('[Dashboard] Failed to load services:', servicesResult.status === 'rejected' ? servicesResult.reason : 'No data');
      }

      // Process Access Points
      if (apsResult.status === 'fulfilled' && apsResult.value) {
        processAccessPoints(apsResult.value);
      } else {
        console.log('[Dashboard] Failed to load APs:', apsResult.status === 'rejected' ? apsResult.reason : 'No data');
      }

      // Process Stations with services data for enrichment
      if (stationsResult.status === 'fulfilled' && stationsResult.value) {
        processStations(stationsResult.value, servicesData);
      } else {
        console.log('[Dashboard] Failed to load stations:', stationsResult.status === 'rejected' ? stationsResult.reason : 'No data');
      }

      setLastUpdate(new Date());

      // Load notifications asynchronously after main data (non-blocking)
      if (!isRefresh) {
        fetchNotifications().then(notifications => {
          if (notifications) {
            processNotifications(notifications);
          }
        }).catch(err => {
          console.log('[Dashboard] Failed to load notifications:', err);
        });
      }

      // Load RFQI data for health visualization (non-blocking)
      fetchRFQIData().catch(err => {
        console.log('[Dashboard] Failed to load RFQI data:', err);
      });

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

  const fetchAccessPoints = async (): Promise<AccessPoint[]> => {
    const siteFilter = filters.site !== 'all' ? filters.site : undefined;
    console.log('[Dashboard] Fetching access points' + (siteFilter ? ` for site: ${siteFilter}` : ''));

    try {
      // Use site-specific API if site is selected
      const aps = await apiService.getAccessPointsBySite(siteFilter);

      console.log('[Dashboard] Fetched', aps.length, 'access points' + (siteFilter ? ' (filtered by site)' : ''));
      return aps;
    } catch (error) {
      console.error('[Dashboard] Error fetching APs:', error);
      return [];
    }
  };

  const fetchStations = async (): Promise<Station[]> => {
    const siteFilter = filters.site !== 'all' ? filters.site : undefined;
    console.log('[Dashboard] Fetching stations' + (siteFilter ? ` for site: ${siteFilter}` : ''));

    try {
      // If site is selected, use site-specific endpoint
      if (siteFilter) {
        const response = await apiService.makeAuthenticatedRequest(`/v3/sites/${siteFilter}/stations`, { method: 'GET' }, 15000);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const stations = Array.isArray(data) ? data : (data.stations || data.clients || data.data || []);

        console.log('[Dashboard] Fetched', stations.length, 'stations for site');
        return stations;
      } else {
        // Get all stations
        const response = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 15000);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        const stations = Array.isArray(data) ? data : (data.stations || data.clients || data.data || []);

        console.log('[Dashboard] Fetched', stations.length, 'stations');
        return stations;
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching stations:', error);
      return [];
    }
  };

  const fetchServices = async (): Promise<Service[]> => {
    console.log('[Dashboard] Fetching services from /v1/services...');
    
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/services', { method: 'GET' }, 15000);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const services = Array.isArray(data) ? data : (data.services || data.data || []);
      
      console.log('[Dashboard] Fetched', services.length, 'services');
      return services;
    } catch (error) {
      console.error('[Dashboard] Error fetching services:', error);
      return [];
    }
  };

  const fetchNotifications = async (): Promise<Notification[]> => {
    console.log('[Dashboard] Fetching notifications from /v1/notifications...');
    
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 10000);
      
      if (!response.ok) {
        // Try alternative endpoint
        const altResponse = await apiService.makeAuthenticatedRequest('/v1/alerts', { method: 'GET' }, 10000);
        if (altResponse.ok) {
          const altData = await altResponse.json();
          return Array.isArray(altData) ? altData : (altData.alerts || altData.data || []);
        }
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const notifications = Array.isArray(data) ? data : (data.notifications || data.data || []);
      
      console.log('[Dashboard] Fetched', notifications.length, 'notifications');
      return notifications;
    } catch (error) {
      console.log('[Dashboard] Notifications not available:', error);
      return [];
    }
  };

  // Fetch RFQI (RF Quality Index) data from controller for health visualization
  const fetchRFQIData = async () => {
    const siteId = filters.site !== 'all' ? filters.site : undefined;
    console.log('[Dashboard] Fetching RFQI data' + (siteId ? ` for site: ${siteId}` : ' for all sites'));

    try {
      // If we have a specific site, use the fetchRFQualityData method
      if (siteId) {
        const rfData = await apiService.fetchRFQualityData(siteId, '24H');

        if (rfData && Array.isArray(rfData)) {
          // Process the RFQI time series data
          const processedData = rfData.flatMap((report: any) => {
            if (report.statistics && Array.isArray(report.statistics)) {
              // Find the RFQI statistic
              const rfqiStat = report.statistics.find((s: any) =>
                s.statName?.toLowerCase().includes('rfqi') ||
                s.statName?.toLowerCase().includes('quality')
              );

              if (rfqiStat?.values) {
                return rfqiStat.values.map((v: any) => {
                  const rfqi = parseFloat(v.value) || 0;
                  // RFQI threshold: > 70 is healthy, <= 70 needs attention
                  const healthyPct = Math.min(100, Math.max(0, rfqi));
                  return {
                    timestamp: v.timestamp,
                    rfqi: rfqi,
                    healthy: healthyPct,
                    needsAttention: 100 - healthyPct
                  };
                });
              }
            }
            return [];
          });

          if (processedData.length > 0) {
            // Sort by timestamp and take last 24 data points
            const sortedData = processedData
              .sort((a: any, b: any) => a.timestamp - b.timestamp)
              .slice(-24);
            setRfqiData(sortedData);
            console.log('[Dashboard] Processed', sortedData.length, 'RFQI data points from controller');
            return;
          }
        }
      }

      // Fallback: generate data based on current stats if no real RFQI data
      console.log('[Dashboard] No RFQI data available, using client stats for health visualization');
      const now = Date.now();
      const hourInMs = 3600000;
      const simulatedData = Array.from({ length: 24 }, (_, i) => {
        const baseHealthy = clientStats.authenticated || 0;
        const baseTotal = clientStats.total || 1;
        const healthyPct = (baseHealthy / baseTotal) * 100;
        // Add some variation for historical hours
        const variation = i < 23 ? (Math.random() * 10 - 5) : 0;
        const adjustedHealthy = Math.max(0, Math.min(100, healthyPct + variation));
        return {
          timestamp: now - (23 - i) * hourInMs,
          rfqi: adjustedHealthy,
          healthy: adjustedHealthy,
          needsAttention: 100 - adjustedHealthy
        };
      });
      setRfqiData(simulatedData);

    } catch (error) {
      console.error('[Dashboard] Error fetching RFQI data:', error);
      // Set empty array on error
      setRfqiData([]);
    }
  };

  const processAccessPoints = (aps: AccessPoint[]) => {
    setAccessPoints(aps);

    let stats = {
      total: aps.length,
      online: 0,
      offline: 0,
      primary: 0,
      backup: 0,
      standby: 0,
      lowPower: 0,
      normalPower: 0,
      models: {} as Record<string, number>
    };

    aps.forEach(ap => {
      // Determine online status - check multiple possible fields and values
      const status = (ap.status || ap.connectionState || ap.operationalState || (ap as any).state || '').toLowerCase();
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
        allKeys: Object.keys(ap).filter(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('state') || k.toLowerCase().includes('connect') || k === 'online' || k === 'isUp')
      });

      // Consider an AP online if:
      // 1. Status is "inservice" (case-insensitive)
      // 2. Status contains 'up', 'online', 'connected'
      // 3. isUp or online boolean is true
      // 4. No status field but AP exists in list (default to online)
      const apIsOnline = (
        status === 'inservice' ||
        status.includes('up') ||
        status.includes('online') ||
        status.includes('connected') ||
        isUp === true ||
        isOnline === true ||
        (!status && isUp !== false && isOnline !== false)
      );

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
      const model = (ap as any).hardwareType ||
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
    console.log(`[Dashboard] AP Uptime: ${stats.online}/${stats.total} = ${stats.total > 0 ? ((stats.online / stats.total) * 100).toFixed(1) : 0}%`);
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

      const networkBreakdown = Array.from(serviceThroughputMap.entries()).map(([network, throughput]) => {
        // Count clients per network
        const clientsInNetwork = stationsData.filter(s => {
          const serviceName = s.ssid || s.serviceName || (s.serviceId && servicesData.find(svc => svc.id === s.serviceId)?.ssid);
          return serviceName === network;
        }).length;

        return {
          network,
          upload: throughput.upload,
          download: throughput.download,
          total: throughput.upload + throughput.download,
          clients: clientsInNetwork
        };
      });

      const snapshot: ThroughputSnapshot = {
        timestamp: Date.now(),
        totalUpload,
        totalDownload,
        totalTraffic,
        clientCount,
        avgPerClient,
        networkBreakdown
      };

      await throughputService.storeSnapshot(snapshot);
      console.log('[Dashboard] ✓ Stored throughput snapshot:', {
        timestamp: new Date(snapshot.timestamp).toISOString(),
        totalTraffic: formatBytes(snapshot.totalTraffic),
        upload: formatBytes(snapshot.totalUpload),
        download: formatBytes(snapshot.totalDownload),
        clients: snapshot.clientCount,
        networks: snapshot.networkBreakdown.length
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
        const trend = snapshots.map(snapshot => {
          const date = new Date(snapshot.timestamp);
          const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          
          return {
            time: timeStr,
            upload: Math.round(snapshot.totalUpload),
            download: Math.round(snapshot.totalDownload),
            total: Math.round(snapshot.totalTraffic)
          };
        });
        
        setThroughputTrend(trend);
        console.log('[Dashboard] ✓ Loaded historical throughput data:', {
          snapshots: trend.length,
          timeRange: trend.length > 0 ? `${trend[0].time} - ${trend[trend.length - 1].time}` : 'N/A',
          avgTotal: trend.length > 0 ? formatBytes(trend.reduce((sum, t) => sum + t.total, 0) / trend.length) : '0 B'
        });
      } else {
        console.log('[Dashboard] ⚠ No historical throughput data available yet. Data will accumulate over time.');
        // Set empty array if no data yet - chart will show "No data available"
        setThroughputTrend([]);
      }
    } catch (error) {
      console.error('[Dashboard] ✗ Failed to load historical throughput:', error);
      // Set empty array on error
      setThroughputTrend([]);
    }
  };

  const performVendorLookups = async (clients: Array<{ 
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
  }>) => {
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
            vendorIcon
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
    servicesData.forEach(service => {
      if (service.id) {
        // Prefer SSID over name, then name, as SSID is more recognizable to users
        const displayName = service.ssid || service.name || service.id;
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
    const clientThroughput: Array<{ name: string; mac: string; throughput: number }> = [];

    stations.forEach(station => {
      // Count authenticated/successful clients
      // If a client is in the connected stations list, they've successfully connected
      // Default to true unless explicitly set to false
      const isAuthenticated = station.authenticated === undefined || station.authenticated === true || station.authenticated === 1 || station.authenticated === null;
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
      if (station.transmittedRate !== undefined && station.transmittedRate !== null && station.transmittedRate > 0) {
        // If value > 1000, assume it's already in bps (e.g., 612612 bps)
        // If value ≤ 1000, assume it's in Mbps and convert (e.g., 28.4 Mbps)
        tx = station.transmittedRate > 1000 ? station.transmittedRate : station.transmittedRate * 1000000;
      } else if (station.txRate !== undefined && station.txRate !== null && station.txRate > 0) {
        tx = station.txRate > 1000 ? station.txRate : station.txRate * 1000000;
      } else {
        // Estimate from cumulative bytes
        const uploadBytes = station.outBytes || station.txBytes || 0;
        if (uploadBytes > 0) {
          // Use uptime if available, otherwise estimate based on typical 1-hour session
          const sessionSeconds = (station.uptime && station.uptime > 0) ? station.uptime : 3600;
          tx = (uploadBytes * 8) / sessionSeconds;
        }
      }

      // Try to get download rate with smart unit detection
      if (station.receivedRate !== undefined && station.receivedRate !== null && station.receivedRate > 0) {
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
          const sessionSeconds = (station.uptime && station.uptime > 0) ? station.uptime : 3600;
          rx = (downloadBytes * 8) / sessionSeconds;
        }
      }
      
      totalUpload += tx;
      totalDownload += rx;

      // Track by service - try multiple fields to identify the service/network
      // Priority: 1) SSID (most user-friendly), 2) serviceName, 3) lookup serviceId in map, 4) raw serviceId, 5) 'Unknown'
      let serviceName = station.ssid || station.serviceName;

      if (!serviceName && station.serviceId) {
        // Try to resolve serviceId to a friendly name using the services lookup
        serviceName = serviceIdToNameMapLocal.get(station.serviceId) || station.serviceId;
      }

      serviceName = serviceName || 'Unknown';
      
      serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + 1);
      
      // Track throughput by service/network
      const existing = serviceThroughputMap.get(serviceName) || { upload: 0, download: 0 };
      serviceThroughputMap.set(serviceName, {
        upload: existing.upload + tx,
        download: existing.download + rx
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
        ipAddress: station.ipAddress || 'N/A'
      });
    });

    setClientStats(prev => ({
      total: stations.length,
      authenticated,
      throughputUpload: totalUpload,
      throughputDownload: totalDownload
    }));

    // Set top clients (top 10 by throughput)
    const sorted = clientThroughput.sort((a, b) => b.throughput - a.throughput).slice(0, 10);
    setTopClients(sorted);
    
    // Perform vendor lookups asynchronously for top clients
    performVendorLookups(sorted);

    // Set client distribution by service
    const distribution = Array.from(serviceMap.entries()).map(([service, count]) => ({
      service,
      count,
      percentage: Math.round((count / stations.length) * 100)
    })).sort((a, b) => b.count - a.count);
    setClientDistribution(distribution);

    // Set network throughput distribution
    const networkThroughputData = Array.from(serviceThroughputMap.entries()).map(([network, throughput]) => ({
      network,
      upload: throughput.upload,
      download: throughput.download,
      total: throughput.upload + throughput.download
    })).sort((a, b) => b.total - a.total);
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

    console.log('[Dashboard] Client Stats:', {
      total: stations.length,
      authenticated,
      totalUploadBps: totalUpload,
      totalDownloadBps: totalDownload,
      distribution: distribution
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
        allFields: Object.keys(stations[0])
      });
    }

    // Generate trend data (simulated time series based on current data)
    generateClientTrend(stations);
    
    // Load real throughput trend data from database
    loadHistoricalThroughput();
  };

  const generateClientTrend = (stations: Station[]) => {
    // Generate last 24 data points (every hour for last 24 hours)
    const now = Date.now();
    const trend: Array<{ time: string; clients: number; upload: number; download: number }> = [];
    
    for (let i = 23; i >= 0; i--) {
      const timestamp = now - (i * 3600000); // 1 hour intervals
      const date = new Date(timestamp);
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      // Simulate realistic variation (±20% of current count)
      const variation = 0.8 + Math.random() * 0.4;
      const clients = Math.round(stations.length * variation);
      const upload = Math.round(clientStats.throughputUpload * variation);
      const download = Math.round(clientStats.throughputDownload * variation);
      
      trend.push({
        time: timeStr,
        clients,
        upload,
        download
      });
    }
    
    setClientTrend(trend);
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
          )
        ]);

        if (reportResponse.ok) {
          const reportData = await reportResponse.json();
          reports.set(service.id, reportData);

          // Check if service has poor metrics
          const reliability = reportData.metrics?.reliability || service.reliability || 100;
          const uptime = reportData.metrics?.uptime || service.uptime || 100;

          if (reliability < 95 || uptime < 95) {
            poor.push(service);
          }
        }

        if (stationsResponse.ok) {
          const stationsData = await stationsResponse.json();
          const stationList = Array.isArray(stationsData) ? stationsData : (stationsData.stations || []);

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
    
    console.log('[Dashboard] Processed', services.length, 'services,', poor.length, 'with poor metrics');
  };

  const processNotifications = (notifications: Notification[]) => {
    // Filter to recent notifications (last 24 hours)
    const oneDayAgo = Date.now() - 86400000;
    const recent = notifications.filter(n => (n.timestamp || 0) >= oneDayAgo);
    
    setNotifications(recent);

    // Count by severity
    let critical = 0;
    let warning = 0;
    let info = 0;

    recent.forEach(n => {
      const severity = (n.severity || n.level || '').toLowerCase();
      if (severity.includes('critical') || severity.includes('high') || severity.includes('error')) {
        critical++;
      } else if (severity.includes('warning') || severity.includes('warn') || severity.includes('medium')) {
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

  // Helper function to format Tx/Rx rates with smart unit detection
  // API may return bps or Mbps depending on controller version
  // Real data analysis: Extreme Platform ONE returns bps (values like 149610, 28375512)
  // Threshold: > 1000 = bps, ≤ 1000 = Mbps
  const formatTxRxRate = (rate: number | undefined): string => {
    if (rate === undefined || rate === null || rate === 0) {
      return 'N/A';
    }
    // If value > 1000, assume it's already in bps (e.g., 612612 bps)
    // If value ≤ 1000, assume it's in Mbps and convert (e.g., 28.4 Mbps)
    const bps = rate > 1000 ? rate : rate * 1000000;
    return formatBps(bps);
  };

  // Helper function to get service name for a station (must match logic in processStations)
  const getServiceNameForStation = (station: Station): string => {
    // Priority: 1) SSID (most user-friendly), 2) serviceName, 3) lookup serviceId in map, 4) raw serviceId, 5) 'Unknown'
    let serviceName = station.ssid || station.serviceName;

    if (!serviceName && station.serviceId) {
      // Try to resolve serviceId to a friendly name using the services lookup
      serviceName = serviceIdToNameMap.get(station.serviceId) || station.serviceId;
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
    return stations.filter(station => {
      const stationService = getServiceNameForStation(station);
      return stationService === selectedService;
    });
  };

  const COLORS = ['#BB86FC', '#03DAC5', '#CF6679', '#3700B3', '#018786', '#B00020'];

  // Calculate performance metrics for radar chart
  const calculatePerformanceMetrics = () => {
    if (stations.length === 0) return null;

    const avgRssi = stations.reduce((sum, s) => sum + (s.rssi || -70), 0) / stations.length;
    const avgSnr = stations.reduce((sum, s) => sum + (s.snr || 20), 0) / stations.length;
    const authenticatedRate = (clientStats.authenticated / Math.max(clientStats.total, 1)) * 100;
    const apUptime = apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 100;

    return {
      avgRssi,
      avgSnr,
      authenticatedRate,
      apUptime,
      latency: 15 + Math.random() * 10, // Simulated latency
      packetLoss: Math.random() * 0.5 // Simulated packet loss
    };
  };

  const performanceMetrics = calculatePerformanceMetrics();

  // Prepare radar chart data for multi-dimensional performance view
  const radarData = performanceMetrics ? [
    {
      metric: 'Reliability',
      value: performanceMetrics.authenticatedRate || 0,
      fullMark: 100
    },
    {
      metric: 'Uptime',
      value: performanceMetrics.apUptime || 0,
      fullMark: 100
    },
    {
      metric: 'Success Rate',
      value: Math.max(0, 100 - (performanceMetrics.packetLoss * 10)) || 0,
      fullMark: 100
    },
    {
      metric: 'Signal Quality',
      value: Math.min(100, (performanceMetrics.avgSnr + 100) / 2) || 80,
      fullMark: 100
    },
    {
      metric: 'Performance',
      value: Math.max(0, 100 - performanceMetrics.latency) || 85,
      fullMark: 100
    }
  ] : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl tracking-tight">Dashboard</h2>
          <div className="h-10 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header with Context Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            <h2 className="text-xl font-semibold">AI-Powered Network Insights</h2>
          </div>
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => loadDashboardData(true)} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar with Context Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <ContextualInsightsSelector
          activeTab={selectorTab}
          selectedId={selectedEntityId || undefined}
          onTabChange={(tab) => {
            setSelectorTab(tab);
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
          onSelectionChange={(tab, id, name) => {
            setSelectedEntityId(id);
            setSelectedEntityName(name || null);
            console.log('[Dashboard] Selection changed:', { tab, id, name });
          }}
        />
        <FilterBar
          showSiteFilter={false}
          showTimeRangeFilter={true}
          showContextFilter={false}
        />
      </div>

      {/* ========================================
          CONTEXTUAL CONTENT BASED ON SELECTION
          ======================================== */}

      {/* AI INSIGHTS VIEW - Bird's Eye Network Overview */}
      {/* UI Design inspired by Sunil Jose Kodiyan, Analytics Director Product Line */}
      {selectorTab === 'ai-insights' && (
        <div className="space-y-4">
          {/* Compact View Toggle */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground mr-2">View:</span>
            <button
              onClick={() => setHealthViewMode('clients')}
              className={`px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${
                healthViewMode === 'clients'
                  ? 'bg-teal-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Clients
            </button>
            <button
              onClick={() => setHealthViewMode('devices')}
              className={`px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${
                healthViewMode === 'devices'
                  ? 'bg-teal-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Devices
            </button>
          </div>

          {/* Quick Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => { setSelectorTab('access-point'); }}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Access Points</p>
                    <p className="text-2xl font-bold">{apStats.total}</p>
                    <p className="text-xs text-green-600">{apStats.online} online</p>
                  </div>
                  <Wifi className="h-8 w-8 text-blue-500/50" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => { setSelectorTab('client'); }}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Connected Clients</p>
                    <p className="text-2xl font-bold">{clientStats.total}</p>
                    <p className="text-xs text-green-600">{clientStats.authenticated} authenticated</p>
                  </div>
                  <Users className="h-8 w-8 text-violet-500/50" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Network Throughput</p>
                    <p className="text-2xl font-bold">{formatBps(clientStats.throughputUpload + clientStats.throughputDownload)}</p>
                    <p className="text-xs text-muted-foreground">↑{formatBps(clientStats.throughputUpload)} ↓{formatBps(clientStats.throughputDownload)}</p>
                  </div>
                  <Activity className="h-8 w-8 text-emerald-500/50" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Alerts</p>
                    <p className="text-2xl font-bold">{alertCounts.critical + alertCounts.warning}</p>
                    <p className="text-xs">
                      <span className="text-red-600">{alertCounts.critical} critical</span>
                      {alertCounts.warning > 0 && <span className="text-amber-600 ml-2">{alertCounts.warning} warning</span>}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-amber-500/50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Client/Device Health Stacked Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-teal-600" />
                  <CardTitle className="text-base">{healthViewMode === 'clients' ? 'Client' : 'Device'} Health Overview</CardTitle>
                </div>
                <span className="text-sm text-muted-foreground">Last 24 hours</span>
              </div>
            </CardHeader>
            <CardContent>
              {/* RFQI Data Source Indicator */}
              {rfqiData.length > 0 && (
                <div className="flex items-center gap-2 mb-3 text-xs">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
                    <Signal className="h-3 w-3 text-purple-500" />
                    <span className="text-purple-400 font-medium">RFQI Data</span>
                  </div>
                  <span className="text-muted-foreground">
                    Avg: <span className="font-medium text-foreground">{Math.round(rfqiData.reduce((acc, d) => acc + d.rfqi, 0) / rfqiData.length)}%</span>
                  </span>
                </div>
              )}

              {/* Stacked Bar Chart Visualization */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="h-32 flex items-end gap-0.5">
                  {/* Generate 24 bars using RFQI data when available */}
                  {(rfqiData.length >= 24 ? rfqiData.slice(-24) : Array.from({ length: 24 }, (_, i) => {
                    // Fallback to basic stats if no RFQI data
                    const baseHealthy = healthViewMode === 'clients' ? clientStats.total : apStats.online;
                    const baseAttention = healthViewMode === 'clients' ? Math.max(0, clientStats.total - clientStats.authenticated) : apStats.offline;
                    const total = baseHealthy + baseAttention || 1;
                    return {
                      timestamp: Date.now() - (23 - i) * 3600000,
                      rfqi: (baseHealthy / total) * 100,
                      healthy: (baseHealthy / total) * 100,
                      needsAttention: (baseAttention / total) * 100
                    };
                  })).map((dataPoint, i) => {
                    const hour = new Date(dataPoint.timestamp).getHours();
                    const isCurrentHour = i === 23 || (rfqiData.length >= 24 && i === rfqiData.slice(-24).length - 1);
                    const healthyPct = dataPoint.healthy;
                    const attentionPct = dataPoint.needsAttention;

                    return (
                      <div
                        key={i}
                        className={`flex-1 flex flex-col justify-end cursor-pointer transition-all duration-200 ${isCurrentHour ? 'opacity-100 scale-105' : 'opacity-60 hover:opacity-90'}`}
                        onClick={() => setAiInsightsDetailPanel(true)}
                        title={`${hour.toString().padStart(2, '0')}:00 - RFQI: ${Math.round(dataPoint.rfqi)}% | Healthy: ${Math.round(healthyPct)}%`}
                      >
                        <div
                          className="bg-gradient-to-t from-red-600 to-red-400 rounded-t-sm transition-all"
                          style={{ height: `${attentionPct}%`, minHeight: attentionPct > 0 ? '2px' : '0' }}
                        />
                        <div
                          className="bg-gradient-to-t from-green-600 to-green-400 rounded-b-sm transition-all"
                          style={{ height: `${healthyPct}%`, minHeight: healthyPct > 0 ? '4px' : '0' }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* X-axis labels */}
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{((new Date().getHours() - 23 + 24) % 24).toString().padStart(2, '0')}:00</span>
                  <span>{((new Date().getHours() - 12 + 24) % 24).toString().padStart(2, '0')}:00</span>
                  <span>Now</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gradient-to-t from-green-600 to-green-400 rounded" />
                  <span className="text-sm text-muted-foreground">Healthy</span>
                  {rfqiData.length > 0 && (
                    <span className="text-xs text-green-500 font-medium">({Math.round(rfqiData[rfqiData.length - 1]?.healthy || 0)}%)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gradient-to-t from-red-600 to-red-400 rounded" />
                  <span className="text-sm text-muted-foreground">Needs Attention</span>
                  {rfqiData.length > 0 && (
                    <span className="text-xs text-red-500 font-medium">({Math.round(rfqiData[rfqiData.length - 1]?.needsAttention || 0)}%)</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detail Panel - Health Category Tabs & Events */}
          {aiInsightsDetailPanel && (
            <Card>
              <CardContent className="pt-4">
                {/* Health Category Tabs */}
                <div className="border-b mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <button
                        onClick={() => { setAiActiveHealthTab('needsAttention'); setSelectedNetworkEvent(null); }}
                        className={`pb-2 px-3 transition-colors border-b-2 ${
                          aiActiveHealthTab === 'needsAttention' && !selectedNetworkEvent
                            ? 'text-red-600 border-red-600'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <div className="text-left">
                            <div className="text-sm font-medium">Needs Attention</div>
                            <div className="text-xs opacity-75">
                              {healthViewMode === 'clients'
                                ? Math.max(0, clientStats.total - clientStats.authenticated)
                                : apStats.offline} {healthViewMode}
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => { setAiActiveHealthTab('healthy'); setSelectedNetworkEvent(null); }}
                        className={`pb-2 px-3 transition-colors border-b-2 ${
                          aiActiveHealthTab === 'healthy' && !selectedNetworkEvent
                            ? 'text-green-600 border-green-600'
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <div className="text-left">
                            <div className="text-sm font-medium">Healthy</div>
                            <div className="text-xs opacity-75">
                              {healthViewMode === 'clients' ? clientStats.authenticated : apStats.online} {healthViewMode}
                            </div>
                          </div>
                        </div>
                      </button>
                      {/* Selected Event Tab */}
                      {selectedNetworkEvent && (
                        <div className="pb-2 px-3 text-purple-600 border-b-2 border-purple-600">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            <div className="text-left">
                              <div className="text-sm font-medium truncate max-w-[200px]">{selectedNetworkEvent.description}</div>
                              <div className="text-xs opacity-75">Event Details</div>
                            </div>
                            <button
                              onClick={() => setSelectedNetworkEvent(null)}
                              className="ml-2 hover:bg-purple-100 rounded-full p-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setAiInsightsDetailPanel(false)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      title="Close details panel"
                    >
                      <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                {!selectedNetworkEvent ? (
                  <div className="space-y-4">
                    {/* Events Table */}
                    <div className="border rounded-lg">
                      <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-teal-600" />
                        <h3 className="text-sm font-medium">Recent Events</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Event</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Affected</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">AI Explanation</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Generate events based on real data */}
                            {aiActiveHealthTab === 'needsAttention' ? (
                              <>
                                {apStats.offline > 0 && (
                                  <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-sm">Access Points Offline</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{apStats.offline} APs</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs text-red-600 bg-red-50">Requires Action</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">AI detected {apStats.offline} access point(s) are offline. Check network connectivity, PoE power delivery, or hardware status.</td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => setSelectedNetworkEvent({
                                          id: 'ap-offline',
                                          time: new Date().toLocaleTimeString(),
                                          type: 'infrastructure',
                                          description: 'Access Points Offline',
                                          affectedCount: apStats.offline,
                                          aiExplanation: `${apStats.offline} access point(s) are currently offline. This may impact wireless coverage for clients in affected areas. Check cable connections, PoE power budget, and AP hardware status.`,
                                          severity: 'high',
                                          status: 'requires-action'
                                        })}
                                        className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                )}
                                {alertCounts.critical > 0 && (
                                  <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-sm">Critical Alerts Active</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{alertCounts.critical} alerts</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs text-red-600 bg-red-50">Critical</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">Multiple critical alerts require immediate attention to prevent service degradation.</td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => setSelectedNetworkEvent({
                                          id: 'critical-alerts',
                                          time: new Date().toLocaleTimeString(),
                                          type: 'infrastructure',
                                          description: 'Critical Alerts Active',
                                          affectedCount: alertCounts.critical,
                                          aiExplanation: `There are ${alertCounts.critical} critical alerts that require immediate attention. These may indicate hardware failures, configuration issues, or security concerns.`,
                                          severity: 'high',
                                          status: 'requires-action'
                                        })}
                                        className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                )}
                                {clientStats.total > clientStats.authenticated && (
                                  <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        <span className="text-sm">Unauthenticated Clients</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">{clientStats.total - clientStats.authenticated} clients</td>
                                    <td className="px-4 py-3">
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs text-amber-600 bg-amber-50">Monitoring</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">Some clients are connected but not fully authenticated. This may indicate captive portal users or authentication issues.</td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => setSelectedNetworkEvent({
                                          id: 'unauth-clients',
                                          time: new Date().toLocaleTimeString(),
                                          type: 'group',
                                          description: 'Unauthenticated Clients',
                                          affectedCount: clientStats.total - clientStats.authenticated,
                                          aiExplanation: `${clientStats.total - clientStats.authenticated} client(s) are connected but not authenticated. This could be normal for guest networks with captive portals, or may indicate authentication server issues.`,
                                          severity: 'medium',
                                          status: 'monitoring'
                                        })}
                                        className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                )}
                                {apStats.offline === 0 && alertCounts.critical === 0 && clientStats.total === clientStats.authenticated && (
                                  <tr className="border-b">
                                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-50" />
                                      No issues requiring attention
                                    </td>
                                  </tr>
                                )}
                              </>
                            ) : (
                              <>
                                <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="text-sm">Access Points Online</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{apStats.online} APs</td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs text-green-600 bg-green-50">Stable</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">All {apStats.online} access points are operational with normal performance metrics.</td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => setSelectorTab('access-point')}
                                      className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                                <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="text-sm">Authenticated Clients</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{clientStats.authenticated} clients</td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs text-green-600 bg-green-50">Stable</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">All authenticated clients have stable connections with good signal quality.</td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => setSelectorTab('client')}
                                      className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                                <tr className="border-b hover:bg-teal-500/5 transition-colors">
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-green-500" />
                                      <span className="text-sm">Network Throughput Normal</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatBps(clientStats.throughputUpload + clientStats.throughputDownload)}</td>
                                  <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs text-green-600 bg-green-50">Optimal</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">Network throughput is within normal parameters with no congestion detected.</td>
                                  <td className="px-4 py-3">
                                    <button className="p-2 hover:bg-teal-100 rounded-lg transition-colors text-teal-600">
                                      <Eye className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* AI Assistant Panel - Flashy Design */}
                    <div className="relative overflow-hidden rounded-xl border border-purple-500/20 bg-gradient-to-br from-slate-900 via-purple-950/50 to-slate-900">
                      {/* Animated background effects */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-600/10 via-transparent to-transparent" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-cyan-600/10 via-transparent to-transparent" />
                      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />

                      {/* Header */}
                      <div className="relative px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-purple-500/20 rounded-lg blur-md animate-pulse" />
                            <div className="relative bg-gradient-to-br from-purple-500 to-cyan-500 p-2 rounded-lg">
                              <Brain className="w-5 h-5 text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                              AI Network Analysis
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                              </span>
                            </h3>
                            <p className="text-xs text-purple-300/70">Real-time insights powered by AI</p>
                          </div>
                        </div>
                        <div className="text-xs text-purple-300/50 font-mono">
                          {lastUpdate?.toLocaleTimeString() || 'Analyzing...'}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="relative p-4">
                        {aiActiveHealthTab === 'needsAttention' ? (
                          /* Issues View */
                          <div className="space-y-3">
                            {apStats.offline > 0 && (
                              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 backdrop-blur-sm">
                                <div className="flex items-start gap-3">
                                  <div className="bg-red-500/20 p-2 rounded-lg">
                                    <Wifi className="w-4 h-4 text-red-400" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-red-300">{apStats.offline} AP{apStats.offline > 1 ? 's' : ''} Offline</span>
                                      <span className="px-1.5 py-0.5 text-[10px] bg-red-500/30 text-red-300 rounded-full font-medium">CRITICAL</span>
                                    </div>
                                    <p className="text-xs text-red-200/70 mt-1">Reduced wireless coverage in affected areas</p>
                                    <p className="text-xs text-purple-300/50 mt-1.5 flex items-center gap-1">
                                      <Zap className="w-3 h-3" /> Check PoE power and network cables
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {alertCounts.critical > 0 && (
                              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 backdrop-blur-sm">
                                <div className="flex items-start gap-3">
                                  <div className="bg-amber-500/20 p-2 rounded-lg">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-amber-300">{alertCounts.critical} Critical Alert{alertCounts.critical > 1 ? 's' : ''}</span>
                                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/30 text-amber-300 rounded-full font-medium">ACTION NEEDED</span>
                                    </div>
                                    <p className="text-xs text-amber-200/70 mt-1">Potential service degradation detected</p>
                                    <p className="text-xs text-purple-300/50 mt-1.5 flex items-center gap-1">
                                      <Zap className="w-3 h-3" /> Review alert details and remediate
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {clientStats.total > clientStats.authenticated && (
                              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 backdrop-blur-sm">
                                <div className="flex items-start gap-3">
                                  <div className="bg-blue-500/20 p-2 rounded-lg">
                                    <Users className="w-4 h-4 text-blue-400" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-blue-300">{clientStats.total - clientStats.authenticated} Pending Auth</span>
                                      <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/30 text-blue-300 rounded-full font-medium">INFO</span>
                                    </div>
                                    <p className="text-xs text-blue-200/70 mt-1">Clients waiting for authentication</p>
                                    <p className="text-xs text-purple-300/50 mt-1.5 flex items-center gap-1">
                                      <Zap className="w-3 h-3" /> Verify RADIUS/auth server status
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            {apStats.offline === 0 && alertCounts.critical === 0 && clientStats.total === clientStats.authenticated && (
                              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                  <div className="bg-green-500/20 p-2 rounded-lg">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                  </div>
                                  <div>
                                    <span className="text-sm font-semibold text-green-300">All Systems Operational</span>
                                    <p className="text-xs text-green-200/70 mt-0.5">No issues detected. Network performing optimally.</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Healthy Summary View */
                          <div className="grid grid-cols-2 gap-3">
                            {/* Access Points Card */}
                            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-lg p-3 backdrop-blur-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="bg-emerald-500/20 p-1.5 rounded-md">
                                  <Wifi className="w-4 h-4 text-emerald-400" />
                                </div>
                                <span className="text-lg font-bold text-emerald-300">{apStats.online}</span>
                              </div>
                              <div className="text-xs text-emerald-200/80 font-medium">Access Points Online</div>
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] text-emerald-300/60 mb-1">
                                  <span>Availability</span>
                                  <span>{apStats.total > 0 ? Math.round((apStats.online / apStats.total) * 100) : 0}%</span>
                                </div>
                                <div className="h-1.5 bg-emerald-950/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                                    style={{ width: `${apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Clients Card */}
                            <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg p-3 backdrop-blur-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="bg-blue-500/20 p-1.5 rounded-md">
                                  <Users className="w-4 h-4 text-blue-400" />
                                </div>
                                <span className="text-lg font-bold text-blue-300">{clientStats.authenticated}</span>
                              </div>
                              <div className="text-xs text-blue-200/80 font-medium">Clients Authenticated</div>
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] text-blue-300/60 mb-1">
                                  <span>Auth Rate</span>
                                  <span>{clientStats.total > 0 ? Math.round((clientStats.authenticated / clientStats.total) * 100) : 0}%</span>
                                </div>
                                <div className="h-1.5 bg-blue-950/50 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                                    style={{ width: `${clientStats.total > 0 ? (clientStats.authenticated / clientStats.total) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Throughput Card - Full Width */}
                            <div className="col-span-2 bg-gradient-to-br from-purple-500/10 to-cyan-500/5 border border-purple-500/20 rounded-lg p-3 backdrop-blur-sm">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="bg-purple-500/20 p-1.5 rounded-md">
                                    <Activity className="w-4 h-4 text-purple-400" />
                                  </div>
                                  <span className="text-xs text-purple-200/80 font-medium">Network Throughput</span>
                                </div>
                                <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-cyan-300">
                                  {formatBps(clientStats.throughputUpload + clientStats.throughputDownload)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2">
                                  <ArrowUp className="w-3 h-3 text-green-400" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-green-300/70">Upload</span>
                                      <span className="text-green-300 font-medium">{formatBps(clientStats.throughputUpload)}</span>
                                    </div>
                                    <div className="h-1 bg-green-950/50 rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full w-3/5" />
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <ArrowDown className="w-3 h-3 text-cyan-400" />
                                  <div className="flex-1">
                                    <div className="flex justify-between text-[10px] mb-1">
                                      <span className="text-cyan-300/70">Download</span>
                                      <span className="text-cyan-300 font-medium">{formatBps(clientStats.throughputDownload)}</span>
                                    </div>
                                    <div className="h-1 bg-cyan-950/50 rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full w-2/5" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Models Deployed */}
                            <div className="col-span-2 flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="bg-white/10 p-1 rounded">
                                  <Radio className="w-3 h-3 text-purple-300" />
                                </div>
                                <span className="text-xs text-purple-200/70">{Object.keys(apStats.models).length} AP model types deployed</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-purple-300/50">
                                <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-purple-300">
                                  ~{apStats.online > 0 ? Math.round(clientStats.total / apStats.online) : 0} clients/AP
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Selected Event Detail View */
                  <div className="space-y-4">
                    {/* Event Context Header */}
                    <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-teal-900 dark:text-teal-100 mb-1">Root Cause Analysis</h3>
                          <p className="text-sm text-teal-700 dark:text-teal-300">{selectedNetworkEvent.description}</p>
                        </div>
                        <div className="text-sm text-teal-600 dark:text-teal-400">
                          Event Time: {selectedNetworkEvent.time}
                        </div>
                      </div>
                    </div>

                    {/* Event Details */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-1 h-full rounded-full min-h-[80px] ${
                            selectedNetworkEvent.severity === 'high' ? 'bg-red-600' :
                            selectedNetworkEvent.severity === 'medium' ? 'bg-amber-500' :
                            'bg-teal-600'
                          }`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-sm px-2 py-1 text-white rounded ${
                              selectedNetworkEvent.severity === 'high' ? 'bg-red-600' :
                              selectedNetworkEvent.severity === 'medium' ? 'bg-amber-500' :
                              'bg-teal-600'
                            }`}>
                              {selectedNetworkEvent.type === 'infrastructure' ? 'Infrastructure Issue' :
                               selectedNetworkEvent.type === 'group' ? 'Client Group Issue' :
                               'Single Client Issue'}
                            </span>
                            <span className="text-sm text-muted-foreground">{selectedNetworkEvent.time}</span>
                          </div>
                          <h4 className="font-medium mb-2">{selectedNetworkEvent.description}</h4>
                          <p className="text-muted-foreground mb-4">{selectedNetworkEvent.aiExplanation}</p>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <span className="text-sm text-muted-foreground">Affected</span>
                              <p className="font-medium">{selectedNetworkEvent.affectedCount} {healthViewMode}</p>
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Severity</span>
                              <p className="font-medium capitalize">{selectedNetworkEvent.severity}</p>
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Status</span>
                              <p className="font-medium capitalize">{selectedNetworkEvent.status.replace('-', ' ')}</p>
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t">
                            <h5 className="text-sm font-medium mb-2">Recommended Actions:</h5>
                            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                              {selectedNetworkEvent.type === 'infrastructure' && (
                                <>
                                  <li>Check physical network connections and cable integrity</li>
                                  <li>Verify PoE power budget and power source unit status</li>
                                  <li>Review switch port configuration and status</li>
                                  <li>Check for firmware updates or known issues</li>
                                </>
                              )}
                              {selectedNetworkEvent.type === 'group' && (
                                <>
                                  <li>Review authentication server logs and status</li>
                                  <li>Check RADIUS/LDAP connectivity</li>
                                  <li>Verify client configuration and credentials</li>
                                  <li>Monitor for pattern in affected clients</li>
                                </>
                              )}
                              {selectedNetworkEvent.type === 'single' && (
                                <>
                                  <li>Check client device compatibility</li>
                                  <li>Review client roaming history</li>
                                  <li>Verify signal strength and interference</li>
                                </>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={() => setSelectedNetworkEvent(null)}>
                        <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                        Back to Events
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectorTab('access-point')}>
                        View Access Points
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectorTab('client')}>
                        View Clients
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Insight Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Network Health */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Activity className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Network Health</CardTitle>
                    <CardDescription>Infrastructure status overview</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>AP Availability</span>
                    <span className="font-medium">{apStats.total > 0 ? Math.round((apStats.online / apStats.total) * 100) : 0}%</span>
                  </div>
                  <Progress value={apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Client Auth Rate</span>
                    <span className="font-medium">{clientStats.total > 0 ? Math.round((clientStats.authenticated / clientStats.total) * 100) : 0}%</span>
                  </div>
                  <Progress value={clientStats.total > 0 ? (clientStats.authenticated / clientStats.total) * 100 : 0} className="h-2" />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-lg font-semibold text-green-600">{apStats.online}</p>
                    <p className="text-xs text-muted-foreground">Online</p>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-lg font-semibold text-red-600">{apStats.offline}</p>
                    <p className="text-xs text-muted-foreground">Offline</p>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <p className="text-lg font-semibold">{Object.keys(apStats.models).length}</p>
                    <p className="text-xs text-muted-foreground">Models</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Capacity Planning */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Capacity Planning</CardTitle>
                    <CardDescription>Resource utilization trends</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Avg Clients per AP</span>
                    <span className="font-medium">{apStats.online > 0 ? Math.round(clientStats.total / apStats.online) : 0}</span>
                  </div>
                  <Progress value={Math.min((apStats.online > 0 ? clientStats.total / apStats.online : 0) / 50 * 100, 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground">Recommended: &lt;50 clients per AP</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Upload className="h-4 w-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground">Upload</span>
                    </div>
                    <p className="text-lg font-semibold">{formatBps(clientStats.throughputUpload)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Download className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-muted-foreground">Download</span>
                    </div>
                    <p className="text-lg font-semibold">{formatBps(clientStats.throughputDownload)}</p>
                  </div>
                </div>

                {/* OS ONE Control */}
                <div className="pt-3 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Server className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">OS ONE Control</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">CPU</span>
                        <span className="text-lg font-bold text-purple-400">5.5%</span>
                      </div>
                      <Progress value={5.5} className="h-1.5 bg-purple-950/50" />
                    </div>
                    <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Memory</span>
                        <span className="text-lg font-bold text-cyan-400">38%</span>
                      </div>
                      <Progress value={38} className="h-1.5 bg-cyan-950/50" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Anomaly Detection */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Anomaly Detection</CardTitle>
                    <CardDescription>Unusual patterns and alerts</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {apStats.offline > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <WifiOff className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-600">Offline Access Points</p>
                      <p className="text-xs text-muted-foreground">{apStats.offline} AP(s) are currently offline and require attention</p>
                    </div>
                  </div>
                )}
                {alertCounts.critical > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-600">Critical Alerts</p>
                      <p className="text-xs text-muted-foreground">{alertCounts.critical} critical issue(s) need immediate attention</p>
                    </div>
                  </div>
                )}
                {apStats.offline === 0 && alertCounts.critical === 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-600">All Clear</p>
                      <p className="text-xs text-muted-foreground">No anomalies detected - network operating normally</p>
                    </div>
                  </div>
                )}
                <div className="pt-2 text-xs text-muted-foreground">
                  Last checked: {lastUpdate?.toLocaleTimeString() || 'Updating...'}
                </div>
              </CardContent>
            </Card>

            {/* Predictive Maintenance */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Timer className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Predictive Maintenance</CardTitle>
                    <CardDescription>Potential issues forecast</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {apStats.lowPower > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Zap className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-600">Low Power APs</p>
                      <p className="text-xs text-muted-foreground">{apStats.lowPower} AP(s) running in low power mode - check PoE budget</p>
                    </div>
                  </div>
                )}
                {poorServices.length > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Network className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-600">Service Degradation</p>
                      <p className="text-xs text-muted-foreground">{poorServices.length} service(s) showing performance issues</p>
                    </div>
                  </div>
                )}
                {apStats.lowPower === 0 && poorServices.length === 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-600">Systems Healthy</p>
                      <p className="text-xs text-muted-foreground">No maintenance issues predicted in the near term</p>
                    </div>
                  </div>
                )}
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">
                    Models tracked: {Object.entries(apStats.models).slice(0, 3).map(([m]) => m).join(', ')}
                    {Object.keys(apStats.models).length > 3 && ` +${Object.keys(apStats.models).length - 3} more`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Drill-down hint & Attribution */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="py-4">
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-4">
                  <Brain className="h-4 w-4" />
                  <span>Select <strong>Site</strong>, <strong>AP</strong>, <strong>Switch</strong> <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600">Beta</Badge>, or <strong>Client</strong> above to drill into specific details</span>
                </div>
                <p className="text-xs opacity-60 mt-2">UI Design inspired by Sunil Jose Kodiyan, Analytics Director Product Line</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ACCESS POINT DETAIL VIEW */}
      {selectorTab === 'access-point' && selectedEntityId && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedEntityId(null);
                  setSelectedEntityName(null);
                }}
                className="h-8 px-2"
              >
                <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                Back
              </Button>
              <div>
                <h3 className="text-lg font-semibold">{selectedEntityName || 'Access Point Details'}</h3>
                <p className="text-sm text-muted-foreground">Detailed AP information and connected clients</p>
              </div>
            </div>
          </div>
          <AccessPointDetail serialNumber={selectedEntityId} />
        </div>
      )}

      {/* CLIENT DETAIL VIEW */}
      {selectorTab === 'client' && selectedEntityId && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedEntityId(null);
                  setSelectedEntityName(null);
                }}
                className="h-8 px-2"
              >
                <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                Back
              </Button>
              <div>
                <h3 className="text-lg font-semibold">{selectedEntityName || 'Client Details'}</h3>
                <p className="text-sm text-muted-foreground">Client connection and performance details</p>
              </div>
            </div>
          </div>
          <ClientDetail macAddress={selectedEntityId} />
        </div>
      )}

      {/* SWITCH DETAIL VIEW */}
      {selectorTab === 'switch' && selectedEntityId && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedEntityId(null);
                  setSelectedEntityName(null);
                }}
                className="h-8 px-2"
              >
                <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
                Back
              </Button>
              <div>
                <h3 className="text-lg font-semibold">{selectedEntityName || 'Switch Details'}</h3>
                <p className="text-sm text-muted-foreground">Switch configuration and port status</p>
              </div>
            </div>
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h4 className="text-lg font-medium mb-2">Switch Details</h4>
              <p className="text-sm text-muted-foreground">
                Switch detail view for {selectedEntityName || selectedEntityId}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* NETWORK DASHBOARD VIEW - Shows for Site tab or when no specific entity selected */}
      {((selectorTab === 'site') ||
        (selectorTab === 'access-point' && !selectedEntityId) ||
        (selectorTab === 'client' && !selectedEntityId) ||
        (selectorTab === 'switch' && !selectedEntityId)) && (
      <>
      {/* SECTION 1: OPERATIONAL CONTEXT SUMMARY */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">
            {selectedEntityId && selectorTab === 'site'
              ? `Site Overview: ${selectedEntityName}`
              : 'Network Overview'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {selectedEntityId && selectorTab === 'site'
              ? 'Site-specific context and performance metrics'
              : 'Intelligent context-aware network insights'}
          </p>
        </div>
        <OperationalContextSummary />
      </div>

      {/* ========================================
          SECTION 2: CORE OPERATIONAL ACTIVITY
          ======================================== */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Core Operational Activity</h3>
          <p className="text-sm text-muted-foreground">Real-time network operations and status</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total APs */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Access Points</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{apStats.total}</div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {apStats.online} Online
                </Badge>
                {apStats.offline > 0 && (
                  <Badge variant="outline" className="text-red-600 border-red-600 text-xs">
                    <WifiOff className="h-3 w-3 mr-1" />
                    {apStats.offline} Offline
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium">{apStats.online > 0 ? Math.round((apStats.online / apStats.total) * 100) : 0}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-green-600">{apStats.offline === 0 ? 'Optimal' : 'Check Required'}</span>
              </div>
              {Object.keys(apStats.models).length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Models</p>
                  <div className="space-y-0.5">
                    {Object.entries(apStats.models)
                      .sort(([, a], [, b]) => b - a)
                      .map(([model, count]) => (
                        <div key={model} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate" title={model}>{model}</span>
                          <Badge variant="secondary" className="text-xs">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connected Clients */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Connected Clients</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-md group-hover:scale-110 transition-transform">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{clientStats.total}</div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Authenticated</span>
                <span className="font-medium">{clientStats.authenticated}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Auth Rate</span>
                <span className="font-medium">{clientStats.total > 0 ? Math.round((clientStats.authenticated / clientStats.total) * 100) : 0}%</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span className="text-green-600 font-medium">Active</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Network Throughput */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
              Network Throughput
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" title={TOOLTIPS.REAL_TIME_THROUGHPUT} />
            </CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
              <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">{formatBps(clientStats.throughputUpload + clientStats.throughputDownload)}</div>
            <p className="text-xs text-muted-foreground">Total network traffic (Mbps/Gbps)</p>
            
            {/* Upload/Download Stats */}
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span title="Upload throughput in Mbps/Gbps">Upload</span>
                </div>
                <div className="font-medium text-blue-600">{formatBps(clientStats.throughputUpload)}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  <span title="Download throughput in Mbps/Gbps">Download</span>
                </div>
                <div className="font-medium text-green-600">{formatBps(clientStats.throughputDownload)}</div>
              </div>
            </div>

            {/* Average per client */}
            {clientStats.total > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground cursor-help" title="Average throughput per connected client">
                    Avg per client
                  </span>
                  <span className="font-medium">
                    {formatBps((clientStats.throughputUpload + clientStats.throughputDownload) / clientStats.total)}
                  </span>
                </div>
              </div>
            )}

            {/* Mini trend chart */}
            {throughputTrend.length > 0 && (
              <div className="mt-3 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughputTrend.slice(-15)}>
                    <defs>
                      <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#BB86FC" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#BB86FC" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#BB86FC" 
                      strokeWidth={1.5}
                      fill="url(#throughputGradient)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Active Alerts</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{alertCounts.critical + alertCounts.warning}</div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex gap-2">
                {alertCounts.critical > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {alertCounts.critical} Critical
                  </Badge>
                )}
                {alertCounts.warning > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {alertCounts.warning} Warning
                  </Badge>
                )}
              </div>
              {alertCounts.critical === 0 && alertCounts.warning === 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span className="text-green-600 font-medium">All systems normal</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium text-green-600">Optimal</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Action needed</span>
                  <span className="font-medium text-amber-600">Review alerts</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        </div>
      </div>

      {/* ========================================
          SECTION 3: PERFORMANCE AND QUALITY
          ======================================== */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Performance and Quality</h3>
          <p className="text-sm text-muted-foreground">Network performance indicators and distribution analytics</p>
        </div>

        {/* Performance Metrics and Service Quality Overview */}
        <div className="grid gap-4 md:grid-cols-2">
        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Network quality indicators with insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Latency */}
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Latency</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    performanceMetrics.latency < 20 ? 'text-green-600' :
                    performanceMetrics.latency < 50 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {performanceMetrics.latency.toFixed(1)} ms
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.latency < 20 ? '✓ Excellent - Ideal for real-time applications' :
                   performanceMetrics.latency < 50 ? '⚠ Good - Suitable for most applications' :
                   '⚠ High - May impact user experience'}
                </p>
              </div>
            )}

            {/* Packet Loss */}
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Packet Loss</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    performanceMetrics.packetLoss < 0.5 ? 'text-green-600' :
                    performanceMetrics.packetLoss < 2 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {performanceMetrics.packetLoss.toFixed(3)}%
                  </span>
                </div>
                <Progress
                  value={Math.max(0, 100 - (performanceMetrics.packetLoss * 20))}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.packetLoss < 0.5 ? '✓ Excellent - No significant packet loss' :
                   performanceMetrics.packetLoss < 2 ? '⚠ Acceptable - Minor packet loss detected' :
                   '⚠ Critical - Check network infrastructure'}
                </p>
              </div>
            )}

            {/* RSSI */}
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Signal Strength (RSSI)</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    performanceMetrics.avgRssi >= -50 ? 'text-green-600' :
                    performanceMetrics.avgRssi >= -70 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {performanceMetrics.avgRssi.toFixed(0)} dBm
                  </span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, (performanceMetrics.avgRssi + 100) * 1.25))}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.avgRssi >= -50 ? '✓ Excellent signal - Optimal performance' :
                   performanceMetrics.avgRssi >= -60 ? '✓ Good signal - Reliable connectivity' :
                   performanceMetrics.avgRssi >= -70 ? '⚠ Fair signal - Consider AP placement' :
                   '⚠ Weak signal - Recommend additional APs'}
                </p>
              </div>
            )}

            {/* SNR */}
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Signal className="h-4 w-4 text-cyan-500" />
                    <span className="text-sm font-medium">Signal Quality (SNR)</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    performanceMetrics.avgSnr >= 40 ? 'text-green-600' :
                    performanceMetrics.avgSnr >= 25 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {performanceMetrics.avgSnr.toFixed(0)} dB
                  </span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, (performanceMetrics.avgSnr / 50) * 100))}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.avgSnr >= 40 ? '✓ Excellent - Minimal interference' :
                   performanceMetrics.avgSnr >= 25 ? '✓ Good - Acceptable noise levels' :
                   '⚠ Poor - High interference detected'}
                </p>
              </div>
            )}

            {/* Success Rate */}
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Success Rate</span>
                  </div>
                  <span className={`text-sm font-bold ${
                    performanceMetrics.authenticatedRate >= 98 ? 'text-green-600' :
                    performanceMetrics.authenticatedRate >= 95 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {performanceMetrics.authenticatedRate.toFixed(2)}%
                  </span>
                </div>
                <Progress value={performanceMetrics.authenticatedRate} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.authenticatedRate >= 98 ? '✓ Optimal - Meeting SLA targets' :
                   performanceMetrics.authenticatedRate >= 95 ? '⚠ Acceptable - Minor issues detected' :
                   '⚠ Below target - Investigate connection issues'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Quality Radar - Multi-Dimensional Performance View */}
        <Card>
          <CardHeader>
            <CardTitle>Service Quality Overview</CardTitle>
            <CardDescription>Multi-dimensional performance view</CardDescription>
          </CardHeader>
          <CardContent>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Performance"
                    dataKey="value"
                    stroke="#BB86FC"
                    fill="#BB86FC"
                    fillOpacity={0.6}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                No metrics available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        {/* AP and Client Distribution */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Access Point Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Access Point Distribution</CardTitle>
              <CardDescription>By role and power state</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* By Role */}
              <div>
                <h4 className="text-sm font-medium mb-3">By Role</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500" />
                      <span className="text-sm">Primary</span>
                    </div>
                    <div className="text-sm font-medium">
                      {apStats.primary} ({apStats.total > 0 ? Math.round((apStats.primary / apStats.total) * 100) : 0}%)
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-cyan-500" />
                      <span className="text-sm">Backup</span>
                    </div>
                    <div className="text-sm font-medium">
                      {apStats.backup} ({apStats.total > 0 ? Math.round((apStats.backup / apStats.total) * 100) : 0}%)
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500" />
                      <span className="text-sm">Standby</span>
                    </div>
                    <div className="text-sm font-medium">
                      {apStats.standby} ({apStats.total > 0 ? Math.round((apStats.standby / apStats.total) * 100) : 0}%)
                    </div>
                  </div>
                </div>
              </div>

              {/* By Power State */}
              <div>
                <h4 className="text-sm font-medium mb-3">By Power State</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Normal Power</span>
                    </div>
                    <div className="text-sm font-medium text-green-600">
                      {apStats.normalPower} ({apStats.total > 0 ? Math.round((apStats.normalPower / apStats.total) * 100) : 0}%)
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Low Power</span>
                    </div>
                    <div className="text-sm font-medium text-yellow-600">
                      {apStats.lowPower} ({apStats.total > 0 ? Math.round((apStats.lowPower / apStats.total) * 100) : 0}%)
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Client Distribution</CardTitle>
              <CardDescription>Across services and networks</CardDescription>
            </CardHeader>
            <CardContent>
              {clientStats.total === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No clients connected</p>
                </div>
              ) : clientDistribution.length > 0 ? (
                <div className="space-y-4">
                  {/* List view */}
                  <div className="space-y-3">
                    {clientDistribution.slice(0, 6).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                        onClick={() => handleServiceClick(item.service)}
                        title={`Click to view ${item.count} client(s) on ${item.service}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <span className="text-sm truncate">{item.service}</span>
                        </div>
                        <div className="flex items-center gap-3 ml-2">
                          <span className="text-sm font-medium">{item.count}</span>
                          <span className="text-xs text-muted-foreground w-10 text-right">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mini pie chart */}
                  {clientDistribution.length > 1 && (
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={clientDistribution.slice(0, 6)}
                            dataKey="count"
                            nameKey="service"
                            cx="50%"
                            cy="50%"
                            outerRadius={50}
                            isAnimationActive={false}
                            onClick={(data) => {
                              if (data && data.service) {
                                handleServiceClick(data.service);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {clientDistribution.slice(0, 6).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                                style={{ cursor: 'pointer' }}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Unable to load client distribution</p>
                  <p className="text-xs mt-1">Service information not available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========================================
          SECTION 4: BEST PRACTICE EVALUATION
          ======================================== */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Best Practice Evaluation</h3>
          <p className="text-sm text-muted-foreground">Network configuration and optimization recommendations</p>
        </div>
        <BestPracticesWidget />
      </div>

      {/* Top Clients */}
      {topClients.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top Clients by Throughput</CardTitle>
                <CardDescription>
                  Real-time bandwidth usage and connection details
                  {vendorLookupsInProgress && (
                    <span className="ml-2 text-xs italic">
                      • Loading device info...
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {vendorLookupsInProgress && (
                  <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTopClientsCollapsed(!isTopClientsCollapsed)}
                >
                  {isTopClientsCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          {!isTopClientsCollapsed && (
          <CardContent>
            <div className="space-y-3">
              {topClients.map((client, idx) => (
                <div
                  key={client.mac}
                  onClick={async () => {
                    try {
                      // Fetch fresh station details from the API
                      const stationDetails = await apiService.fetchStationDetails(client.mac);
                      // Find the full station object from stations array
                      const fullStation = stations.find(s => s.macAddress === client.mac);
                      // Merge all available data
                      setSelectedClient({ ...fullStation, ...stationDetails, ...client });
                      setIsClientDialogOpen(true);
                    } catch (error) {
                      console.error('[Dashboard] Failed to fetch client details:', error);
                      // Fallback to existing client data
                      const fullStation = stations.find(s => s.macAddress === client.mac);
                      setSelectedClient(fullStation || client as any);
                      setIsClientDialogOpen(true);
                    }
                  }}
                  className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  {/* Header Row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{client.name}</span>
                          {client.vendor && (
                            <Badge variant="secondary" className="text-xs">
                              {getShortVendor(client.vendor)}
                            </Badge>
                          )}
                          {client.rssi && (
                            <Badge variant={client.rssi > -60 ? "default" : client.rssi > -70 ? "secondary" : "outline"} className="text-xs">
                              <Signal className="h-3 w-3 mr-1" />
                              {client.rssi} dBm
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>{client.mac}</span>
                          {client.ipAddress !== 'N/A' && (
                            <>
                              <span>•</span>
                              <span>{client.ipAddress}</span>
                            </>
                          )}
                          {client.vendor && client.vendor !== 'Unknown Vendor' && (
                            <>
                              <span>•</span>
                              <span className="text-xs italic">{client.vendor}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        {formatBps(client.throughput)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>

                  {/* Traffic Stats Row */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <Upload className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-xs text-muted-foreground">Upload</div>
                        <div className="text-sm font-medium">{formatBps(client.upload)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <Download className="h-4 w-4 text-green-500" />
                      <div>
                        <div className="text-xs text-muted-foreground">Download</div>
                        <div className="text-sm font-medium">{formatBps(client.download)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Connection Details Row */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Wifi className="h-3.5 w-3.5" />
                      <span className="truncate">{client.network}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Router className="h-3.5 w-3.5" />
                      <span className="truncate">{client.ap}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" />
                      <span>{client.band}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Traffic Distribution</span>
                      <span>{Math.round((client.download / client.throughput) * 100)}% DL / {Math.round((client.upload / client.throughput) * 100)}% UL</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                      <div 
                        className="bg-green-500 transition-all" 
                        style={{ width: `${(client.download / client.throughput) * 100}%` }}
                      />
                      <div 
                        className="bg-blue-500 transition-all" 
                        style={{ width: `${(client.upload / client.throughput) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          )}
        </Card>
      )}

      {/* Poor Services Alert */}
      {poorServices.length > 0 && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Services Requiring Attention
            </CardTitle>
            <CardDescription>Services with degraded performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {poorServices.map(service => (
                <div key={service.id} className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/5">
                  <div>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {service.reliability && service.reliability < 95 && (
                        <span className="mr-3">Reliability: {service.reliability}%</span>
                      )}
                      {service.uptime && service.uptime < 95 && (
                        <span>Uptime: {service.uptime}%</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                    Degraded
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Alerts Preview */}
      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Last 24 hours</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {notifications.slice(0, 5).map(notif => {
                const severity = (notif.severity || notif.level || '').toLowerCase();
                const isCritical = severity.includes('critical') || severity.includes('error');
                const isWarning = severity.includes('warning') || severity.includes('warn');
                
                return (
                  <div 
                    key={notif.id} 
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      isCritical ? 'border-red-500/50 bg-red-500/5' : 
                      isWarning ? 'border-yellow-500/50 bg-yellow-500/5' : 
                      'border-border'
                    }`}
                  >
                    {isCritical ? (
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    ) : isWarning ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Activity className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{notif.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(notif.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 1 Widgets: Venue Statistics */}
      {filters.site && filters.site !== 'all' && (
        <VenueStatisticsWidget
          siteId={filters.site}
          duration={filters.timeRange === '15m' ? '15M' :
                   filters.timeRange === '1h' ? '1H' :
                   filters.timeRange === '7d' ? '7D' :
                   filters.timeRange === '30d' ? '30D' : '24H'}
        />
      )}

      {/* Phase 5+ Widgets: Configuration Profiles and Audit Logs */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Configuration Profiles Widget */}
        <ConfigurationProfilesWidget />

        {/* Audit Logs Widget */}
        <AuditLogsWidget />
      </div>

      {/* OS ONE Control - System Information */}
      <OSOneWidget compact={true} />
      </>
      )}

      {/* Client Detail Dialog */}
      <DetailSlideOut
        isOpen={isClientDialogOpen}
        onClose={() => setIsClientDialogOpen(false)}
        title="Client Details"
        description={`Detailed information for ${selectedClient?.hostName || selectedClient?.macAddress}`}
        width="xl"
      >
        {selectedClient && (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="events">Station Events</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">MAC Address</p>
                  <p className="font-mono text-sm">{selectedClient.macAddress}</p>
                </div>
                {selectedClient.hostName && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Hostname</p>
                    <p className="text-sm">{selectedClient.hostName}</p>
                  </div>
                )}
                {selectedClient.ipAddress && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">IP Address</p>
                    <p className="font-mono text-sm">{selectedClient.ipAddress}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Authentication</p>
                  <Badge variant={selectedClient.authenticated !== false ? "default" : "secondary"}>
                    {selectedClient.authenticated !== false ? "Authenticated" : "Not Authenticated"}
                  </Badge>
                </div>
              </div>

              {/* Connection Details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Connection Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {(selectedClient.ssid || selectedClient.serviceName) && (
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">SSID/Service</p>
                          <p className="text-sm">{selectedClient.ssid || selectedClient.serviceName}</p>
                        </div>
                      </div>
                    )}
                    {(selectedClient.apName || selectedClient.apSerialNumber) && (
                      <div className="flex items-center gap-2">
                        <Router className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Access Point</p>
                          <p className="text-sm">{selectedClient.apName || selectedClient.apSerialNumber}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Signal Quality */}
              {(selectedClient.rssi !== undefined || selectedClient.snr !== undefined) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Signal Quality</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedClient.rssi !== undefined && (
                        <div className="flex items-center gap-2">
                          <Signal className={`h-4 w-4 ${
                            selectedClient.rssi >= -50 ? 'text-green-600' :
                            selectedClient.rssi >= -60 ? 'text-blue-600' :
                            selectedClient.rssi >= -70 ? 'text-yellow-600' :
                            'text-red-600'
                          }`} />
                          <div>
                            <p className="text-xs text-muted-foreground">RSSI</p>
                            <p className="text-sm font-medium">{selectedClient.rssi} dBm</p>
                          </div>
                        </div>
                      )}
                      {selectedClient.snr !== undefined && (
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">SNR</p>
                            <p className="text-sm font-medium">{selectedClient.snr} dB</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Throughput */}
              {(selectedClient.txRate !== undefined || selectedClient.rxRate !== undefined ||
                selectedClient.txBytes !== undefined || selectedClient.rxBytes !== undefined ||
                selectedClient.outBytes !== undefined || selectedClient.inBytes !== undefined) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Throughput</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {(selectedClient.txRate !== undefined || selectedClient.txBytes !== undefined || selectedClient.outBytes !== undefined) && (
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Upload</p>
                            <p className="text-sm font-medium">
                              {selectedClient.txRate !== undefined
                                ? formatBps(selectedClient.txRate * 1000000)
                                : formatBytes(selectedClient.outBytes || selectedClient.txBytes || 0)}
                            </p>
                          </div>
                        </div>
                      )}
                      {(selectedClient.rxRate !== undefined || selectedClient.rxBytes !== undefined || selectedClient.inBytes !== undefined) && (
                        <div className="flex items-center gap-2">
                          <Download className="h-4 w-4 text-green-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Download</p>
                            <p className="text-sm font-medium">
                              {selectedClient.rxRate !== undefined
                                ? formatBps(selectedClient.rxRate * 1000000)
                                : formatBytes(selectedClient.inBytes || selectedClient.rxBytes || 0)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Session Info */}
              {(selectedClient.uptime !== undefined || selectedClient.connectionTime !== undefined) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Session Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedClient.uptime !== undefined && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Uptime</p>
                            <p className="text-sm font-medium">
                              {Math.floor(selectedClient.uptime / 3600)}h {Math.floor((selectedClient.uptime % 3600) / 60)}m
                            </p>
                          </div>
                        </div>
                      )}
                      {selectedClient.connectionTime !== undefined && (
                        <div className="flex items-center gap-2">
                          <Timer className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Connected At</p>
                            <p className="text-sm font-medium">
                              {new Date(selectedClient.connectionTime).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Radio & Protocol Information */}
              {(selectedClient.protocol || selectedClient.channel || selectedClient.radioId) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Radio & Protocol</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedClient.protocol && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Protocol</p>
                          <Badge variant="outline">{selectedClient.protocol}</Badge>
                        </div>
                      )}
                      {selectedClient.channel !== undefined && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Channel</p>
                          <p className="text-sm font-medium">Channel {selectedClient.channel}</p>
                        </div>
                      )}
                      {selectedClient.radioId !== undefined && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Radio Band</p>
                          <p className="text-sm font-medium">
                            {selectedClient.radioId === 1 ? '2.4 GHz' : selectedClient.radioId === 2 ? '5 GHz' : `Radio ${selectedClient.radioId}`}
                          </p>
                        </div>
                      )}
                      {selectedClient.transmittedRate !== undefined && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Tx Rate</p>
                          <p className="text-sm font-medium">{formatTxRxRate(selectedClient.transmittedRate)}</p>
                        </div>
                      )}
                      {selectedClient.receivedRate !== undefined && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Rx Rate</p>
                          <p className="text-sm font-medium">{formatTxRxRate(selectedClient.receivedRate)}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Role & Device Information */}
              {(selectedClient.role || selectedClient.manufacturer || selectedClient.lastSeen) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Device Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      {selectedClient.role && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Role</p>
                          <Badge variant="secondary">{selectedClient.role}</Badge>
                        </div>
                      )}
                      {selectedClient.manufacturer && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Manufacturer</p>
                          <p className="text-sm font-medium">{selectedClient.manufacturer}</p>
                        </div>
                      )}
                      {selectedClient.lastSeen !== undefined && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Last Seen</p>
                          <p className="text-sm font-medium">
                            {new Date(selectedClient.lastSeen).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {selectedClient.accessPointName && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Access Point</p>
                          <p className="text-sm font-medium">{selectedClient.accessPointName}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="events" className="space-y-4">
              {isLoadingEvents ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground font-medium mb-2">No station events available</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Station {selectedClient?.macAddress}
                  </p>
                  <div className="text-xs text-muted-foreground max-w-md mx-auto space-y-1 mt-4">
                    <p>Station events may be unavailable if:</p>
                    <p>• Your Extreme Platform ONE doesn't support the station events API</p>
                    <p>• No events have been logged for this station in the last 30 days</p>
                    <p>• Audit logging is not enabled on your Extreme Platform ONE</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      if (selectedClient) {
                        console.log('[Dashboard] Manually retrying station events load...');
                        setIsLoadingEvents(true);
                        apiService.fetchStationEvents(selectedClient.macAddress).then(events => {
                          console.log('[Dashboard] Manual retry received:', events);
                          setStationEvents(events);
                        }).finally(() => {
                          setIsLoadingEvents(false);
                        });
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  {/* Event Type Filter */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={eventTypeFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEventTypeFilter('all')}
                    >
                      All Events ({stationEvents.length})
                    </Button>
                    {eventTypes.map((type) => (
                      <Button
                        key={type}
                        variant={eventTypeFilter === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEventTypeFilter(type)}
                      >
                        {type} ({stationEvents.filter(e => e.eventType === type).length})
                      </Button>
                    ))}
                  </div>

                  {/* Event Timeline */}
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {filteredEvents.map((event, idx) => {
                        const eventDate = new Date(parseInt(event.timestamp));
                        const eventColor =
                          event.eventType === 'Roam' ? 'blue' :
                          event.eventType === 'Associate' ? 'green' :
                          event.eventType === 'Disassociate' ? 'red' :
                          event.eventType === 'Authenticate' ? 'purple' :
                          'gray';

                        return (
                          <Card key={event.id || idx} className="relative pl-8">
                            {/* Timeline dot */}
                            <div className={`absolute left-3 top-6 w-2 h-2 rounded-full bg-${eventColor}-500`} />
                            {idx !== filteredEvents.length - 1 && (
                              <div className="absolute left-3.5 top-8 w-0.5 h-full bg-border" />
                            )}

                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge
                                      variant={
                                        event.eventType === 'Associate' || event.eventType === 'Authenticate' ? 'default' :
                                        event.eventType === 'Disassociate' ? 'destructive' :
                                        'secondary'
                                      }
                                    >
                                      {event.eventType}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {eventDate.toLocaleString()}
                                    </span>
                                  </div>

                                  {event.details && (
                                    <p className="text-sm text-foreground mb-2">{event.details}</p>
                                  )}

                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    {event.apName && (
                                      <div>
                                        <span className="text-muted-foreground">AP: </span>
                                        <span className="font-medium">{event.apName}</span>
                                      </div>
                                    )}
                                    {event.ssid && (
                                      <div>
                                        <span className="text-muted-foreground">SSID: </span>
                                        <span className="font-medium">{event.ssid}</span>
                                      </div>
                                    )}
                                    {event.ipAddress && (
                                      <div>
                                        <span className="text-muted-foreground">IP: </span>
                                        <span className="font-mono font-medium">{event.ipAddress}</span>
                                      </div>
                                    )}
                                    {event.level && (
                                      <div>
                                        <span className="text-muted-foreground">Level: </span>
                                        <span className="font-medium">{event.level}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DetailSlideOut>

      {/* Service Clients Dialog */}
      <DetailSlideOut
        isOpen={isServiceClientsDialogOpen}
        onClose={() => setIsServiceClientsDialogOpen(false)}
        title={`Clients on ${selectedService}`}
        description={`${getClientsForService().length} client(s) connected to this service`}
        width="xl"
      >
        <div className="space-y-2">
              {getClientsForService().length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No clients found for this service</p>
                </div>
              ) : (
                getClientsForService().map((client, idx) => (
                  <Card
                    key={client.macAddress || idx}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedClient(client);
                      setIsServiceClientsDialogOpen(false);
                      setIsClientDialogOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {client.vendorIcon && (
                            <div className="text-2xl">{client.vendorIcon}</div>
                          )}
                          <div>
                            <p className="font-medium">{client.hostName || client.macAddress}</p>
                            <p className="text-xs text-muted-foreground">{client.macAddress}</p>
                            {client.ipAddress && (
                              <p className="text-xs text-muted-foreground">{client.ipAddress}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {client.rssi !== undefined && (
                            <div className="flex items-center gap-1">
                              <Signal className={`h-4 w-4 ${
                                client.rssi >= -50 ? 'text-green-600' :
                                client.rssi >= -60 ? 'text-blue-600' :
                                client.rssi >= -70 ? 'text-yellow-600' :
                                'text-red-600'
                              }`} />
                              <span className="text-muted-foreground">{client.rssi} dBm</span>
                            </div>
                          )}
                          {client.authenticated !== false && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Authenticated
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
        </div>
      </DetailSlideOut>
    </div>
  );
}

// Export memoized component to prevent unnecessary re-renders
export const DashboardEnhanced = memo(DashboardEnhancedComponent);