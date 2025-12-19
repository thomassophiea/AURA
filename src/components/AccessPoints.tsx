import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { AlertCircle, Wifi, Search, RefreshCw, Filter, Eye, Users, Activity, Signal, Cpu, HardDrive, MoreVertical, Shield, Key, RotateCcw, MapPin, Settings, AlertTriangle, Download, Trash2, Cloud, Power, WifiOff, CheckCircle2, XCircle, Building, Info } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, AccessPoint, APDetails, APStation, APQueryColumn, Site } from '../services/api';

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
        console.log('Waiting for authentication before loading sites...');
        setSites([]);
        return;
      }
      
      console.log('Loading sites for AccessPoints filter...');
      const sitesData = await apiService.getSites();
      console.log('Sites loaded for AccessPoints:', sitesData);
      
      // Ensure we have an array
      const sitesArray = Array.isArray(sitesData) ? sitesData : [];
      setSites(sitesArray);
      
      console.log(`Loaded ${sitesArray.length} sites for AccessPoints filter`);
    } catch (err) {
      // Only log if it's not an auth error
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage.includes('No access token') && !errorMessage.includes('not authenticated')) {
        console.warn('Failed to load sites for AccessPoints:', err);
      }
      // Don't show error toast for sites loading failure, just log it
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  };

  const loadAccessPointsForSite = async () => {
    setIsLoading(true);
    setError('');

    try {
      console.log('Loading access points for site:', selectedSite);

      let apsData;
      if (!selectedSite || selectedSite === 'all') {
        // Load all access points
        apsData = await apiService.getAccessPoints();
      } else {
        // Load access points for specific site
        apsData = await apiService.getAccessPointsBySite(selectedSite);
      }

      const accessPointsArray = Array.isArray(apsData) ? apsData : [];
      console.log(`Loaded ${accessPointsArray.length} access points for site ${selectedSite || 'all'}`);

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

      // Load client counts for filtered APs
      await loadClientCounts(accessPointsArray);

      // Update last refresh time on successful load
      setLastRefreshTime(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load access points for selected site';

      // Only show errors that aren't timeouts
      if (!errorMessage.includes('timeout') && !errorMessage.includes('timed out')) {
        setError(errorMessage);
        console.error('Error loading access points for site:', err);
      } else {
        // For timeout errors, just log silently and show a user-friendly message
        setError('Loading access points is taking longer than expected. The Campus Controller may be slow to respond.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadClientCounts = async (aps: AccessPoint[]) => {
    if (aps.length === 0) {
      console.log('No APs to load client counts for');
      return;
    }

    setIsLoadingClients(true);
    console.log('=== LOADING CLIENT COUNTS FOR', aps.length, 'ACCESS POINTS ===');
    
    const clientCountsByAP: Record<string, number> = {};
    
    // Initialize all APs with 0 clients
    aps.forEach(ap => {
      clientCountsByAP[ap.serialNumber] = 0;
    });
    
    console.log('Initialized client counts:', clientCountsByAP);

    try {
      // Method 1: Try individual AP queries (more reliable)
      console.log('Using individual AP station queries...');
      let successCount = 0;
      let totalClients = 0;
      
      for (const ap of aps) {
        try {
          console.log(`Querying stations for AP: ${ap.serialNumber}`);
          const stations = await apiService.getAccessPointStations(ap.serialNumber);
          const count = Array.isArray(stations) ? stations.length : 0;
          clientCountsByAP[ap.serialNumber] = count;
          totalClients += count;
          successCount++;
          
          console.log(`✓ AP ${ap.serialNumber}: ${count} clients`);
          
          // Update state incrementally so user sees progress
          setClientCounts({...clientCountsByAP});
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (stationError) {
          console.warn(`✗ Failed to load stations for AP ${ap.serialNumber}:`, stationError);
          // Keep the count at 0 for failed APs
        }
      }
      
      console.log(`=== COMPLETED: ${successCount}/${aps.length} APs, ${totalClients} total clients ===`);
      console.log('Final client counts:', clientCountsByAP);
      
      // Set final state
      setClientCounts(clientCountsByAP);
      
    } catch (err) {
      console.error('Critical error in loadClientCounts:', err);
      // Still set the counts (even if all zeros) so the UI updates
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

    // Otherwise, check the status field
    const status = ap.status?.toLowerCase();
    return status === 'online' || status === 'connected' || status === 'up' || status === 'in-service' || status === 'inservice';
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
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Access Points</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accessPoints.length}</div>
            <p className="text-xs text-muted-foreground">
              Managed devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {accessPoints.filter(ap => isAPOnline(ap)).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {accessPoints.length > 0 
                ? `${Math.round((accessPoints.filter(ap => isAPOnline(ap)).length / accessPoints.length) * 100)}%`
                : '0%'} active
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <WifiOff className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {accessPoints.filter(ap => !isAPOnline(ap)).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {accessPoints.length > 0 
                ? `${Math.round((accessPoints.filter(ap => !isAPOnline(ap)).length / accessPoints.length) * 100)}%`
                : '0%'} disconnected
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold">{getTotalClientCount()}</div>
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

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hardware Types</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getUniqueHardwareTypes().length}</div>
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
                    <TableHead>Connection</TableHead>
                    <TableHead>AP Name</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Connected Clients</TableHead>
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
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {getConnectionStatusIcon(ap)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{getAPName(ap)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {ap.serialNumber}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {ap.hostSite || 'Unknown Location'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {ap.model || ap.hardwareType || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {ap.ipAddress || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                          <Users className="h-4 w-4 text-secondary" />
                          <span className="text-sm font-semibold text-secondary">
                            {getClientCount(ap)}
                          </span>
                          {isLoadingClients && (
                            <Activity className="h-3 w-3 text-secondary/60 animate-pulse ml-1" />
                          )}
                        </div>
                      </TableCell>

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
                                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                  <Key className="mr-2 h-4 w-4" />
                                  Generate CSR
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                  <Shield className="mr-2 h-4 w-4" />
                                  Apply Signed Certificates
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <MapPin className="mr-2 h-4 w-4" />
                              Assign to Site
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Settings className="mr-2 h-4 w-4" />
                              Adoption Preference
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <AlertTriangle className="mr-2 h-4 w-4" />
                              Event Level
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Download className="mr-2 h-4 w-4" />
                              Image Upgrade
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reset to Default
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Power className="mr-2 h-4 w-4" />
                              Reboot
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Cloud className="mr-2 h-4 w-4" />
                              Release to Cloud
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={(e) => e.stopPropagation()}
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
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Wifi className="h-5 w-5" />
              <span>Access Point Details</span>
              {selectedAP?.status && (
                <Badge variant={getStatusBadgeVariant(selectedAP.status)}>
                  {selectedAP.status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {getAPName(selectedAP)}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[600px] w-full">
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
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}