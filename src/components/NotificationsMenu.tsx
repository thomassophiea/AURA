import { useState, useEffect } from 'react';
import { 
  Bell, 
  Search, 
  Settings, 
  Filter,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Shield,
  Wifi,
  Server,
  Users,
  XCircle,
  Activity
} from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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

interface NotificationItem {
  id: string;
  type: 'critical' | 'non-critical' | 'information';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'security':
      return <Shield className="h-4 w-4" />;
    case 'wireless':
    case 'wifi':
      return <Wifi className="h-4 w-4" />;
    case 'infrastructure':
    case 'system':
      return <Server className="h-4 w-4" />;
    case 'client':
    case 'user':
      return <Users className="h-4 w-4" />;
    case 'performance':
      return <Activity className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

const getSeverityColor = (severity: string) => {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'text-red-600 bg-red-600/10 border-red-600/20';
    case 'warning':
      return 'text-yellow-600 bg-yellow-600/10 border-yellow-600/20';
    case 'info':
    case 'low':
      return 'text-blue-600 bg-blue-600/10 border-blue-600/20';
    default:
      return 'text-muted-foreground bg-muted/20 border-border';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'acknowledged':
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case 'resolved':
    case 'cleared':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

const getNotificationIcon = (type: NotificationItem['type']) => {
  switch (type) {
    case 'critical':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'non-critical':
      return <AlertCircle className="h-4 w-4 text-warning" />;
    case 'information':
      return <Info className="h-4 w-4 text-info" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
};

const getNotificationTypeLabel = (type: NotificationItem['type']) => {
  switch (type) {
    case 'critical':
      return 'Critical';
    case 'non-critical':
      return 'Non-Critical';
    case 'information':
      return 'Information';
    default:
      return 'Unknown';
  }
};

export function NotificationsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const totalCount = notifications.length;
  const criticalCount = notifications.filter(n => n.type === 'critical').length;
  const nonCriticalCount = notifications.filter(n => n.type === 'non-critical').length;
  const informationCount = notifications.filter(n => n.type === 'information').length;

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      // Try to load notifications from various API endpoints
      const alertsData = await loadAlertsData();
      const eventsData = await loadEventsData();
      const systemData = await loadSystemNotifications();
      
      // Combine all notification sources
      const allNotifications = [
        ...alertsData,
        ...eventsData,
        ...systemData
      ];
      
      setNotifications(allNotifications);
    } catch (error) {
      // Silently handle expected API failures - errors are already handled by global error system
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAlertsData = async (): Promise<NotificationItem[]> => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/alerts', { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.status}`);
      }
      const data = await response.json();
      
      // Convert alerts to notifications
      if (Array.isArray(data)) {
        return data.map((alert: Alert, index: number) => ({
          id: alert.id || `alert-${index}`,
          type: alert.severity === 'high' ? 'critical' : alert.severity === 'medium' ? 'non-critical' : 'information',
          title: alert.title || alert.name || 'Alert',
          message: alert.description || alert.message || 'System alert notification',
          timestamp: alert.timestamp ? formatTimestamp(alert.timestamp) : 'Recent',
          isRead: alert.acknowledged || false
        }));
      }
      return [];
    } catch (error) {
      // Silently handle expected API failures - errors are already handled by global error system
      return [];
    }
  };

  const loadEventsData = async (): Promise<NotificationItem[]> => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/events', { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status}`);
      }
      const data = await response.json();
      
      // Convert events to notifications
      if (Array.isArray(data)) {
        return data.slice(0, 10).map((event: Event, index: number) => ({
          id: event.id || `event-${index}`,
          type: 'information',
          title: event.title || event.type || 'System Event',
          message: event.description || event.message || 'System event notification',
          timestamp: event.timestamp ? formatTimestamp(event.timestamp) : 'Recent',
          isRead: true // Events are typically informational and marked as read
        }));
      }
      return [];
    } catch (error) {
      // Silently handle expected API failures - errors are already handled by global error system
      return [];
    }
  };

  const loadSystemNotifications = async (): Promise<NotificationItem[]> => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/notifications', { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }
      const data = await response.json();
      
      // Use direct notification data if available
      if (Array.isArray(data)) {
        return data.map((notification: any, index: number) => ({
          id: notification.id || `notification-${index}`,
          type: notification.type || 'information',
          title: notification.title || 'Notification',
          message: notification.message || notification.description || 'System notification',
          timestamp: notification.timestamp ? formatTimestamp(notification.timestamp) : 'Recent',
          isRead: notification.isRead || notification.read || false
        }));
      }
      return [];
    } catch (error) {
      // Silently handle expected API failures - errors are already handled by global error system
      return [];
    }
  };

  const formatTimestamp = (timestamp: string | number): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return date.toLocaleDateString();
    } catch (error) {
      return 'Recent';
    }
  };

  const handleMarkAllRead = async () => {
    try {
      // Try to mark all as read via API
      await apiService.makeAuthenticatedRequest('/v1/notifications/mark-all-read', { 
        method: 'POST' 
      }, 5000);
    } catch (error) {
      // Silently handle API failures for mark as read operations
    }
    
    // Update local state regardless
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      // Try to mark as read via API
      await apiService.makeAuthenticatedRequest(`/v1/notifications/${id}/read`, { 
        method: 'POST' 
      }, 5000);
    } catch (error) {
      // Silently handle API failures for mark as read operations
    }
    
    // Update local state regardless
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, isRead: true } : n
    ));
  };

  const filteredNotifications = notifications.filter(notification =>
    notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    notification.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFilteredByType = (type?: NotificationItem['type']) => {
    if (!type) return filteredNotifications;
    return filteredNotifications.filter(n => n.type === type);
  };

  const renderNotificationItem = (notification: NotificationItem) => (
    <div
      key={notification.id}
      className={`
        p-4 rounded-lg border transition-all duration-200 cursor-pointer
        ${notification.isRead 
          ? 'bg-background border-border/50 hover:border-border' 
          : 'bg-accent/20 border-accent hover:border-accent/50'
        }
      `}
      onClick={() => handleMarkAsRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getNotificationIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className={`
              font-medium text-sm leading-tight
              ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}
            `}>
              {notification.title}
            </h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!notification.isRead && (
                <div className="w-2 h-2 bg-primary rounded-full" />
              )}
              <Badge 
                variant="outline" 
                className={`
                  text-xs px-2 py-0.5 font-medium
                  ${notification.type === 'critical' 
                    ? 'bg-destructive/10 text-destructive border-destructive/20' 
                    : notification.type === 'non-critical'
                    ? 'bg-warning/10 text-warning border-warning/20'
                    : 'bg-info/10 text-info border-info/20'
                  }
                `}
              >
                {getNotificationTypeLabel(notification.type)}
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {notification.timestamp}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 flex items-center justify-center relative"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-destructive text-destructive-foreground border-background"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      
      <SheetContent className="w-96 surface-4dp border-border/50 p-0" side="right">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-4 pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <SheetTitle className="text-lg font-medium">
                  {unreadCount}
                </SheetTitle>
              </div>
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-xs"
                >
                  Mark All Read
                </Button>
              )}
            </div>
            <SheetDescription>
              View and manage your system notifications including alerts, events, and status updates.
            </SheetDescription>
            <div className="text-left mt-2">
              <h3 className="font-medium text-foreground mb-1">Notifications</h3>
              <p className="text-sm text-muted-foreground">
                {unreadCount} unread of {totalCount} total
              </p>
            </div>
          </SheetHeader>

          {/* Search */}
          <div className="p-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 pb-3">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="all" className="text-xs">
                  <span className="flex items-center gap-1">
                    All
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                      {totalCount}
                    </Badge>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="critical" className="text-xs">
                  <span className="flex items-center gap-1">
                    Critical
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                      {criticalCount}
                    </Badge>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="non-critical" className="text-xs">
                  <span className="flex items-center gap-1">
                    Non-Critical
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                      {nonCriticalCount}
                    </Badge>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="information" className="text-xs">
                  <span className="flex items-center gap-1">
                    Information
                    <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                      {informationCount}
                    </Badge>
                  </span>
                </TabsTrigger>
              </TabsList>

              {/* Notifications List */}
              <div className="mt-4">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <TabsContent value="all" className="mt-0">
                    <div className="space-y-3 pr-4">
                      {loading ? (
                        <div className="space-y-3 pr-4">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 rounded-lg border animate-pulse">
                              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                              <div className="h-3 bg-muted rounded w-full mb-1"></div>
                              <div className="h-3 bg-muted rounded w-1/2"></div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {getFilteredByType().map(renderNotificationItem)}
                          {getFilteredByType().length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No notifications found</p>
                              <p className="text-xs mt-1">Notifications will appear here when system events occur</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="critical" className="mt-0">
                    <div className="space-y-3 pr-4">
                      {loading ? (
                        <div className="space-y-3 pr-4">
                          {[1, 2].map(i => (
                            <div key={i} className="p-4 rounded-lg border animate-pulse">
                              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                              <div className="h-3 bg-muted rounded w-full mb-1"></div>
                              <div className="h-3 bg-muted rounded w-1/2"></div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {getFilteredByType('critical').map(renderNotificationItem)}
                          {getFilteredByType('critical').length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No critical notifications</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="non-critical" className="mt-0">
                    <div className="space-y-3 pr-4">
                      {loading ? (
                        <div className="space-y-3 pr-4">
                          {[1, 2].map(i => (
                            <div key={i} className="p-4 rounded-lg border animate-pulse">
                              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                              <div className="h-3 bg-muted rounded w-full mb-1"></div>
                              <div className="h-3 bg-muted rounded w-1/2"></div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {getFilteredByType('non-critical').map(renderNotificationItem)}
                          {getFilteredByType('non-critical').length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No non-critical notifications</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="information" className="mt-0">
                    <div className="space-y-3 pr-4">
                      {loading ? (
                        <div className="space-y-3 pr-4">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 rounded-lg border animate-pulse">
                              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                              <div className="h-3 bg-muted rounded w-full mb-1"></div>
                              <div className="h-3 bg-muted rounded w-1/2"></div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {getFilteredByType('information').map(renderNotificationItem)}
                          {getFilteredByType('information').length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">No information notifications</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                </ScrollArea>
              </div>
            </Tabs>
          </div>

          {/* Footer */}
          <div className="mt-auto border-t border-border/50 p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => toast.info('Feature coming soon', { description: 'Notification settings will be available in a future update.' })}
              >
                <Settings className="h-4 w-4" />
                Notification Settings
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={loadNotifications}
                disabled={loading}
              >
                {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Filter className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}