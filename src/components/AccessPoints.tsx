import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DetailSlideOut } from './DetailSlideOut';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { AlertCircle, Wifi, Search, RefreshCw, Filter, Eye, Users, Activity, Signal, Cpu, HardDrive, MoreVertical, Shield, Key, RotateCcw, MapPin, Settings, AlertTriangle, Download, Trash2, Cloud, Power, WifiOff, CheckCircle2, XCircle, Building, Info, Columns } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, AccessPoint, APDetails, APStation, APQueryColumn, Site } from '../services/api';
import { toast } from 'sonner';

// Define available columns with friendly labels
interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
  category: 'basic' | 'network' | 'status' | 'performance' | 'hardware' | 'advanced';
}

const AVAILABLE_COLUMNS: ColumnConfig[] = [
  // Basic columns (always visible core columns)
  { key: 'connection', label: 'Connection Status', defaultVisible: true, category: 'basic' },
  { key: 'apName', label: 'AP Name', defaultVisible: true, category: 'basic' },
  { key: 'serialNumber', label: 'Serial Number', defaultVisible: true, category: 'basic' },
  { key: 'hostSite', label: 'Site/Location', defaultVisible: true, category: 'basic' },
  { key: 'model', label: 'Model', defaultVisible: true, category: 'basic' },
  { key: 'ipAddress', label: 'IP Address', defaultVisible: true, category: 'basic' },
  { key: 'clients', label: 'Connected Clients', defaultVisible: true, category: 'basic' },

  // Network columns
  { key: 'macAddress', label: 'MAC Address', defaultVisible: false, category: 'network' },
  { key: 'ethMode', label: 'Ethernet Mode', defaultVisible: false, category: 'network' },
  { key: 'ethSpeed', label: 'Ethernet Speed', defaultVisible: false, category: 'network' },
  { key: 'tunnel', label: 'Tunnel', defaultVisible: false, category: 'network' },
  { key: 'wiredClients', label: 'Wired Clients', defaultVisible: false, category: 'network' },

  // Status columns
  { key: 'status', label: 'Status', defaultVisible: false, category: 'status' },
  { key: 'uptime', label: 'Uptime', defaultVisible: false, category: 'status' },
  { key: 'adoptedBy', label: 'Adopted By', defaultVisible: false, category: 'status' },
  { key: 'home', label: 'Home Controller', defaultVisible: false, category: 'status' },

  // Performance columns
  { key: 'pwrUsage', label: 'Power Usage (W)', defaultVisible: false, category: 'performance' },
  { key: 'pwrSource', label: 'Power Source', defaultVisible: false, category: 'performance' },
  { key: 'channelUtilization', label: 'Avg Channel Util %', defaultVisible: false, category: 'performance' },

  // Hardware columns
  { key: 'softwareVersion', label: 'Firmware Version', defaultVisible: false, category: 'hardware' },
  { key: 'platformName', label: 'Platform', defaultVisible: false, category: 'hardware' },
  { key: 'environment', label: 'Environment', defaultVisible: false, category: 'hardware' },
  { key: 'ethPowerStatus', label: 'Ethernet Power Status', defaultVisible: false, category: 'hardware' },

  // Advanced columns
  { key: 'profileName', label: 'Profile Name', defaultVisible: false, category: 'advanced' },
  { key: 'rfMgmtPolicyName', label: 'RF Management Policy', defaultVisible: false, category: 'advanced' },
  { key: 'switchPorts', label: 'Switch Ports', defaultVisible: false, category: 'advanced' },
  { key: 'source', label: 'Location Source', defaultVisible: false, category: 'advanced' },
  { key: 'floorName', label: 'Floor Name', defaultVisible: false, category: 'advanced' },
  { key: 'description', label: 'Description', defaultVisible: false, category: 'advanced' },
];

interface AccessPointsProps {
  onShowDetail?: (serialNumber: string, displayName?: string) => void;
}

