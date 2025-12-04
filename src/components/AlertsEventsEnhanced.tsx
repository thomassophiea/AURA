import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  XCircle, 
  Activity, 
  RefreshCw, 
  Search,
  Filter,
  AlertCircle,
  Bell,
  BellOff,
  Clock,
  Shield,
  Wifi,
  Server,
  Users,
  TrendingDown,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface Alert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info' | 'low';
  category: string;
  message: string;
  description?: string;
  source: string;
  timestamp: number;
  status: 'active' | 'acknowledged' | 'resolved' | 'cleared';
  affectedDevices?: string[];
  assignedTo?: string;
}

interface Event {
  id: string;
  type: string;
  category: string;
  message: string;
  description?: string;
  source: string;
  timestamp: number;
  severity?: string;
  user?: string;
  device?: string;
  details?: Record<string, any>;
}

export function AlertsEventsEnhanced() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('alerts');
  
  // Filter states
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [selectedTimeRange]);

  const loadData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Calculate time range
      const now = Date.now();
      const timeRanges: Record<string, number> = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000
      };
      const timeAgo = now - (timeRanges[selectedTimeRange] || timeRanges['24h']);

      console.log('[AlertsEvents] Fetching alerts and events...');
      
      // Try multiple endpoints for alerts and events
      const [alertsResponse, eventsResponse, notificationsResponse] = await Promise.allSettled([
        apiService.makeAuthenticatedRequest('/v1/alerts', { method: 'GET' }, 10000),
        apiService.makeAuthenticatedRequest('/v1/events?type=all', { method: 'GET' }, 10000),
        apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 10000)
      ]);

      let loadedAlerts: Alert[] = [];
      let loadedEvents: Event[] = [];

      // Process alerts
      if (alertsResponse.status === 'fulfilled' && alertsResponse.value.ok) {
        try {
          const alertsData = await alertsResponse.value.json();
          const alertsArray = Array.isArray(alertsData) ? alertsData : (alertsData.alerts || alertsData.data || []);
          
          console.log('[AlertsEvents] Processing alerts:', alertsArray.length);
          
          loadedAlerts = alertsArray
            .filter((alert: any) => {
              const timestamp = alert.timestamp || alert.time || alert.createdAt || now;
              return timestamp >= timeAgo;
            })
            .map((alert: any) => ({
              id: alert.id || alert.alertId || `alert-${Date.now()}-${Math.random()}`,
              type: alert.type || alert.alertType || 'general',
              severity: normalizeSeverity(alert.severity || alert.level || alert.priority),
              category: alert.category || categorizeAlert(alert.type || alert.message),
              message: alert.message || alert.name || alert.title || 'Alert',
              description: alert.description || alert.details || alert.summary || '',
              source: alert.source || alert.deviceName || alert.apName || 'System',
              timestamp: alert.timestamp || alert.time || alert.createdAt || now,
              status: normalizeStatus(alert.status || alert.state),
              affectedDevices: alert.affectedDevices || (alert.deviceName ? [alert.deviceName] : []),
              assignedTo: alert.assignedTo || alert.owner
            }));
          
        } catch (error) {
          console.log('[AlertsEvents] Failed to parse alerts:', error);
        }
      } else {
        console.log('[AlertsEvents] Alerts endpoint not available');
      }

      // Process events
      if (eventsResponse.status === 'fulfilled' && eventsResponse.value.ok) {
        try {
          const eventsData = await eventsResponse.value.json();
          const eventsArray = Array.isArray(eventsData) ? eventsData : (eventsData.events || eventsData.data || []);
          
          console.log('[AlertsEvents] Processing events:', eventsArray.length);
          
          loadedEvents = eventsArray
            .filter((event: any) => {
              const timestamp = event.timestamp || event.time || event.createdAt || now;
              return timestamp >= timeAgo;
            })
            .map((event: any) => ({
              id: event.id || event.eventId || `event-${Date.now()}-${Math.random()}`,
              type: event.type || event.eventType || 'general',
              category: event.category || categorizeEvent(event.type || event.message),
              message: event.message || event.name || event.title || 'Event',
              description: event.description || event.details || '',
              source: event.source || event.deviceName || event.apName || 'System',
              timestamp: event.timestamp || event.time || event.createdAt || now,
              severity: event.severity || event.level,
              user: event.user || event.userName || event.userId,
              device: event.device || event.deviceName || event.apName,
              details: event.details || event.metadata
            }));
          
        } catch (error) {
          console.log('[AlertsEvents] Failed to parse events:', error);
        }
      }

      // Process notifications as fallback/additional source
      if (notificationsResponse.status === 'fulfilled' && notificationsResponse.value.ok) {
        try {
          const notifData = await notificationsResponse.value.json();
          const notifsArray = Array.isArray(notifData) ? notifData : (notifData.notifications || []);
          
          console.log('[AlertsEvents] Processing notifications:', notifsArray.length);
          
          // Convert notifications to events if not already present
          const notifEvents = notifsArray
            .filter((notif: any) => {
              const timestamp = notif.timestamp || notif.time || now;
              return timestamp >= timeAgo;
            })
            .map((notif: any) => ({
              id: notif.id || `notif-${Date.now()}-${Math.random()}`,
              type: notif.type || 'notification',
              category: notif.category || 'system',
              message: notif.message || notif.title || 'Notification',
              description: notif.description || '',
              source: notif.source || 'System',
              timestamp: notif.timestamp || notif.time || now,
              severity: notif.severity,
              details: notif.details
            }));
          
          // Merge with events (avoid duplicates)
          const existingIds = new Set(loadedEvents.map(e => e.id));
          notifEvents.forEach(ne => {
            if (!existingIds.has(ne.id)) {
              loadedEvents.push(ne);
            }
          });
          
        } catch (error) {
          console.log('[AlertsEvents] Failed to parse notifications:', error);
        }
      }

      // Sort by timestamp (newest first)
      loadedAlerts.sort((a, b) => b.timestamp - a.timestamp);
      loadedEvents.sort((a, b) => b.timestamp - a.timestamp);

      setAlerts(loadedAlerts);
      setEvents(loadedEvents);

      if (showRefreshing) {
        toast.success('Data refreshed');
      }

    } catch (error) {
      console.error('[AlertsEvents] Error loading data:', error);
      toast.error('Failed to load alerts and events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const normalizeSeverity = (severity: any): 'critical' | 'warning' | 'info' | 'low' => {
    const sev = String(severity || '').toLowerCase();
    if (sev.includes('critical') || sev.includes('high') || sev.includes('error')) return 'critical';
    if (sev.includes('warning') || sev.includes('warn') || sev.includes('medium')) return 'warning';
    if (sev.includes('info') || sev.includes('information')) return 'info';
    return 'low';
  };

  const normalizeStatus = (status: any): 'active' | 'acknowledged' | 'resolved' | 'cleared' => {
    const stat = String(status || 'active').toLowerCase();
    if (stat.includes('ack')) return 'acknowledged';
    if (stat.includes('resolve') || stat.includes('closed')) return 'resolved';
    if (stat.includes('clear')) return 'cleared';
    return 'active';
  };

  const categorizeAlert = (type: string): string => {
    const t = type.toLowerCase();
    if (t.includes('security') || t.includes('auth') || t.includes('intrusion')) return 'security';
    if (t.includes('ap') || t.includes('access point') || t.includes('wifi')) return 'infrastructure';
    if (t.includes('client') || t.includes('user') || t.includes('station')) return 'clients';
    if (t.includes('network') || t.includes('connectivity')) return 'network';
    if (t.includes('performance') || t.includes('throughput')) return 'performance';
    return 'system';
  };

  const categorizeEvent = (type: string): string => {
    const t = type.toLowerCase();
    if (t.includes('config') || t.includes('setting')) return 'configuration';
    if (t.includes('auth') || t.includes('login') || t.includes('logout')) return 'authentication';
    if (t.includes('connect') || t.includes('disconnect')) return 'connection';
    if (t.includes('update') || t.includes('upgrade')) return 'system';
    return 'general';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'default';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'info': return <Info className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'destructive';
      case 'acknowledged': return 'secondary';
      case 'resolved': return 'default';
      case 'cleared': return 'outline';
      default: return 'outline';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return <Shield className="h-4 w-4" />;
      case 'infrastructure': return <Wifi className="h-4 w-4" />;
      case 'clients': return <Users className="h-4 w-4" />;
      case 'network': return <Server className="h-4 w-4" />;
      case 'performance': return <Activity className="h-4 w-4" />;
      case 'configuration': return <Server className="h-4 w-4" />;
      case 'authentication': return <Shield className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 minute
    if (diff < 60000) return 'Just now';
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 1 day
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Filter alerts
  const filteredAlerts = alerts.filter(alert => {
    const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;
    const matchesCategory = categoryFilter === 'all' || alert.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
    const matchesSearch = searchTerm === '' || 
      alert.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.source.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSeverity && matchesCategory && matchesStatus && matchesSearch;
  });

  // Filter events
  const filteredEvents = events.filter(event => {
    const matchesCategory = categoryFilter === 'all' || event.category === categoryFilter;
    const matchesSearch = searchTerm === '' ||
      event.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.source.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  // Get unique categories
  const alertCategories = ['all', ...Array.from(new Set(alerts.map(a => a.category)))];
  const eventCategories = ['all', ...Array.from(new Set(events.map(e => e.category)))];

  // Calculate statistics
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'active').length;
  const warningCount = alerts.filter(a => a.severity === 'warning' && a.status === 'active').length;
  const activeCount = alerts.filter(a => a.status === 'active').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved' || a.status === 'cleared').length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-10 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded animate-pulse" />
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
          <h2 className="text-3xl tracking-tight">Alerts & Events</h2>
          <p className="text-muted-foreground">
            Real-time system notifications and event monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => loadData(true)} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Critical Alerts</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{warningCount}</div>
            <p className="text-xs text-muted-foreground">Needs review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Active Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">Currently open</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-xs text-muted-foreground">In selected period</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">
            <Bell className="mr-2 h-4 w-4" />
            Alerts ({alerts.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            <Activity className="mr-2 h-4 w-4" />
            Events ({events.length})
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                {activeTab === 'alerts' && (
                  <>
                    <Select value={severityFilter} onValueChange={setSeverityFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Severity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Severities</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="acknowledged">Acknowledged</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="cleared">Cleared</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(activeTab === 'alerts' ? alertCategories : eventCategories).map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>
                Showing {filteredAlerts.length} of {alerts.length} alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <BellOff className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No alerts found</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {searchTerm || severityFilter !== 'all' || statusFilter !== 'all' || categoryFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'All systems operating normally'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlerts.map(alert => (
                        <TableRow key={alert.id}>
                          <TableCell>
                            <Badge variant={getSeverityColor(alert.severity)} className="flex items-center gap-1 w-fit">
                              {getSeverityIcon(alert.severity)}
                              {alert.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(alert.category)}
                              <span className="capitalize">{alert.category}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{alert.message}</div>
                              {alert.description && (
                                <div className="text-sm text-muted-foreground">{alert.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{alert.source}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusColor(alert.status)} className="capitalize">
                              {alert.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatTimestamp(alert.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Events</CardTitle>
              <CardDescription>
                Showing {filteredEvents.length} of {events.length} events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <h3 className="mt-4 text-lg">No events found</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    {searchTerm || categoryFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No events in selected time range'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.map(event => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(event.category)}
                              <span className="capitalize">{event.category}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {event.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{event.message}</div>
                              {event.description && (
                                <div className="text-sm text-muted-foreground">{event.description}</div>
                              )}
                              {event.user && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  User: {event.user}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{event.source}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatTimestamp(event.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Distribution */}
      {activeTab === 'alerts' && alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alert Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from(new Set(alerts.map(a => a.category))).map(category => {
                const count = alerts.filter(a => a.category === category).length;
                const percentage = Math.round((count / alerts.length) * 100);
                
                return (
                  <div key={category} className="p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      {getCategoryIcon(category)}
                      <span className="text-sm font-medium capitalize">{category}</span>
                    </div>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs text-muted-foreground">{percentage}%</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}