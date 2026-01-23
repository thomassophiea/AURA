import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
  Settings,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  ChevronDown,
  ChevronRight,
  Radio,
  ArrowUpDown,
  Power,
  Download
} from 'lucide-react';
import { apiService, AccessPoint, APDetails, APStation, APRadio, APAlarm, APAlarmCategory } from '../services/api';
import { toast } from 'sonner';

interface AccessPointDetailProps {
  serialNumber: string;
}

export function AccessPointDetail({ serialNumber }: AccessPointDetailProps) {
  const [apDetails, setApDetails] = useState<APDetails | null>(null);
  const [stations, setStations] = useState<APStation[]>([]);
  const [events, setEvents] = useState<APAlarm[]>([]);
  const [eventCategories, setEventCategories] = useState<APAlarmCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [, setTimeUpdateCounter] = useState(0);
  const [eventDuration, setEventDuration] = useState<number>(14);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(true);

  const loadApDetails = async () => {
    try {
      setIsLoading(true);
      const [details, stationsData] = await Promise.all([
        apiService.getAccessPointDetails(serialNumber),
        apiService.getAccessPointStations(serialNumber).catch(() => [])
      ]);

      // Enrich AP details with formatted uptime
      const enrichedDetails = {
        ...details,
        uptime: (details as any).sysUptime ? formatUptime((details as any).sysUptime) : details.uptime,
        // Calculate average channel utilization from all radios
        channelUtilization: details.radios && details.radios.length > 0
          ? Math.round(details.radios.reduce((sum, radio) => sum + (radio.channelUtilization || 0), 0) / details.radios.length)
          : details.channelUtilization
      };

      setApDetails(enrichedDetails);
      setStations(stationsData);
      setLastRefreshTime(new Date());

      // Load events in parallel (don't block the main details)
      loadEvents();
    } catch (error) {
      console.error('Failed to load AP details:', error);
      toast.error('Failed to load access point details');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      setIsLoadingEvents(true);
      const categories = await apiService.getAccessPointEvents(serialNumber, eventDuration);
      setEventCategories(categories);
      const flatEvents = apiService.flattenAPEvents(categories);
      setEvents(flatEvents);
    } catch (error) {
      console.error('Failed to load AP events:', error);
      // Don't show toast - events are optional
    } finally {
      setIsLoadingEvents(false);
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

  // Reload events when duration changes
  useEffect(() => {
    if (apDetails) {
      loadEvents();
    }
  }, [eventDuration]);

  // Auto-refresh polling
  useEffect(() => {
    const REFRESH_INTERVAL = 60000; // 60 seconds

    const intervalId = setInterval(() => {
      // Only auto-refresh if the page is visible
      if (document.visibilityState === 'visible') {
        console.log('Auto-refreshing AP detail data...');
        setIsAutoRefreshing(true);
        loadApDetails().finally(() => {
          setIsAutoRefreshing(false);
        });
      }
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [serialNumber]);

  // Pause polling when tab becomes inactive, resume when active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became active, refreshing AP detail data...');
        loadApDetails();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [serialNumber]);

  // Force re-render every 10 seconds to update "time ago" text
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeUpdateCounter(prev => prev + 1);
    }, 10000);

    return () => clearInterval(intervalId);
  }, []);

  // Helper function to format time ago
  const getTimeAgo = () => {
    if (!lastRefreshTime) return 'Never';

    const seconds = Math.floor((new Date().getTime() - lastRefreshTime.getTime()) / 1000);

    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Helper function to format uptime from seconds
  const formatUptime = (seconds: number): string => {
    if (seconds === 0 || !seconds) return 'N/A';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : 'N/A';
  };

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
    if (s === 'online' || s === 'connected' || s === 'up' || s === 'in-service' || s === 'inservice') return 'default';
    if (s === 'offline' || s === 'disconnected' || s === 'down') return 'destructive';
    return 'secondary';
  };

  // Get badge variant for event severity
  const getEventBadgeVariant = (level?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!level) return 'secondary';
    const l = level.toLowerCase();
    if (l === 'critical' || l === 'error') return 'destructive';
    if (l === 'major' || l === 'warning') return 'default';
    return 'secondary';
  };

  // Get icon for event category
  const getEventIcon = (category?: string, context?: string) => {
    const cat = (category || '').toLowerCase();
    const ctx = (context || '').toLowerCase();

    if (cat.includes('channel') || ctx.includes('channel')) return Radio;
    if (cat.includes('discovery') || ctx.includes('connect')) return Wifi;
    if (cat.includes('reboot') || ctx.includes('power')) return Power;
    if (cat.includes('upgrade')) return Download;
    if (cat.includes('alarm')) return AlertTriangle;
    return Info;
  };

  // Format event timestamp
  const formatEventTime = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate event summary stats
  const eventStats = {
    total: events.length,
    critical: events.filter(e => e.Level?.toLowerCase() === 'critical').length,
    major: events.filter(e => e.Level?.toLowerCase() === 'major').length,
    categories: [...new Set(events.map(e => e.Category))].length
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-2">
            <Wifi className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Access Point Details</span>
          </div>
          {lastRefreshTime && (
            <p className="text-xs text-muted-foreground mt-1 ml-7">
              Last updated: {getTimeAgo()}
              {isAutoRefreshing && (
                <span className="ml-2 inline-flex items-center">
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  Auto-refreshing...
                </span>
              )}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isAutoRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing || isAutoRefreshing ? 'animate-spin' : ''}`} />
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

      {/* Events Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>Events</span>
              {events.length > 0 && (
                <Badge variant="secondary" className="ml-2">{events.length}</Badge>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Select
                value={String(eventDuration)}
                onValueChange={(val) => setEventDuration(parseInt(val))}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 Hours</SelectItem>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="14">Last 14 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEvents(!showEvents)}
                className="h-8 px-2"
              >
                {showEvents ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        {showEvents && (
          <CardContent>
            {isLoadingEvents ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No events in the last {eventDuration} days
                </p>
              </div>
            ) : (
              <>
                {/* Event Summary Stats */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="p-2 bg-muted/30 rounded-lg text-center">
                    <p className="text-lg font-semibold">{eventStats.total}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  </div>
                  <div className="p-2 bg-destructive/10 rounded-lg text-center">
                    <p className="text-lg font-semibold text-destructive">{eventStats.critical}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Critical</p>
                  </div>
                  <div className="p-2 bg-yellow-500/10 rounded-lg text-center">
                    <p className="text-lg font-semibold text-yellow-600">{eventStats.major}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Major</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded-lg text-center">
                    <p className="text-lg font-semibold">{eventStats.categories}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Categories</p>
                  </div>
                </div>

                {/* Event List */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {events.slice(0, 20).map((event, index) => {
                    const EventIcon = getEventIcon(event.Category, event.Context);
                    const eventKey = `${event.ts}-${event.Id}-${index}`;
                    const isExpanded = expandedEventId === eventKey;

                    return (
                      <div
                        key={eventKey}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          isExpanded ? 'bg-muted/50 border-primary/30' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setExpandedEventId(isExpanded ? null : eventKey)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-md ${
                            event.Level?.toLowerCase() === 'critical'
                              ? 'bg-destructive/10'
                              : event.Level?.toLowerCase() === 'major'
                              ? 'bg-yellow-500/10'
                              : 'bg-muted'
                          }`}>
                            <EventIcon className={`h-4 w-4 ${
                              event.Level?.toLowerCase() === 'critical'
                                ? 'text-destructive'
                                : event.Level?.toLowerCase() === 'major'
                                ? 'text-yellow-600'
                                : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={getEventBadgeVariant(event.Level)} className="text-[10px] px-1.5 py-0">
                                {event.Level || 'Info'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {event.Category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatEventTime(event.ts)}
                              </span>
                            </div>
                            <p className="text-sm truncate">
                              {event.log}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Time:</span>
                                <span className="ml-2 font-medium">{formatEventTime(event.ts)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Type:</span>
                                <span className="ml-2 font-medium">{event.Level}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Category:</span>
                                <span className="ml-2 font-medium">{event.Category}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Context:</span>
                                <span className="ml-2 font-medium">{event.Context}</span>
                              </div>
                              {event.ApName && (
                                <div>
                                  <span className="text-muted-foreground">AP Name:</span>
                                  <span className="ml-2 font-medium">{event.ApName}</span>
                                </div>
                              )}
                              {event.Id && (
                                <div>
                                  <span className="text-muted-foreground">Event ID:</span>
                                  <span className="ml-2 font-medium">{event.Id}</span>
                                </div>
                              )}
                            </div>
                            <div className="pt-2">
                              <span className="text-muted-foreground text-xs">Message:</span>
                              <p className="mt-1 text-sm bg-muted/30 p-2 rounded">
                                {event.log}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {events.length > 20 && (
                    <div className="text-center py-2">
                      <p className="text-xs text-muted-foreground">
                        Showing 20 of {events.length} events
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
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