import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { formatCompactNumber } from '../lib/units';
import {
  Activity,
  Signal,
  Users,
  Wifi,
  Shield,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Search,
  Filter,
  Info
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { apiService } from '../services/api';
import { useAppContext } from '@/contexts/AppContext';
import { toast } from 'sonner';

interface ReportWidget {
  id: string;
  title: string;
  description: string;
  value: string | number;
  unit?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
  };
  status: 'healthy' | 'warning' | 'critical';
  icon: any;
  endpoint: string;
  category: string;
  lastUpdated?: Date;
}

interface WidgetData {
  [key: string]: any;
}

export function ReportWidgets() {
  const { navigationScope, siteGroups } = useAppContext();
  const [widgets, setWidgets] = useState<ReportWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Define the available report widgets with their endpoints
  const widgetDefinitions: Omit<ReportWidget, 'value' | 'status' | 'lastUpdated'>[] = [
    {
      id: 'network-utilization',
      title: 'Client Load Index',
      description: 'Connected client count as a proxy for network load (no site-scoped channel utilization without a site filter)',
      unit: 'clients',
      icon: Activity,
      endpoint: '/v1/stations',
      category: 'network'
    },
    {
      id: 'client-count',
      title: 'Connected Clients',
      description: 'Total number of active client connections',
      unit: 'clients',
      icon: Users,
      endpoint: '/v1/services/report/widgets/client-count',
      category: 'clients'
    },
    {
      id: 'ap-health',
      title: 'Access Point Health',
      description: 'Overall health status of access points',
      unit: '%',
      icon: Wifi,
      endpoint: '/v1/services/report/widgets/ap-health',
      category: 'infrastructure'
    },
    {
      id: 'throughput',
      title: 'Total Traffic Volume',
      description: 'Cumulative data transferred by all connected clients (lifetime bytes, not a rate)',
      unit: 'MB',
      icon: TrendingUp,
      endpoint: '/v1/stations',
      category: 'network'
    },
    {
      id: 'signal-quality',
      title: 'Signal Quality',
      description: 'Average signal strength across all connections',
      unit: 'dBm',
      icon: Signal,
      endpoint: '/v1/services/report/widgets/signal-quality',
      category: 'radio'
    },
    {
      id: 'security-events',
      title: 'Security Notifications',
      description: 'Security-related notifications in the last 24 hours (sourced from /v1/notifications)',
      unit: 'events',
      icon: Shield,
      endpoint: '/v1/notifications',
      category: 'security'
    },
    {
      id: 'alerts-count',
      title: 'Active Alerts',
      description: 'Warning/critical notifications not yet resolved (sourced from /v1/notifications)',
      unit: 'alerts',
      icon: AlertTriangle,
      endpoint: '/v1/notifications',
      category: 'monitoring'
    },
    {
      id: 'performance-score',
      title: 'Performance Score (Derived)',
      description: 'Composite score: AP connectivity % + client signal quality %. No direct API analog.',
      unit: '/100',
      icon: BarChart3,
      endpoint: '/v1/aps',
      category: 'analytics'
    }
  ];

  const fetchWidgetData = async (widget: Omit<ReportWidget, 'value' | 'status' | 'lastUpdated'>): Promise<ReportWidget> => {
    try {
      let value: string | number = 'N/A';
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      // Use actual Extreme Platform ONE API endpoints to get real data
      switch (widget.id) {
        case 'network-utilization':
          try {
            // NOTE: Real channel utilization requires /v1/report/sites/{siteId} with channelUtil widget.
            // Without a site scope, we use connected client count as a "Client Load Index" proxy.
            // This is a derived metric, not actual RF channel utilization.
            const stationsResp = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 8000);
            if (stationsResp.ok) {
              const stations = await stationsResp.json();
              const stationsArray = Array.isArray(stations) ? stations : [];
              // Client Load Index: 1 point per client, max 100. Reflects congestion tendency.
              const utilization = Math.min(stationsArray.length, 100);
              value = utilization;
              status = utilization > 85 ? 'critical' : utilization > 70 ? 'warning' : 'healthy';
            }
          } catch (err) {
            console.log('Failed to fetch client load data');
          }
          break;

        case 'client-count':
          try {
            // Get actual connected clients count
            const clientsResp = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 8000);
            if (clientsResp.ok) {
              const clients = await clientsResp.json();
              const clientsArray = Array.isArray(clients) ? clients : [];
              value = clientsArray.length;
              status = 'healthy';
            }
          } catch (err) {
            console.log('Failed to fetch client count');
          }
          break;

        case 'ap-health':
          try {
            // Calculate AP health percentage from connected/total APs
            const apsResp = await apiService.makeAuthenticatedRequest('/v1/aps', { method: 'GET' }, 8000);
            if (apsResp.ok) {
              const apsData = await apsResp.json();
              const aps = Array.isArray(apsData) ? apsData : (apsData.aps || apsData.accessPoints || []);
              const totalAPs = aps.length;
              const connectedAPs = aps.filter((ap: any) => {
                const status = ap.status?.toLowerCase() || '';
                return status === 'connected' || status === 'online' || status === 'up';
              }).length;
              
              if (totalAPs > 0) {
                value = Math.round((connectedAPs / totalAPs) * 100);
                status = value < 85 ? 'critical' : value < 95 ? 'warning' : 'healthy';
              } else {
                value = 0;
                status = 'warning';
              }
            }
          } catch (err) {
            console.log('Failed to fetch AP health data');
          }
          break;

        case 'throughput':
          try {
            // NOTE: station inBytes/outBytes are cumulative lifetime totals, not a rate.
            // Real throughput requires /v1/report/sites/{siteId} with throughputReport widget.
            // We sum cumulative bytes as a traffic volume indicator (total MB transferred).
            const stationsResp = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 8000);
            if (stationsResp.ok) {
              const stations = await stationsResp.json();
              const stationsArray = Array.isArray(stations) ? stations : [];

              // Sum cumulative bytes and convert to MB as a traffic volume indicator
              let totalBytes = 0;
              stationsArray.forEach((station: any) => {
                const inBytes = station.inBytes || station.rxBytes || 0;
                const outBytes = station.outBytes || station.txBytes || 0;
                totalBytes += inBytes + outBytes;
              });

              // Display as total MB transferred (cumulative volume, not rate)
              const totalMB = Math.round(totalBytes / (1024 * 1024));
              value = totalMB;
              status = 'healthy';
            }
          } catch (err) {
            console.log('Failed to fetch throughput data');
          }
          break;

        case 'signal-quality':
          try {
            // Calculate average signal strength from clients
            const stationsResp = await apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 8000);
            if (stationsResp.ok) {
              const stations = await stationsResp.json();
              const stationsArray = Array.isArray(stations) ? stations : [];
              
              const signalStrengths = stationsArray
                .map((s: any) => s.signalStrength || s.rss)
                .filter((s: any) => s !== undefined && s !== null && s < 0);
              
              if (signalStrengths.length > 0) {
                const avgSignal = Math.round(
                  signalStrengths.reduce((sum: number, s: number) => sum + s, 0) / signalStrengths.length
                );
                value = avgSignal;
                status = avgSignal < -70 ? 'critical' : avgSignal < -50 ? 'warning' : 'healthy';
              }
            }
          } catch (err) {
            console.log('Failed to fetch signal quality data');
          }
          break;

        case 'security-events':
          try {
            // /v1/events and /v1/alerts are NOT in Swagger. Use /v1/notifications (Swagger: NotificationManager).
            // Filter notifications for security-related keywords and critical severity.
            const notifResp = await apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 8000);
            if (notifResp.ok) {
              const notifData = await notifResp.json();
              const notifications = Array.isArray(notifData) ? notifData : (notifData.notifications || []);

              // Filter for security-related notifications in the last 24 hours
              const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
              const securityNotifications = notifications.filter((n: any) => {
                const timestamp = n.timestamp || n.time || n.createdAt || 0;
                const nType = (n.type || '').toLowerCase();
                const nCategory = (n.category || '').toLowerCase();
                const nSeverity = (n.severity || '').toLowerCase();
                const nMessage = (n.description || n.message || '').toLowerCase();

                const isSecurity =
                  nType.includes('security') ||
                  nCategory.includes('security') ||
                  nSeverity === 'critical' ||
                  nMessage.includes('security') ||
                  nMessage.includes('intrusion') ||
                  nMessage.includes('breach') ||
                  nMessage.includes('unauthorized') ||
                  nMessage.includes('rogue');

                const isRecent = !timestamp || timestamp > oneDayAgo;
                return isSecurity && isRecent;
              });

              value = securityNotifications.length;
              status = value > 5 ? 'critical' : value > 2 ? 'warning' : 'healthy';
            }
          } catch (err) {
            console.log('Failed to fetch security notifications');
          }
          break;

        case 'alerts-count':
          try {
            // /v1/alerts is NOT in Swagger. Use /v1/notifications (Swagger: NotificationManager).
            // Count notifications with warning or critical severity as "active alerts".
            const alertsResp = await apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 8000);
            if (alertsResp.ok) {
              const alertsData = await alertsResp.json();
              const notifications = Array.isArray(alertsData) ? alertsData : (alertsData.notifications || []);

              // Count notifications that represent active issues (warning or critical severity)
              const activeAlerts = notifications.filter((n: any) => {
                const sev = (n.severity || '').toLowerCase();
                const resolved = (n.status || '').toLowerCase();
                return (sev === 'warning' || sev === 'critical') &&
                  resolved !== 'resolved' && resolved !== 'cleared';
              });

              value = activeAlerts.length;
              status = value > 3 ? 'critical' : value > 1 ? 'warning' : 'healthy';
            }
          } catch (err) {
            console.log('Failed to fetch active alerts from notifications');
          }
          break;

        case 'performance-score':
          try {
            // DERIVED SCORE: No single Swagger endpoint provides a "performance score".
            // Formula: (% APs connected * 50) + (% clients with signal > -60dBm * 50).
            // This is a composite heuristic. No real API analog exists.
            const [apsResp, stationsResp] = await Promise.all([
              apiService.makeAuthenticatedRequest('/v1/aps', { method: 'GET' }, 8000),
              apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 8000)
            ]);

            let apScore = 50;
            let clientScore = 50;

            if (apsResp.ok) {
              const apsData = await apsResp.json();
              const aps = Array.isArray(apsData) ? apsData : (apsData.aps || []);
              const totalAPs = aps.length;
              const connectedAPs = aps.filter((ap: any) => {
                const apStatus = ap.status?.toLowerCase() || '';
                return apStatus === 'connected' || apStatus === 'online';
              }).length;

              if (totalAPs > 0) {
                apScore = Math.round((connectedAPs / totalAPs) * 50);
              }
            }

            if (stationsResp.ok) {
              const stations = await stationsResp.json();
              const stationsArray = Array.isArray(stations) ? stations : [];

              // Score based on client signal quality (signal > -60 dBm is "good")
              const goodSignalClients = stationsArray.filter((s: any) => {
                const signal = s.signalStrength || s.rss;
                return signal && signal > -60;
              }).length;

              if (stationsArray.length > 0) {
                clientScore = Math.round((goodSignalClients / stationsArray.length) * 50);
              }
            }

            value = Math.min(apScore + clientScore, 100);
            status = value < 70 ? 'critical' : value < 85 ? 'warning' : 'healthy';
          } catch (err) {
            console.log('Failed to calculate performance score');
          }
          break;

        default:
          // Try the widget-specific endpoint as fallback
          try {
            const response = await apiService.makeAuthenticatedRequest(widget.endpoint, {
              method: 'GET'
            }, 8000);

            if (response.ok) {
              const data = await response.json();
              value = data.value || data.count || data.total || 'N/A';
              status = data.status || 'healthy';
            }
          } catch (err) {
            console.log(`Failed to fetch data for widget ${widget.id}`);
          }
      }

      return {
        ...widget,
        value,
        status,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`Error fetching widget data for ${widget.id}:`, error);
      return {
        ...widget,
        value: 'Error',
        status: 'critical',
        lastUpdated: new Date()
      };
    }
  };

  const loadWidgets = async () => {
    try {
      setLoading(true);

      const isOrgScope = navigationScope === 'global' && siteGroups.length > 0;

      if (isOrgScope) {
        // Org scope: fetch from all controllers and aggregate
        const originalBaseUrl = apiService.getBaseUrl();
        const allResults: ReportWidget[][] = [];

        for (const sg of siteGroups) {
          try {
            apiService.setBaseUrl(`${sg.controller_url}/management`);
            const results = await Promise.all(widgetDefinitions.map(w => fetchWidgetData(w)));
            allResults.push(results);
          } catch (err) {
            console.warn(`[ReportWidgets] Failed to fetch from ${sg.name}:`, err);
          }
        }

        apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);

        // Merge: sum numeric values, pick worst status
        const merged = widgetDefinitions.map((def, idx) => {
          let totalValue = 0;
          let worstStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
          const statusPriority = { healthy: 0, warning: 1, critical: 2 };

          for (const controllerWidgets of allResults) {
            const w = controllerWidgets[idx];
            if (w && typeof w.value === 'number') totalValue += w.value;
            if (w && statusPriority[w.status] > statusPriority[worstStatus]) worstStatus = w.status;
          }

          // For percentage-based widgets (ap-health, signal-quality), average instead of sum
          if ((def.id === 'ap-health' || def.id === 'signal-quality') && allResults.length > 0) {
            totalValue = Math.round(totalValue / allResults.length);
          }

          return { ...def, value: totalValue, status: worstStatus, lastUpdated: new Date() } as ReportWidget;
        });

        setWidgets(merged);
      } else {
        // Single controller
        const widgetPromises = widgetDefinitions.map(widget => fetchWidgetData(widget));
        const loadedWidgets = await Promise.all(widgetPromises);
        setWidgets(loadedWidgets);
      }
    } catch (error) {
      console.log('SUPPRESSED_ANALYTICS_ERROR: Error loading report widgets:', error);
      toast.error('Failed to load some widgets', {
        description: 'Some report widgets may not be available.'
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshWidgets = async () => {
    setRefreshing(true);
    await loadWidgets();
    setRefreshing(false);
    toast.success('Widgets refreshed');
  };

  useEffect(() => {
    loadWidgets();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(loadWidgets, 30000);
    return () => clearInterval(interval);
  }, [navigationScope, siteGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter widgets based on search and filters
  const filteredWidgets = widgets.filter(widget => {
    const matchesSearch = widget.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         widget.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || widget.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || widget.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-status-healthy text-status-healthy';
      case 'warning': return 'bg-status-warning text-status-warning';
      case 'critical': return 'bg-status-critical text-status-critical';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      default: return '→';
    }
  };

  const categories = ['all', ...Array.from(new Set(widgets.map(w => w.category)))];
  const statuses = ['all', 'healthy', 'warning', 'critical'];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>

            <p className="text-muted-foreground">Real-time analytics and monitoring widgets</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-4 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-5 text-high-emphasis">Analytics & Monitoring Hub</h1>
          <p className="text-muted-foreground">
            Real-time widgets and metrics from the controller
          </p>
        </div>
        
        <Button 
          onClick={refreshWidgets} 
          disabled={refreshing}
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search widgets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status === 'all' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredWidgets.map((widget) => {
          const IconComponent = widget.icon;
          
          return (
            <Card key={widget.id} className="hover:transition-all duration-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <IconComponent className="h-5 w-5 text-primary" />
                    <Badge variant="outline" className={getStatusColor(widget.status)}>
                      {widget.status}
                    </Badge>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {widget.category}
                  </Badge>
                </div>
                
                <CardTitle className="text-base">{widget.title}</CardTitle>
                <CardDescription className="text-sm">{widget.description}</CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl font-semibold text-foreground">
                      {typeof widget.value === 'number' ? formatCompactNumber(widget.value) : widget.value}
                    </span>
                    {widget.unit && (
                      <span className="text-sm text-muted-foreground">{widget.unit}</span>
                    )}
                  </div>
                  
                  {widget.trend && (
                    <div className="flex items-center space-x-1 text-sm">
                      <span>{getTrendIcon(widget.trend.direction)}</span>
                      <span className={widget.trend.direction === 'up' ? 'text-success' : 'text-destructive'}>
                        {widget.trend.percentage}%
                      </span>
                      <span className="text-muted-foreground">vs last hour</span>
                    </div>
                  )}
                  
                  {widget.lastUpdated && (
                    <div className="text-xs text-muted-foreground">
                      Updated {widget.lastUpdated.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredWidgets.length === 0 && !loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No widgets found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms or filters to see more widgets.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Widget Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-foreground">{widgets.length}</div>
              <div className="text-sm text-muted-foreground">Total Widgets</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-success">
                {widgets.filter(w => w.status === 'healthy').length}
              </div>
              <div className="text-sm text-muted-foreground">Healthy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-warning">
                {widgets.filter(w => w.status === 'warning').length}
              </div>
              <div className="text-sm text-muted-foreground">Warning</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-destructive">
                {widgets.filter(w => w.status === 'critical').length}
              </div>
              <div className="text-sm text-muted-foreground">Critical</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}