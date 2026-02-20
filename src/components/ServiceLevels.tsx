import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Skeleton } from './ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, TrendingUp, TrendingDown, Wifi, Cable, Globe, RefreshCw, Calendar, Clock, AlertCircle, CheckCircle2, XCircle, Minus, Zap, BarChart3, MapPin, FolderTree, Radio, Database, Play, Pause, Info } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import { sleDataCollectionService, SLEDataPoint } from '../services/sleDataCollection';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';
import { TYPOGRAPHY, SPACING, CARD_STYLES, ICON_SIZES, formatDateTime, formatMetric, TERMINOLOGY } from '../utils/ui-constants';

interface MetricDefinition {
  key: string;
  name: string;
  unit: string;
  threshold_field: string;
}

interface MetricCatalog {
  wireless: MetricDefinition[];
  wired: MetricDefinition[];
  wan: MetricDefinition[];
}

interface TimeSeriesDataPoint {
  metric_key: string;
  scope: string;
  site_id: string;
  timestamp: number;
  value: number;
  unit: string;
  classifiers?: Record<string, number>;
}

interface SLEMetric {
  key: string;
  name: string;
  currentValue: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  unit: string;
}

interface Site {
  id: string;
  name: string;
}

interface SiteGroup {
  id: string;
  name: string;
}

interface Network {
  id: string;
  name: string;
  ssid?: string;
}

const METRIC_CATALOG: MetricCatalog = {
  wireless: [
    { key: 'time_to_connect', name: 'Time to Connect', unit: 'seconds', threshold_field: 'max_seconds' },
    { key: 'coverage', name: 'Coverage', unit: 'percent_poor_coverage', threshold_field: 'max_percent' },
    { key: 'capacity', name: 'Capacity', unit: 'percent_available_channel_capacity', threshold_field: 'min_available_channel_capacity_percent' },
    { key: 'roaming', name: 'Roaming', unit: 'severity_score_1_to_5', threshold_field: 'max_severity' },
    { key: 'successful_connects', name: 'Successful Connects', unit: 'percent_success', threshold_field: 'min_percent' },
    { key: 'ap_health', name: 'AP Health', unit: 'percent_healthy', threshold_field: 'min_percent' }
  ],
  wired: [
    { key: 'switch_health', name: 'Switch Health', unit: 'percent_healthy', threshold_field: 'min_percent' },
    { key: 'successful_connects', name: 'Successful Connects', unit: 'percent_success', threshold_field: 'min_percent' }
  ],
  wan: [
    { key: 'wan_link_health', name: 'WAN Link Health', unit: 'percent_healthy', threshold_field: 'min_percent' }
  ]
};