export function AccessPoints({ onShowDetail }: AccessPointsProps) {
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hardwareFilter, setHardwareFilter] = useState<string>('all');
  const [selectedAP, setSelectedAP] = useState<APDetails | null>(null);
  const [apStations, setApStations] = useState<APStation[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queryColumns, setQueryColumns] = useState<APQueryColumn[]>([]);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [, setTimeUpdateCounter] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem('apVisibleColumns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved columns:', e);
      }
    }
    return AVAILABLE_COLUMNS.filter(col => col.defaultVisible).map(col => col.key);
  });
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Load access points when selected site changes
    // This will trigger on initial load (selectedSite starts as 'all') and when user changes selection
    loadAccessPointsForSite();
  }, [selectedSite]);

  // Auto-refresh polling
  useEffect(() => {
    const REFRESH_INTERVAL = 60000; // 60 seconds

    const intervalId = setInterval(() => {
      // Only auto-refresh if the page is visible
      if (document.visibilityState === 'visible') {
        console.log('Auto-refreshing AP data...');
        setIsAutoRefreshing(true);
        loadAccessPointsForSite().finally(() => {
          setIsAutoRefreshing(false);
        });
      }
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [selectedSite]); // Re-create interval when selected site changes

  // Pause polling when tab becomes inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became active, refreshing AP data...');
        loadAccessPointsForSite();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedSite]);

  // Force re-render every 10 seconds to update "time ago" text
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeUpdateCounter(prev => prev + 1);
    }, 10000);

    return () => clearInterval(intervalId);
  }, []);

  // Save visible columns to localStorage when they change
  useEffect(() => {
    localStorage.setItem('apVisibleColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (columnKey: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnKey)) {
        return prev.filter(k => k !== columnKey);
      } else {
        return [...prev, columnKey];
      }
    });
  };

  const resetColumns = () => {
    const defaults = AVAILABLE_COLUMNS.filter(col => col.defaultVisible).map(col => col.key);
    setVisibleColumns(defaults);
  };

  const loadData = async () => {
    setError('');
    
    try {
      // Load sites first
      await loadSites();
      
      // Try to load query columns if available (optional)
      try {
        const columnsData = await apiService.getAPQueryColumns();
        setQueryColumns(Array.isArray(columnsData) ? columnsData : []);
      } catch (columnError) {
        console.log('Query columns not available:', columnError);
        setQueryColumns([]);
      }
      
      // Note: Access points will be loaded by the useEffect that watches selectedSite
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access points data');
      console.error('Error loading access points:', err);
    }
  };

  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      // Check if authenticated before making API call
      if (!apiService.isAuthenticated()) {
        setSites([]);
        return;
      }

      const sitesData = await apiService.getSites();

      // Ensure we have an array
      const sitesArray = Array.isArray(sitesData) ? sitesData : [];
      setSites(sitesArray);
    } catch (err) {
      // Silently handle errors
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  };

  const loadAccessPointsForSite = async () => {
    setIsLoading(true);
    setError('');

    try {
      let apsData;
      if (!selectedSite || selectedSite === 'all') {
        // Load all access points
        apsData = await apiService.getAccessPoints();
      } else {
        // Load access points for specific site
        apsData = await apiService.getAccessPointsBySite(selectedSite);
      }

      const accessPointsArray = Array.isArray(apsData) ? apsData : [];

      // Map sysUptime to uptime field and format it
      const enrichedAPs = accessPointsArray.map(ap => ({
        ...ap,
        uptime: ap.sysUptime ? formatUptime(ap.sysUptime) : ap.uptime,
        // Calculate average channel utilization from all radios
        channelUtilization: ap.radios && ap.radios.length > 0
          ? Math.round(ap.radios.reduce((sum: number, radio: any) => sum + (radio.channelUtilization || 0), 0) / ap.radios.length)
          : undefined
      }));

      setAccessPoints(enrichedAPs);

      // Update last refresh time on successful load
      setLastRefreshTime(new Date());

      // Load client counts in background (non-blocking)
      loadClientCounts(accessPointsArray);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load access points for selected site';

      // Only show errors that aren't timeouts
      if (!errorMessage.includes('timeout') && !errorMessage.includes('timed out')) {
        setError(errorMessage);
      } else {
        // For timeout errors, show a user-friendly message
        setError('Loading access points is taking longer than expected. The Campus Controller may be slow to respond.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientCounts = async (aps: AccessPoint[]) => {
    if (aps.length === 0) {
      return;
    }

    setIsLoadingClients(true);

    const clientCountsByAP: Record<string, number> = {};

    // Initialize all APs with 0 clients
    aps.forEach(ap => {
      clientCountsByAP[ap.serialNumber] = 0;
    });

    try {
      // Load all client counts in parallel instead of sequentially
      const promises = aps.map(async (ap) => {
        try {
          const stations = await apiService.getAccessPointStations(ap.serialNumber);
          const count = Array.isArray(stations) ? stations.length : 0;
          return { serialNumber: ap.serialNumber, count };
        } catch (error) {
          // Return 0 for failed APs
          return { serialNumber: ap.serialNumber, count: 0 };
        }
      });

      // Wait for all requests to complete in parallel
      const results = await Promise.all(promises);

      // Update counts
      results.forEach(({ serialNumber, count }) => {
        clientCountsByAP[serialNumber] = count;
      });

      // Set final state once
      setClientCounts(clientCountsByAP);

    } catch (err) {
      console.error('Error loading client counts:', err);
      setClientCounts(clientCountsByAP);
    } finally {
      setIsLoadingClients(false);
    }
  };

  const loadAPDetails = async (serialNumber: string) => {
    setIsLoadingDetails(true);
    try {
      // Try to get detailed AP information
      let apDetails: APDetails;
      try {
        apDetails = await apiService.getAccessPointDetails(serialNumber);
      } catch (detailError) {
        console.warn('Detailed AP info not available, using basic info:', detailError);
        // Fall back to basic AP info from the list
        const basicAP = accessPoints.find(ap => ap.serialNumber === serialNumber);
        if (!basicAP) {
          throw new Error('Access point not found');
        }
        apDetails = basicAP as APDetails;
      }
      
      // Try to get stations/clients for this AP
      let stations: APStation[] = [];
      try {
        const stationsData = await apiService.getAccessPointStations(serialNumber);
        stations = Array.isArray(stationsData) ? stationsData : [];
      } catch (stationError) {
        console.warn('Station data not available for AP:', serialNumber, stationError);
        stations = [];
      }
      
      setSelectedAP(apDetails);
      setApStations(stations);
      setIsModalOpen(true);
    } catch (err) {
      console.error('Error loading AP details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load AP details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'online':
      case 'connected':
      case 'up':
      case 'in-service':
      case 'inservice':
        return 'default';
      case 'offline':
      case 'disconnected':
      case 'down':
        return 'destructive';
      case 'warning':
      case 'limited':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const filteredAccessPoints = accessPoints.filter((ap) => {
    const matchesSearch = !searchTerm || 
      ap.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAPName(ap)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ap.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ap.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAPSite(ap)?.toLowerCase().includes(searchTerm.toLowerCase()); // Include site in search
    
    const matchesStatus = statusFilter === 'all' || ap.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesHardware = hardwareFilter === 'all' || ap.hardwareType === hardwareFilter;
    
    return matchesSearch && matchesStatus && matchesHardware;
  });

  const getUniqueStatuses = () => {
    const statuses = new Set(accessPoints.map(ap => ap.status).filter(Boolean));
    return Array.from(statuses);
  };

  const getUniqueHardwareTypes = () => {
    const types = new Set(accessPoints.map(ap => ap.hardwareType).filter(Boolean));
    return Array.from(types);
  };

  // Helper function to get AP name from various possible field names
  const getAPName = (ap: AccessPoint | null | undefined) => {
    if (!ap) {
      return 'Unknown AP';
    }
    
    const nameFields = [
      'displayName',
      'name', 
      'apName',
      'ap_name',
      'hostname',
      'deviceName',
      'device_name',
      'friendlyName',
      'friendly_name',
      'label',
      'identifier',
      'title'
    ];
    
    for (const field of nameFields) {
      const value = ap[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    
    // Fallback to serial number if no name fields are available
    return ap.serialNumber || '';
  };

  // Helper function to get site/location name for an AP
  const getAPSite = (ap: AccessPoint) => {
    // Define all possible location/site-related field names to check
    // Prioritize hostSite first as it contains the actual location like "LAB Remote Site"
    const locationFields = [
      'hostSite', 'location', 'locationName', 'apLocation', 'ap_location',
      'site', 'siteName', 'site_name', 'campus', 'building',
      'siteId', 'site_id', 'place', 'area', 'zone'
    ];
    
    // First try to find the actual location/site information from the AP data
    for (const field of locationFields) {
      const value = ap[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        const trimmedValue = value.trim();
        
        // Return the actual location/site value directly from the AP
        // This will show values like "LAB Remote Site" exactly as they appear in the AP data
        return trimmedValue;
      }
    }
    
    // If no direct location found, try to get it from the sites list as fallback
    if (selectedSite !== 'all' && sites.length > 0) {
      const selectedSiteObj = sites.find(s => s.id === selectedSite);
      if (selectedSiteObj) {
        return selectedSiteObj.name || selectedSiteObj.siteName || 'Selected Site';
      }
    }
    
    // Debug: Log available fields if no site/location found (only for first few APs to avoid spam)
    if (accessPoints.indexOf(ap) < 3) {
      console.log(`AP ${ap.serialNumber} COMPLETE FIELD ANALYSIS:`, {
        // Show ALL fields in the AP object
        allAPFields: Object.keys(ap).sort().map(key => `${key}: ${ap[key]}`),
        
        // Show only potential location-related fields
        locationRelatedFields: Object.keys(ap).filter(key => 
          key.toLowerCase().includes('site') || 
          key.toLowerCase().includes('location') ||
          key.toLowerCase().includes('campus') ||
          key.toLowerCase().includes('building') ||
          key.toLowerCase().includes('place') ||
          key.toLowerCase().includes('area') ||
          key.toLowerCase().includes('zone') ||
          key.toLowerCase().includes('address') ||
          key.toLowerCase().includes('room') ||
          key.toLowerCase().includes('floor')
        ).map(key => `${key}: ${ap[key]}`),
        
        // Show what fields we're specifically checking
        locationFieldsChecked: locationFields.map(field => `${field}: ${ap[field]}`),
        
        // Show filtering context
        selectedSite,
        sitesAvailable: sites.length,
        
        // Show the actual AP object structure for analysis
        rawAPObject: ap
      });
    }
    
    return '';
  };

  // Helper function to determine if AP is online
  const isAPOnline = (ap: AccessPoint) => {
    // If AP has clients connected, it's definitely online
    const clientCount = getClientCount(ap);
    if (typeof clientCount === 'number' && clientCount > 0) {
      return true;
    }

    // Check multiple possible status fields (aligned with DashboardEnhanced logic)
    const status = (ap.status || (ap as any).connectionState || (ap as any).operationalState || (ap as any).state || '').toLowerCase();
    const isUp = (ap as any).isUp;
    const isOnline = (ap as any).online;

    // Consider an AP online if:
    // 1. Status is "inservice" (case-insensitive) - this is the primary status from Campus Controller
    // 2. Status contains 'up', 'online', 'connected'
    // 3. isUp or online boolean is true
    // 4. No status field but AP exists in list (default to online)
    return (
      status === 'inservice' ||
      status.includes('up') ||
      status.includes('online') ||
      status.includes('connected') ||
      isUp === true ||
      isOnline === true ||
      (!status && isUp !== false && isOnline !== false)
    );
  };

  // Helper function to get connection status icon and color
  const getConnectionStatusIcon = (ap: AccessPoint) => {
    if (isAPOnline(ap)) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  // Helper function to get client count - now uses the clientCounts state
  const getClientCount = (ap: AccessPoint) => {
    // First check if we have a real-time count from station data
    const realTimeCount = clientCounts[ap.serialNumber];
    if (realTimeCount !== undefined) {
      return realTimeCount;
    }
    
    // Fall back to checking AP fields if available (but this is less reliable)
    const clientFields = [
      'clientCount', 
      'associatedClients', 
      'clients', 
      'connectedClients', 
      'numClients',
      'client_count',
      'associated_clients',
      'stations',
      'numStations',
      'stationCount',
      'totalClients',
      'numberOfClients',
      'activeClients',
      'clientsConnected'
    ];
    
    for (const field of clientFields) {
      const value = ap[field];
      if (typeof value === 'number' && value >= 0) {
        return value;
      }
    }
    
    // If we find an array of clients/stations, return the length
    if (Array.isArray(ap.stations)) {
      return ap.stations.length;
    }
    if (Array.isArray(ap.clients)) {
      return ap.clients.length;
    }
    
    // If we're still loading client counts, show a loading indicator
    if (isLoadingClients) {
      return '...';
    }
    
    return 0;
  };

  const getTotalClientCount = () => {
    // Sum all client counts from our accurate clientCounts state
    return Object.values(clientCounts).reduce((total, count) => total + count, 0);
  };

  // Helper function to format time ago
  const getTimeAgo = () => {
    if (!lastRefreshTime) return 'Never';

    const seconds = Math.floor((new Date().getTime() - lastRefreshTime.getTime()) / 1000);

    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Helper function to format uptime from seconds
  const formatUptime = (seconds: number): string => {
    if (seconds === 0 || !seconds) return 'N/A';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : 'N/A';
  };

  // Helper function to render column content based on column key
  const renderColumnContent = (columnKey: string, ap: AccessPoint) => {
    switch (columnKey) {
      case 'connection':
        return <div className="flex items-center justify-center">{getConnectionStatusIcon(ap)}</div>;
      case 'apName':
        return <span>{getAPName(ap)}</span>;
      case 'serialNumber':
        return <span className="font-mono text-sm">{ap.serialNumber}</span>;
      case 'hostSite':
        return (
          <div className="flex items-center space-x-1">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">{ap.hostSite || 'Unknown Location'}</span>
          </div>
        );
      case 'model':
        return <span>{ap.model || ap.hardwareType || '-'}</span>;
      case 'ipAddress':
        return <span className="font-mono text-sm">{ap.ipAddress || '-'}</span>;
      case 'clients':
        return (
          <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
            <Users className="h-4 w-4 text-secondary" />
            <span className="text-sm font-semibold text-secondary">{getClientCount(ap)}</span>
            {isLoadingClients && <Activity className="h-3 w-3 text-secondary/60 animate-pulse ml-1" />}
          </div>
        );
      case 'macAddress':
        return <span className="font-mono text-sm">{ap.macAddress || '-'}</span>;
      case 'ethMode':
        return <span className="text-sm">{(ap as any).ethMode || '-'}</span>;
      case 'ethSpeed':
        return <span className="text-sm">{(ap as any).ethSpeed || '-'}</span>;
      case 'tunnel':
        return <span className="text-sm">{(ap as any).tunnel || '-'}</span>;
      case 'wiredClients':
        return <span className="text-sm">{(ap as any).wiredClients || '0'}</span>;
      case 'status':
        return <Badge variant={getStatusBadgeVariant(ap.status || '')}>{ap.status || '-'}</Badge>;
      case 'uptime':
        return <span className="text-sm">{ap.uptime || '-'}</span>;
      case 'adoptedBy':
        return <span className="text-sm">{(ap as any).adoptedBy || '-'}</span>;
      case 'home':
        return <span className="text-sm">{(ap as any).home || '-'}</span>;
      case 'pwrUsage':
        return <span className="text-sm">{(ap as any).pwrUsage ? `${(ap as any).pwrUsage}W` : '-'}</span>;
      case 'pwrSource':
        return <span className="text-sm">{(ap as any).pwrSource || '-'}</span>;
      case 'channelUtilization':
        return <span className="text-sm">{ap.channelUtilization !== undefined ? `${ap.channelUtilization}%` : '-'}</span>;
      case 'softwareVersion':
        return <span className="font-mono text-xs">{(ap as any).softwareVersion || '-'}</span>;
      case 'platformName':
        return <span className="text-sm">{(ap as any).platformName || '-'}</span>;
      case 'environment':
        return <span className="text-sm">{(ap as any).environment || '-'}</span>;
      case 'ethPowerStatus':
        return <span className="text-sm">{(ap as any).ethPowerStatus || '-'}</span>;
      case 'profileName':
        return <span className="text-sm">{(ap as any).profileName || '-'}</span>;
      case 'rfMgmtPolicyName':
        return <span className="text-sm">{(ap as any).rfMgmtPolicyName || '-'}</span>;
      case 'switchPorts':
        return <span className="text-sm">{(ap as any).switchPorts || '-'}</span>;
      case 'source':
        return <span className="text-sm">{(ap as any).source || '-'}</span>;
      case 'floorName':
        return <span className="text-sm">{(ap as any).floorName || '-'}</span>;
      case 'description':
        return <span className="text-sm">{(ap as any).description || '-'}</span>;
      default:
        return <span className="text-sm">-</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-muted-foreground">
            Configure and monitor access points across your network infrastructure
          </p>
          {lastRefreshTime && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {getTimeAgo()}
              {isAutoRefreshing && (
                <span className="ml-2 inline-flex items-center">
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  Auto-refreshing...
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={() => {
            // Refresh both sites and access points
            loadData();
            loadAccessPointsForSite();
          }} variant="outline" size="sm" disabled={isAutoRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isAutoRefreshing ? 'animate-spin' : ''}`} />
            Refresh APs
          </Button>
          <Button
            onClick={() => loadClientCounts(accessPoints)}
            variant="outline"
            size="sm"
            disabled={isLoadingClients}
          >
            <Users className="mr-2 h-4 w-4" />
            {isLoadingClients ? 'Loading...' : 'Refresh Clients'}
          </Button>
          <Button
            onClick={() => setIsColumnDialogOpen(true)}
            variant="outline"
            size="sm"
          >
            <Columns className="mr-2 h-4 w-4" />
            Customize Columns
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Column Customization Dialog */}
      <DetailSlideOut
        isOpen={isColumnDialogOpen}
        onClose={() => setIsColumnDialogOpen(false)}
        title="Customize Table Columns"
        description="Select which columns you want to display in the Access Points table"
        width="lg"
      >
        <div className="space-y-6">
            <div className="space-y-6">
              {/* Basic Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'basic').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Network Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Network</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'network').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'status').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Performance</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'performance').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hardware Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Hardware</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'hardware').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advanced Columns */}
              <div>
                <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Advanced</h3>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_COLUMNS.filter(col => col.category === 'advanced').map(column => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.key}
                        checked={visibleColumns.includes(column.key)}
                        onCheckedChange={() => toggleColumn(column.key)}
                      />
                      <label
                        htmlFor={column.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          {/* Footer Actions */}
          <div className="flex justify-between items-center pt-6 border-t mt-6">
            <Button variant="outline" onClick={resetColumns}>
              Reset to Default
            </Button>
            <div className="text-sm text-muted-foreground">
              {visibleColumns.length} of {AVAILABLE_COLUMNS.length} columns selected
            </div>
            <Button onClick={() => setIsColumnDialogOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </DetailSlideOut>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Total Access Points</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{accessPoints.length}</div>
            <p className="text-xs text-muted-foreground">
              Managed devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">AP Status</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
              <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Online</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                    {accessPoints.filter(ap => isAPOnline(ap)).length}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({accessPoints.length > 0
                      ? `${Math.round((accessPoints.filter(ap => isAPOnline(ap)).length / accessPoints.length) * 100)}%`
                      : '0%'})
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">Offline</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-red-600">
                    {accessPoints.filter(ap => !isAPOnline(ap)).length}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({accessPoints.length > 0
                      ? `${Math.round((accessPoints.filter(ap => !isAPOnline(ap)).length / accessPoints.length) * 100)}%`
                      : '0%'})
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Total Clients</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-md group-hover:scale-110 transition-transform">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{getTotalClientCount()}</div>
              {isLoadingClients && (
                <div className="animate-pulse">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Connected devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Hardware Types</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{getUniqueHardwareTypes().length}</div>
            <p className="text-xs text-muted-foreground">
              Different models
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle className="text-headline-6 text-high-emphasis">Access Points</CardTitle>
          <CardDescription>
            {selectedSite !== 'all' 
              ? `Access points in ${sites.find(s => s.id === selectedSite)?.name || 'selected site'}. Click any access point for details.`
              : 'Click any access point to view detailed information and connected clients'
            }
          </CardDescription>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by serial number, name, model, IP, or site..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <Select value={selectedSite} onValueChange={(value) => {
              console.log('Site selection changed to:', value);
              setSelectedSite(value);
            }}>
              <SelectTrigger className="w-48">
                <Building className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.name || site.siteName || site.id}>
                    {site.name || site.siteName} {site.aps ? `(${site.aps} APs)` : ''}
                  </SelectItem>
                ))}
                {sites.length === 0 && !isLoadingSites && (
                  <SelectItem value="no-sites" disabled>
                    No sites available
                  </SelectItem>
                )}
                {isLoadingSites && (
                  <SelectItem value="loading" disabled>
                    Loading sites...
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {getUniqueStatuses().map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={hardwareFilter} onValueChange={setHardwareFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Hardware" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hardware</SelectItem>
                {getUniqueHardwareTypes().map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAccessPoints.length === 0 ? (
            <div className="text-center py-8">
              <Wifi className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Access Points Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || hardwareFilter !== 'all' 
                  ? 'No access points match your current filters.' 
                  : 'No access points are currently configured.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map(columnKey => {
                      const column = AVAILABLE_COLUMNS.find(c => c.key === columnKey);
                      return <TableHead key={columnKey}>{column?.label || columnKey}</TableHead>;
                    })}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccessPoints.map((ap) => (
                    <TableRow
                      key={ap.serialNumber}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        if (onShowDetail) {
                          onShowDetail(ap.serialNumber, getAPName(ap));
                        } else {
                          loadAPDetails(ap.serialNumber);
                        }
                      }}
                    >
                      {visibleColumns.map(columnKey => (
                        <TableCell key={columnKey}>
                          {renderColumnContent(columnKey, ap)}
                        </TableCell>
                      ))}

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>AP Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                loadAPDetails(ap.serialNumber);
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Shield className="mr-2 h-4 w-4" />
                                Manage Certificate
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const result = await apiService.generateCSR(ap.serialNumber);
                                    toast.success('CSR generated successfully');
                                    console.log('[AccessPoints] Generated CSR:', result);
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Failed to generate CSR');
                                  }
                                }}>
                                  <Key className="mr-2 h-4 w-4" />
                                  Generate CSR
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info('Certificate upload feature coming soon');
                                }}>
                                  <Shield className="mr-2 h-4 w-4" />
                                  Apply Signed Certificates
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              toast.info('Site assignment dialog coming soon');
                            }}>
                              <MapPin className="mr-2 h-4 w-4" />
                              Assign to Site
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              toast.info('Adoption preference dialog coming soon');
                            }}>
                              <Settings className="mr-2 h-4 w-4" />
                              Adoption Preference
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              toast.info('Event level dialog coming soon');
                            }}>
                              <AlertTriangle className="mr-2 h-4 w-4" />
                              Event Level
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await apiService.upgradeAPImage(ap.serialNumber);
                                toast.success('Firmware upgrade initiated');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed to upgrade firmware');
                              }
                            }}>
                              <Download className="mr-2 h-4 w-4" />
                              Image Upgrade
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Reset ${getAPName(ap)} to factory defaults? This cannot be undone.`)) {
                                try {
                                  await apiService.resetAPToDefault(ap.serialNumber);
                                  toast.success('Factory reset initiated');
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Failed to reset AP');
                                }
                              }
                            }}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reset to Default
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await apiService.rebootAP(ap.serialNumber);
                                toast.success('AP reboot initiated');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Failed to reboot AP');
                              }
                            }}>
                              <Power className="mr-2 h-4 w-4" />
                              Reboot
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Release ${getAPName(ap)} to cloud management?`)) {
                                try {
                                  await apiService.releaseToCloud(ap.serialNumber);
                                  toast.success('AP released to cloud');
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Failed to release to cloud');
                                }
                              }
                            }}>
                              <Cloud className="mr-2 h-4 w-4" />
                              Release to Cloud
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Delete ${getAPName(ap)}? This will remove the AP from the controller.`)) {
                                  try {
                                    await apiService.deleteAP(ap.serialNumber);
                                    toast.success('AP deleted successfully');
                                    // Refresh AP list
                                    loadAccessPoints();
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Failed to delete AP');
                                  }
                                }
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AP Details Modal */}
      <DetailSlideOut
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Access Point Details${selectedAP?.status ? ` - ${selectedAP.status}` : ''}`}
        description={getAPName(selectedAP)}
        width="xl"
      >
        <div className="space-y-4">
            {isLoadingDetails ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : selectedAP ? (
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="clients">
                    Clients ({apStations.length})
                  </TabsTrigger>
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Serial Number:</span>
                          <span className="font-mono">{selectedAP.serialNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">AP Name:</span>
                          <span>{getAPName(selectedAP)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Model:</span>
                          <span>{selectedAP.model || selectedAP.hardwareType || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">IP Address:</span>
                          <span className="font-mono">{selectedAP.ipAddress || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">MAC Address:</span>
                          <span className="font-mono">{selectedAP.macAddress || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Location:</span>
                          <span>{selectedAP.location || selectedAP.site || 'N/A'}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Performance Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Connected Clients:</span>
                          <div className="flex items-center space-x-1">
                            <Users className="h-4 w-4" />
                            <span>{selectedAP ? getClientCount(selectedAP as AccessPoint) : apStations.length}</span>
                          </div>
                        </div>
                        {selectedAP.uptime && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Uptime:</span>
                            <span>{selectedAP.uptime}</span>
                          </div>
                        )}
                        {selectedAP.channel && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Channel:</span>
                            <span>{selectedAP.channel}</span>
                          </div>
                        )}
                        {selectedAP.txPower && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">TX Power:</span>
                            <span>{selectedAP.txPower} dBm</span>
                          </div>
                        )}
                        {selectedAP.channelUtilization !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Channel Utilization:</span>
                            <span>{selectedAP.channelUtilization}%</span>
                          </div>
                        )}
                        {selectedAP.cpuUsage !== undefined && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">CPU Usage:</span>
                            <div className="flex items-center space-x-1">
                              <Cpu className="h-4 w-4" />
                              <span>{selectedAP.cpuUsage}%</span>
                            </div>
                          </div>
                        )}
                        {selectedAP.memoryUsage !== undefined && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Memory Usage:</span>
                            <div className="flex items-center space-x-1">
                              <HardDrive className="h-4 w-4" />
                              <span>{selectedAP.memoryUsage}%</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="clients" className="space-y-4">
                  {apStations.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Connected Clients</h3>
                      <p className="text-muted-foreground">
                        This access point currently has no connected client devices.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>MAC Address</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Signal Strength</TableHead>
                            <TableHead>Connected Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {apStations.map((station, index) => (
                            <TableRow key={station.macAddress || index}>
                              <TableCell className="font-mono text-sm">
                                {station.macAddress || 'N/A'}
                              </TableCell>
                              <TableCell>{station.name || station.hostname || 'Unknown Device'}</TableCell>
                              <TableCell>
                                <Badge variant={station.status === 'connected' ? 'default' : 'secondary'}>
                                  {station.status || 'Connected'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {station.rssi && (
                                  <div className="flex items-center space-x-1">
                                    <Signal className="h-4 w-4" />
                                    <span>{station.rssi} dBm</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {station.connectedTime || station.uptime || 'N/A'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="technical" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Technical Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {Object.entries(selectedAP).map(([key, value]) => {
                          // Skip showing certain fields we already display elsewhere
                          if (['serialNumber', 'displayName', 'model', 'hardwareType', 'ipAddress', 'macAddress', 'location', 'site', 'status'].includes(key)) {
                            return null;
                          }
                          
                          // Skip null/undefined values
                          if (value === null || value === undefined || value === '') {
                            return null;
                          }
                          
                          return (
                            <div key={key} className="flex justify-between py-1 border-b border-gray-100 last:border-b-0">
                              <span className="text-muted-foreground capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim()}:
                              </span>
                              <span className="font-mono text-xs">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : null}
        </div>
      </DetailSlideOut>
    </div>
  );
}