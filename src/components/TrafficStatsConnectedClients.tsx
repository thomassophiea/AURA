import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { AlertCircle, Users, RefreshCw, Wifi, Activity, Timer, Signal, Download, Upload, Shield, Router, MapPin, User, Clock, Star, Trash2, UserX, RotateCcw, UserPlus, UserMinus, ShieldCheck, ShieldX, Info, Radio, WifiOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Cable, Shuffle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, ArrowUpDown, ArrowUp, ArrowDown, Settings2, Columns, Building } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, Station, Site } from '../services/api';
import { trafficService } from '../services/traffic';
import { identifyClient, lookupVendor, suggestDeviceType } from '../services/ouiLookup';
import { isRandomizedMac, getMacAddressInfo } from '../services/macAddressUtils';
import { resolveClientIdentity, type ClientIdentity } from '../lib/clientIdentity';
import { toast } from 'sonner';
import { SaveToWorkspace } from './SaveToWorkspace';
import { ExportButton } from './ExportButton';
import { SearchFilterBar } from './SearchFilterBar';
import { useCompoundSearch } from '../hooks/useCompoundSearch';
import { useTableCustomization } from '../hooks/useTableCustomization';
import { DetailSlideOut } from './DetailSlideOut';
import { DEVICE_MONITORING_COLUMNS } from '../config/deviceMonitoringColumns';
import { useAppContext } from '@/contexts/AppContext';
import { Server } from 'lucide-react';

interface ConnectedClientsProps {
  onShowDetail?: (macAddress: string, hostName?: string) => void;
}

