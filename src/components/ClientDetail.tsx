import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import {
  Smartphone,
  Wifi,
  Shield,
  Clock,
  Activity,
  Signal,
  MapPin,
  Globe,
  RefreshCw,
  Ban,
  RotateCcw,
  Settings,
  Download,
  Upload,
  Package,
  FileText,
  Route,
  ArrowLeft
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { apiService, Station, StationEvent, APEvent, RRMEvent } from '../services/api';
import { RoamingTrail } from './RoamingTrail';
import { ClientInsights, ClientInsightsFullScreen } from './ClientInsights';
import { trafficService, StationTrafficStats } from '../services/traffic';
import { siteMappingService } from '../services/siteMapping';
import { simpleServiceMapping } from '../services/simpleServiceMapping';
import { toast } from 'sonner';
import { formatCompactNumber } from '../lib/units';

interface ClientDetailProps {
  macAddress: string;
}

export function ClientDetail({ macAddress }: ClientDetailProps) {
  const [clientDetails, setClientDetails] = useState<Station | null>(null);
  const [trafficStats, setTrafficStats] = useState<StationTrafficStats | null>(null);
  const [resolvedSiteName, setResolvedSiteName] = useState<string | null>(null);
  const [resolvedServiceDetails, setResolvedServiceDetails] = useState<{ ssid: string; networkName: string; vlan: string } | null>(null);
  const [resolvedRoleName, setResolvedRoleName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
  const [isLoadingSiteName, setIsLoadingSiteName] = useState(false);
  const [isLoadingServiceDetails, setIsLoadingServiceDetails] = useState(false);
  const [isLoadingRoleName, setIsLoadingRoleName] = useState(false);

  // Station Events state
  const [stationEvents, setStationEvents] = useState<StationEvent[]>([]);
  const [apEvents, setApEvents] = useState<APEvent[]>([]);
  const [rrmEvents, setRrmEvents] = useState<RRMEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [showRoamingTrail, setShowRoamingTrail] = useState(false);
  const [showClientInsights, setShowClientInsights] = useState(false);

  const loadClientDetails = async () => {
    try {
      setIsLoading(true);
      const details = await apiService.getStation(macAddress);
      setClientDetails(details);
      
      // Debug logging to see what fields are available
      console.log('Station details for', macAddress, ':', {
        ssid: details.ssid,
        networkName: details.networkName,
        essid: details.essid,
        network: details.network,
        profileName: details.profileName,
        serviceName: details.serviceName,
        serviceId: details.serviceId, // Added serviceId logging
        roleId: details.roleId, // Added roleId logging
        vlan: details.vlan,
        vlanId: details.vlanId,
        vlanTag: details.vlanTag,
        dot1dPortNumber: details.dot1dPortNumber,
        channel: details.channel,
        radioChannel: details.radioChannel,
        channelNumber: details.channelNumber,
        apName: details.apName,
        apDisplayName: details.apDisplayName,
        apHostname: details.apHostname,
        accessPointName: details.accessPointName,
        apSerial: details.apSerial,
        apSerialNumber: details.apSerialNumber,
        apSn: details.apSn,
        accessPointSerial: details.accessPointSerial,
        siteId: details.siteId,
        siteName: details.siteName,
        rxRate: details.rxRate,
        dataRate: details.dataRate,
        txRate: details.txRate
      });

      // Log ALL fields to see what's actually available
      console.log('All station fields:', details);
      
      // Load site name if siteId is available
      if (details.siteId) {
        loadSiteName(details.siteId);
      }
      
      // Load service details if serviceId is available
      if (details.serviceId) {
        loadServiceDetails(details.serviceId);
      }
      
      // Load role name if roleId is available
      if (details.roleId) {
        loadRoleName(details.roleId);
      }
    } catch (error) {
      console.error('Failed to load client details:', error);
      
      // Check if it's a "not found" error
      if (error instanceof Error && error.message.includes('not found')) {
        toast.error('Client not found', {
          description: `No client with MAC address ${macAddress} was found in the system.`
        });
      } else {
        toast.error('Failed to load client details', {
          description: error instanceof Error ? error.message : 'An unknown error occurred'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadSiteName = async (siteId: string) => {
    try {
      setIsLoadingSiteName(true);
      console.log(`ClientDetail: Loading site name for siteId: ${siteId}`);
      
      // Run diagnostic if this is the problematic site ID
      if (siteId === 'c7395471-aa5c-46dc-9211-3ed24c5789bd') {
        console.log('Running diagnostic for problematic site ID...');
        await siteMappingService.diagnoseSiteMapping(siteId);
      }
      
      const siteName = await siteMappingService.getSiteName(siteId);
      console.log(`ClientDetail: Resolved site name: ${siteId} -> ${siteName}`);
      setResolvedSiteName(siteName);
    } catch (error) {
      console.warn('Failed to resolve site name:', error);
      // Don't show error toast for site name resolution as it's supplementary data
    } finally {
      setIsLoadingSiteName(false);
    }
  };

  const loadServiceDetails = async (serviceId: string) => {
    try {
      setIsLoadingServiceDetails(true);
      console.log(`ClientDetail: Loading service details for serviceId: ${serviceId}`);
      
      const serviceDetails = await simpleServiceMapping.getServiceDetails(serviceId);
      console.log(`ClientDetail: Resolved service details: ${serviceId} ->`, serviceDetails);
      setResolvedServiceDetails(serviceDetails);
    } catch (error) {
      console.warn('Failed to resolve service details:', error);
      // Don't show error toast for service resolution as it's supplementary data
    } finally {
      setIsLoadingServiceDetails(false);
    }
  };

  const loadRoleName = async (roleId: string) => {
    try {
      setIsLoadingRoleName(true);
      console.log(`ClientDetail: Loading role name for roleId: ${roleId}`);
      
      const roleName = await simpleServiceMapping.getRoleName(roleId);
      console.log(`ClientDetail: Resolved role name: ${roleId} -> ${roleName}`);
      setResolvedRoleName(roleName);
    } catch (error) {
      console.warn('Failed to resolve role name:', error);
      // Don't show error toast for role resolution as it's supplementary data
    } finally {
      setIsLoadingRoleName(false);
    }
  };

  const loadTrafficStats = async () => {
    try {
      setIsLoadingTraffic(true);
      const stats = await trafficService.getStationTrafficStats(macAddress);
      setTrafficStats(stats);
    } catch (error) {
      console.warn('Failed to load traffic statistics:', error);
      // Don't show error toast for traffic stats as it's supplementary data
    } finally {
      setIsLoadingTraffic(false);
    }
  };

  const loadStationEvents = async () => {
    try {
      setIsLoadingEvents(true);
      console.log('[ClientDetail] Loading station events with correlation for:', macAddress);

      // Try to fetch correlated events (station + AP + RRM)
      const correlatedEvents = await apiService.fetchStationEventsWithCorrelation(macAddress, '24H');

      console.log('[ClientDetail] Loaded correlated events:', {
        station: correlatedEvents.stationEvents.length,
        ap: correlatedEvents.apEvents.length,
        rrm: correlatedEvents.smartRfEvents.length
      });

      setStationEvents(correlatedEvents.stationEvents);
      setApEvents(correlatedEvents.apEvents);
      setRrmEvents(correlatedEvents.smartRfEvents);
    } catch (error) {
      console.warn('Failed to load station events:', error);
      // Don't show error toast for events as it's supplementary data
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadClientDetails(),
      loadTrafficStats(),
      loadStationEvents()
    ]);
    setIsRefreshing(false);
    toast.success('Client details refreshed');
  };

  const handleDisassociate = async () => {
    try {
      await apiService.disassociateStations([macAddress]);
      toast.success('Client disassociated successfully');
      await loadClientDetails();
    } catch (error) {
      toast.error('Failed to disassociate client');
    }
  };

  const handleReauthenticate = async () => {
    try {
      await apiService.reauthenticateStation(macAddress);
      toast.success('Client reauthentication initiated');
    } catch (error) {
      toast.error('Failed to reauthenticate client');
    }
  };

  useEffect(() => {
    // Preload sites only - services and roles will load on demand
    siteMappingService.loadSites().catch(error => {
      console.warn('Failed to preload sites for mapping:', error);
    });
    loadClientDetails();
    loadTrafficStats();
    loadStationEvents();
  }, [macAddress]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!clientDetails) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted/20 p-4">
            <Smartphone className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Client not found</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            The client with MAC address <code className="bg-muted px-1 py-0.5 rounded text-xs">{macAddress}</code> could not be found. 
            It may have been disconnected or the MAC address may be incorrect.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadClientDetails}
          disabled={isLoading}
          className="mt-4"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Try Again
        </Button>
      </div>
    );
  }

  const getStatusBadgeVariiant = (status?: string) => {
    if (!status) return 'secondary';
    const s = status.toLowerCase();
    if (s === 'connected' || s === 'associated' || s === 'online') return 'default';
    if (s === 'disconnected' || s === 'offline') return 'destructive';
    return 'secondary';
  };

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 B';
    if (bytes < 0) return 'N/A';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    // Format with appropriate decimal places
    const formatted = unitIndex === 0 ? value.toString() : value.toFixed(value < 10 ? 2 : 1);
    return `${formatted} ${units[unitIndex]}`;
  };

  const formatPackets = (packets?: number) => {
    if (packets === undefined || packets === null) return 'N/A';
    if (packets === 0) return '0';
    return packets.toLocaleString();
  };

  const formatDuration = (duration?: string) => {
    if (!duration) return 'N/A';
    return duration;
  };

  // Format timestamp to readable date and time
  const formatDateTime = (timestamp?: string | number) => {
    if (!timestamp) return 'N/A';
    
    try {
      let date: Date;
      
      // Handle both string and number timestamps
      if (typeof timestamp === 'string') {
        // Try parsing as ISO string first, then as number
        date = isNaN(Date.parse(timestamp)) ? new Date(parseInt(timestamp) * 1000) : new Date(timestamp);
      } else {
        // Handle Unix timestamp (seconds) - convert to milliseconds if needed
        date = timestamp > 1e10 ? new Date(timestamp) : new Date(timestamp * 1000);
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      
      // Format as readable date and time
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'N/A';
    }
  };

  // Helper functions to extract field values with multiple possible field names
  const getSSID = (client: Station): string => {
    // Prioritize resolved service details over client fields
    if (resolvedServiceDetails?.ssid && resolvedServiceDetails.ssid !== 'N/A') {
      return resolvedServiceDetails.ssid;
    }
    return client.ssid || client.networkName || client.essid || 'N/A';
  };

  const getNetwork = (client: Station): string => {
    // Prioritize resolved service details over client fields
    if (resolvedServiceDetails?.networkName && resolvedServiceDetails.networkName !== 'N/A') {
      return resolvedServiceDetails.networkName;
    }
    return client.network || client.networkName || client.profileName || client.serviceName || 'N/A';
  };

  const getVLAN = (client: Station): string => {
    // Prioritize resolved service details over client fields
    if (resolvedServiceDetails?.vlan && resolvedServiceDetails.vlan !== 'N/A') {
      return resolvedServiceDetails.vlan;
    }
    const vlan = client.vlan || client.vlanId || client.vlanTag || client.dot1dPortNumber;
    if (vlan === undefined || vlan === null) return 'N/A';
    return vlan.toString();
  };

  const getRole = (client: Station): string => {
    // Always prioritize resolved role name from /v1/roles endpoint
    if (resolvedRoleName && resolvedRoleName !== 'N/A') {
      return resolvedRoleName;
    }
    // Fallback to client role field, but this should be rare
    return client.role || 'N/A';
  };



  const getChannel = (client: Station): string => {
    const channel = client.channel || client.radioChannel || client.channelNumber;
    if (channel === undefined || channel === null) return 'N/A';
    return channel.toString();
  };

  const getAccessPoint = (client: Station): string => {
    return client.apName || client.apDisplayName || client.apHostname || client.accessPointName || 'N/A';
  };

  const getAPSerial = (client: Station): string => {
    return client.apSerial || client.apSerialNumber || client.apSn || client.accessPointSerial || 'N/A';
  };

  // Helper component for displaying field values
  const FieldDisplay = ({ 
    label, 
    value, 
    icon: Icon, 
    isMono = false
  }: { 
    label: string; 
    value: string; 
    icon?: any; 
    isMono?: boolean;
  }) => (
    <div className="flex justify-between">
      <div className="flex items-center space-x-2">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-muted-foreground">{label}:</span>
      </div>
      <div className="flex items-center space-x-1">
        <span className={`font-medium ${isMono ? 'font-mono text-xs' : ''} ${value === 'N/A' ? 'text-muted-foreground' : ''}`}>
          {value}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Client Details</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status Overview */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.01] transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
        <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center justify-between">
            <span>Connection Status</span>
            <Badge variant={getStatusBadgeVariiant(clientDetails.status)}>
              {clientDetails.status || 'Unknown'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative">
          <div className="grid grid-cols-2 gap-6">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
                <Signal className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Signal Strength</p>
                <p className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  {(trafficStats?.rss || trafficStats?.signalStrength || clientDetails.signalStrength)
                    ? `${trafficStats?.rss || trafficStats?.signalStrength || clientDetails.signalStrength} dBm`
                    : 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Protocol</p>
                <p className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">{clientDetails.protocol || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Insights */}
      <ClientInsights
        macAddress={macAddress}
        clientName={clientDetails.hostName || macAddress}
        onOpenFullScreen={() => setShowClientInsights(true)}
      />

      {/* Device Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Smartphone className="h-4 w-4" />
            <span>Device Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hostname:</span>
              <span className="font-medium">{clientDetails.hostName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MAC Address:</span>
              <span className="font-mono text-xs">{clientDetails.macAddress}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Address:</span>
              <span className="font-mono text-xs">{clientDetails.ipAddress || 'N/A'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">IPv6 Address:</span>
              <span className="font-mono text-xs truncate" title={clientDetails.ipv6Address || 'N/A'}>{clientDetails.ipv6Address || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Device Type:</span>
              <span className="font-medium">{clientDetails.deviceType || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Manufacturer:</span>
              <span className="font-medium">{clientDetails.manufacturer || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Username:</span>
              <span className="font-medium">{clientDetails.username || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role:</span>
              <div className="flex items-center space-x-2">
                {isLoadingRoleName ? (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <span className={`font-medium ${getRole(clientDetails) === 'N/A' ? 'text-muted-foreground' : ''}`}>
                    {getRole(clientDetails)}
                  </span>
                )}
              </div>
            </div>
            <FieldDisplay 
              label="Last Seen" 
              value={formatDateTime(clientDetails.lastSeen)} 
              icon={Clock}
            />
          </div>
        </CardContent>
      </Card>

      {/* Network Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Wifi className="h-4 w-4" />
            <span>Network Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <div className="flex items-center space-x-2">
                <Wifi className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">SSID:</span>
              </div>
              <div className="flex items-center space-x-2">
                {isLoadingServiceDetails ? (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <span className={`font-medium ${getSSID(clientDetails) === 'N/A' ? 'text-muted-foreground' : ''}`}>
                    {getSSID(clientDetails)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <div className="flex items-center space-x-2">
                <Package className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">VLAN:</span>
              </div>
              <div className="flex items-center space-x-2">
                {isLoadingServiceDetails ? (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <span className={`font-medium ${getVLAN(clientDetails) === 'N/A' ? 'text-muted-foreground' : ''}`}>
                    {getVLAN(clientDetails)}
                  </span>
                )}
              </div>
            </div>
            <FieldDisplay 
              label="Channel" 
              value={getChannel(clientDetails)} 
              icon={Signal}
            />
            <div className="flex justify-between">
              <div className="flex items-center space-x-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Site:</span>
              </div>
              <div className="flex items-center space-x-2">
                {isLoadingSiteName ? (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <span className="font-medium">
                    {resolvedSiteName || clientDetails.siteName || 'N/A'}
                  </span>
                )}
              </div>
            </div>
            <FieldDisplay 
              label="Access Point" 
              value={getAccessPoint(clientDetails)} 
              icon={Activity}
            />

          </div>
        </CardContent>
      </Card>

      {/* Traffic Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Traffic Statistics</span>
            </div>
            {isLoadingTraffic && (
              <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {/* TX/Upload Data */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/20 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Upload className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground">Upload (TX)</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Bytes:</span>
                  <span className="font-medium">
                    {formatBytes(trafficStats?.txBytes || trafficStats?.outBytes || clientDetails.txBytes)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Packets:</span>
                  <span className="font-medium">
                    {formatCompactNumber(trafficStats?.outPackets || clientDetails.outPackets)}
                  </span>
                </div>
              </div>
            </div>

            {/* RX/Download Data */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/20 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Download className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Download (RX)</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Bytes:</span>
                  <span className="font-medium">
                    {formatBytes(trafficStats?.rxBytes || trafficStats?.inBytes || clientDetails.rxBytes)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Packets:</span>
                  <span className="font-medium">
                    {formatCompactNumber(trafficStats?.packets || clientDetails.packets)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Traffic Information */}
          {trafficStats && (
            <div className="pt-3 border-t">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Data:</span>
                  <span className="font-medium">
                    {formatBytes(
                      (trafficStats.txBytes || trafficStats.outBytes || 0) +
                      (trafficStats.rxBytes || trafficStats.inBytes || 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Packets:</span>
                  <span className="font-medium">
                    {formatCompactNumber((trafficStats.outPackets || 0) + (trafficStats.packets || 0))}
                  </span>
                </div>
                {trafficStats.rss && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signal (RSS):</span>
                    <span className="font-medium">{trafficStats.rss} dBm</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Station Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Recent Events</span>
              {stationEvents.length > 0 && (
                <Badge variant="secondary" className="ml-2">{stationEvents.length}</Badge>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {isLoadingEvents && (
                <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {stationEvents.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRoamingTrail(true)}
                  className="h-8 px-2 flex items-center gap-1.5 text-xs"
                  title="View Roaming Trail"
                >
                  <Route className="h-3.5 w-3.5" />
                  Roaming Trail
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingEvents ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stationEvents.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground font-medium mb-2">No station events available</p>
              <p className="text-sm text-muted-foreground mb-2">
                Station {macAddress}
              </p>
              <div className="text-xs text-muted-foreground max-w-md mx-auto space-y-1 mt-4">
                <p>Station events may be unavailable if:</p>
                <p>• Your Campus Controller doesn't support the station events API</p>
                <p>• No events have been logged for this station in the last 30 days</p>
                <p>• Audit logging is not enabled on your controller</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={loadStationEvents}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Event Type Filter and Roaming Trail Button */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={eventTypeFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEventTypeFilter('all')}
                  >
                    All ({stationEvents.length})
                  </Button>
                  {(() => {
                    const eventTypes = Array.from(new Set(stationEvents.map(e => e.eventType).filter(Boolean)));
                    return eventTypes.map((type) => (
                      <Button
                        key={type}
                        variant={eventTypeFilter === type ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEventTypeFilter(type)}
                      >
                        {type} ({stationEvents.filter(e => e.eventType === type).length})
                      </Button>
                    ));
                  })()}
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

              {/* Events List */}
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {stationEvents
                    .filter(event => eventTypeFilter === 'all' || event.eventType === eventTypeFilter)
                    .map((event, idx) => (
                      <div
                        key={event.id || idx}
                        className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <Badge
                            variant={
                              event.eventType === 'Associate' || event.eventType === 'Authenticate' || event.eventType === 'Registration' ? 'default' :
                              event.eventType === 'Disassociate' || event.eventType === 'De-registration' ? 'destructive' :
                              'secondary'
                            }
                            className="text-xs"
                          >
                            {event.eventType || 'Event'}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {(() => {
                              if (!event.timestamp) return 'N/A';
                              const ts = parseInt(event.timestamp);
                              if (isNaN(ts)) return 'N/A';
                              return new Date(ts).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              });
                            })()}
                          </div>
                        </div>

                        {/* Parse and display structured details */}
                        {event.details && (() => {
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
                                  {parsedDetails.Port && (
                                    <div>
                                      <span className="text-muted-foreground">Port: </span>
                                      <span className="font-medium">{parsedDetails.Port}</span>
                                    </div>
                                  )}
                                  {parsedDetails.Network && (
                                    <div>
                                      <span className="text-muted-foreground">Network: </span>
                                      <span className="font-medium">{parsedDetails.Network}</span>
                                    </div>
                                  )}
                                  {parsedDetails.FT && (
                                    <div>
                                      <span className="text-muted-foreground">Fast Transition: </span>
                                      <span className="font-medium">{parsedDetails.FT}</span>
                                    </div>
                                  )}
                                  {/* Signal strength with color indicator */}
                                  {(parsedDetails.Signal || parsedDetails.RSS || parsedDetails.RSSI) && (() => {
                                    const rssi = parseInt(parsedDetails.Signal || parsedDetails.RSS || parsedDetails.RSSI);
                                    if (isNaN(rssi)) return null;
                                    const color = rssi >= -60 ? 'text-green-600' : rssi >= -70 ? 'text-orange-500' : 'text-red-500';
                                    return (
                                      <div>
                                        <span className="text-muted-foreground">Signal: </span>
                                        <span className={`font-medium ${color}`}>{rssi} dBm</span>
                                      </div>
                                    );
                                  })()}
                                  {/* Channel info */}
                                  {parsedDetails.Channel && (
                                    <div>
                                      <span className="text-muted-foreground">Channel: </span>
                                      <span className="font-medium">{parsedDetails.Channel}</span>
                                    </div>
                                  )}
                                  {/* Band/Radio frequency */}
                                  {(parsedDetails.Band || parsedDetails.Radio) && (
                                    <div>
                                      <span className="text-muted-foreground">Band: </span>
                                      <span className="font-medium">{parsedDetails.Band || parsedDetails.Radio}</span>
                                    </div>
                                  )}
                                  {/* Auth method */}
                                  {(parsedDetails.Auth || parsedDetails.AuthMethod) && (
                                    <div>
                                      <span className="text-muted-foreground">Auth: </span>
                                      <span className="font-medium">{parsedDetails.Auth || parsedDetails.AuthMethod}</span>
                                    </div>
                                  )}
                                  {/* Previous AP for roaming context */}
                                  {(parsedDetails.From || parsedDetails.FromAP || parsedDetails.PrevAP) && (
                                    <div>
                                      <span className="text-muted-foreground">From AP: </span>
                                      <span className="font-medium">{parsedDetails.From || parsedDetails.FromAP || parsedDetails.PrevAP}</span>
                                    </div>
                                  )}
                                  {/* SNR if available */}
                                  {parsedDetails.SNR && (
                                    <div>
                                      <span className="text-muted-foreground">SNR: </span>
                                      <span className="font-medium">{parsedDetails.SNR} dB</span>
                                    </div>
                                  )}
                                  {/* Data rate */}
                                  {(parsedDetails.Rate || parsedDetails.DataRate || parsedDetails.PhyRate) && (
                                    <div>
                                      <span className="text-muted-foreground">Rate: </span>
                                      <span className="font-medium">{parsedDetails.Rate || parsedDetails.DataRate || parsedDetails.PhyRate} Mbps</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-foreground mb-2">{event.details}</p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Display all available event fields */}
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
                          {/* Direct API fields for troubleshooting */}
                          {event.rssi && (
                            <div>
                              <span className="text-muted-foreground">Signal: </span>
                              <span className={`font-medium ${event.rssi >= -60 ? 'text-green-600' : event.rssi >= -70 ? 'text-orange-500' : 'text-red-500'}`}>
                                {event.rssi} dBm
                              </span>
                            </div>
                          )}
                          {event.channel && (
                            <div>
                              <span className="text-muted-foreground">Channel: </span>
                              <span className="font-medium">{event.channel}</span>
                            </div>
                          )}
                          {event.band && (
                            <div>
                              <span className="text-muted-foreground">Band: </span>
                              <span className="font-medium">{event.band}</span>
                            </div>
                          )}
                          {event.dataRate && (
                            <div>
                              <span className="text-muted-foreground">Rate: </span>
                              <span className="font-medium">{event.dataRate} Mbps</span>
                            </div>
                          )}
                          {event.previousAp && (
                            <div>
                              <span className="text-muted-foreground">From AP: </span>
                              <span className="font-medium">{event.previousAp}</span>
                            </div>
                          )}
                          {event.authMethod && (
                            <div>
                              <span className="text-muted-foreground">Auth: </span>
                              <span className="font-medium">{event.authMethod}</span>
                            </div>
                          )}
                          {event.reasonCode && (
                            <div>
                              <span className="text-muted-foreground">Reason Code: </span>
                              <span className="font-mono font-medium">{event.reasonCode}</span>
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
                    ))}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Client Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReauthenticate}
              className="flex items-center space-x-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reauthenticate</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisassociate}
              className="flex items-center space-x-2"
            >
              <Ban className="h-4 w-4" />
              <span>Disassociate</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Client Insights Full Screen */}
      {showClientInsights && (
        <ClientInsightsFullScreen
          macAddress={macAddress}
          clientName={clientDetails?.hostName || macAddress}
          onClose={() => setShowClientInsights(false)}
        />
      )}

      {/* Roaming Trail Full Page */}
      {showRoamingTrail && (
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
                    Roaming Trail - {clientDetails?.hostName || macAddress}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Visual timeline showing how this client roamed between access points
                  </p>
                </div>
              </div>
            </div>

            {/* Roaming Trail Content */}
            <div className="flex-1 overflow-auto">
              <RoamingTrail
                events={stationEvents}
                apEvents={apEvents}
                rrmEvents={rrmEvents}
                macAddress={macAddress}
                hostName={clientDetails?.hostName}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}