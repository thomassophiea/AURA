import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { AlertCircle, Users, Search, RefreshCw, Filter, Wifi, Activity, Timer, Signal, Download, Upload, Shield, Router, MapPin, Building, User, Clock, Star, Trash2, UserX, RotateCcw, UserPlus, UserMinus, ShieldCheck, ShieldX, Info, Radio, WifiOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Cable, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, Station } from '../services/api';
import { trafficService } from '../services/traffic';
import { identifyClient, lookupVendor, suggestDeviceType } from '../services/ouiLookup';
import { isRandomizedMac, getMacAddressInfo } from '../services/macAddressUtils';
import { toast } from 'sonner';

interface ConnectedClientsProps {
  onShowDetail?: (macAddress: string, hostName?: string) => void;
}

export function TrafficStatsConnectedClients({ onShowDetail }: ConnectedClientsProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [apFilter, setApFilter] = useState<string>('all');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>('all');
  const [macTypeFilter, setMacTypeFilter] = useState<string>('all'); // all, randomized, permanent
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [stationEvents, setStationEvents] = useState<any[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [stationTrafficData, setStationTrafficData] = useState<Map<string, any>>(new Map());
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);

  // GDPR state
  const [isGdprDeleteDialogOpen, setIsGdprDeleteDialogOpen] = useState(false);
  const [isDeletingClientData, setIsDeletingClientData] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    // Check authentication before loading
    if (!apiService.isAuthenticated()) {
      console.warn('[TrafficStatsConnectedClients] User not authenticated, skipping data load');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Use the new correlation method to get stations with proper site information
      const stationsData = await apiService.getStationsWithSiteCorrelation();
      const stationsArray = Array.isArray(stationsData) ? stationsData : [];
      setStations(stationsArray);
      setTotalItems(stationsArray.length);

      // Load traffic statistics for all stations with pagination
      if (stationsArray.length > 0) {
        await loadTrafficStatisticsForCurrentPage(stationsArray);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connected clients');
      console.error('Error loading stations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load traffic statistics for the current page of filtered stations
  const loadTrafficStatisticsForCurrentPage = async (stationsList: Station[]) => {
    setIsLoadingTraffic(true);

    try {
      // Calculate pagination offset
      const offset = (currentPage - 1) * itemsPerPage;

      // Load traffic data with pagination support
      const trafficMap = await trafficService.loadTrafficStatisticsForStations(
        stationsList,
        itemsPerPage,
        offset
      );

      setStationTrafficData(trafficMap);

      console.log(`[TrafficStats] Loaded traffic for page ${currentPage} (${trafficMap.size} stations)`);
    } catch (error) {
      console.warn('Error loading traffic statistics:', error);
      toast.error('Failed to load traffic statistics', {
        description: 'Some traffic data may be unavailable'
      });
    } finally {
      setIsLoadingTraffic(false);
    }
  };

  // Reload traffic when page changes
  useEffect(() => {
    if (stations.length > 0) {
      loadTrafficStatisticsForCurrentPage(stations);
    }
  }, [currentPage, itemsPerPage]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'connected':
      case 'associated':
      case 'active':
        return 'default';
      case 'disconnected':
      case 'inactive':
        return 'destructive';
      case 'idle':
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (duration: string | number) => {
    if (!duration) return 'N/A';
    if (typeof duration === 'string') return duration;
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatLastSeen = (lastSeenTimestamp: string | undefined) => {
    if (!lastSeenTimestamp) return null;
    
    try {
      const lastSeenDate = new Date(lastSeenTimestamp);
      const now = new Date();
      const diffMs = now.getTime() - lastSeenDate.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSeconds < 60) {
        return 'Just now';
      } else if (diffMinutes < 60) {
        return `${diffMinutes} min${diffMinutes !== 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
      } else if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      } else {
        // For older dates, show the actual date
        return lastSeenDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: diffDays > 365 ? 'numeric' : undefined
        });
      }
    } catch (error) {
      return lastSeenTimestamp; // Return as-is if parsing fails
    }
  };

  const getBandFromRadioId = (radioId: number | undefined) => {
    switch (radioId) {
      case 1:
        return { band: '2.4 GHz', color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
      case 2:
        return { band: '5 GHz', color: 'text-green-500', bgColor: 'bg-green-500/10' };
      case 3:
        return { band: '6 GHz', color: 'text-purple-500', bgColor: 'bg-purple-500/10' };
      case 20:
        return { band: 'Eth1 Wired', color: 'text-orange-500', bgColor: 'bg-orange-500/10' };
      default:
        return { band: 'Unknown', color: 'text-muted-foreground', bgColor: 'bg-muted/10' };
    }
  };

  const getSignalStrengthIndicator = (rss: number | undefined, radioId: number | undefined) => {
    // Handle wired connections (radioId 20 = Eth1 Wired)
    if (radioId === 20) {
      return {
        icon: Cable,
        color: 'text-blue-500',
        label: 'Wired',
        quality: 'Ethernet',
        bgColor: 'bg-blue-500/10'
      };
    }

    // Handle wireless connections without signal data
    if (rss === undefined || rss === null) {
      return {
        icon: WifiOff,
        color: 'text-muted-foreground',
        label: 'No Signal',
        quality: 'No Data',
        bgColor: 'bg-muted/10'
      };
    }

    // RSSI is typically negative, closer to 0 is better (wireless only)
    if (rss >= -30) {
      return {
        icon: Signal,
        color: 'text-green-500',
        label: `${rss} dBm`,
        quality: 'Excellent',
        bgColor: 'bg-green-500/10'
      };
    } else if (rss >= -50) {
      return {
        icon: SignalHigh,
        color: 'text-green-400',
        label: `${rss} dBm`,
        quality: 'Very Good',
        bgColor: 'bg-green-400/10'
      };
    } else if (rss >= -60) {
      return {
        icon: SignalMedium,
        color: 'text-yellow-500',
        label: `${rss} dBm`,
        quality: 'Good',
        bgColor: 'bg-yellow-500/10'
      };
    } else if (rss >= -70) {
      return {
        icon: SignalLow,
        color: 'text-orange-500',
        label: `${rss} dBm`,
        quality: 'Fair',
        bgColor: 'bg-orange-500/10'
      };
    } else {
      return {
        icon: SignalZero,
        color: 'text-red-500',
        label: `${rss} dBm`,
        quality: 'Poor',
        bgColor: 'bg-red-500/10'
      };
    }
  };

  // Filter stations based on search and filters
  const filteredStations = stations.filter((station) => {
    const matchesSearch = !searchTerm ||
      station.macAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.ipAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.hostName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.apName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.apSerial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.siteName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.network?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      station.deviceType?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || station.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesAP = apFilter === 'all' || station.apSerial === apFilter || station.apName === apFilter;
    const matchesSite = selectedSite === 'all' || station.siteName === selectedSite;
    const matchesDeviceType = deviceTypeFilter === 'all' || station.deviceType === deviceTypeFilter;

    // MAC address type filter
    let matchesMacType = true;
    if (macTypeFilter === 'randomized') {
      matchesMacType = isRandomizedMac(station.macAddress);
    } else if (macTypeFilter === 'permanent') {
      matchesMacType = !isRandomizedMac(station.macAddress);
    }

    return matchesSearch && matchesStatus && matchesAP && matchesSite && matchesDeviceType && matchesMacType;
  });

  // Pagination calculations
  const totalFilteredItems = filteredStations.length;
  const totalPages = Math.ceil(totalFilteredItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFilteredItems);
  const paginatedStations = filteredStations.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, apFilter, selectedSite, deviceTypeFilter, macTypeFilter]);

  const getUniqueStatuses = () => {
    const statuses = new Set(stations.map(station => station.status).filter(Boolean));
    return Array.from(statuses);
  };

  const getUniqueAPs = () => {
    const aps = new Set(stations.map(station => station.apName || station.apSerial).filter(Boolean));
    return Array.from(aps);
  };

  const getUniqueSites = () => {
    const sites = new Set(stations.map(station => station.siteName).filter(Boolean));
    return Array.from(sites);
  };

  const getUniqueDeviceTypes = () => {
    const deviceTypes = new Set(stations.map(station => station.deviceType).filter(Boolean));
    return Array.from(deviceTypes);
  };

  const getUniqueNetworks = () => {
    const networks = new Set(stations.map(station => station.network).filter(Boolean));
    return Array.from(networks);
  };

  const getTotalTraffic = () => {
    return stations.reduce((total, station) => {
      const trafficData = stationTrafficData.get(station.macAddress);
      if (trafficData) {
        const inBytes = trafficData.inBytes || 0;
        const outBytes = trafficData.outBytes || 0;
        return total + inBytes + outBytes;
      }
      // Fallback to station data if traffic data not available
      const rx = station.rxBytes || station.clientBandwidthBytes || 0;
      const tx = station.txBytes || station.outBytes || 0;
      return total + rx + tx;
    }, 0);
  };

  const getActiveClientsCount = () => {
    return stations.filter(station => 
      station.status?.toLowerCase() === 'connected' || 
      station.status?.toLowerCase() === 'associated' ||
      station.status?.toLowerCase() === 'active'
    ).length;
  };

  const getDisconnectedClientsCount = () => {
    return stations.filter(station => 
      station.status?.toLowerCase() === 'disconnected' ||
      station.status?.toLowerCase() === 'inactive'
    ).length;
  };

  const getUniqueNetworkCount = () => {
    return getUniqueNetworks().length;
  };

  const getUniqueSiteCount = () => {
    return getUniqueSites().length;
  };

  const getRandomizedMacCount = () => {
    return stations.filter(station => isRandomizedMac(station.macAddress)).length;
  };

  const getPermanentMacCount = () => {
    return stations.filter(station => !isRandomizedMac(station.macAddress)).length;
  };

  const handleStationSelect = (macAddress: string, checked: boolean) => {
    const newSelection = new Set(selectedStations);
    if (checked) {
      newSelection.add(macAddress);
    } else {
      newSelection.delete(macAddress);
    }
    setSelectedStations(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all stations on current page
      const allMacAddresses = new Set(paginatedStations.map(station => station.macAddress));
      setSelectedStations(allMacAddresses);
    } else {
      setSelectedStations(new Set());
    }
  };

  // GDPR: Download client data as JSON (supports multiple clients)
  const handleDownloadClientData = () => {
    const selectedStationsList = stations.filter(s => selectedStations.has(s.macAddress));
    if (selectedStationsList.length === 0) {
      toast.error('No clients selected');
      return;
    }

    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        gdprDataExport: true,
        exportType: selectedStationsList.length === 1 ? 'single_client' : 'bulk_export',
        totalClients: selectedStationsList.length,
        clients: selectedStationsList.map(station => {
          const trafficData = stationTrafficData.get(station.macAddress);
          return {
            clientIdentifier: station.macAddress,
            basicInformation: {
              macAddress: station.macAddress,
              ipAddress: station.ipAddress,
              hostname: station.hostName,
              username: station.username,
              deviceType: station.deviceType,
              manufacturer: station.manufacturer,
              osType: station.osType,
            },
            networkInformation: {
              siteName: station.siteName,
              siteId: station.siteId,
              accessPoint: station.apName,
              apSerial: station.apSerial,
              network: station.network,
              ssid: station.ssid,
              role: station.role,
              vlan: station.vlan,
              radioId: station.radioId,
              channel: station.channel,
            },
            connectionStatus: {
              status: station.status,
              lastSeen: station.lastSeen,
            },
            trafficStatistics: {
              inBytes: trafficData?.inBytes || station.rxBytes || 0,
              outBytes: trafficData?.outBytes || station.txBytes || 0,
            },
            signalQuality: {
              rss: trafficData?.rss || station.rss,
              rssi: station.rssi,
              snr: station.snr,
            },
          };
        }),
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = selectedStationsList.length === 1
        ? `client-data-${selectedStationsList[0].macAddress.replace(/:/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
        : `client-data-export-${selectedStationsList.length}-clients-${new Date().toISOString().split('T')[0]}.json`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported data for ${selectedStationsList.length} client${selectedStationsList.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('[TrafficStatsConnectedClients] Error exporting client data:', error);
      toast.error('Failed to export client data');
    }
  };

  // GDPR: Delete client data
  const handleDeleteClientData = async () => {
    if (selectedStations.size === 0) {
      toast.error('No clients selected');
      return;
    }

    setIsDeletingClientData(true);
    try {
      const macAddresses = Array.from(selectedStations);
      await apiService.bulkDeleteStations(macAddresses);

      toast.success(`Deleted data for ${macAddresses.length} client${macAddresses.length > 1 ? 's' : ''}`);
      setIsGdprDeleteDialogOpen(false);
      setSelectedStations(new Set());

      // Refresh the stations list
      await loadStations();
    } catch (error) {
      console.error('[TrafficStatsConnectedClients] Error deleting client data:', error);
      toast.error('Failed to delete client data');
    } finally {
      setIsDeletingClientData(false);
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
            Monitor and manage connected wireless client devices across your network with real-time traffic statistics and signal strength (RSSI)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={loadStations} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && getRandomizedMacCount() > 0 && (
        <Alert>
          <Shuffle className="h-4 w-4" />
          <AlertDescription>
            <strong>{getRandomizedMacCount()} of {stations.length} clients</strong> are using randomized MAC addresses for privacy. 
            These addresses change periodically to prevent device tracking across networks.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <div className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{stations.length}</div>
            <p className="text-xs text-muted-foreground">
              Connected devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Active Connections</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">{getActiveClientsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-rose-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-pink-500/10 rounded-full blur-2xl group-hover:bg-pink-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Randomized MACs</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 shadow-md group-hover:scale-110 transition-transform">
              <Shuffle className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">{getRandomizedMacCount()}</div>
            <p className="text-xs text-muted-foreground">
              Privacy-enabled devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Disconnected</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 shadow-md group-hover:scale-110 transition-transform">
              <WifiOff className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">{getDisconnectedClientsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Recently offline
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Total Traffic</CardTitle>
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
              <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{formatBytes(getTotalTraffic())}</div>
            <p className="text-xs text-muted-foreground">
              Data transferred {isLoadingTraffic && "(loading...)"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GDPR Data Rights Panel - Compact */}
      <Card className="border border-blue-500/50 bg-gradient-to-r from-blue-950/20 to-indigo-950/20">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              <span className="font-medium text-sm">GDPR</span>
              <span className="text-xs text-muted-foreground">
                {selectedStations.size > 0
                  ? `${selectedStations.size} selected`
                  : 'Select clients below'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                onClick={handleDownloadClientData}
                disabled={selectedStations.size === 0}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Download ({selectedStations.size})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                onClick={() => setIsGdprDeleteDialogOpen(true)}
                disabled={selectedStations.size === 0}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete ({selectedStations.size})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GDPR Delete Confirmation Dialog */}
      <Dialog open={isGdprDeleteDialogOpen} onOpenChange={setIsGdprDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirm Data Deletion
            </DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>
                You are about to permanently delete all data for <strong>{selectedStations.size} client{selectedStations.size > 1 ? 's' : ''}</strong>.
              </p>
              <div className="bg-muted p-3 rounded-lg font-mono text-xs max-h-32 overflow-y-auto">
                {Array.from(selectedStations).map(mac => {
                  const station = stations.find(s => s.macAddress === mac);
                  return (
                    <div key={mac} className="py-1 border-b last:border-0">
                      <span className="font-medium">{mac}</span>
                      {station?.hostName && <span className="text-muted-foreground ml-2">({station.hostName})</span>}
                    </div>
                  );
                })}
              </div>
              <p className="text-red-600 font-medium">
                This action cannot be undone. All connection history, events, and statistics
                for these devices will be permanently removed.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsGdprDeleteDialogOpen(false)}
              disabled={isDeletingClientData}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClientData}
              disabled={isDeletingClientData}
            >
              {isDeletingClientData ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All Data ({selectedStations.size})
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle>Device Monitoring & Traffic Analytics</CardTitle>
          <CardDescription>
            Select clients using checkboxes to manage GDPR data rights. Click any client to view detailed connection information. Signal strength (RSS/RSSI) included.
          </CardDescription>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-[2] min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name, MAC, device type, or site..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="w-48 h-10">
                <Building className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {getUniqueSites().map((site) => (
                  <SelectItem key={site} value={site}>{site}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={apFilter} onValueChange={setApFilter}>
              <SelectTrigger className="w-36 h-10">
                <Wifi className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Access Point" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {getUniqueAPs().map((ap) => (
                  <SelectItem key={ap} value={ap}>{ap}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={macTypeFilter} onValueChange={setMacTypeFilter}>
              <SelectTrigger className="w-48 h-10">
                <Shuffle className="mr-2 h-4 w-4" />
                <SelectValue placeholder="MAC Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MACs</SelectItem>
                <SelectItem value="randomized">Randomized Only</SelectItem>
                <SelectItem value="permanent">Permanent Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredStations.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Connected Clients Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || apFilter !== 'all' || selectedSite !== 'all' || deviceTypeFilter !== 'all' || macTypeFilter !== 'all'
                  ? 'No clients match your current filters.' 
                  : 'No clients are currently connected to the network.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="w-12 p-2 text-[10px]">
                      <Checkbox
                        checked={selectedStations.size === paginatedStations.length && paginatedStations.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="h-3 w-3"
                      />
                    </TableHead>
                    <TableHead className="w-20 p-2 text-[10px]">Status / Last Seen</TableHead>
                    <TableHead className="w-28 p-2 text-[10px]">Client Info</TableHead>
                    <TableHead className="w-32 p-2 text-[10px]">Device Info</TableHead>
                    <TableHead className="w-28 p-2 text-[10px]">User & Network</TableHead>
                    <TableHead className="w-28 p-2 text-[10px]">Access Point</TableHead>
                    <TableHead className="w-20 p-2 text-[10px]">Band</TableHead>
                    <TableHead className="w-24 p-2 text-[10px]">Signal Strength</TableHead>
                    <TableHead className="w-32 p-2 text-[10px]">Traffic Statistics</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStations.map((station, index) => {
                    const trafficData = stationTrafficData.get(station.macAddress);
                    
                    return (
                      <TableRow 
                        key={station.macAddress || index}
                        className="cursor-pointer hover:bg-muted/50 h-10"
                        onClick={(e) => {
                          // Don't trigger row click if clicking on checkbox
                          if ((e.target as HTMLElement).closest('[data-checkbox]')) {
                            return;
                          }
                          if (onShowDetail) {
                            onShowDetail(station.macAddress, station.hostName);
                          } else {
                            setSelectedStation(station);
                            setIsModalOpen(true);
                          }
                        }}
                      >
                        <TableCell className="p-1" data-checkbox>
                          <Checkbox
                            checked={selectedStations.has(station.macAddress)}
                            onCheckedChange={(checked) => handleStationSelect(station.macAddress, checked as boolean)}
                            className="h-3 w-3"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <div className="space-y-0.5">
                            {station.status ? (
                              <Badge variant={getStatusBadgeVariant(station.status)} className="text-[9px] px-1 py-0 h-3 min-h-0">
                                {station.status}
                              </Badge>
                            ) : (
                              '-'
                            )}
                            {station.status?.toLowerCase() === 'disconnected' && station.lastSeen && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-0.5 text-muted-foreground">
                                    <Clock className="h-2 w-2 flex-shrink-0" />
                                    <span className="text-[8px] leading-none">
                                      {formatLastSeen(station.lastSeen)}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Last seen: {new Date(station.lastSeen).toLocaleString()}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-medium text-[12px] leading-none">
                                {station.hostName || station.macAddress}
                              </span>
                              {isRandomizedMac(station.macAddress) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Shuffle className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-medium">Randomized MAC Address</p>
                                    <p className="text-xs">Privacy feature - prevents device tracking</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {station.hostName && (
                              <div className="font-mono text-[10px] text-muted-foreground leading-none mb-0.5">
                                {station.macAddress}
                              </div>
                            )}
                            <div className="font-mono text-[10px] text-muted-foreground leading-none">
                              {station.ipAddress || 'No IP'}
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="p-0.5 w-16">
                          <div className="space-y-0.5 max-w-16">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-0.5">
                                  <MapPin className="h-2 w-2 text-muted-foreground flex-shrink-0" />
                                  <span className="text-[9px] truncate leading-none">{station.siteName || '-'}</span>
                                  {station.siteRating !== undefined && (
                                    <>
                                      <Star className="h-2 w-2 text-yellow-500 flex-shrink-0" />
                                      <span className="text-[8px] leading-none">{station.siteRating}</span>
                                    </>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{station.siteName || '-'}</p>
                              </TooltipContent>
                            </Tooltip>
                            {station.deviceType && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[8px] h-2.5 px-1 py-0 max-w-14">
                                    <span className="truncate">{station.deviceType}</span>
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{station.deviceType}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {station.manufacturer && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="text-[10px] text-muted-foreground leading-none truncate max-w-14">
                                    {station.manufacturer}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{station.manufacturer}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <div>
                            {station.role && (
                              <div className="text-[13px] text-muted-foreground leading-none mb-0.5">{station.role}</div>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <div>
                            {(station.apName || station.apDisplayName || station.apHostname || station.accessPointName) && (
                              <div className="text-[12px] font-medium leading-none mb-0.5 truncate">
                                {station.apName || station.apDisplayName || station.apHostname || station.accessPointName}
                              </div>
                            )}
                            {station.apSerial && (
                              <div className="font-mono text-[8px] text-muted-foreground truncate leading-none mb-0.5">
                                {station.apSerial}
                              </div>
                            )}
                            <div className="flex items-center gap-0.5">
                              <Clock className="h-2 w-2 text-muted-foreground flex-shrink-0" />
                              <span className="text-[10px] leading-none">{station.lastSeen || '-'}</span>
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 hover:scale-105 ${getBandFromRadioId(station.radioId || station.radio)?.bgColor || 'bg-muted/10'}`}>
                                <Radio className={`h-2 w-2 ${getBandFromRadioId(station.radioId || station.radio)?.color || 'text-muted-foreground'}`} />
                                <span className={`text-[10px] font-medium ${getBandFromRadioId(station.radioId || station.radio)?.color || 'text-muted-foreground'}`}>
                                  {getBandFromRadioId(station.radioId || station.radio)?.band || 'Unknown'}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Radio Band: {getBandFromRadioId(station.radioId || station.radio)?.band || 'Unknown'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        
                        <TableCell className="p-1">
                          {(() => {
                            const trafficData = stationTrafficData.get(station.macAddress);
                            const rssValue = trafficData?.rss ?? station.rss ?? station.signalStrength;
                            const radioId = station.radioId || station.radio;
                            const signalInfo = getSignalStrengthIndicator(rssValue, radioId);
                            const SignalIcon = signalInfo.icon;
                            
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 hover:scale-105 ${signalInfo.bgColor}`}>
                                    <SignalIcon className={`h-2 w-2 ${signalInfo.color}`} />
                                    <span className={`text-[10px] font-medium ${signalInfo.color}`}>
                                      {radioId === 20 ? signalInfo.label : (rssValue !== undefined ? `${rssValue}` : '-')}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-center">
                                    <p className="font-medium">{signalInfo.quality}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {radioId === 20 
                                        ? 'Physical ethernet connection'
                                        : (rssValue !== undefined ? `${rssValue} dBm` : 'No signal data')
                                      }
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </TableCell>
                        
                        <TableCell className="p-1">
                          <div className="space-y-0.5">
                            {trafficData ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1">
                                      <Download className="h-2 w-2 text-green-500" />
                                      <span className="text-[10px] text-green-600 font-medium">
                                        {formatBytes(trafficData.inBytes || 0)}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Inbound: {formatBytes(trafficData.inBytes || 0)}</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1">
                                      <Upload className="h-2 w-2 text-blue-500" />
                                      <span className="text-[10px] text-blue-600 font-medium">
                                        {formatBytes(trafficData.outBytes || 0)}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Outbound: {formatBytes(trafficData.outBytes || 0)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </>
                            ) : isLoadingTraffic ? (
                              <div className="flex items-center gap-1">
                                <div className="animate-spin h-2 w-2 border border-muted-foreground border-t-transparent rounded-full"></div>
                                <span className="text-[8px] text-muted-foreground">Loading...</span>
                              </div>
                            ) : (
                              <div className="text-[8px] text-muted-foreground">No data</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalFilteredItems > 0 && (
            <div className="flex items-center justify-between px-2 py-4 border-t">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{endIndex} of {totalFilteredItems} clients
                  {isLoadingTraffic && <span className="ml-2 text-xs">(loading traffic...)</span>}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">Per page:</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}