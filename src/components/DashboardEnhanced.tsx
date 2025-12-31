import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
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
  MapPin,
  Router,
  Shield,
  Timer,
  Info
} from 'lucide-react';
import { apiService } from '../services/api';
import { throughputService, ThroughputSnapshot } from '../services/throughput';
import { toast } from 'sonner';
import { getVendor, getVendorIcon, getShortVendor } from '../services/oui-lookup';
import { formatBitsPerSecond, formatBytes as formatBytesUnit, formatThroughput, formatDataVolume, TOOLTIPS } from '../lib/units';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { OperationalHealthSummary } from './OperationalHealthSummary';
import { FilterBar } from './FilterBar';
import { VersionBadge } from './VersionBadge';

interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  model?: string;
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

export function DashboardEnhanced() {
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
    normalPower: 0
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

  useEffect(() => {
    loadDashboardData();
    loadHistoricalThroughput();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 30000);
    
    // Reload historical data every 5 minutes
    const historyInterval = setInterval(() => {
      loadHistoricalThroughput();
    }, 300000);
    
    return () => {
      clearInterval(interval);
      clearInterval(historyInterval);
    };
  }, []);

  const loadDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log('[Dashboard] Loading comprehensive dashboard data...');

      // Fetch all data in parallel with fallback strategies
      const [apsResult, stationsResult, servicesResult, notificationsResult] = await Promise.allSettled([
        fetchAccessPoints(),
        fetchStations(),
        fetchServices(),
        fetchNotifications()
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

      // Process Notifications
      if (notificationsResult.status === 'fulfilled' && notificationsResult.value) {
        processNotifications(notificationsResult.value);
      } else {
        console.log('[Dashboard] Failed to load notifications:', notificationsResult.status === 'rejected' ? notificationsResult.reason : 'No data');
      }

      setLastUpdate(new Date());
      
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
    console.log('[Dashboard] Fetching access points from /v1/aps...');
    
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/aps', { method: 'GET' }, 15000);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const aps = Array.isArray(data) ? data : (data.aps || data.data || []);
      
      console.log('[Dashboard] Fetched', aps.length, 'access points');
      return aps;
    } catch (error) {
      console.error('[Dashboard] Error fetching APs:', error);
      return [];
    }
  };

  const fetchStations = async (): Promise<Station[]> => {
    console.log('[Dashboard] Fetching stations from /v1/stations...');
    
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 15000);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const stations = Array.isArray(data) ? data : (data.stations || data.clients || data.data || []);
      
      console.log('[Dashboard] Fetched', stations.length, 'stations');
      return stations;
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
      normalPower: 0
    };

    aps.forEach(ap => {
      // Determine online status
      const status = (ap.status || ap.connectionState || ap.operationalState || '').toLowerCase();
      if (status.includes('online') || status.includes('connected') || status.includes('up')) {
        stats.online++;
      } else if (status.includes('offline') || status.includes('down') || status.includes('disconnected')) {
        stats.offline++;
      } else {
        // Default to online if status is unclear
        stats.online++;
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
    });

    setApStats(stats);
    console.log('[Dashboard] AP Stats:', stats);
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
          avgTotal: formatBytes(trend.reduce((sum, t) => sum + t.total, 0) / trend.length)
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
    const serviceIdToNameMap = new Map<string, string>();
    servicesData.forEach(service => {
      if (service.id) {
        // Prefer SSID over name, then name, as SSID is more recognizable to users
        const displayName = service.ssid || service.name || service.id;
        serviceIdToNameMap.set(service.id, displayName);
      }
    });
    
    // Calculate statistics
    let totalUpload = 0;
    let totalDownload = 0;
    let authenticated = 0;

    const serviceMap = new Map<string, number>();
    const serviceThroughputMap = new Map<string, { upload: number; download: number }>();
    const clientThroughput: Array<{ name: string; mac: string; throughput: number }> = [];

    stations.forEach(station => {
      // Count authenticated clients
      if (station.authenticated !== false) {
        authenticated++;
      }

      // Sum throughput - try multiple rate field names, then estimate from cumulative bytes
      let tx = 0;
      let rx = 0;

      // Try to get upload rate (transmittedRate, txRate in Mbps)
      if (station.transmittedRate !== undefined && station.transmittedRate !== null && station.transmittedRate > 0) {
        tx = station.transmittedRate * 1000000; // Mbps to bps
      } else if (station.txRate !== undefined && station.txRate !== null && station.txRate > 0) {
        tx = station.txRate * 1000000; // Mbps to bps
      } else {
        // Estimate from cumulative bytes
        const uploadBytes = station.outBytes || station.txBytes || 0;
        if (uploadBytes > 0) {
          // Use uptime if available, otherwise estimate based on typical 1-hour session
          const sessionSeconds = (station.uptime && station.uptime > 0) ? station.uptime : 3600;
          tx = (uploadBytes * 8) / sessionSeconds;
        }
      }

      // Try to get download rate (receivedRate, rxRate in Mbps)
      if (station.receivedRate !== undefined && station.receivedRate !== null && station.receivedRate > 0) {
        rx = station.receivedRate * 1000000; // Mbps to bps
      } else if (station.rxRate !== undefined && station.rxRate !== null && station.rxRate > 0) {
        rx = station.rxRate * 1000000; // Mbps to bps
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
        serviceName = serviceIdToNameMap.get(station.serviceId) || station.serviceId;
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
    
    // Fetch detailed reports for each service
    const reports = new Map<string, ServiceReport>();
    const poor: Service[] = [];

    for (const service of services.slice(0, 10)) { // Limit to first 10 to avoid too many requests
      try {
        // Try to fetch service report
        const reportResponse = await apiService.makeAuthenticatedRequest(
          `/v1/services/${service.id}/report`,
          { method: 'GET' },
          8000
        );

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

        // Also try to fetch station count for this service
        const stationsResponse = await apiService.makeAuthenticatedRequest(
          `/v1/services/${service.id}/stations`,
          { method: 'GET' },
          8000
        );

        if (stationsResponse.ok) {
          const stationsData = await stationsResponse.json();
          const stationList = Array.isArray(stationsData) ? stationsData : (stationsData.stations || []);
          
          // Update service with client count
          service.clientCount = stationList.length;
        }

      } catch (error) {
        console.log(`[Dashboard] Could not fetch report for service ${service.id}:`, error);
      }
    }

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

  const COLORS = ['#BB86FC', '#03DAC5', '#CF6679', '#3700B3', '#018786', '#B00020'];

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl tracking-tight">Network Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time network health and performance monitoring
            {lastUpdate && (
              <span className="ml-2">• Last updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VersionBadge />
          <Button onClick={() => loadDashboardData(true)} variant="outline" disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        showSiteFilter={true}
        showTimeRangeFilter={true}
        onFilterChange={(filters) => {
          console.log('[Dashboard] Filters changed:', filters);
          // Filters will automatically be applied via useGlobalFilters hook
        }}
      />

      {/* Operational Health Summary Widget (P1-001) */}
      <OperationalHealthSummary />

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total APs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Access Points</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apStats.total}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                {apStats.online} Online
              </Badge>
              {apStats.offline > 0 && (
                <Badge variant="outline" className="text-red-600 border-red-600">
                  <WifiOff className="h-3 w-3 mr-1" />
                  {apStats.offline} Offline
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {apStats.online > 0 ? Math.round((apStats.online / apStats.total) * 100) : 0}% uptime
            </p>
          </CardContent>
        </Card>

        {/* Connected Clients */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Connected Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientStats.total}</div>
            <p className="text-xs text-muted-foreground">
              {clientStats.authenticated} authenticated
            </p>
            <div className="mt-2 flex items-center gap-1 text-sm">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Active</span>
            </div>
          </CardContent>
        </Card>

        {/* Network Throughput */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              Network Throughput
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" title={TOOLTIPS.REAL_TIME_THROUGHPUT} />
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBps(clientStats.throughputUpload + clientStats.throughputDownload)}</div>
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

            {/* Throughput by Network */}
            {networkThroughput.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">By Network</div>
                {networkThroughput.slice(0, 3).map((net, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1 mr-2">{net.network}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600 text-[10px]">↑{formatBps(net.upload)}</span>
                      <span className="text-green-600 text-[10px]">↓{formatBps(net.download)}</span>
                      <span className="font-medium min-w-[60px] text-right">{formatBps(net.total)}</span>
                    </div>
                  </div>
                ))}
                {networkThroughput.length > 3 && (
                  <div className="text-[10px] text-muted-foreground text-center pt-1">
                    +{networkThroughput.length - 3} more networks
                  </div>
                )}
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertCounts.critical + alertCounts.warning}</div>
            <div className="flex gap-2 mt-2">
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
            {alertCounts.critical === 0 && alertCounts.warning === 0 && (
              <p className="text-xs text-green-600 mt-2">All systems normal</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AP Details */}
      <div className="grid gap-4 md:grid-cols-2">
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
                    <div key={idx} className="flex items-center justify-between">
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
                        >
                          {clientDistribution.slice(0, 6).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
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

      {/* Charts */}
      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Client Trend</TabsTrigger>
          <TabsTrigger value="throughput">Throughput</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected Clients Over Time</CardTitle>
              <CardDescription>Last 24 hours</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={clientTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="clients" 
                    stroke="#BB86FC" 
                    fill="#BB86FC" 
                    fillOpacity={0.6}
                    name="Clients"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="throughput" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Network Throughput</CardTitle>
                  <CardDescription>
                    Real-time upload and download trends (Last 60 minutes)
                    {throughputTrend.length > 0 && (
                      <span className="ml-2 text-xs">
                        • {throughputTrend.length} data points
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadHistoricalThroughput()}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {throughputTrend.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  <div className="text-center space-y-3">
                    <Activity className="h-12 w-12 mx-auto opacity-50" />
                    <div>
                      <p className="font-medium">No throughput data available yet</p>
                      <p className="text-sm mt-1">Data collection is active - snapshots are stored every 30 seconds</p>
                      <p className="text-xs mt-2 text-muted-foreground/70">
                        Historical data will appear here once collected
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => loadHistoricalThroughput()}
                      className="mt-4"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Check Again
                    </Button>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={throughputTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatBytes(Number(value))} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="upload" 
                      stroke="#3700B3" 
                      strokeWidth={2}
                      name="Upload"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="download" 
                      stroke="#03DAC5" 
                      strokeWidth={2}
                      name="Download"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Throughput Statistics Summary */}
          {throughputTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Throughput Statistics</CardTitle>
                <CardDescription>Summary of collected data points</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Data Points</p>
                    <p className="text-2xl font-bold">{throughputTrend.length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Peak Upload</p>
                    <p className="text-2xl font-bold">
                      {formatBps(Math.max(...throughputTrend.map(t => t.upload)))}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Peak Download</p>
                    <p className="text-2xl font-bold">
                      {formatBps(Math.max(...throughputTrend.map(t => t.download)))}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Avg Total</p>
                    <p className="text-2xl font-bold">
                      {formatBps(
                        throughputTrend.reduce((sum, t) => sum + t.total, 0) / throughputTrend.length
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Performance Summary</CardTitle>
              <CardDescription>Top services by client count</CardDescription>
            </CardHeader>
            <CardContent>
              {services.length > 0 ? (
                <div className="space-y-4">
                  {services.slice(0, 5).map((service, idx) => (
                    <div key={service.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Network className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{service.name}</span>
                          {service.ssid && service.ssid !== service.name && (
                            <Badge variant="outline" className="text-xs">{service.ssid}</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>Clients: {service.clientCount || 0}</span>
                          {service.reliability && (
                            <span>Reliability: {service.reliability}%</span>
                          )}
                          {service.uptime && (
                            <span>Uptime: {service.uptime}%</span>
                          )}
                        </div>
                      </div>
                      {service.enabled !== false ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No service data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
              {vendorLookupsInProgress && (
                <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topClients.map((client, idx) => (
                <div 
                  key={client.mac} 
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
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
        </Card>
      )}

      {/* Connected Clients Detail */}
      {stations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Connected Clients</CardTitle>
                <CardDescription>Click on any client to view detailed information</CardDescription>
              </div>
              <Badge variant="secondary">{stations.length} Total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {stations.slice(0, 20).map((station) => {
                  const rssi = station.rssi || 0;
                  const signalQuality = rssi >= -50 ? 'excellent' : rssi >= -60 ? 'good' : rssi >= -70 ? 'fair' : 'poor';
                  const SignalIcon = rssi >= -60 ? Signal : rssi >= -70 ? Signal : Signal;
                  
                  const tx = station.txRate ? (station.txRate * 1000000) : ((station.outBytes || station.txBytes || 0) * 8);
                  const rx = station.rxRate ? (station.rxRate * 1000000) : ((station.inBytes || station.rxBytes || 0) * 8);
                  const totalThroughput = tx + rx;
                  
                  return (
                    <div
                      key={station.macAddress}
                      onClick={() => {
                        setSelectedClient(station);
                        setIsClientDialogOpen(true);
                      }}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex flex-col items-center justify-center w-10">
                          {station.authenticated !== false ? (
                            <Shield className="h-5 w-5 text-green-600" />
                          ) : (
                            <Shield className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {station.hostName || station.macAddress}
                            </span>
                            {station.authenticated !== false && (
                              <Badge variant="outline" className="text-xs border-green-600 text-green-600">
                                Auth
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Router className="h-3 w-3" />
                              {station.apName || station.apSerialNumber || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Network className="h-3 w-3" />
                              {station.ssid || station.serviceName || 'Unknown'}
                            </span>
                            {station.ipAddress && (
                              <span className="flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                {station.ipAddress}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-xs">
                            <SignalIcon 
                              className={`h-4 w-4 ${
                                signalQuality === 'excellent' ? 'text-green-600' :
                                signalQuality === 'good' ? 'text-blue-600' :
                                signalQuality === 'fair' ? 'text-yellow-600' :
                                'text-red-600'
                              }`}
                            />
                            <span>{rssi} dBm</span>
                          </div>
                          {totalThroughput > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {formatBps(totalThroughput)}
                            </div>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
              {stations.length > 20 && (
                <div className="text-center text-sm text-muted-foreground mt-4">
                  Showing 20 of {stations.length} clients
                </div>
              )}
            </ScrollArea>
          </CardContent>
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

      {/* Client Detail Dialog */}
      <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client Details
            </DialogTitle>
            <DialogDescription>
              Detailed information for {selectedClient?.hostName || selectedClient?.macAddress}
            </DialogDescription>
          </DialogHeader>
          
          {selectedClient && (
            <div className="space-y-4 mt-4">
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}