import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Server, 
  Activity, 
  MapPin, 
  Wifi, 
  Router, 
  Monitor, 
  Smartphone,
  Clock,
  Thermometer,
  Cpu,
  HardDrive,
  Power,
  Settings,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Network,
  Info,
  Calendar,
  Signal
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface DeviceDetailProps {
  deviceId: string;
}

interface DeviceInfo {
  id?: string;
  serialNumber?: string;
  macAddress?: string;
  deviceName?: string;
  deviceType?: string;
  model?: string;
  firmwareVersion?: string;
  status?: string;
  operationalStatus?: string;
  adminStatus?: string;
  siteId?: string;
  siteName?: string;
  location?: string;
  ipAddress?: string;
  lastSeen?: string;
  uptime?: number;
  cpuUtilization?: number;
  memoryUtilization?: number;
  temperature?: number;
  powerStatus?: string;
  configurationStatus?: string;
  managementVlan?: number;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  connectedClients?: number;
  totalPorts?: number;
  activePorts?: number;
  bandwidth?: string;
  [key: string]: any;
}

interface DeviceStats {
  cpuUtilization?: number;
  memoryUtilization?: number;
  temperature?: number;
  uptime?: number;
  throughput?: {
    rx?: number;
    tx?: number;
  };
  errors?: {
    rx?: number;
    tx?: number;
  };
  [key: string]: any;
}