const ROLLUP_OPTIONS = [
  { value: '1m', label: '1 minute', ms: 1 * 60 * 1000 },
  { value: '5m', label: '5 minutes', ms: 5 * 60 * 1000 },
  { value: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
  { value: '1h', label: '1 hour', ms: 60 * 60 * 1000 }
];

const TIME_RANGES = [
  { value: '1h', label: 'Last Hour', days: 1/24 },
  { value: '6h', label: 'Last 6 Hours', days: 6/24 },
  { value: '24h', label: 'Last 24 Hours', days: 1 },
  { value: '7d', label: 'Last 7 Days', days: 7 },
  { value: '30d', label: 'Last 30 Days', days: 30 }
];

export function ServiceLevels() {
  const [scope, setScope] = useState<'wireless' | 'wired' | 'wan'>('wireless');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(METRIC_CATALOG.wireless.map(m => m.key));
  const [rollup, setRollup] = useState('1m');
  const [timeRange, setTimeRange] = useState('24h');
  const [isLoading, setIsLoading] = useState(false);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>([]);
  const [cursorTimestamp, setCursorTimestamp] = useState<number>(Date.now());
  const [startTimestamp, setStartTimestamp] = useState<number>(Date.now() - 24 * 60 * 60 * 1000);
  const [endTimestamp, setEndTimestamp] = useState<number>(Date.now());
  const [isCollectionActive, setIsCollectionActive] = useState(false);
  const [collectionStats, setCollectionStats] = useState<any>(null);

  // New filter states
  const [sites, setSites] = useState<Site[]>([]);
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedSiteGroup, setSelectedSiteGroup] = useState<string>('all');
  const [selectedWlan, setSelectedWlan] = useState<string>('all');
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  // Load sites, site groups, and networks on mount
  useEffect(() => {
    loadFilterOptions();
    
    // Check if collection is already running
    setIsCollectionActive(sleDataCollectionService.isCollectionActive());
    updateCollectionStats();
    
    // Subscribe to data updates
    const unsubscribe = sleDataCollectionService.subscribe(() => {
      loadMetricsData();
      updateCollectionStats();
    });
    
    // Load existing data
    loadMetricsData();
    
    return () => {
      unsubscribe();
    };
  }, []);

  // When scope changes, update selected metrics to ALL metrics in the new scope
  useEffect(() => {
    const allMetrics = METRIC_CATALOG[scope].map(m => m.key);
    setSelectedMetrics(allMetrics);
    loadMetricsData();
  }, [scope]);

  useEffect(() => {
    loadMetricsData();
  }, [selectedMetrics, rollup, timeRange, selectedSite, selectedSiteGroup, selectedWlan]);

  const updateCollectionStats = () => {
    const stats = sleDataCollectionService.getStats();
    setCollectionStats(stats);
  };

  const handleStartCollection = () => {
    sleDataCollectionService.startCollection();
    setIsCollectionActive(true);
    toast.success('SLE Data Collection Started', {
      description: 'Collecting client data every minute to generate service level metrics',
      duration: 3000
    });
    updateCollectionStats();
  };

  const handleStopCollection = () => {
    sleDataCollectionService.stopCollection();
    setIsCollectionActive(false);
    toast.info('SLE Data Collection Stopped', {
      description: 'Data collection has been paused',
      duration: 2000
    });
    updateCollectionStats();
  };

  const handleClearData = () => {
    sleDataCollectionService.clearData();
    setTimeSeriesData([]);
    toast.success('SLE Data Cleared', {
      description: 'All collected service level data has been cleared',
      duration: 2000
    });
    updateCollectionStats();
  };

  const loadFilterOptions = async () => {
    setIsLoadingFilters(true);
    try {
      // Load sites
      const sitesResponse = await apiService.makeAuthenticatedRequest('/v1/sites', {
        method: 'GET'
      });
      
      if (sitesResponse.ok) {
        const sitesData = await sitesResponse.json();
        if (Array.isArray(sitesData)) {
          setSites(sitesData.map((site: any) => ({
            id: site.id || site.siteId,
            name: site.name || site.siteName || 'Unnamed Site'
          })));
        }
      }

      // Load networks (WLANs)
      const networksResponse = await apiService.makeAuthenticatedRequest('/v1/networks', {
        method: 'GET'
      });
      
      if (networksResponse.ok) {
        const networksData = await networksResponse.json();
        if (Array.isArray(networksData)) {
          setNetworks(networksData
            .filter((net: any) => net.type === 'employee' || net.type === 'guest')
            .map((net: any) => ({
              id: net.id,
              name: net.name,
              ssid: net.ssid
            })));
        }
      }

      // Note: Site groups may not be available in all API versions
      setSiteGroups([]);
      
    } catch (error) {
      // Silently handle timeout errors - Extreme Platform ONE may be slow
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('timeout') && !errorMessage.includes('timed out')) {
        console.error('Error loading filter options:', error);
      }
    } finally {
      setIsLoadingFilters(false);
    }
  };

  const loadMetricsData = () => {
    setIsLoading(true);
    try {
      // Calculate time range
      const range = TIME_RANGES.find(r => r.value === timeRange);
      const days = range?.days || 1;
      const end = Date.now();
      const start = end - days * 24 * 60 * 60 * 1000;
      
      setStartTimestamp(start);
      setEndTimestamp(end);
      setCursorTimestamp(end);

      // If no metrics selected, clear data
      if (selectedMetrics.length === 0) {
        setTimeSeriesData([]);
        return;
      }

      // Get filtered data from the collection service
      const data = sleDataCollectionService.getFilteredData({
        siteId: selectedSite,
        scope: scope,
        metricKeys: selectedMetrics,
        startTimestamp: start,
        endTimestamp: end
      });

      setTimeSeriesData(data);
      console.log(`[Service Levels] Loaded ${data.length} data points`);
    } catch (error) {
      console.error('[Service Levels] Error loading metrics data:', error);
      setTimeSeriesData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScopeChange = (newScope: string) => {
    setScope(newScope as 'wireless' | 'wired' | 'wan');
  };

  const handleTimeRangeChange = (newRange: string) => {
    setTimeRange(newRange);
    const range = TIME_RANGES.find(r => r.value === newRange);
    if (range) {
      const end = Date.now();
      const start = end - range.days * 24 * 60 * 60 * 1000;
      setStartTimestamp(start);
      setEndTimestamp(end);
      setCursorTimestamp(end);
    }
  };

  const handleCursorChange = (value: number[]) => {
    setCursorTimestamp(value[0]);
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCurrentMetricValues = (): SLEMetric[] => {
    const currentData = timeSeriesData.filter(d => d.timestamp <= cursorTimestamp);
    
    return selectedMetrics.map(metricKey => {
      const metricDef = METRIC_CATALOG[scope].find(m => m.key === metricKey);
      if (!metricDef) return null;

      const metricData = currentData.filter(d => d.metric_key === metricKey);
      if (metricData.length === 0) {
        return {
          key: metricKey,
          name: metricDef.name,
          currentValue: 0,
          threshold: 0,
          status: 'critical' as const,
          trend: 'stable' as const,
          unit: metricDef.unit
        };
      }

      const latestPoint = metricData[metricData.length - 1];
      const previousPoint = metricData.length > 1 ? metricData[metricData.length - 2] : null;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (previousPoint) {
        const change = latestPoint.value - previousPoint.value;
        if (Math.abs(change) > latestPoint.value * 0.05) {
          trend = change > 0 ? 'up' : 'down';
        }
      }

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (metricDef.unit.includes('percent')) {
        if (latestPoint.value < 80) status = 'warning';
        if (latestPoint.value < 60) status = 'critical';
      } else if (metricDef.unit === 'seconds') {
        if (latestPoint.value > 5) status = 'warning';
        if (latestPoint.value > 10) status = 'critical';
      } else if (metricDef.unit === 'severity_score_1_to_5') {
        if (latestPoint.value > 2.5) status = 'warning';
        if (latestPoint.value > 3.5) status = 'critical';
      }

      return {
        key: metricKey,
        name: metricDef.name,
        currentValue: latestPoint.value,
        threshold: 0,
        status,
        trend,
        unit: metricDef.unit
      };
    }).filter(Boolean) as SLEMetric[];
  };

  const getChartData = () => {
    const timestamps = [...new Set(timeSeriesData.map(d => d.timestamp))].sort();
    return timestamps.map(ts => {
      const point: any = { timestamp: ts };
      selectedMetrics.forEach(metricKey => {
        const dataPoint = timeSeriesData.find(d => d.timestamp === ts && d.metric_key === metricKey);
        if (dataPoint) {
          point[metricKey] = dataPoint.value;
        }
      });
      return point;
    });
  };

  const getFilteredDataForTable = () => {
    return timeSeriesData
      .filter(d => d.timestamp <= cursorTimestamp)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  };

  const getMetricColor = (metricKey: string, index: number) => {
    const colors = ['#BB86FC', '#03DAC5', '#FFB74D', '#CF6679', '#81C784', '#64B5F6', '#FFD54F'];
    return colors[index % colors.length];
  };

  const getScopeIcon = (scopeValue: string) => {
    switch (scopeValue) {
      case 'wireless': return <Wifi className="h-4 w-4" />;
      case 'wired': return <Cable className="h-4 w-4" />;
      case 'wan': return <Globe className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'critical': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const currentMetrics = getCurrentMetricValues();
  const showEmptyState = !isLoading && timeSeriesData.length === 0;

  if (isLoading && timeSeriesData.length === 0) {
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
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Real-Time Data Collection Banner */}
      <Alert className="bg-info/10 border-info/30">
        <Database className="h-5 w-5 text-info" />
        <AlertDescription className="ml-2 flex items-center justify-between w-full">
          <div>
            <strong className="font-semibold">Live SLE Data Collection:</strong> Metrics calculated from real client data polled every minute from the controller API.
            {collectionStats && (
              <span className="text-sm ml-2">
                ({collectionStats.totalDataPoints} data points • {collectionStats.sitesMonitored} sites)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCollectionActive ? (
              <Button onClick={handleStopCollection} variant="outline" size="sm" className="gap-2">
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button onClick={handleStartCollection} variant="default" size="sm" className="gap-2">
                <Play className="h-4 w-4" />
                Start Collection
              </Button>
            )}
            <Button onClick={handleClearData} variant="destructive" size="sm">
              Clear Data
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Modern Header with Gradient */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 blur-3xl opacity-30 -z-10" />
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                  Network Intelligence
                </p>
                <p className="text-muted-foreground/80 mt-1">
                  Real-time service level monitoring with historical network rewind
                </p>
              </div>
            </div>
          </div>
          <Button 
            onClick={loadMetricsData} 
            variant="outline" 
            size="sm" 
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="surface-2dp border-primary/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Scope & Filters
          </CardTitle>
          <CardDescription>
            Configure monitoring parameters, sites, and time ranges
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-6">
          {/* Primary Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Scope Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Network Scope
              </label>
              <Select value={scope} onValueChange={handleScopeChange}>
                <SelectTrigger className="border-primary/20 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-2">
                    {getScopeIcon(scope)}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wireless">
                    Wireless ({METRIC_CATALOG.wireless.length} metrics)
                  </SelectItem>
                  <SelectItem value="wired">
                    Wired ({METRIC_CATALOG.wired.length} metrics)
                  </SelectItem>
                  <SelectItem value="wan">
                    WAN ({METRIC_CATALOG.wan.length} metric)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Rollup Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-secondary" />
                Data Rollup
              </label>
              <Select value={rollup} onValueChange={setRollup}>
                <SelectTrigger className="border-secondary/20 hover:border-secondary/40 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLUP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-warning" />
                Time Range
              </label>
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="border-warning/20 hover:border-warning/40 transition-colors">
                  <Calendar className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Secondary Filters Row - Site, Site Group, WLAN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/50">
            {/* Site Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-info" />
                Site
              </label>
              <Select 
                value={selectedSite} 
                onValueChange={setSelectedSite}
                disabled={isLoadingFilters}
              >
                <SelectTrigger className="border-info/20 hover:border-info/40 transition-colors">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Site Group Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <FolderTree className="h-3.5 w-3.5 text-success" />
                Site Group
              </label>
              <Select 
                value={selectedSiteGroup} 
                onValueChange={setSelectedSiteGroup}
                disabled={isLoadingFilters || siteGroups.length === 0}
              >
                <SelectTrigger className="border-success/20 hover:border-success/40 transition-colors">
                  <SelectValue placeholder="All Site Groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Site Groups</SelectItem>
                  {siteGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* WLAN Selector */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-secondary" />
                WLAN {scope !== 'wireless' && <span className="text-xs text-muted-foreground">(Wireless only)</span>}
              </label>
              <Select 
                value={selectedWlan} 
                onValueChange={setSelectedWlan}
                disabled={isLoadingFilters || scope !== 'wireless'}
              >
                <SelectTrigger className="border-secondary/20 hover:border-secondary/40 transition-colors">
                  <SelectValue placeholder="All WLANs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All WLANs</SelectItem>
                  {networks.map((network) => (
                    <SelectItem key={network.id} value={network.id}>
                      {network.name} {network.ssid && `(${network.ssid})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {showEmptyState && (
        <Card className="surface-1dp border-primary/10">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 rounded-full bg-muted/20 mb-4">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Metrics Data Available</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {isCollectionActive 
                ? 'Waiting for data collection... First metrics will appear after 1 minute.'
                : 'Click "Start Collection" above to begin polling client data and generating service level metrics.'}
            </p>
            {!isCollectionActive && (
              <Button onClick={handleStartCollection} variant="default" className="gap-2">
                <Play className="h-4 w-4" />
                Start Data Collection
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Network Rewind Slider */}
      {!showEmptyState && (
      <Card className="surface-2dp border-primary/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            Network Rewind
          </CardTitle>
          <CardDescription>
            Viewing data up to: <strong className="text-primary">{formatTimestamp(cursorTimestamp)}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-6">
          <div className="px-2">
            <Slider
              value={[cursorTimestamp]}
              min={startTimestamp}
              max={endTimestamp}
              step={ROLLUP_OPTIONS.find(r => r.value === rollup)?.ms || 60 * 1000}
              onValueChange={handleCursorChange}
              className="w-full"
            />
          </div>

          <div className="flex justify-between items-center text-xs">
            <div className="flex flex-col">
              <span className="text-muted-foreground uppercase tracking-wider mb-1">Start</span>
              <span className="font-mono font-medium">{formatTimestamp(startTimestamp)}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-muted-foreground uppercase tracking-wider mb-1">End</span>
              <span className="font-mono font-medium">{formatTimestamp(endTimestamp)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursorTimestamp(startTimestamp)}
              className="flex-1 gap-2"
            >
              <TrendingDown className="h-3.5 w-3.5" />
              Jump to Start
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursorTimestamp(endTimestamp)}
              className="flex-1 gap-2"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Jump to End
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Current Metrics Summary */}
      {!showEmptyState && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-1 bg-gradient-to-b from-primary to-secondary rounded-full" />
              <div>
                <h3 className="font-semibold">Live Metrics</h3>
                <p className="text-sm text-muted-foreground">
                  Real-time status for {currentMetrics.length} {scope} metrics
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentMetrics.map((metric, index) => (
              <div 
                key={metric.key} 
                className="group relative overflow-hidden border rounded-xl p-5 surface-2dp hover:surface-4dp transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
              >
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `linear-gradient(135deg, ${getMetricColor(metric.key, index)}15 0%, transparent 100%)`
                  }}
                />
                
                <div className="relative space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {metric.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(metric.trend)}
                      {getStatusIcon(metric.status)}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span 
                      className="text-3xl font-bold tracking-tight"
                      style={{ color: getMetricColor(metric.key, index) }}
                    >
                      {metric.currentValue.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">
                      {metric.unit.includes('percent') ? '%' : metric.unit === 'Mbps' ? 'Mbps' : metric.unit === 'seconds' ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={metric.status === 'healthy' ? 'default' : metric.status === 'warning' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {metric.status === 'healthy' ? 'Healthy' : metric.status === 'warning' ? 'Warning' : 'Critical'}
                    </Badge>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 h-1 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${metric.status === 'healthy' ? 100 : metric.status === 'warning' ? 60 : 30}%`,
                        background: `linear-gradient(90deg, ${getMetricColor(metric.key, index)}, ${getMetricColor(metric.key, index)}80)`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Chart */}
      {!showEmptyState && (
      <Card className="surface-1dp border-primary/10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 via-transparent to-primary/5 pointer-events-none" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-secondary/10 border border-secondary/20">
              <Activity className="h-4 w-4 text-secondary" />
            </div>
            Performance Trends
          </CardTitle>
          <CardDescription>
            Historical analysis of {selectedMetrics.length} {scope} metrics with network rewind cursor
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="h-[400px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={getChartData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,252,0.1)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  stroke="rgba(255,255,252,0.6)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="rgba(255,255,252,0.6)"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e1e1e',
                    border: '1px solid rgba(187, 134, 252, 0.3)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
                />
                <Legend />
                {selectedMetrics.map((metricKey, index) => {
                  const metric = METRIC_CATALOG[scope].find(m => m.key === metricKey);
                  return (
                    <Line
                      key={metricKey}
                      type="monotone"
                      dataKey={metricKey}
                      name={metric?.name || metricKey}
                      stroke={getMetricColor(metricKey, index)}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
                <ReferenceLine
                  x={cursorTimestamp}
                  stroke="#BB86FC"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{ 
                    value: 'Cursor', 
                    position: 'top', 
                    fill: '#BB86FC',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Details Table */}
      {!showEmptyState && (
      <Card className="surface-1dp border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
              <BarChart3 className="h-4 w-4 text-warning" />
            </div>
            Data Points
          </CardTitle>
          <CardDescription>
            Detailed metric values up to cursor position (latest 100 entries)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Timestamp</TableHead>
                  <TableHead className="font-semibold">Metric</TableHead>
                  <TableHead className="font-semibold">Value</TableHead>
                  <TableHead className="font-semibold">Unit</TableHead>
                  <TableHead className="font-semibold">Scope</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getFilteredDataForTable().map((point, index) => {
                  const metric = METRIC_CATALOG[scope].find(m => m.key === point.metric_key);
                  return (
                    <TableRow 
                      key={`${point.timestamp}-${point.metric_key}-${index}`}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <TableCell className="font-mono text-xs">
                        {formatTimestamp(point.timestamp)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {metric?.name || point.metric_key}
                      </TableCell>
                      <TableCell className="font-mono">
                        {point.value.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {point.unit}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {point.scope}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}