import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
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
  Network
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SaveToWorkspace } from './SaveToWorkspace';

interface DashboardData {
  networkHealth: {
    primaryActiveAPs: number;
    backupActiveAPs: number;
    inactiveAPs: number;
    lowPowerAPs: number;
    globalSyncStatus: string;
    mobilityStatus: boolean;
    linkStatus: string;
    activeSWs: number;
    inactiveSWs: number;
    troubleSWs: number;
    totalClients?: number;
    randomMacClients?: number;
  };
  countOfUniqueUsersReport: Array<{
    statistics: Array<{
      values: Array<{
        timestamp: number;
        value: string;
      }>;
    }>;
  }>;
  topSitesByClientCount: Array<{
    distributionStats: Array<{
      name: string;
      value: number;
    }>;
  }>;
  // New extended data structures
  clientDistribution?: Array<{
    networkName: string;
    clientCount: number;
    ssid?: string;
  }>;
  topActiveDevices?: Array<{
    macAddress: string;
    deviceName?: string;
    apName?: string;
  }>;
  networkUptime?: {
    uptimePercentage: number;
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
  };
}

export function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Utility function to detect randomized MAC addresses
  const isRandomizedMac = (macAddress: string): boolean => {
    if (!macAddress) return false;
    
    // Remove any separators (colons, hyphens, dots)
    const cleanMac = macAddress.replace(/[:-.\s]/g, '').toUpperCase();
    
    // Check if MAC address has valid length
    if (cleanMac.length !== 12) return false;
    
    // Get the second hexadecimal digit (bit 1 of first octet)
    const secondDigit = cleanMac.charAt(1);
    
    // If bit 1 is set (locally administered), it's a random MAC
    // Second digit will be 2, 3, 6, 7, A, B, E, F
    return ['2', '3', '6', '7', 'A', 'B', 'E', 'F'].includes(secondDigit);
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async (showRefreshing = false) => {
    // Check authentication before loading
    if (!apiService.isAuthenticated()) {
      console.warn('[Dashboard] User not authenticated, skipping data load');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      console.log('[Dashboard] Fetching dashboard data...');
      
      // Try multiple possible endpoints for dashboard data
      const endpoints = [
        '/v1/dashboard',
        '/v1/reports/dashboard',
        '/v1/aps/reports/dashboard'
      ];
      
      let response: Response | null = null;
      let successEndpoint = '';
      
      // Try each endpoint until one works
      for (const endpoint of endpoints) {
        try {
          console.log(`[Dashboard] Trying endpoint: ${endpoint}`);
          const resp = await apiService.makeAuthenticatedRequest(
            endpoint, 
            { method: 'GET' }, 
            10000
          );
          
          if (resp.ok) {
            response = resp;
            successEndpoint = endpoint;
            console.log(`[Dashboard] Success with endpoint: ${endpoint}`);
            break;
          } else {
            console.log(`[Dashboard] Endpoint ${endpoint} returned ${resp.status}`);
          }
        } catch (err) {
          console.log(`[Dashboard] Endpoint ${endpoint} failed:`, err);
          continue;
        }
      }
      
      if (response && response.ok) {
        const data = await response.json();
        console.log('[Dashboard] Received dashboard data:', data);
        
        setDashboardData(data);
        
        if (showRefreshing) {
          toast.success('Dashboard refreshed');
        }
      } else {
        // If all endpoints fail, try building dashboard from individual components
        console.log('[Dashboard] Dashboard endpoints unavailable, trying component approach...');
        const componentData = await loadDashboardComponents();
        
        if (componentData) {
          console.log('[Dashboard] Successfully built dashboard from components');
          setDashboardData(componentData);
          if (showRefreshing) {
            toast.success('Dashboard refreshed');
          }
        } else {
          // Silently set error without logging - this is expected for some Extreme Platform ONE versions
          setError('Dashboard endpoint not available. Please check API configuration.');
          
          // Only show toast if user explicitly refreshed
          if (showRefreshing) {
            toast.info('Dashboard unavailable', {
              description: 'This Extreme Platform ONE version does not support dashboard endpoints.'
            });
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[Dashboard] Exception:', err);
      
      if (!showRefreshing) {
        toast.error('Failed to load dashboard', {
          description: errorMessage
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDashboardComponents = async (): Promise<DashboardData | null> => {
    try {
      // Try to build dashboard from individual API calls with comprehensive data
      console.log('[Dashboard] Attempting to build dashboard from components...');
      
      const [apsResponse, clientsResponse, sitesResponse, alertsResponse, eventsResponse] = await Promise.allSettled([
        apiService.makeAuthenticatedRequest('/v1/aps', { method: 'GET' }, 15000),
        apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 15000),
        apiService.makeAuthenticatedRequest('/v1/sites', { method: 'GET' }, 10000),
        apiService.makeAuthenticatedRequest('/v1/alerts', { method: 'GET' }, 10000),
        apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 10000)
      ]);
      
      // Build a comprehensive dashboard structure
      const componentData: DashboardData = {
        networkHealth: {
          primaryActiveAPs: 0,
          backupActiveAPs: 0,
          inactiveAPs: 0,
          lowPowerAPs: 0,
          globalSyncStatus: 'Unknown',
          mobilityStatus: false,
          linkStatus: 'Not configured',
          activeSWs: 0,
          inactiveSWs: 0,
          troubleSWs: 0,
          totalClients: 0,
          randomMacClients: 0
        },
        countOfUniqueUsersReport: [],
        topSitesByClientCount: []
      };
      
      let hasData = false;
      let apsArray: any[] = [];
      let clientsArray: any[] = [];
      let sitesArray: any[] = [];
      
      // Parse APs data if available
      if (apsResponse.status === 'fulfilled' && apsResponse.value.ok) {
        try {
          const apsData = await apsResponse.value.json();
          apsArray = Array.isArray(apsData) ? apsData : (apsData.aps || apsData.accessPoints || []);
          
          console.log('[Dashboard] Processing APs data:', apsArray.length, 'access points found');
          
          // Count AP statuses with more detailed categorization
          apsArray.forEach((ap: any) => {
            const status = ap.status?.toLowerCase() || '';
            const connectionState = ap.connectionState?.toLowerCase() || '';
            const operationalState = ap.operationalState?.toLowerCase() || '';
            
            // Check multiple status fields for more accurate state detection
            const isOnline = status === 'connected' || status === 'online' || status === 'up' ||
                           connectionState === 'connected' || connectionState === 'online' ||
                           operationalState === 'up' || operationalState === 'online';
            
            const isOffline = status === 'disconnected' || status === 'offline' || status === 'down' ||
                            connectionState === 'disconnected' || connectionState === 'offline' ||
                            operationalState === 'down' || operationalState === 'offline';
            
            if (isOnline) {
              // Check if it's primary or backup based on role/type
              const role = ap.role?.toLowerCase() || ap.type?.toLowerCase() || '';
              if (role.includes('backup') || role.includes('standby')) {
                componentData.networkHealth.backupActiveAPs++;
              } else {
                componentData.networkHealth.primaryActiveAPs++;
              }
              hasData = true;
            } else if (isOffline) {
              componentData.networkHealth.inactiveAPs++;
              hasData = true;
            } else {
              // Unknown state, count as inactive
              componentData.networkHealth.inactiveAPs++;
            }
            
            // Check for low power APs
            if (ap.powerMode?.toLowerCase() === 'low' || ap.poeClass === '1' || ap.poeClass === '2') {
              componentData.networkHealth.lowPowerAPs++;
            }
          });
          
          console.log('[Dashboard] Network Health:', componentData.networkHealth);
        } catch (parseError) {
          console.log('[Dashboard] Failed to parse APs response:', parseError);
        }
      } else {
        console.log('[Dashboard] APs request failed:', apsResponse.status === 'fulfilled' ? apsResponse.value.status : 'rejected');
      }
      
      // Parse clients data if available
      if (clientsResponse.status === 'fulfilled' && clientsResponse.value.ok) {
        try {
          const clientsData = await clientsResponse.value.json();
          clientsArray = Array.isArray(clientsData) ? clientsData : (clientsData.clients || clientsData.stations || []);
          
          console.log('[Dashboard] Processing clients data:', clientsArray.length, 'clients found');
          
          // Create a client count report with timestamp data
          if (clientsArray.length > 0) {
            const now = Date.now();
            const oneHourAgo = now - 3600000;
            
            // Count total clients and those with randomized MACs
            let randomMacCount = 0;
            componentData.networkHealth.totalClients = clientsArray.length;
            
            clientsArray.forEach((client: any) => {
              const mac = client.macAddress || client.mac || client.clientMac || '';
              if (isRandomizedMac(mac)) {
                randomMacCount++;
              }
            });
            
            componentData.networkHealth.randomMacClients = randomMacCount;
            console.log('[Dashboard] Detected', randomMacCount, 'clients with randomized MAC addresses out of', clientsArray.length);
            
            // Generate simulated time series data (5-minute intervals)
            const timePoints = [];
            const interval = 300000; // 5 minutes
            for (let t = oneHourAgo; t <= now; t += interval) {
              timePoints.push({
                timestamp: t,
                value: clientsArray.length.toString()
              });
            }
            
            componentData.countOfUniqueUsersReport = [{
              statistics: [{
                count: 0,
                statName: 'tntUniqueUsers',
                type: 'number',
                unit: 'users',
                values: timePoints
              }]
            }];
            hasData = true;
          }
        } catch (parseError) {
          console.log('[Dashboard] Failed to parse clients response:', parseError);
        }
      } else {
        console.log('[Dashboard] Clients request failed:', clientsResponse.status === 'fulfilled' ? clientsResponse.value.status : 'rejected');
      }
      
      // Parse sites data if available
      if (sitesResponse.status === 'fulfilled' && sitesResponse.value.ok) {
        try {
          const sitesData = await sitesResponse.value.json();
          sitesArray = Array.isArray(sitesData) ? sitesData : (sitesData.sites || []);
          
          console.log('[Dashboard] Processing sites data:', sitesArray.length, 'sites found');
          
          // Build site-based statistics
          if (sitesArray.length > 0 && apsArray.length > 0 && clientsArray.length > 0) {
            // Map clients to sites via APs
            const siteClientCounts: Record<string, number> = {};
            const siteNames: Record<string, string> = {};

            // Build site name mapping
            sitesArray.forEach((site: any) => {
              const siteId = site.id || site.siteId || site.uuid;
              const siteName = site.name || site.siteName || `Site ${siteId}`;
              if (siteId) {
                siteNames[siteId] = siteName;
                siteClientCounts[siteId] = 0;
              }
            });

            // Map APs to sites
            const apSiteMap: Record<string, string> = {};
            apsArray.forEach((ap: any) => {
              const apSerial = ap.serialNumber || ap.serial;
              const siteId = ap.siteId || ap.hostSite || ap.location;
              if (apSerial && siteId) {
                apSiteMap[apSerial] = siteId;
              }
            });

            // Count clients per site
            clientsArray.forEach((client: any) => {
              const apSerial = client.apSerialNumber || client.apSerial || client.connectedAP;
              const siteId = apSiteMap[apSerial];

              if (siteId && siteClientCounts[siteId] !== undefined) {
                siteClientCounts[siteId]++;
              }
            });

            // Build top sites by client count
            const topClientSites = Object.entries(siteClientCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([siteId, count]) => ({
                name: siteNames[siteId] || siteId,
                value: count
              }));

            if (topClientSites.length > 0) {
              componentData.topSitesByClientCount = [{
                distributionStats: topClientSites
              }];
              hasData = true;
            }
          }
        } catch (parseError) {
          console.log('[Dashboard] Failed to parse sites response:', parseError);
        }
      }
      
      // Parse alerts/notifications for system status
      if (alertsResponse.status === 'fulfilled' && alertsResponse.value.ok) {
        try {
          const alertsData = await alertsResponse.value.json();
          const alerts = Array.isArray(alertsData) ? alertsData : (alertsData.alerts || []);
          
          console.log('[Dashboard] Processing alerts data:', alerts.length, 'alerts found');
          
          // Check for critical system alerts that affect mobility status
          const criticalAlerts = alerts.filter((alert: any) => 
            alert.severity?.toLowerCase() === 'critical' || 
            alert.level?.toLowerCase() === 'critical'
          );
          
          // Set mobility status based on critical alerts
          componentData.networkHealth.mobilityStatus = criticalAlerts.length === 0;
          componentData.networkHealth.globalSyncStatus = criticalAlerts.length === 0 ? 'In Sync' : 'Issues Detected';
          
        } catch (parseError) {
          console.log('[Dashboard] Failed to parse alerts response:', parseError);
        }
      }
      
      // Parse events/notifications for additional context
      if (eventsResponse.status === 'fulfilled' && eventsResponse.value.ok) {
        try {
          const eventsData = await eventsResponse.value.json();
          const events = Array.isArray(eventsData) ? eventsData : (eventsData.notifications || eventsData.events || []);
          
          console.log('[Dashboard] Processing events data:', events.length, 'events found');
          
          // Could process events for additional insights here
          // For now, just confirm we received the data
          if (events.length > 0) {
            hasData = true;
          }
        } catch (parseError) {
          console.log('[Dashboard] Failed to parse events response:', parseError);
        }
      }
      
      // Set link status based on whether we have data
      if (hasData) {
        componentData.networkHealth.linkStatus = 'Connected';
      }
      
      // If we got at least some data, return it
      if (hasData) {
        console.log('[Dashboard] Successfully built comprehensive dashboard from components');
        return componentData;
      }
      
      console.log('[Dashboard] No data available from components');
      return null;
    } catch (err) {
      console.error('[Dashboard] Failed to build dashboard from components:', err);
      return null;
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const renderNetworkHealth = () => {
    if (!dashboardData?.networkHealth) return null;

    const { networkHealth } = dashboardData;
    const totalAPs = networkHealth.primaryActiveAPs + networkHealth.backupActiveAPs + networkHealth.inactiveAPs;
    const totalSWs = networkHealth.activeSWs + networkHealth.inactiveSWs + networkHealth.troubleSWs;
    const apHealthPercent = totalAPs > 0 ? (networkHealth.primaryActiveAPs / totalAPs) * 100 : 0;
    
    // If no data at all, don't render
    if (totalAPs === 0 && totalSWs === 0) {
      return null;
    }

    return (
      <Card className="surface-2dp border-primary/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>Network Health</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <SaveToWorkspace
                widgetId="dashboard-network-health"
                widgetType="metric_card"
                title="Network Health"
                endpointRefs={['access_points.summary']}
                sourcePage="dashboard"
                catalogId="metric_network_health"
              />
              <Badge variant={apHealthPercent >= 90 ? 'default' : apHealthPercent >= 70 ? 'secondary' : 'destructive'}>
                {apHealthPercent.toFixed(0)}% Healthy
              </Badge>
            </div>
          </div>
          <CardDescription>Real-time network infrastructure status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Access Points */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Access Points</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Active (Primary)</span>
                  <Badge variant="default" className="text-xs">
                    {networkHealth.primaryActiveAPs}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Active (Backup)</span>
                  <Badge variant="secondary" className="text-xs">
                    {networkHealth.backupActiveAPs}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Inactive</span>
                  <Badge variant="outline" className="text-xs">
                    {networkHealth.inactiveAPs}
                  </Badge>
                </div>
                {networkHealth.lowPowerAPs > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-warning">Low Power</span>
                    <Badge variant="outline" className="text-xs text-warning">
                      {networkHealth.lowPowerAPs}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Switches */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Switches</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Badge variant="default" className="text-xs">
                    {networkHealth.activeSWs}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Inactive</span>
                  <Badge variant="outline" className="text-xs">
                    {networkHealth.inactiveSWs}
                  </Badge>
                </div>
                {networkHealth.troubleSWs > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-destructive">Trouble</span>
                    <Badge variant="destructive" className="text-xs">
                      {networkHealth.troubleSWs}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* System Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">System Status</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Global Sync</span>
                  <Badge variant="outline" className="text-xs">
                    {networkHealth.globalSyncStatus}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Mobility</span>
                  <Badge 
                    variant={networkHealth.mobilityStatus ? 'default' : 'outline'} 
                    className="text-xs"
                  >
                    {networkHealth.mobilityStatus ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Link Status</span>
                  <Badge variant="outline" className="text-xs">
                    {networkHealth.linkStatus}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Connected Clients */}
            {networkHealth.totalClients !== undefined && networkHealth.totalClients > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Connected Clients</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total Active</span>
                    <Badge variant="default" className="text-xs">
                      {networkHealth.totalClients}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Standard MACs</span>
                    <Badge variant="secondary" className="text-xs">
                      {networkHealth.totalClients - (networkHealth.randomMacClients || 0)}
                    </Badge>
                  </div>
                  {networkHealth.randomMacClients !== undefined && networkHealth.randomMacClients > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-info" title="Devices using privacy/randomized MAC addresses">
                        Random MACs
                      </span>
                      <Badge variant="outline" className="text-xs text-info border-info/50">
                        {networkHealth.randomMacClients} ({Math.round((networkHealth.randomMacClients / networkHealth.totalClients) * 100)}%)
                      </Badge>
                    </div>
                  )}
                  {networkHealth.randomMacClients === 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Random MACs</span>
                      <Badge variant="outline" className="text-xs">
                        0
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Summary</p>
              </div>
              <div className="space-y-1">
                <div className="text-center py-2">
                  <div className="text-3xl font-bold text-primary">
                    {totalAPs}
                  </div>
                  <div className="text-xs text-muted-foreground">Total APs</div>
                </div>
                <div className="text-center py-2">
                  <div className="text-3xl font-bold text-secondary">
                    {totalSWs}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Switches</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };


  const renderUniqueClientsChart = () => {
    if (!dashboardData?.countOfUniqueUsersReport?.[0]?.statistics?.[0]?.values) return null;

    const values = dashboardData.countOfUniqueUsersReport[0].statistics[0].values;
    
    // Sample every 10th point
    const chartData = values
      .filter((_, index) => index % 10 === 0)
      .map(point => ({
        time: formatTimestamp(point.timestamp),
        clients: parseInt(point.value) || 0,
      }));

    const currentClients = parseInt(values[values.length - 1]?.value || '0');
    const avgClients = Math.round(values.reduce((sum, v) => sum + parseInt(v.value || '0'), 0) / values.length);

    return (
      <Card className="surface-2dp border-info/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-info" />
              <CardTitle>Unique Clients</CardTitle>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Current</div>
                <div className="text-lg font-semibold text-primary">
                  {currentClients}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Average</div>
                <div className="text-sm font-medium text-muted-foreground">
                  {avgClients}
                </div>
              </div>
            </div>
          </div>
          <CardDescription>Connected wireless clients over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis 
                dataKey="time" 
                stroke="var(--muted-foreground)"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="var(--muted-foreground)"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
              />
              <Line
                type="monotone"
                dataKey="clients"
                name="Clients"
                stroke="var(--info)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderTopSites = () => {
    const clientCountSites = dashboardData?.topSitesByClientCount?.[0]?.distributionStats || [];

    if (clientCountSites.length === 0) return null;

    return (
      <Card className="surface-2dp border-secondary/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-secondary" />
            <CardTitle>Top Sites by Clients</CardTitle>
          </div>
          <CardDescription>Sites ranked by user count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {clientCountSites.map((site, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/5 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/20 text-secondary font-semibold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{site.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-secondary">{site.value} clients</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderPerformanceMetrics = () => {
    if (!dashboardData) return null;

    const clientReport = dashboardData.countOfUniqueUsersReport?.[0]?.statistics?.[0];
    const networkHealth = dashboardData.networkHealth;

    // Calculate network health score (0-100)
    const totalAPs = networkHealth.primaryActiveAPs + networkHealth.backupActiveAPs + networkHealth.inactiveAPs;
    const activeAPs = networkHealth.primaryActiveAPs + networkHealth.backupActiveAPs;
    const healthScore = totalAPs > 0 ? Math.round((activeAPs / totalAPs) * 100) : 0;

    // Calculate average clients
    let avgClients = 0;
    let currentClients = 0;
    if (clientReport?.values && clientReport.values.length > 0) {
      const clientValues = clientReport.values.map(v => parseInt(v.value) || 0);
      avgClients = Math.round(clientValues.reduce((sum, val) => sum + val, 0) / clientValues.length);
      currentClients = clientValues[clientValues.length - 1];
    }

    // Only show if we have data
    if (totalAPs === 0 && avgClients === 0) return null;

    return (
      <Card className="surface-2dp border-primary/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>Performance Metrics</CardTitle>
          </div>
          <CardDescription>Real-time network performance indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Network Health Score */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Health Score</p>
              </div>
              <div>
                <p className={`text-2xl font-semibold ${
                  healthScore >= 90 ? 'text-green-500' :
                  healthScore >= 70 ? 'text-yellow-500' :
                  'text-red-500'
                }`}>
                  {healthScore}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeAPs}/{totalAPs} APs online
                </p>
              </div>
            </div>

            {/* Average Clients */}
            {avgClients > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Avg Clients</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-info">{avgClients}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: {currentClients}
                  </p>
                </div>
              </div>
            )}

            {/* Connection Quality */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Quality</p>
              </div>
              <div>
                <p className={`text-2xl font-semibold ${
                  healthScore >= 90 ? 'text-green-500' :
                  healthScore >= 70 ? 'text-yellow-500' :
                  'text-red-500'
                }`}>
                  {healthScore >= 90 ? 'Excellent' :
                   healthScore >= 70 ? 'Good' :
                   'Fair'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Overall rating
                </p>
              </div>
            </div>

            {/* Low Power APs Warning */}
            {networkHealth.lowPowerAPs > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <p className="text-sm text-muted-foreground">Low Power</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warning">{networkHealth.lowPowerAPs}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    APs affected
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="space-y-6">
        <Card className="surface-2dp border-warning/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <CardTitle>Dashboard Data Unavailable</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The dashboard endpoint is not available on this Extreme Platform ONE. The system tried multiple methods to load dashboard data.
            </p>
            <div className="bg-muted/20 border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Alternative Views:</strong>
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Use <strong>Access Points</strong> page to monitor AP health and status</li>
                <li>Use <strong>Connected Clients</strong> page to view active users</li>
                <li>Use <strong>Alerts & Events</strong> page for system notifications</li>
                <li>Use <strong>Report Widgets</strong> page for detailed analytics</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => loadDashboardData()} variant="default" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button 
                onClick={() => window.location.href = '#'} 
                variant="outline"
                size="sm"
                disabled
              >
                Access Points
              </Button>
              <Button 
                onClick={() => window.location.href = '#'} 
                variant="outline"
                size="sm"
                disabled
              >
                Connected Clients
              </Button>
              <Button 
                onClick={() => window.location.href = '#'} 
                variant="outline"
                size="sm"
                disabled
              >
                Report Widgets
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats Card - Always show some info */}
        <Card className="surface-2dp border-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>Quick Navigation</CardTitle>
            </div>
            <CardDescription>Access key system features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/5 border border-border hover:border-primary/50 transition-colors cursor-not-allowed">
                <div className="flex items-center gap-3 mb-2">
                  <Wifi className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">Access Points</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Monitor and manage all access points in your network
                </p>
              </div>
              
              <div className="p-4 rounded-lg bg-muted/5 border border-border hover:border-secondary/50 transition-colors cursor-not-allowed">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-5 w-5 text-secondary" />
                  <h3 className="font-medium">Connected Clients</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  View all active users and their connection details
                </p>
              </div>
              
              <div className="p-4 rounded-lg bg-muted/5 border border-border hover:border-info/50 transition-colors cursor-not-allowed">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-info" />
                  <h3 className="font-medium">Analytics</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Explore detailed network performance metrics
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasFullData = dashboardData &&
    dashboardData.countOfUniqueUsersReport &&
    dashboardData.countOfUniqueUsersReport.length > 0;

  const hasPartialData = dashboardData &&
    (dashboardData.networkHealth.primaryActiveAPs > 0 ||
     dashboardData.networkHealth.inactiveAPs > 0 ||
     (dashboardData.countOfUniqueUsersReport && dashboardData.countOfUniqueUsersReport.length > 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Default Dashboard</h3>
          <p className="text-sm text-muted-foreground">
            {hasFullData 
              ? 'Real-time network monitoring and analytics'
              : 'Basic network status overview'}
          </p>
        </div>
        <Button
          onClick={() => loadDashboardData(true)}
          disabled={refreshing}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Info Banner for Partial Data */}
      {hasPartialData && !hasFullData && (
        <Card className="surface-1dp border-info/30">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-info mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Limited Dashboard Data</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Some dashboard features are unavailable. Showing basic network health from available data sources.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Network Health */}
      {renderNetworkHealth()}

      {/* Performance Metrics */}
      {renderPerformanceMetrics()}

      {/* Unique Clients Chart */}
      {renderUniqueClientsChart()}

      {/* Top Sites */}
      {renderTopSites()}
      
      {/* Show placeholder if we have partial data but no charts */}
      {hasPartialData && !hasFullData && (
        <Card className="surface-2dp border-muted">
          <CardHeader>
            <CardTitle>Additional Analytics</CardTitle>
            <CardDescription>Advanced metrics require full dashboard API support</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/5 border border-dashed border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Performance Trends</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Historical data unavailable
                </p>
              </div>

              <div className="p-4 rounded-lg bg-muted/5 border border-dashed border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Client Analytics</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Advanced metrics unavailable
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}