export function DeviceDetail({ deviceId }: DeviceDetailProps) {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch device details
  const fetchDeviceDetails = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v3/devices/${deviceId}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch device details: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setDevice(data);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        toast.error('Request timed out', {
          description: 'The controller is taking too long to respond.',
          duration: 8000
        });
      } else {
        toast.error('Failed to load device details', {
          description: errorMessage,
          duration: 5000
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceId]);

  // Fetch device statistics
  const fetchDeviceStats = useCallback(async () => {
    try {
      const response = await apiService.makeAuthenticatedRequest(`/v3/devices/${deviceId}/stats`, {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch device stats:', error);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDeviceDetails();
    fetchDeviceStats();
  }, [fetchDeviceDetails, fetchDeviceStats]);

  // Get device type icon
  const getDeviceTypeIcon = (type?: string) => {
    if (!type) return <Server className="h-5 w-5" />;
    
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes('access') || normalizedType.includes('ap')) {
      return <Wifi className="h-5 w-5" />;
    } else if (normalizedType.includes('switch')) {
      return <Router className="h-5 w-5" />;
    } else if (normalizedType.includes('controller')) {
      return <Monitor className="h-5 w-5" />;
    } else if (normalizedType.includes('mobile') || normalizedType.includes('phone')) {
      return <Smartphone className="h-5 w-5" />;
    }
    return <Server className="h-5 w-5" />;
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status?: string) => {
    if (!status) return 'secondary';
    
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('online') || normalizedStatus === 'up' || normalizedStatus === 'active') {
      return 'default';
    } else if (normalizedStatus.includes('offline') || normalizedStatus === 'down' || normalizedStatus === 'inactive') {
      return 'destructive';
    } else if (normalizedStatus.includes('warning') || normalizedStatus === 'degraded') {
      return 'outline';
    }
    return 'secondary';
  };

  // Format uptime
  const formatUptime = (uptime?: number) => {
    if (!uptime) return 'N/A';
    
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days} days, ${hours} hours`;
    } else if (hours > 0) {
      return `${hours} hours, ${minutes} minutes`;
    } else {
      return `${minutes} minutes`;
    }
  };

  // Format last seen
  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Never';
    
    try {
      const date = new Date(lastSeen);
      return date.toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  // Format bytes
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <div className="h-6 w-6 bg-muted animate-pulse rounded" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
                <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!device) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Device not found or no data available.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getDeviceTypeIcon(device.deviceType)}
          <div>
            <h3 className="font-semibold">{device.deviceName || 'Unknown Device'}</h3>
            <p className="text-sm text-muted-foreground">
              {device.deviceType} {device.model && `• ${device.model}`}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getStatusBadgeVariant(device.status || device.operationalStatus)}>
            {device.status || device.operationalStatus || 'Unknown'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDeviceDetails(false)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="connectivity">Connectivity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Info className="h-4 w-4" />
                <span>Device Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Serial Number</label>
                  <p className="font-medium">{device.serialNumber || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">MAC Address</label>
                  <p className="font-medium">{device.macAddress || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">IP Address</label>
                  <p className="font-medium">{device.ipAddress || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Firmware Version</label>
                  <p className="font-medium">{device.firmwareVersion || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Site</label>
                  <p className="font-medium">{device.siteName || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Location</label>
                  <p className="font-medium flex items-center">
                    {device.location ? (
                      <>
                        <MapPin className="h-3 w-3 mr-1" />
                        {device.location}
                      </>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
              </div>

              {device.description && (
                <div>
                  <label className="text-sm text-muted-foreground">Description</label>
                  <p className="font-medium">{device.description}</p>
                </div>
              )}

              {device.tags && device.tags.length > 0 && (
                <div>
                  <label className="text-sm text-muted-foreground">Tags</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {device.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span>Status & Health</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Operational Status</label>
                  <div className="flex items-center space-x-2">
                    {(device.status?.toLowerCase().includes('online') || device.operationalStatus?.toLowerCase() === 'up') ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">{device.status || device.operationalStatus || 'Unknown'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Admin Status</label>
                  <div className="flex items-center space-x-2">
                    {device.adminStatus === 'enabled' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Power className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="font-medium">{device.adminStatus || 'Unknown'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Last Seen</label>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{formatLastSeen(device.lastSeen)}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Uptime</label>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{formatUptime(device.uptime)}</span>
                  </div>
                </div>
              </div>

              {device.powerStatus && (
                <div>
                  <label className="text-sm text-muted-foreground">Power Status</label>
                  <div className="flex items-center space-x-2">
                    <Power className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{device.powerStatus}</span>
                  </div>
                </div>
              )}

              {device.configurationStatus && (
                <div>
                  <label className="text-sm text-muted-foreground">Configuration Status</label>
                  <div className="flex items-center space-x-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{device.configurationStatus}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span>Performance Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* CPU Utilization */}
              {(device.cpuUtilization !== undefined || stats?.cpuUtilization !== undefined) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">CPU Utilization</span>
                    </div>
                    <span className="text-sm font-medium">
                      {(device.cpuUtilization || stats?.cpuUtilization || 0).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={device.cpuUtilization || stats?.cpuUtilization || 0} className="h-2" />
                </div>
              )}

              {/* Memory Utilization */}
              {(device.memoryUtilization !== undefined || stats?.memoryUtilization !== undefined) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Memory Utilization</span>
                    </div>
                    <span className="text-sm font-medium">
                      {(device.memoryUtilization || stats?.memoryUtilization || 0).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={device.memoryUtilization || stats?.memoryUtilization || 0} className="h-2" />
                </div>
              )}

              {/* Temperature */}
              {(device.temperature !== undefined || stats?.temperature !== undefined) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Temperature</span>
                    </div>
                    <span className="text-sm font-medium">
                      {(device.temperature || stats?.temperature || 0).toFixed(1)}°C
                    </span>
                  </div>
                  <Progress 
                    value={Math.min((device.temperature || stats?.temperature || 0) / 80 * 100, 100)} 
                    className="h-2" 
                  />
                </div>
              )}

              {/* Throughput */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">RX Throughput</label>
                  <p className="font-medium">{formatBytes(stats?.throughput?.rx || 0)}/s</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">TX Throughput</label>
                  <p className="font-medium">{formatBytes(stats?.throughput?.tx || 0)}/s</p>
                </div>
              </div>

              {/* Errors */}
              {stats?.errors && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">RX Errors</label>
                    <p className="font-medium">{stats.errors.rx || 0}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">TX Errors</label>
                    <p className="font-medium">{stats.errors.tx || 0}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Configuration Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {device.managementVlan && (
                  <div>
                    <label className="text-sm text-muted-foreground">Management VLAN</label>
                    <p className="font-medium">{device.managementVlan}</p>
                  </div>
                )}
                
                {device.bandwidth && (
                  <div>
                    <label className="text-sm text-muted-foreground">Bandwidth</label>
                    <p className="font-medium">{device.bandwidth}</p>
                  </div>
                )}

                {device.totalPorts && (
                  <div>
                    <label className="text-sm text-muted-foreground">Total Ports</label>
                    <p className="font-medium">{device.totalPorts}</p>
                  </div>
                )}

                {device.activePorts !== undefined && (
                  <div>
                    <label className="text-sm text-muted-foreground">Active Ports</label>
                    <p className="font-medium">{device.activePorts}</p>
                  </div>
                )}

                {device.createdAt && (
                  <div>
                    <label className="text-sm text-muted-foreground">Created</label>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{new Date(device.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}

                {device.updatedAt && (
                  <div>
                    <label className="text-sm text-muted-foreground">Last Updated</label>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{new Date(device.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connectivity Tab */}
        <TabsContent value="connectivity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Network className="h-4 w-4" />
                <span>Connectivity Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {device.connectedClients !== undefined && (
                  <div>
                    <label className="text-sm text-muted-foreground">Connected Clients</label>
                    <div className="flex items-center space-x-2">
                      <Signal className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{device.connectedClients}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm text-muted-foreground">Network Status</label>
                  <div className="flex items-center space-x-2">
                    {(device.status?.toLowerCase().includes('online') || device.operationalStatus?.toLowerCase() === 'up') ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">
                      {(device.status?.toLowerCase().includes('online') || device.operationalStatus?.toLowerCase() === 'up') ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>

              {device.ipAddress && (
                <div>
                  <label className="text-sm text-muted-foreground">Network Interface</label>
                  <div className="mt-2 p-3 bg-muted rounded-lg">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">IP Address:</span>
                        <span className="ml-2 font-medium">{device.ipAddress}</span>
                      </div>
                      {device.macAddress && (
                        <div>
                          <span className="text-muted-foreground">MAC Address:</span>
                          <span className="ml-2 font-medium">{device.macAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}