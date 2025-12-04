import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { 
  Wifi, 
  Activity, 
  Users, 
  MapPin, 
  Server, 
  Signal,
  Zap,
  HardDrive,
  Cpu,
  RefreshCw,
  Settings
} from 'lucide-react';
import { apiService, AccessPoint, APDetails, APStation, APRadio } from '../services/api';
import { toast } from 'sonner';

interface AccessPointDetailProps {
  serialNumber: string;
}

export function AccessPointDetail({ serialNumber }: AccessPointDetailProps) {
  const [apDetails, setApDetails] = useState<APDetails | null>(null);
  const [stations, setStations] = useState<APStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadApDetails = async () => {
    try {
      setIsLoading(true);
      const [details, stationsData] = await Promise.all([
        apiService.getAccessPointDetails(serialNumber),
        apiService.getAccessPointStations(serialNumber).catch(() => [])
      ]);
      
      setApDetails(details);
      setStations(stationsData);
    } catch (error) {
      console.error('Failed to load AP details:', error);
      toast.error('Failed to load access point details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadApDetails();
    setIsRefreshing(false);
    toast.success('Access point details refreshed');
  };

  useEffect(() => {
    loadApDetails();
  }, [serialNumber]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!apDetails) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load access point details</p>
      </div>
    );
  }

  const getStatusBadgeVariant = (status?: string) => {
    if (!status) return 'secondary';
    const s = status.toLowerCase();
    if (s === 'online' || s === 'connected' || s === 'up') return 'default';
    if (s === 'offline' || s === 'disconnected' || s === 'down') return 'destructive';
    return 'secondary';
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Wifi className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Access Point Details</span>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Status Overview</span>
            <Badge variant={getStatusBadgeVariant(apDetails.status)}>
              {apDetails.status || 'Unknown'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Connected Clients</p>
                <p className="font-medium">{stations.length}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="font-medium">{apDetails.uptime || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Active Radios</p>
                <p className="font-medium">{apDetails.radios?.filter(r => r.adminState).length || 0}/{apDetails.radios?.length || 0}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Signal className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Modes</p>
                <p className="font-medium">{apDetails.radios?.map(r => r.mode.toUpperCase()).join(', ') || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-4 w-4" />
            <span>Device Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Display Name:</span>
              <span className="font-medium">{apDetails.apName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Serial Number:</span>
              <span className="font-mono text-xs">{apDetails.serialNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model:</span>
              <span className="font-medium">{apDetails.model || apDetails.hardwareType || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MAC Address:</span>
              <span className="font-mono text-xs">{apDetails.macAddress || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Address:</span>
              <span className="font-mono text-xs">{apDetails.ipAddress || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Firmware:</span>
              <span className="font-medium">{apDetails.softwareVersion || 'N/A'}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Site:</span>
              <span className="font-medium">{apDetails.hostSite || 'N/A'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Radio Configuration */}
      {apDetails.radios && apDetails.radios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Signal className="h-4 w-4" />
              <span>Radio Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {apDetails.radios.map((radio, index) => (
              <div key={radio.radioIndex || index} className="p-4 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{radio.radioName}</span>
                  </div>
                  <Badge variant={radio.adminState ? 'default' : 'secondary'}>
                    {radio.adminState ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel:</span>
                    <span className="font-medium">{radio.reqChannel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode:</span>
                    <span className="font-medium">{radio.mode.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel Width:</span>
                    <span className="font-medium">{radio.channelwidth.replace('Ch1Width_', '').replace('MHz', ' MHz')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max TX Power:</span>
                    <span className="font-medium">{radio.txMaxPower} dBm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Smart RF:</span>
                    <span className="font-medium">{radio.useSmartRf ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Radio Index:</span>
                    <span className="font-medium">{radio.radioIndex}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {(apDetails.cpuUsage !== undefined || apDetails.memoryUsage !== undefined || apDetails.channelUtilization !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Cpu className="h-4 w-4" />
              <span>Performance Metrics</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {apDetails.cpuUsage !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">CPU Usage:</span>
                <span className="font-medium">{apDetails.cpuUsage}%</span>
              </div>
            )}
            {apDetails.memoryUsage !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Memory Usage:</span>
                <span className="font-medium">{apDetails.memoryUsage}%</span>
              </div>
            )}
            {apDetails.channelUtilization !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Channel Utilization:</span>
                <span className="font-medium">{apDetails.channelUtilization}%</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connected Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Connected Clients</span>
            </div>
            <Badge variant="secondary">{stations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No clients currently connected
            </p>
          ) : (
            <div className="space-y-3">
              {stations.slice(0, 10).map((station, index) => (
                <div key={station.macAddress || index} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {station.hostName || station.macAddress || 'Unknown Client'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {station.macAddress}
                    </p>
                  </div>
                  <div className="text-right">
                    {station.signalStrength && (
                      <p className="text-xs text-muted-foreground">
                        {station.signalStrength} dBm
                      </p>
                    )}
                    {station.dataRate && (
                      <p className="text-xs text-muted-foreground">
                        {station.dataRate}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {stations.length > 10 && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">
                    ... and {stations.length - 10} more clients
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Management Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" size="sm" className="justify-start">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reboot Access Point
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <Settings className="h-4 w-4 mr-2" />
              Configure Settings
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <Activity className="h-4 w-4 mr-2" />
              View Performance Logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}