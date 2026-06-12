import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AGGridWrapper } from '@/components/ui/AGGridWrapper';
import type { ColDef } from 'ag-grid-community';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import {
  AlertCircle,
  Users,
  RefreshCw,
  Wifi,
  Activity,
  Shield,
  Trash2,
  RotateCcw,
  WifiOff,
  Shuffle,
  FileDown,
  Columns,
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { apiService, Station } from '../services/api';
import { trafficService } from '../services/traffic';
import { useSourceSites } from '../hooks/useSourceSites';
import { SourceSiteSelector } from './SourceSiteSelector';
import { parseXiqSiteValue } from '../services/siteContextService';
import { loadXiqClients } from '../services/xiqInventory';
import { isRandomizedMac } from '../services/macAddressUtils';
import { toast } from 'sonner';
import { ExportButton } from './ExportButton';
import { SearchFilterBar } from './SearchFilterBar';
import { useCompoundSearch } from '../hooks/useCompoundSearch';
import { useTableCustomization } from '../hooks/useTableCustomization';
import { DetailSlideOut } from './DetailSlideOut';
import { DEVICE_MONITORING_COLUMNS } from '../config/deviceMonitoringColumns';
import { useAppContext } from '@/contexts/AppContext';
import { useCortexContext } from '@/contexts/CortexContext';

interface ConnectedClientsProps {
  onShowDetail?: (macAddress: string, hostName?: string) => void;
}

/** Columns XIQ populates for a client — used when an XIQ site is selected. */
const XIQ_CLIENT_VISIBLE_KEYS = [
  'status',
  'hostname',
  'macAddress',
  'ipAddress',
  'siteName',
  'network',
  'apName',
  'rss',
  'traffic',
  'deviceType',
  'vlan',
];

export function TrafficStatsConnectedClients({ onShowDetail }: ConnectedClientsProps) {
  const { navigationScope, siteGroups, orgSiteGroupFilter } = useAppContext();
  const { setWirelessContext } = useCortexContext();
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  // Source-aware site list (OS-ONE + XIQ) for the grouped selector.
  const { sites, xiqSites } = useSourceSites();
  // XIQ clients (loaded when an XIQ site is selected); separate from controller stations.
  const [xiqRows, setXiqRows] = useState<Station[]>([]);
  const xiqSel = parseXiqSiteValue(selectedSite);
  const isXiq = !!xiqSel;

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    filterRows: filterBySearch,
    hasActiveSearch,
  } = useCompoundSearch<Station>({
    storageKey: 'client-search',
    fields: [
      (s) => s.hostName,
      (s) => s.macAddress,
      (s) => s.ipAddress,
      (s) => s.siteName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.apName || (s as any).apDisplayName || (s as any).apHostname,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => (s as any).deviceType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => (s as any).manufacturer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => (s as any).username,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.network || (s as any).ssid || (s as any).serviceName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => (s as any).vlan?.toString() || (s as any).vlanId?.toString(),
      (s) => s.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => (s as any).band || (s as any).frequencyBand,
    ],
  });

  const [, setSelectedStation] = useState<Station | null>(null);
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [stationTrafficData, setStationTrafficData] = useState<Map<string, any>>(new Map()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);

  // GDPR state
  const [isGdprDeleteDialogOpen, setIsGdprDeleteDialogOpen] = useState(false);
  const [isDeletingClientData, setIsDeletingClientData] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Sorting state
  type SortField =
    | 'hostName'
    | 'macAddress'
    | 'ipAddress'
    | 'status'
    | 'apName'
    | 'ssid'
    | 'signalStrength'
    | 'band'
    | null;
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc'); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Column customization state
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);

  // Column customization hook
  const columnCustomization = useTableCustomization({
    tableId: 'device-monitoring',
    columns: DEVICE_MONITORING_COLUMNS,
    storageKey: 'deviceMonitoringVisibleColumns',
    enableViews: false,
    enablePersistence: true,
  });

  useEffect(() => {
    loadStations();
  }, [navigationScope, siteGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load XIQ clients when an XIQ site is selected (cleared otherwise).
  useEffect(() => {
    let cancelled = false;
    if (!xiqSel) {
      setXiqRows([]);
      return;
    }
    const siteName = xiqSites.find((s) => s.id === xiqSel.locationId)?.name ?? null;
    setIsLoading(true);
    loadXiqClients(xiqSel.siteGroupId, siteName)
      .then((rows) => {
        if (!cancelled) setXiqRows(rows as Station[]);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[ConnectedClients] XIQ clients load failed:', err);
          setXiqRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite, xiqSites]);

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
            const tagged = (Array.isArray(sgStations) ? sgStations : []).map((s) => ({
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
    } catch (error) {
      console.warn('Error loading traffic statistics:', error);
      toast.error('Failed to load traffic statistics', {
        description: 'Some traffic data may be unavailable',
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, itemsPerPage]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // XIQ rows are already scoped to the selected XIQ site; controller rows are
  // filtered client-side by site group (org scope) and selected site name.
  const baseStations = isXiq ? xiqRows : stations;
  const siteGroupFiltered =
    !isXiq && orgSiteGroupFilter
      ? baseStations.filter((s: any) => s._siteGroupId === orgSiteGroupFilter) // eslint-disable-line @typescript-eslint/no-explicit-any
      : baseStations;
  const siteFiltered =
    !isXiq && selectedSite !== 'all'
      ? siteGroupFiltered.filter((s) => s.siteName === selectedSite)
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
        aValue = a.ipAddress
          ? a.ipAddress
              .split('.')
              .map((n) => n.padStart(3, '0'))
              .join('')
          : '';
        bValue = b.ipAddress
          ? b.ipAddress
              .split('.')
              .map((n) => n.padStart(3, '0'))
              .join('')
          : '';
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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
    return effectiveStations.filter(
      (station) =>
        station.status?.toLowerCase() === 'connected' ||
        station.status?.toLowerCase() === 'associated' ||
        station.status?.toLowerCase() === 'active'
    ).length;
  };

  const getDisconnectedClientsCount = () => {
    return effectiveStations.filter(
      (station) =>
        station.status?.toLowerCase() === 'disconnected' ||
        station.status?.toLowerCase() === 'inactive'
    ).length;
  };

  const getRandomizedMacCount = () => {
    return effectiveStations.filter((station) => isRandomizedMac(station.macAddress)).length;
  };

  // GDPR: Download client data as JSON (supports multiple clients)
  const handleDownloadClientData = () => {
    const selectedStationsList = stations.filter((s) => selectedStations.has(s.macAddress));
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
        clients: selectedStationsList.map((station) => {
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
      const filename =
        selectedStationsList.length === 1
          ? `client-data-${selectedStationsList[0].macAddress.replace(/:/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
          : `client-data-export-${selectedStationsList.length}-clients-${new Date().toISOString().split('T')[0]}.json`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported data for ${selectedStationsList.length} client${selectedStationsList.length > 1 ? 's' : ''}`
      );
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

      toast.success(
        `Deleted data for ${macAddresses.length} client${macAddresses.length > 1 ? 's' : ''}`
      );
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
            Monitor and manage connected wireless client devices across your network with real-time
            traffic statistics and signal strength (RSSI)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <SourceSiteSelector
            value={selectedSite}
            onValueChange={setSelectedSite}
            sites={sites}
            xiqSites={xiqSites}
            triggerClassName="w-[180px] h-8 text-xs"
          />
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
          <Button variant="outline" size="sm" onClick={() => setIsColumnDialogOpen(true)}>
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
            <strong>
              {getRandomizedMacCount()} of {effectiveStations.length} clients
            </strong>{' '}
            are using randomized MAC addresses for privacy. These addresses change periodically to
            prevent device tracking across networks.
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
            <p className="text-xs text-muted-foreground">Connected devices</p>
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
            <p className="text-xs text-muted-foreground">Currently active</p>
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
            <p className="text-xs text-muted-foreground">Privacy-enabled devices</p>
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
            <div className="text-2xl font-bold text-foreground">
              {getDisconnectedClientsCount()}
            </div>
            <p className="text-xs text-muted-foreground">Recently offline</p>
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
            <div className="text-2xl font-bold text-foreground">
              {formatBytes(getTotalTraffic())}
            </div>
            <p className="text-xs text-muted-foreground">
              Data transferred {isLoadingTraffic && '(loading...)'}
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
                You are about to permanently delete all data for{' '}
                <strong>
                  {selectedStations.size} client{selectedStations.size > 1 ? 's' : ''}
                </strong>
                .
              </p>
              <div className="bg-muted p-3 rounded-lg font-mono text-xs max-h-32 overflow-y-auto">
                {Array.from(selectedStations).map((mac) => {
                  const station = stations.find((s) => s.macAddress === mac);
                  return (
                    <div key={mac} className="py-1 border-b last:border-0">
                      <span className="font-medium">{mac}</span>
                      {station?.hostName && (
                        <span className="text-muted-foreground ml-2">({station.hostName})</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[color:var(--status-error)] font-medium">
                This action cannot be undone. All connection history, events, and statistics for
                these devices will be permanently removed.
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
            (() => {
              const colSizing: Record<
                string,
                {
                  width?: number;
                  minWidth?: number;
                  flex?: number;
                  align?: 'center' | 'left' | 'right';
                }
              > = {
                status: { width: 100, align: 'center' },
                hostname: { flex: 1.5, minWidth: 180 },
                macAddress: { width: 170 },
                ipAddress: { width: 150 },
                ipv6Address: { width: 220 },
                siteName: { width: 160 },
                network: { width: 140 },
                accessPoint: { flex: 1.4, minWidth: 200 },
                apName: { flex: 1.4, minWidth: 200 },
                role: { width: 140 },
                username: { width: 160 },
                band: { width: 110, align: 'center' },
                signal: { width: 110, align: 'center' },
                rssi: { width: 110, align: 'center' },
                rss: { width: 110, align: 'center' },
                channel: { width: 90, align: 'right' },
                protocol: { width: 110 },
                rxRate: { width: 110, align: 'right' },
                txRate: { width: 110, align: 'right' },
                spatialStreams: { width: 110, align: 'right' },
                capabilities: { width: 200 },
                traffic: { width: 150 },
                inBytes: { width: 130, align: 'right' },
                outBytes: { width: 130, align: 'right' },
                inPackets: { width: 130, align: 'right' },
                outPackets: { width: 130, align: 'right' },
                deviceType: { width: 180 },
                manufacturer: { width: 150 },
              };
              const agColDefs: ColDef[] = [
                ...(navigationScope === 'global' && siteGroups.length > 1
                  ? [
                      {
                        colId: 'siteGroup',
                        headerName: 'Site Group',
                        width: 130,
                        cellRenderer: (
                          p: any // eslint-disable-line @typescript-eslint/no-explicit-any
                        ) => (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(p.data as any)._siteGroupName || '—'}{' '}
                          </Badge>
                        ),
                      } as ColDef,
                    ]
                  : []),
                ...(isXiq
                  ? DEVICE_MONITORING_COLUMNS.filter((c) => XIQ_CLIENT_VISIBLE_KEYS.includes(c.key))
                  : columnCustomization.visibleColumnConfigs
                ).map((column): ColDef => {
                  const sizing = colSizing[column.key] || {};
                  const align = sizing.align || 'left';
                  const justifyContent =
                    align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
                  return {
                    colId: column.key,
                    headerName: column.label,
                    field: (column.fieldPath || column.key) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                    sortable: column.sortable !== false,
                    width: sizing.width,
                    minWidth: sizing.minWidth,
                    flex: sizing.flex,
                    headerClass:
                      align === 'center'
                        ? 'ag-header-center'
                        : align === 'right'
                          ? 'ag-header-right'
                          : undefined,
                    cellStyle: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent,
                      height: '100%',
                      overflow: 'hidden',
                    },
                    cellRenderer: column.renderCell
                      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (p: any) => {
                          const stationWithTraffic = {
                            ...p.data,
                            trafficData: stationTrafficData.get(p.data.macAddress),
                          };
                          return column.renderCell!(stationWithTraffic, p.rowIndex || 0);
                        }
                      : undefined,
                  };
                }),
                // XIQ-only signal not present in the controller column set.
                ...(isXiq
                  ? [
                      {
                        colId: 'snr',
                        headerName: 'SNR (dB)',
                        field: 'snr' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        width: 100,
                        sortable: true,
                        headerClass: 'ag-header-right',
                        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
                      } as ColDef,
                    ]
                  : []),
              ];
              return (
                <AGGridWrapper
                  rowData={sortedStations}
                  columnDefs={agColDefs}
                  height={620}
                  storageKey="traffic-stats-clients"
                  gridOptions={{
                    rowHeight: 56,
                    getRowId: (p) => p.data.macAddress,
                    rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: true },
                    onSelectionChanged: (e) => {
                      const next = new Set<string>();
                      e.api.getSelectedRows().forEach((s: any) => next.add(s.macAddress)); // eslint-disable-line @typescript-eslint/no-explicit-any
                      setSelectedStations(next);
                    },
                    onRowClicked: (e) => {
                      if (!e.data) return;
                      setWirelessContext({
                        clientMac: e.data.macAddress,
                        apSerial: e.data.apSerial || e.data.apSerialNumber,
                        apName: e.data.apName,
                        ssid: e.data.ssid,
                      });
                      if (onShowDetail) onShowDetail(e.data.macAddress, e.data.hostName);
                      else setSelectedStation(e.data);
                    },
                  }}
                />
              );
            })()
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
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter((col) => col.category === 'basic').map((column) => (
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
              {DEVICE_MONITORING_COLUMNS.filter((col) => col.category === 'network').map(
                (column) => (
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
                )
              )}
            </div>
          </div>

          {/* Connection Columns */}
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">
              Connection
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter((col) => col.category === 'connection').map(
                (column) => (
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
                )
              )}
            </div>
          </div>

          {/* Performance Columns */}
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">
              Performance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter((col) => col.category === 'performance').map(
                (column) => (
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
                )
              )}
            </div>
          </div>

          {/* Advanced Columns */}
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase text-muted-foreground">Advanced</h3>
            <div className="grid grid-cols-2 gap-3">
              {DEVICE_MONITORING_COLUMNS.filter((col) => col.category === 'advanced').map(
                (column) => (
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
                )
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => columnCustomization.resetColumns()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Defaults
            </Button>
            <div className="text-sm text-muted-foreground">
              {columnCustomization.visibleColumns.length} of {DEVICE_MONITORING_COLUMNS.length}{' '}
              columns selected
            </div>
            <Button onClick={() => setIsColumnDialogOpen(false)}>Done</Button>
          </div>
        </div>
      </DetailSlideOut>
    </div>
  );
}
