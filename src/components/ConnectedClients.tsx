import { useState, useEffect, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DetailSlideOut } from './DetailSlideOut';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { AlertCircle, Users, Search, RefreshCw, Filter, Wifi, Activity, Timer, Signal, Download, Upload, Shield, Router, MapPin, User, Clock, Star, Trash2, UserX, RotateCcw, UserPlus, UserMinus, ShieldCheck, ShieldX, Info, Radio, WifiOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Cable, Shuffle, Columns, Route, ArrowLeft, FileDown, UserMinus2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, Station, type StationEvent, type APEvent, type RRMEvent } from '../services/api';
import { RoamingTrail } from './RoamingTrail';
import { identifyClient, lookupVendor, suggestDeviceType } from '../services/ouiLookup';
import { toast } from 'sonner';
import { useTableCustomization } from '@/hooks/useTableCustomization';
import { ColumnCustomizationDialog } from './ui/ColumnCustomizationDialog';
import { CLIENTS_TABLE_COLUMNS } from '@/config/clientsTableColumns';
import { SaveToWorkspace } from './SaveToWorkspace';

interface ConnectedClientsProps {
  onShowDetail?: (macAddress: string, hostName?: string) => void;
}

function ConnectedClientsComponent({ onShowDetail }: ConnectedClientsProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [apFilter, setApFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>('all');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  const [groupId, setGroupId] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [stationEvents, setStationEvents] = useState<StationEvent[]>([]);
  const [apEvents, setApEvents] = useState<APEvent[]>([]);
  const [rrmEvents, setRrmEvents] = useState<RRMEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [stationTrafficData, setStationTrafficData] = useState<Map<string, any>>(new Map());
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
  const [showRoamingTrail, setShowRoamingTrail] = useState(false);
  const [isGdprDeleteDialogOpen, setIsGdprDeleteDialogOpen] = useState(false);
  const [isDeletingClientData, setIsDeletingClientData] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Table customization
  const customization = useTableCustomization({
    tableId: 'connected-clients',
    columns: CLIENTS_TABLE_COLUMNS,
    enableViews: true,
    enablePersistence: true,
    userId: localStorage.getItem('user_email') || 'default-user'
  });

  useEffect(() => {
    loadStations();
  }, []);

  const loadStations = async () => {
    // Check authentication before loading
    if (!apiService.isAuthenticated()) {
      console.warn('[ConnectedClients] User not authenticated, skipping data load');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      // Use the new correlation method to get stations with proper site information
      const stationsData = await apiService.getStationsWithSiteCorrelation();
      setStations(Array.isArray(stationsData) ? stationsData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connected clients');
      console.error('Error loading stations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'connected':
      case 'associated':
      case 'active':
        return 'bg-green-500/15 text-green-500 border-green-500/30';
      case 'disconnected':
      case 'inactive':
        return 'bg-red-500/15 text-red-500 border-red-500/30';
      case 'idle':
      case 'low':
        return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    }
  };

  // Log to verify new version is deployed
  console.log('[ConnectedClients] Column customization enabled - v2024-12-23');

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
      station.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || station.status?.toLowerCase() === statusFilter.toLowerCase();
    const matchesAP = apFilter === 'all' || station.apSerial === apFilter || station.apName === apFilter;
    const matchesSite = siteFilter === 'all' || station.siteName === siteFilter;
    const matchesDeviceType = deviceTypeFilter === 'all' || station.deviceType === deviceTypeFilter;

    return matchesSearch && matchesStatus && matchesAP && matchesSite && matchesDeviceType;
  });

  // Helper function to get sortable value for a column
  const getSortValue = (station: Station, columnKey: string): string | number => {
    const stationAny = station as any;
    switch (columnKey) {
      case 'macAddress':
        return (station.macAddress || '').toLowerCase();
      case 'hostName':
        return (station.hostName || '').toLowerCase();
      case 'ipAddress':
        return station.ipAddress || '';
      case 'status':
        return (station.status || '').toLowerCase();
      case 'apName':
        return (station.apName || '').toLowerCase();
      case 'apSerial':
        return (station.apSerial || '').toLowerCase();
      case 'siteName':
        return (station.siteName || '').toLowerCase();
      case 'network':
        return (station.network || '').toLowerCase();
      case 'ssid':
        return (stationAny.ssid || station.network || '').toLowerCase();
      case 'rssi':
      case 'signalStrength':
        return stationAny.rssi || stationAny.signalStrength || stationAny.snr || 0;
      case 'snr':
        return stationAny.snr || 0;
      case 'channel':
        return stationAny.channel || 0;
      case 'band':
        return (stationAny.band || '').toLowerCase();
      case 'rxBytes':
      case 'download':
        return station.rxBytes || stationAny.clientBandwidthBytes || 0;
      case 'txBytes':
      case 'upload':
        return station.txBytes || stationAny.outBytes || 0;
      case 'connectedTime':
      case 'connectionTime':
        return stationAny.connectedTime || stationAny.connectionTime || stationAny.assocTime || 0;
      case 'username':
        return (station.username || '').toLowerCase();
      case 'role':
        return (stationAny.role || '').toLowerCase();
      case 'vlan':
        return stationAny.vlan || 0;
      case 'manufacturer':
      case 'vendor':
        return (station.manufacturer || '').toLowerCase();
      case 'deviceType':
        return (station.deviceType || '').toLowerCase();
      case 'os':
        return (stationAny.os || '').toLowerCase();
      case 'protocol':
        return (stationAny.protocol || '').toLowerCase();
      case 'authType':
        return (stationAny.authType || '').toLowerCase();
      default:
        return stationAny[columnKey] || '';
    }
  };

  // Handle column header click for sorting
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // Sort the filtered stations
  const sortedStations = [...filteredStations].sort((a, b) => {
    if (!sortColumn) return 0;

    const aValue = getSortValue(a, sortColumn);
    const bValue = getSortValue(b, sortColumn);

    let comparison = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

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

  const getUniqueNetworkCount = () => {
    return getUniqueNetworks().length;
  };

  const getUniqueSiteCount = () => {
    return getUniqueSites().length;
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
      const allMacAddresses = new Set(sortedStations.map(station => station.macAddress));
      setSelectedStations(allMacAddresses);
    } else {
      setSelectedStations(new Set());
    }
  };

  const loadStationEvents = async (macAddress: string) => {
    if (!macAddress) return;

    console.log(`[ConnectedClients] Loading station events with correlation for client:`, macAddress);
    setIsLoadingEvents(true);
    setEventTypeFilter('all'); // Reset filter when loading new events
    try {
      // Fetch correlated events (station + AP + RRM)
      const correlatedEvents = await apiService.fetchStationEventsWithCorrelation(macAddress, '24H');

      console.log(`[ConnectedClients] Received correlated events:`, {
        station: correlatedEvents.stationEvents.length,
        ap: correlatedEvents.apEvents.length,
        rrm: correlatedEvents.smartRfEvents.length
      });

      setStationEvents(correlatedEvents.stationEvents);
      setApEvents(correlatedEvents.apEvents);
      setRrmEvents(correlatedEvents.smartRfEvents);
    } catch (err) {
      console.error('[ConnectedClients] Failed to load station events:', err);
      setStationEvents([]);
      setApEvents([]);
      setRrmEvents([]);
      toast.error('Failed to load station events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const performBulkAction = async (action: string) => {
    if (selectedStations.size === 0) {
      toast.error('No stations selected');
      return;
    }

    setIsPerformingAction(true);
    const macAddresses = Array.from(selectedStations);

    try {
      let result;
      switch (action) {
        case 'delete':
          result = await apiService.bulkDeleteStations(macAddresses);
          toast.success(`Deleted ${result.successes}/${result.total} stations`);
          break;
        
        case 'disassociate':
          result = await apiService.bulkDisassociateStations(macAddresses);
          toast.success(`Disassociated ${macAddresses.length} stations`);
          break;
        
        case 'reauthenticate':
          result = await apiService.bulkReauthenticateStations(macAddresses);
          toast.success(`Reauthenticated ${result.successes}/${result.total} stations`);
          break;
        
        case 'addToGroup':
          if (!groupId) {
            toast.error('Please specify a Group ID');
            return;
          }
          const addResults = await Promise.allSettled(
            macAddresses.map(mac => apiService.addStationToGroup(mac, groupId))
          );
          const addSuccesses = addResults.filter(r => r.status === 'fulfilled').length;
          toast.success(`Added ${addSuccesses}/${macAddresses.length} stations to group`);
          break;
        
        case 'removeFromGroup':
          if (!groupId) {
            toast.error('Please specify a Group ID');
            return;
          }
          const removeResults = await Promise.allSettled(
            macAddresses.map(mac => apiService.removeStationFromGroup(mac, groupId))
          );
          const removeSuccesses = removeResults.filter(r => r.status === 'fulfilled').length;
          toast.success(`Removed ${removeSuccesses}/${macAddresses.length} stations from group`);
          break;
        
        case 'addToAllowList':
          if (!siteId) {
            toast.error('Please specify a Site ID');
            return;
          }
          const allowResults = await Promise.allSettled(
            macAddresses.map(mac => apiService.addStationToAllowList(mac, siteId))
          );
          const allowSuccesses = allowResults.filter(r => r.status === 'fulfilled').length;
          toast.success(`Added ${allowSuccesses}/${macAddresses.length} stations to allow list`);
          break;
        
        case 'addToDenyList':
          if (!siteId) {
            toast.error('Please specify a Site ID');
            return;
          }
          const denyResults = await Promise.allSettled(
            macAddresses.map(mac => apiService.addStationToDenyList(mac, siteId))
          );
          const denySuccesses = denyResults.filter(r => r.status === 'fulfilled').length;
          toast.success(`Added ${denySuccesses}/${macAddresses.length} stations to deny list`);
          break;
        
        default:
          toast.error('Unknown action');
          return;
      }

      // Clear selection and refresh data
      setSelectedStations(new Set());
      setIsActionsModalOpen(false);
      await loadStations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsPerformingAction(false);
    }
  };

  // GDPR: Download client data as JSON (supports multiple clients)
  const handleDownloadClientData = async (stationsToExport: Station[]) => {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        gdprDataExport: true,
        exportType: stationsToExport.length === 1 ? 'single_client' : 'bulk_export',
        totalClients: stationsToExport.length,
        clients: stationsToExport.map(station => ({
          clientIdentifier: station.macAddress,
          basicInformation: {
            macAddress: station.macAddress,
            ipAddress: station.ipAddress,
            ipv6Address: station.ipv6Address,
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
            connectionTime: station.connectionTime,
            sessionDuration: station.sessionDuration,
          },
          trafficStatistics: {
            rxBytes: station.rxBytes,
            txBytes: station.txBytes,
            inBytes: station.inBytes,
            outBytes: station.outBytes,
            clientBandwidthBytes: station.clientBandwidthBytes,
          },
          signalQuality: {
            rssi: station.rssi,
            snr: station.snr,
            txRate: station.txRate,
            rxRate: station.rxRate,
            siteRating: station.siteRating,
          },
        })),
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = stationsToExport.length === 1
        ? `client-data-${stationsToExport[0].macAddress.replace(/:/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
        : `client-data-export-${stationsToExport.length}-clients-${new Date().toISOString().split('T')[0]}.json`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported data for ${stationsToExport.length} client${stationsToExport.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('[ConnectedClients] Error exporting client data:', error);
      toast.error('Failed to export client data');
    }
  };

  // GDPR: Download selected clients data
  const handleDownloadSelectedClients = () => {
    const selectedStationsList = stations.filter(s => selectedStations.has(s.macAddress));
    if (selectedStationsList.length === 0) {
      toast.error('No clients selected');
      return;
    }
    handleDownloadClientData(selectedStationsList);
  };

  // GDPR: Delete all client data (supports multiple clients)
  const handleDeleteClientData = async (macAddresses: string[]) => {
    setIsDeletingClientData(true);
    try {
      // Call the API to delete the station/client data
      await apiService.bulkDeleteStations(macAddresses);

      toast.success(`Deleted data for ${macAddresses.length} client${macAddresses.length > 1 ? 's' : ''}`);
      setIsGdprDeleteDialogOpen(false);
      setSelectedStations(new Set());

      // Refresh the stations list
      await loadStations();
    } catch (error) {
      console.error('[ConnectedClients] Error deleting client data:', error);
      toast.error('Failed to delete client data');
    } finally {
      setIsDeletingClientData(false);
    }
  };

  // GDPR: Delete selected clients data
  const handleDeleteSelectedClients = () => {
    if (selectedStations.size === 0) {
      toast.error('No clients selected');
      return;
    }
    setIsGdprDeleteDialogOpen(true);
  };

  // Helper function to render column content based on column key
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
          <h1 className="text-2xl font-bold">Connected Clients</h1>
          <p className="text-muted-foreground">
            Monitor and manage connected wireless client devices across your network
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={loadStations} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <ColumnCustomizationDialog
            customization={customization}
            triggerLabel="Customize Columns"
            showTriggerIcon={true}
          />
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
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stations.length}</div>
            <p className="text-xs text-muted-foreground">
              Connected devices
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
            <Wifi className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getActiveClientsCount()}</div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sites</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getUniqueSiteCount()}</div>
            <p className="text-xs text-muted-foreground">
              Active sites
            </p>
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Traffic</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(getTotalTraffic())}</div>
            <p className="text-xs text-muted-foreground">
              Data transferred
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GDPR Data Rights Panel - Prominent */}
      <Card className="border-2 border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <CardContent className="py-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">GDPR Data Rights</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedStations.size > 0
                    ? `${selectedStations.size} client${selectedStations.size > 1 ? 's' : ''} selected`
                    : 'Select clients from the table below to manage their data'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="bg-white dark:bg-background border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                onClick={handleDownloadSelectedClients}
                disabled={selectedStations.size === 0}
              >
                <FileDown className="mr-2 h-4 w-4 text-blue-600" />
                Download Data ({selectedStations.size})
              </Button>
              <Button
                variant="outline"
                className="bg-white dark:bg-background border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={handleDeleteSelectedClients}
                disabled={selectedStations.size === 0}
              >
                <Trash2 className="mr-2 h-4 w-4 text-red-600" />
                Delete Data ({selectedStations.size})
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 border-t pt-3">
            <strong>GDPR Compliance:</strong> Article 15 (Right of Access) allows data subjects to obtain a copy of their personal data.
            Article 17 (Right to Erasure) allows data subjects to request deletion of their personal data.
          </p>
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
              onClick={() => handleDeleteClientData(Array.from(selectedStations))}
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
          <div className="flex items-center justify-between">
            <CardTitle>Connected Clients</CardTitle>
            <SaveToWorkspace
              widgetId="connected-clients-table"
              widgetType="topn_table"
              title="Connected Clients"
              endpointRefs={['clients.list']}
              sourcePage="clients"
              catalogId="table_clients_all"
            />
          </div>
          <CardDescription>
            Select clients using the checkboxes to manage their GDPR data rights
          </CardDescription>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-[2] min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name, MAC, or site..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-10">
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

            <Select value={deviceTypeFilter} onValueChange={setDeviceTypeFilter}>
              <SelectTrigger className="w-32 h-10">
                <SelectValue placeholder="Device Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {getUniqueDeviceTypes().map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={apFilter} onValueChange={setApFilter}>
              <SelectTrigger className="w-36 h-10">
                <Wifi className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Access Point" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {getUniqueAPs().map((ap) => (
                  <SelectItem key={ap} value={ap}>{ap}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {sortedStations.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Connected Clients Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || apFilter !== 'all' || siteFilter !== 'all' || deviceTypeFilter !== 'all'
                  ? 'No clients match your current filters.'
                  : 'No clients are currently connected to the network.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="w-10 p-1 text-[10px]">
                      <Checkbox
                        checked={selectedStations.size === sortedStations.length && sortedStations.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="h-3 w-3"
                      />
                    </TableHead>
                    {customization.visibleColumnConfigs.map(column => (
                      <TableHead
                        key={column.key}
                        className="p-1 text-[10px] cursor-pointer select-none hover:bg-muted/50 transition-colors"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStations.map((station, index) => (
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

                      {customization.visibleColumnConfigs.map(column => (
                        <TableCell key={column.key}>
                          {column.renderCell ? column.renderCell(station) : (station as any)[column.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions Modal */}
      <DetailSlideOut
        isOpen={isActionsModalOpen}
        onClose={() => setIsActionsModalOpen(false)}
        title="Bulk Actions"
        description={`Perform actions on ${selectedStations.size} selected clients`}
        width="md"
      >
        <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Station Management</h4>
              <div className="space-y-2">
                <Button
                  onClick={() => performBulkAction('disassociate')}
                  disabled={isPerformingAction}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Disassociate Stations
                </Button>
                
                <Button
                  onClick={() => performBulkAction('reauthenticate')}
                  disabled={isPerformingAction}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reauthenticate Stations
                </Button>
                
                <Button
                  onClick={() => performBulkAction('delete')}
                  disabled={isPerformingAction}
                  variant="destructive"
                  className="w-full justify-start"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Stations
                </Button>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Group Management</h4>
              <div className="space-y-2">
                <div>
                  <Input
                    placeholder="Group ID"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="mb-2"
                  />
                  <div className="space-y-2">
                    <Button
                      onClick={() => performBulkAction('addToGroup')}
                      disabled={isPerformingAction || !groupId}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add to Group
                    </Button>
                    
                    <Button
                      onClick={() => performBulkAction('removeFromGroup')}
                      disabled={isPerformingAction || !groupId}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove from Group
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Access Control</h4>
              <div className="space-y-2">
                <div>
                  <Input
                    placeholder="Site ID"
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className="mb-2"
                  />
                  <div className="space-y-2">
                    <Button
                      onClick={() => performBulkAction('addToAllowList')}
                      disabled={isPerformingAction || !siteId}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Add to Allow List
                    </Button>
                    
                    <Button
                      onClick={() => performBulkAction('addToDenyList')}
                      disabled={isPerformingAction || !siteId}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <ShieldX className="mr-2 h-4 w-4" />
                      Add to Deny List
                    </Button>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </DetailSlideOut>

      {/* Station Detail Modal */}
      <DetailSlideOut
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Client Details - ${selectedStation?.hostName || selectedStation?.macAddress}`}
        description="Detailed information and events for this connected client"
        width="3xl"
      >
          
          {selectedStation && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Client Information</TabsTrigger>
                <TabsTrigger value="events" onClick={() => loadStationEvents(selectedStation.macAddress)}>
                  Recent Events
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">MAC Address:</span>
                        <span className="font-mono">{selectedStation.macAddress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">IP Address:</span>
                        <span className="font-mono">{selectedStation.ipAddress || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Hostname:</span>
                        <span>{selectedStation.hostName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Status:</span>
                        <Badge className={getStatusBadgeClass(selectedStation.status || '')}>
                          {selectedStation.status || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Device Type:</span>
                        <span>{selectedStation.deviceType || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Manufacturer:</span>
                        <span>{selectedStation.manufacturer || 'Unknown'}</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Network Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Site:</span>
                        <span>{selectedStation.siteName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Access Point:</span>
                        <span className="font-mono text-sm">{selectedStation.apSerial || selectedStation.apName || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Network:</span>
                        <span>{selectedStation.network || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Role:</span>
                        <span>{selectedStation.role || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Username:</span>
                        <span>{selectedStation.username || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Last Seen:</span>
                        <span>{selectedStation.lastSeen || 'N/A'}</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Traffic Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium flex items-center gap-1">
                          <Download className="h-4 w-4 text-green-600" />
                          Downloaded:
                        </span>
                        <span>{formatBytes(selectedStation.txBytes || selectedStation.outBytes || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium flex items-center gap-1">
                          <Upload className="h-4 w-4 text-blue-600" />
                          Uploaded:
                        </span>
                        <span>{formatBytes(selectedStation.rxBytes || selectedStation.inBytes || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium">Total Traffic:</span>
                        <span>{formatBytes((selectedStation.rxBytes || selectedStation.inBytes || 0) + (selectedStation.txBytes || selectedStation.outBytes || 0))}</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Additional Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium">Site Rating:</span>
                        <div className="flex items-center gap-1">
                          {selectedStation.siteRating !== undefined && (
                            <>
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span>{selectedStation.siteRating}</span>
                            </>
                          ) || <span>N/A</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                </TabsContent>
              
              <TabsContent value="events" className="space-y-4">
                {isLoadingEvents ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : stationEvents.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground font-medium mb-2">No station events available</p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Station {selectedStation?.macAddress}
                    </p>
                    <div className="text-xs text-muted-foreground max-w-md mx-auto space-y-1 mt-4">
                      <p>Station events may be unavailable if:</p>
                      <p>• Your Extreme Platform ONE doesn't support the station events API</p>
                      <p>• No events have been logged for this station in the last 30 days</p>
                      <p>• Audit logging is not enabled</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        if (selectedStation) {
                          loadStationEvents(selectedStation.macAddress);
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Event Type Filter and Roaming Trail Button */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant={eventTypeFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setEventTypeFilter('all')}
                        >
                          All Events ({stationEvents.length})
                        </Button>
                        {Array.from(new Set(stationEvents.map(e => e.eventType))).sort().map((type) => (
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
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowRoamingTrail(true)}
                        className="flex items-center gap-2"
                      >
                        <Route className="h-4 w-4" />
                        View Roaming Trail
                      </Button>
                    </div>

                    {/* Event Timeline */}
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {stationEvents
                          .filter(event => eventTypeFilter === 'all' || event.eventType === eventTypeFilter)
                          .map((event, idx) => {
                            const eventDate = new Date(parseInt(event.timestamp));

                            return (
                              <Card key={event.id || idx} className="relative pl-8">
                                {/* Timeline dot */}
                                <div className={`absolute left-3 top-6 w-2 h-2 rounded-full ${
                                  event.eventType === 'Roam' ? 'bg-blue-500' :
                                  event.eventType === 'Associate' ? 'bg-green-500' :
                                  event.eventType === 'Disassociate' ? 'bg-red-500' :
                                  event.eventType === 'Authenticate' ? 'bg-purple-500' :
                                  'bg-gray-500'
                                }`} />
                                {idx !== stationEvents.filter(e => eventTypeFilter === 'all' || e.eventType === eventTypeFilter).length - 1 && (
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

                                      {event.details && (() => {
                                        // Parse details field for structured information
                                        const parseDetails = (details: string) => {
                                          const parsed: Record<string, string> = {};
                                          const regex = /(\w+)\[([^\]]+)\]/g;
                                          let match;
                                          while ((match = regex.exec(details)) !== null) {
                                            parsed[match[1]] = match[2];
                                          }
                                          return parsed;
                                        };

                                        const parsedDetails = parseDetails(event.details);
                                        const hasStructuredData = Object.keys(parsedDetails).length > 0;

                                        return (
                                          <div className="mb-2">
                                            {/* Show structured details if available */}
                                            {hasStructuredData ? (
                                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
                                                {parsedDetails.Cause && (
                                                  <div>
                                                    <span className="text-muted-foreground">Cause: </span>
                                                    <span className="font-medium">{parsedDetails.Cause}</span>
                                                  </div>
                                                )}
                                                {parsedDetails.Reason && (
                                                  <div>
                                                    <span className="text-muted-foreground">Reason: </span>
                                                    <span className="font-medium">{parsedDetails.Reason}</span>
                                                  </div>
                                                )}
                                                {parsedDetails.Status && (
                                                  <div>
                                                    <span className="text-muted-foreground">Status: </span>
                                                    <span className="font-medium">{parsedDetails.Status}</span>
                                                  </div>
                                                )}
                                                {parsedDetails.Code && (
                                                  <div>
                                                    <span className="text-muted-foreground">Code: </span>
                                                    <span className="font-mono font-medium">{parsedDetails.Code}</span>
                                                  </div>
                                                )}
                                                {parsedDetails.DevFamily && (
                                                  <div>
                                                    <span className="text-muted-foreground">Device: </span>
                                                    <span className="font-medium">{parsedDetails.DevFamily}</span>
                                                  </div>
                                                )}
                                                {parsedDetails.Hostname && (
                                                  <div>
                                                    <span className="text-muted-foreground">Hostname: </span>
                                                    <span className="font-medium">{parsedDetails.Hostname}</span>
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-foreground">{event.details}</p>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                        {event.apName && (
                                          <div>
                                            <span className="text-muted-foreground">AP: </span>
                                            <span className="font-medium">{event.apName}</span>
                                          </div>
                                        )}
                                        {event.apSerial && (
                                          <div>
                                            <span className="text-muted-foreground">AP Serial: </span>
                                            <span className="font-mono text-xs font-medium">{event.apSerial}</span>
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
                                        {event.ipv6Address && (
                                          <div className="col-span-2">
                                            <span className="text-muted-foreground">IPv6: </span>
                                            <span className="font-mono text-xs font-medium">{event.ipv6Address}</span>
                                          </div>
                                        )}
                                        {event.type && (
                                          <div>
                                            <span className="text-muted-foreground">Type: </span>
                                            <span className="font-medium">{event.type}</span>
                                          </div>
                                        )}
                                        {event.level && (
                                          <div>
                                            <span className="text-muted-foreground">Level: </span>
                                            <span className="font-medium">{event.level}</span>
                                          </div>
                                        )}
                                        {event.category && (
                                          <div>
                                            <span className="text-muted-foreground">Category: </span>
                                            <span className="font-medium">{event.category}</span>
                                          </div>
                                        )}
                                        {event.context && (
                                          <div>
                                            <span className="text-muted-foreground">Context: </span>
                                            <span className="font-medium">{event.context}</span>
                                          </div>
                                        )}
                                        {event.id && (
                                          <div className="col-span-2">
                                            <span className="text-muted-foreground">Event ID: </span>
                                            <span className="font-mono text-xs">{event.id}</span>
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

      {/* Roaming Trail Full Page */}
      {showRoamingTrail && selectedStation && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="h-full flex flex-col">
            {/* Page Header */}
            <div className="border-b bg-background px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRoamingTrail(false)}
                  className="mr-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Route className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">
                    Roaming Trail - {selectedStation.hostName || selectedStation.macAddress}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Visual timeline showing how this client roamed between access points
                  </p>
                </div>
              </div>
            </div>

            {/* Roaming Trail Content */}
            <div className="flex-1 overflow-hidden">
              <RoamingTrail
                events={stationEvents}
                apEvents={apEvents}
                rrmEvents={rrmEvents}
                macAddress={selectedStation.macAddress}
                hostName={selectedStation.hostName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// Export memoized component to prevent unnecessary re-renders
export const ConnectedClients = memo(ConnectedClientsComponent);