export function TrafficStatsConnectedClients({ onShowDetail }: ConnectedClientsProps) {
  const { navigationScope, siteGroups, orgSiteGroupFilter } = useAppContext();
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [sites, setSites] = useState<Site[]>([]);

  const { query: searchQuery, setQuery: setSearchQuery, filterRows: filterBySearch, hasActiveSearch } = useCompoundSearch<Station>({
    storageKey: 'client-search',
    fields: [
      s => s.hostName,
      s => s.macAddress,
      s => s.ipAddress,
      s => s.siteName,
      s => s.apName || (s as any).apDisplayName || (s as any).apHostname,
      s => (s as any).deviceType,
      s => (s as any).manufacturer,
      s => (s as any).username,
      s => s.network || (s as any).ssid || (s as any).serviceName,
      s => (s as any).vlan?.toString() || (s as any).vlanId?.toString(),
      s => s.status,
      s => (s as any).band || (s as any).frequencyBand,
    ],
  });


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

  // Sorting state
  type SortField = 'hostName' | 'macAddress' | 'ipAddress' | 'status' | 'apName' | 'ssid' | 'signalStrength' | 'band' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Column customization state
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);

  // Column customization hook
  const columnCustomization = useTableCustomization({
    tableId: 'device-monitoring',
    columns: DEVICE_MONITORING_COLUMNS,
    storageKey: 'deviceMonitoringVisibleColumns',
    enableViews: false,
    enablePersistence: true
  });

  // Memoize stations with traffic data for column rendering
  const stationsWithTraffic = useMemo(() => {
    return stations.map(station => ({
      ...station,
      trafficData: stationTrafficData.get(station.macAddress)
    }));
  }, [stations, stationTrafficData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const loadSites = async () => {
    try {
      let allSites: Site[] = [];
      if (navigationScope === 'global' && siteGroups.length > 0) {
        const originalBaseUrl = apiService.getBaseUrl();
        for (const sg of siteGroups) {
          try {
            apiService.setBaseUrl(`${sg.controller_url}/management`);
            const sgSites = await apiService.getSites();
            allSites.push(...(Array.isArray(sgSites) ? sgSites : []));
          } catch (err) {
            console.warn(`[ConnectedClients] Failed to fetch sites from ${sg.name}:`, err);
          }
        }
        apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
      } else {
        const sitesData = await apiService.getSites();
        allSites = Array.isArray(sitesData) ? sitesData : [];
      }
      // Normalize name and deduplicate
      const seen = new Set<string>();
      const normalized = allSites
        .map(s => ({ ...s, name: s.name || s.siteName || 'Unnamed Site' }))
        .filter(s => {
          if (seen.has(s.name)) return false;
          seen.add(s.name);
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setSites(normalized);
    } catch (err) {
      console.warn('[ConnectedClients] Failed to load sites:', err);
    }
  };

  useEffect(() => {
    loadStations();
    loadSites();
  }, [navigationScope, siteGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let stationsArray: Station[] = [];

      if (navigationScope === 'global' && siteGroups.length > 0) {
        // Org scope: fetch from all controllers, tag with site group info
        const originalBaseUrl = apiService.getBaseUrl();

        for (const sg of siteGroups) {
          try {
            apiService.setBaseUrl(`${sg.controller_url}/management`);
            const sgStations = await apiService.getStationsWithSiteCorrelation();
            const tagged = (Array.isArray(sgStations) ? sgStations : []).map(s => ({
              ...s,
              _siteGroupId: sg.id,
              _siteGroupName: sg.name,
            }));
            stationsArray.push(...tagged);
          } catch (err) {
            console.warn(`[ConnectedClients] Failed to fetch from ${sg.name}:`, err);
          }
        }

        // Restore original base URL
        apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
      } else {
        // Site-group scope: single controller fetch
        const stationsData = await apiService.getStationsWithSiteCorrelation();
        stationsArray = Array.isArray(stationsData) ? stationsData : [];
      }

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
        color: 'text-[color:var(--status-info)]',
        label: 'Wired',
        quality: 'Ethernet',
        bgColor: 'bg-[color:var(--status-info-bg)]'
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
        color: 'text-[color:var(--status-success)]',
        label: `${rss} dBm`,
        quality: 'Excellent',
        bgColor: 'bg-[color:var(--status-success-bg)]'
      };
    } else if (rss >= -50) {
      return {
        icon: SignalHigh,
        color: 'text-[color:var(--status-success)]',
        label: `${rss} dBm`,
        quality: 'Very Good',
        bgColor: 'bg-[color:var(--status-success-bg)]'
      };
    } else if (rss >= -60) {
      return {
        icon: SignalMedium,
        color: 'text-[color:var(--status-warning)]',
        label: `${rss} dBm`,
        quality: 'Good',
        bgColor: 'bg-[color:var(--status-warning-bg)]'
      };
    } else if (rss >= -70) {
      return {
        icon: SignalLow,
        color: 'text-[color:var(--status-warning)]',
        label: `${rss} dBm`,
        quality: 'Fair',
        bgColor: 'bg-[color:var(--status-warning-bg)]'
      };
    } else {
      return {
        icon: SignalZero,
        color: 'text-[color:var(--status-error)]',
        label: `${rss} dBm`,
        quality: 'Poor',
        bgColor: 'bg-[color:var(--status-error-bg)]'
      };
    }
  };

  // Filter stations by site group (org scope), site, compound search, and time range
  const siteGroupFiltered = orgSiteGroupFilter
    ? stations.filter((s: any) => s._siteGroupId === orgSiteGroupFilter)
    : stations;
  const siteFiltered = selectedSite !== 'all'
    ? siteGroupFiltered.filter(s => s.siteName === selectedSite)
    : siteGroupFiltered;
  // Use site-filtered stations for all stat calculations
  const effectiveStations = siteFiltered;
  const filteredStations = filterBySearch(siteFiltered);

  // Sort filtered stations
  const sortedStations = [...filteredStations].sort((a, b) => {
    if (!sortField) return 0;

    let aValue: string | number = '';
    let bValue: string | number = '';

    switch (sortField) {
      case 'hostName':
        aValue = (a.hostName || a.macAddress || '').toLowerCase();
        bValue = (b.hostName || b.macAddress || '').toLowerCase();
        break;
      case 'macAddress':
        aValue = (a.macAddress || '').toLowerCase();
        bValue = (b.macAddress || '').toLowerCase();
        break;
      case 'ipAddress':
        // Sort IP addresses numerically
        aValue = a.ipAddress ? a.ipAddress.split('.').map(n => n.padStart(3, '0')).join('') : '';
        bValue = b.ipAddress ? b.ipAddress.split('.').map(n => n.padStart(3, '0')).join('') : '';
        break;
      case 'status':
        aValue = (a.status || '').toLowerCase();
        bValue = (b.status || '').toLowerCase();
        break;
      case 'apName':
        aValue = (a.apName || '').toLowerCase();
        bValue = (b.apName || '').toLowerCase();
        break;
      case 'ssid':
        aValue = (a.ssid || a.network || '').toLowerCase();
        bValue = (b.ssid || b.network || '').toLowerCase();
        break;
      case 'signalStrength':
        aValue = a.signalStrength || a.rssi || -100;
        bValue = b.signalStrength || b.rssi || -100;
        break;
      case 'band':
        aValue = (a.band || '').toLowerCase();
        bValue = (b.band || '').toLowerCase();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalFilteredItems = sortedStations.length;
  const totalPages = Math.ceil(totalFilteredItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFilteredItems);
  const paginatedStations = sortedStations.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const getUniqueStatuses = () => {
    const statuses = new Set(effectiveStations.map(station => station.status).filter(Boolean));
    return Array.from(statuses);
  };

  const getUniqueAPs = () => {
    const aps = new Set(effectiveStations.map(station => station.apName || station.apSerial).filter(Boolean));
    return Array.from(aps);
  };

  const getUniqueSites = () => {
    const sites = new Set(effectiveStations.map(station => station.siteName).filter(Boolean));
    return Array.from(sites);
  };

  const getUniqueDeviceTypes = () => {
    const deviceTypes = new Set(effectiveStations.map(station => station.deviceType).filter(Boolean));
    return Array.from(deviceTypes);
  };

  const getUniqueNetworks = () => {
    const networks = new Set(effectiveStations.map(station => station.network).filter(Boolean));
    return Array.from(networks);
  };

  const getTotalTraffic = () => {
    return effectiveStations.reduce((total, station) => {
      const trafficData = stationTrafficData.get(station.macAddress);
      if (trafficData) {
        const inBytes = trafficData.inBytes || 0;
        const outBytes = trafficData.outBytes || 0;
        return total + inBytes + outBytes;
      }
      const rx = station.rxBytes || station.clientBandwidthBytes || 0;
      const tx = station.txBytes || station.outBytes || 0;
      return total + rx + tx;
    }, 0);
  };

  const getActiveClientsCount = () => {
    return effectiveStations.filter(station =>
      station.status?.toLowerCase() === 'connected' ||
      station.status?.toLowerCase() === 'associated' ||
      station.status?.toLowerCase() === 'active'
    ).length;
  };

  const getDisconnectedClientsCount = () => {
    return effectiveStations.filter(station =>
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
    return effectiveStations.filter(station => isRandomizedMac(station.macAddress)).length;
  };

  const getPermanentMacCount = () => {
    return effectiveStations.filter(station => !isRandomizedMac(station.macAddress)).length;
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

  // Only show skeleton on initial load (when there's no data yet)
  // This prevents flashing on subsequent refreshes
  if (isLoading && stations.length === 0) {
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
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[145px] h-8 text-xs">
              <Building className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map(site => (
                <SelectItem key={site.id || site.name} value={site.name}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={loadStations} variant="outline" size="sm" disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Clients
          </Button>
          <Button
            onClick={() => loadTrafficStatisticsForCurrentPage(stations)}
            variant="outline"
            size="sm"
            disabled={isLoadingTraffic}
          >
            <Activity className="mr-2 h-4 w-4" />
            {isLoadingTraffic ? 'Loading...' : 'Refresh Traffic'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsColumnDialogOpen(true)}
          >
            <Columns className="mr-2 h-4 w-4" />
            Customize Columns
          </Button>
          <ExportButton
            data={sortedStations}
            columns={[
              ...(navigationScope === 'global' && siteGroups.length > 1
                ? [{ key: '_siteGroupName', label: 'Site Group' }]
                : []),
              { key: 'hostName', label: 'Hostname' },
              { key: 'macAddress', label: 'MAC Address' },
              { key: 'ipAddress', label: 'IP Address' },
              { key: 'status', label: 'Status' },
              { key: 'apName', label: 'Access Point' },
              { key: 'ssid', label: 'SSID' },
              { key: 'band', label: 'Band' },
              { key: 'signalStrength', label: 'Signal (dBm)' },
              { key: 'deviceType', label: 'Device Type' },
              { key: 'siteName', label: 'Site' },
            ]}
            filename="connected-clients"
            title="Connected Clients"
          />
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
            <strong>{getRandomizedMacCount()} of {effectiveStations.length} clients</strong> are using randomized MAC addresses for privacy. 
            These addresses change periodically to prevent device tracking across networks.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Total Clients</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-violet shadow-md group-hover:scale-110 transition-transform">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{effectiveStations.length}</div>
            <p className="text-xs text-muted-foreground">
              Connected devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Active Connections</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-green shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{getActiveClientsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Randomized MACs</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-pink shadow-md group-hover:scale-110 transition-transform">
              <Shuffle className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{getRandomizedMacCount()}</div>
            <p className="text-xs text-muted-foreground">
              Privacy-enabled devices
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Disconnected</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-red shadow-md group-hover:scale-110 transition-transform">
              <WifiOff className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{getDisconnectedClientsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Recently offline
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Total Traffic</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-blue shadow-md group-hover:scale-110 transition-transform">
              <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{formatBytes(getTotalTraffic())}</div>
            <p className="text-xs text-muted-foreground">
              Data transferred {isLoadingTraffic && "(loading...)"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GDPR Data Rights Panel - Compact */}
      <Card className="border bg-muted/30">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
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
                variant="outline"
                className="h-8"
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
            <DialogTitle className="flex items-center gap-2 text-[color:var(--status-error)]">
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
              <p className="text-[color:var(--status-error)] font-medium">
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

      <Card>
        <CardHeader className="pb-3 pt-4">
          <SearchFilterBar
            searchPlaceholder="Search by hostname, MAC, IP, AP, site, SSID, device type..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showTimeRange={false}
            resultCount={filteredStations.length}
            totalCount={effectiveStations.length}
          />
        </CardHeader>
        <CardContent>
          {filteredStations.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Connected Clients Found</h3>
              <p className="text-muted-foreground">
                {hasActiveSearch
                  ? 'No clients match your current filters.'
                  : 'No clients are currently connected to the network.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="h-8">
                    {/* Checkbox column - always visible */}
                    <TableHead className="w-12 p-2 text-[10px] sticky left-0 bg-background z-10">
                      <Checkbox
                        checked={selectedStations.size === paginatedStations.length && paginatedStations.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="h-3.5 w-3.5"
                      />
                    </TableHead>
                    {/* Site Group column — only at org scope */}
                    {navigationScope === 'global' && siteGroups.length > 1 && (
                      <TableHead className="p-2 text-[10px]">
                        <div className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          <span>Site Group</span>
                        </div>
                      </TableHead>
                    )}
                    {/* Dynamic columns from customization */}
                    {columnCustomization.visibleColumnConfigs.map((column) => (
                      <TableHead
                        key={column.key}
                        className={`p-2 text-[10px] ${column.sortable ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                        onClick={() => {
                          if (column.sortable) {
                            const fieldMap: Record<string, SortField> = {
                              'status': 'status',
                              'hostname': 'hostName',
                              'macAddress': 'macAddress',
                              'ipAddress': 'ipAddress',
                              'network': 'ssid',
                              'apName': 'apName',
                              'band': 'band',
                              'rss': 'signalStrength'
                            };
                            const mappedField = fieldMap[column.key];
                            if (mappedField) {
                              handleSort(mappedField);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>{column.label}</span>
                            </TooltipTrigger>
                            {column.tooltip && (
                              <TooltipContent>
                                <p>{column.tooltip}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {column.sortable && (
                            (() => {
                              const fieldMap: Record<string, SortField> = {
                                'status': 'status',
                                'hostname': 'hostName',
                                'macAddress': 'macAddress',
                                'ipAddress': 'ipAddress',
                                'network': 'ssid',
                                'apName': 'apName',
                                'band': 'band',
                                'rss': 'signalStrength'
                              };
                              const mappedField = fieldMap[column.key];
                              if (sortField === mappedField) {
                                return sortDirection === 'asc'
                                  ? <ArrowUp className="h-3 w-3" />
                                  : <ArrowDown className="h-3 w-3" />;
                              }
                              return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
                            })()
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStations.map((station, index) => {
                    // Merge station with traffic data for column rendering
                    const stationWithTraffic = {
                      ...station,
                      trafficData: stationTrafficData.get(station.macAddress)
                    };

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
                        {/* Checkbox cell - always visible */}
                        <TableCell className="p-1 sticky left-0 bg-background z-10" data-checkbox>
                          <Checkbox
                            checked={selectedStations.has(station.macAddress)}
                            onCheckedChange={(checked) => handleStationSelect(station.macAddress, checked as boolean)}
                            className="h-3.5 w-3.5"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        {/* Site Group cell — only at org scope */}
                        {navigationScope === 'global' && siteGroups.length > 1 && (
                          <TableCell className="p-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                              {(station as any)._siteGroupName || '—'}
                            </Badge>
                          </TableCell>
                        )}
                        {/* Dynamic cells from visible columns */}
                        {columnCustomization.visibleColumnConfigs.map((column) => (
                          <TableCell key={column.key} className="p-1">
                            {column.renderCell ? column.renderCell(stationWithTraffic, index) : '-'}
                          </TableCell>
                        ))}
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

      {/* Column Customization Slide-Out */}
      <DetailSlideOut
        isOpen={isColumnDialogOpen}
        onClose={() => setIsColumnDialogOpen(false)}
        title="Customize Table Columns"
        description="Select which columns you want to display in the Connected Clients table"
        width="lg"
      >
        <div className="space-y-6">
          {/* Basic Columns */}
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Basic Information</h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter(col => col.category === 'basic').map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={columnCustomization.visibleColumns.includes(column.key)}
                    onCheckedChange={() => columnCustomization.toggleColumn(column.key)}
                    disabled={column.lockVisible}
                  />
                  <label
                    htmlFor={`col-${column.key}`}
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
              {DEVICE_MONITORING_COLUMNS.filter(col => col.category === 'network').map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={columnCustomization.visibleColumns.includes(column.key)}
                    onCheckedChange={() => columnCustomization.toggleColumn(column.key)}
                  />
                  <label
                    htmlFor={`col-${column.key}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {column.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Connection Columns */}
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Connection</h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter(col => col.category === 'connection').map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={columnCustomization.visibleColumns.includes(column.key)}
                    onCheckedChange={() => columnCustomization.toggleColumn(column.key)}
                  />
                  <label
                    htmlFor={`col-${column.key}`}
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
              {DEVICE_MONITORING_COLUMNS.filter(col => col.category === 'performance').map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={columnCustomization.visibleColumns.includes(column.key)}
                    onCheckedChange={() => columnCustomization.toggleColumn(column.key)}
                  />
                  <label
                    htmlFor={`col-${column.key}`}
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
              {DEVICE_MONITORING_COLUMNS.filter(col => col.category === 'advanced').map(column => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={columnCustomization.visibleColumns.includes(column.key)}
                    onCheckedChange={() => columnCustomization.toggleColumn(column.key)}
                  />
                  <label
                    htmlFor={`col-${column.key}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {column.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => columnCustomization.resetColumns()}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Defaults
            </Button>
            <div className="text-sm text-muted-foreground">
              {columnCustomization.visibleColumns.length} of {DEVICE_MONITORING_COLUMNS.length} columns selected
            </div>
            <Button onClick={() => setIsColumnDialogOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </DetailSlideOut>
    </div>
  );
}