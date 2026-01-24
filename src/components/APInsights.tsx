/**
 * AP Insights Component
 *
 * Displays performance metrics charts for an Access Point
 * Shows throughput, power consumption, client count, channel utilization, etc.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import {
  Activity,
  Zap,
  Users,
  Radio,
  Signal,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Maximize2,
  RefreshCw,
  ArrowLeft,
  Clock
} from 'lucide-react';
import { apiService, APInsightsResponse, APInsightsReport, APInsightsStatistic } from '../services/api';
import { useTimelineNavigation } from '../hooks/useTimelineNavigation';
import { TimelineControls } from './timeline';

interface APInsightsProps {
  serialNumber: string;
  apName: string;
  onOpenFullScreen?: () => void;
}

// Duration options
const DURATION_OPTIONS = [
  { value: '3H', label: 'Last 3 Hours', resolution: 15 },
  { value: '24H', label: 'Last 24 Hours', resolution: 60 },
  { value: '7D', label: 'Last 7 Days', resolution: 360 },
  { value: '30D', label: 'Last 30 Days', resolution: 1440 }
];

// Compact tooltip styling for consistency
const COMPACT_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background) / 0.9)',
  border: '1px solid hsl(var(--border) / 0.3)',
  borderRadius: '4px',
  padding: '4px 6px',
  fontSize: '9px',
  backdropFilter: 'blur(8px)'
};

// Format timestamp for chart
function formatTime(timestamp: number, duration: string): string {
  const date = new Date(timestamp);
  if (duration === '3H' || duration === '24H') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format value with unit
function formatValue(value: number, unit: string): string {
  if (unit === 'bps') {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)} Gbps`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)} Mbps`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)} Kbps`;
    return `${value.toFixed(0)} bps`;
  }
  if (unit === 'dBm') return `${value.toFixed(0)} dBm`;
  if (unit === '%') return `${value.toFixed(0)}%`;
  if (unit === 'W' || unit === 'mW') return `${value.toFixed(1)} W`;
  return value.toFixed(1);
}

// Transform report data for charts
function transformReportData(report: APInsightsReport | undefined, duration: string): any[] {
  if (!report || !report.statistics || report.statistics.length === 0) return [];

  const dataMap = new Map<number, any>();

  report.statistics.forEach((stat: APInsightsStatistic) => {
    if (!stat.values) return;
    stat.values.forEach((point) => {
      const ts = point.timestamp;
      if (!dataMap.has(ts)) {
        dataMap.set(ts, { timestamp: ts, time: formatTime(ts, duration) });
      }
      const entry = dataMap.get(ts);
      entry[stat.statName] = parseFloat(point.value) || 0;
    });
  });

  return Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Check if chart data has actual values beyond just timestamp/time
function hasActualChartData(data: any[]): boolean {
  if (!data || data.length === 0) return false;

  // Check if any entry has values beyond just timestamp/time
  return data.some(entry => {
    const keys = Object.keys(entry).filter(k => k !== 'timestamp' && k !== 'time');
    return keys.some(k => {
      const value = entry[k];
      return value !== null && value !== undefined && !isNaN(value) && value !== 0;
    });
  });
}

// Chart colors
const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  secondary: 'hsl(var(--muted-foreground))',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899'
};

export function APInsights({ serialNumber, apName, onOpenFullScreen }: APInsightsProps) {
  const [insights, setInsights] = useState<APInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState('3H');
  const [expanded, setExpanded] = useState(true);

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const resolution = DURATION_OPTIONS.find(d => d.value === duration)?.resolution || 15;
        const data = await apiService.getAccessPointInsights(serialNumber, duration, resolution);
        if (!cancelled) {
          setInsights(data);
        }
      } catch (error) {
        console.error('Failed to load AP insights:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [serialNumber, duration]);

  // Calculate summary stats - only return valid data
  const stats = useMemo(() => {
    if (!insights) return null;

    const throughput = insights.throughputReport?.[0];
    const power = insights.apPowerConsumptionTimeseries?.[0];
    const clients = insights.countOfUniqueUsersReport?.[0];

    const avgThroughputValues = throughput?.statistics?.find(s => s.statName === 'Total')?.values;
    const avgPowerValues = power?.statistics?.find(s => s.statName === 'Power Consumption')?.values;
    const avgClientsValues = clients?.statistics?.find(s => s.statName === 'tntUniqueUsers')?.values;

    const avgThroughput = avgThroughputValues && avgThroughputValues.length > 0
      ? avgThroughputValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) / avgThroughputValues.length
      : null;

    const avgPower = avgPowerValues && avgPowerValues.length > 0
      ? avgPowerValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) / avgPowerValues.length
      : null;

    const peakClients = avgClientsValues && avgClientsValues.length > 0
      ? Math.max(...avgClientsValues.map(v => parseFloat(v.value) || 0))
      : null;

    // Check if we have any valid data
    const hasValidData = (avgThroughput !== null && !isNaN(avgThroughput) && avgThroughput > 0) ||
                         (avgPower !== null && !isNaN(avgPower) && avgPower > 0) ||
                         (peakClients !== null && !isNaN(peakClients) && peakClients > 0);

    if (!hasValidData) return null;

    return {
      avgThroughput,
      avgPower,
      peakClients
    };
  }, [insights]);

  return (
    <Card
      className={onOpenFullScreen ? "cursor-pointer border-primary/30 hover:border-primary hover:bg-accent/50 hover:shadow-md transition-all" : ""}
      onClick={onOpenFullScreen}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AP Insights</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto mr-1">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger
                className="w-[110px] h-7 text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <Clock className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {onOpenFullScreen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFullScreen();
                }}
                className="h-7 w-7 p-0"
                title="Expand Full Screen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="h-7 w-7 p-0"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-2">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-3">
              {stats.avgThroughput !== null && !isNaN(stats.avgThroughput) && stats.avgThroughput > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{formatValue(stats.avgThroughput, 'bps')}</p>
                  <p className="text-[10px] text-muted-foreground">Avg Throughput</p>
                </div>
              )}
              {stats.peakClients !== null && !isNaN(stats.peakClients) && stats.peakClients > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{stats.peakClients}</p>
                  <p className="text-[10px] text-muted-foreground">Peak Clients</p>
                </div>
              )}
              {stats.avgPower !== null && !isNaN(stats.avgPower) && stats.avgPower > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{stats.avgPower.toFixed(1)}W</p>
                  <p className="text-[10px] text-muted-foreground">Avg Power</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">Click to view detailed insights</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Full-screen AP Insights component
interface APInsightsFullScreenProps {
  serialNumber: string;
  apName: string;
  onClose: () => void;
}

export function APInsightsFullScreen({ serialNumber, apName, onClose }: APInsightsFullScreenProps) {
  const [insights, setInsights] = useState<APInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState('3H');
  const [refreshKey, setRefreshKey] = useState(0);

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  const handleRefresh = () => setRefreshKey(k => k + 1);

  // Timeline navigation hook
  const timeline = useTimelineNavigation('ap-insights');

  // Helper function to format X-axis ticks
  const formatXAxisTick = (timestamp: number, duration: string): string => {
    const date = new Date(timestamp);
    if (duration === '3H' || duration === '24H') {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const resolution = DURATION_OPTIONS.find(d => d.value === duration)?.resolution || 15;
        const data = await apiService.getAccessPointInsights(serialNumber, duration, resolution);
        if (!cancelled) {
          setInsights(data);
        }
      } catch (error) {
        console.error('Failed to load AP insights:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [serialNumber, duration, refreshKey]);

  // Soft reset timeline when duration changes (preserve lock state and current time)
  useEffect(() => {
    timeline.softReset();
  }, [duration, timeline.softReset]);

  // Transform data for each chart
  const throughputData = useMemo(() => {
    const report = insights?.throughputReport?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const powerData = useMemo(() => {
    const report = insights?.apPowerConsumptionTimeseries?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const clientData = useMemo(() => {
    const report = insights?.countOfUniqueUsersReport?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rssData = useMemo(() => {
    const report = insights?.baseliningAPRss?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const channelUtil5Data = useMemo(() => {
    const report = insights?.channelUtilization5?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const channelUtil24Data = useMemo(() => {
    const report = insights?.channelUtilization2_4?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const noiseData = useMemo(() => {
    const report = insights?.noisePerRadio?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  // Define all charts with their data - charts with data appear first, empty charts are hidden
  const chartConfigs = useMemo(() => {
    const configs = [
      { id: 'throughput', title: 'Throughput', data: throughputData, hasData: hasActualChartData(throughputData) },
      { id: 'power', title: 'Power Consumption', data: powerData, hasData: hasActualChartData(powerData) },
      { id: 'clients', title: 'Unique Client Count', data: clientData, hasData: hasActualChartData(clientData) },
      { id: 'rss', title: 'RSS (Signal Strength)', data: rssData, hasData: hasActualChartData(rssData) },
      { id: 'channelUtil5', title: 'Channel Utilization 5GHz', data: channelUtil5Data, hasData: hasActualChartData(channelUtil5Data) },
      { id: 'channelUtil24', title: 'Channel Utilization 2.4GHz', data: channelUtil24Data, hasData: hasActualChartData(channelUtil24Data) },
      { id: 'noise', title: 'Noise Per Channel', data: noiseData, hasData: hasActualChartData(noiseData) },
    ];

    // Sort: charts with data first, empty charts last (and will be hidden by renderChart)
    return configs.sort((a, b) => {
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      return 0;
    });
  }, [throughputData, powerData, clientData, rssData, channelUtil5Data, channelUtil24Data, noiseData]);

  // Render individual chart based on id
  const renderChart = (config: { id: string; title: string; data: any[]; hasData: boolean }) => {
    // Don't render charts without data
    if (!config.hasData) {
      return null;
    }

    switch (config.id) {
      case 'throughput':
        return (
          <Card key={config.id} className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={throughputData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <defs>
                      <linearGradient id="colorTotalFull" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                    <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area type="monotone" dataKey="Total" stroke={CHART_COLORS.blue} fill="url(#colorTotalFull)" name="Total" />
                    <Area type="monotone" dataKey="Upload" stroke={CHART_COLORS.cyan} fill="transparent" name="Upload" />
                    <Area type="monotone" dataKey="Download" stroke={CHART_COLORS.pink} fill="transparent" name="Download" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'power':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={powerData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} W`} width={50} />
                    <Tooltip contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Line type="monotone" dataKey="Power Consumption" stroke={CHART_COLORS.blue} dot={false} name="Power" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'clients':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={clientData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Line type="stepAfter" dataKey="tntUniqueUsers" stroke={CHART_COLORS.blue} dot={false} name="Unique Users" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'rss':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rssData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <defs>
                      <linearGradient id="colorRss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area type="monotone" dataKey="Rss Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="Rss" stroke={CHART_COLORS.blue} fill="url(#colorRss)" name="RSS" />
                    <Area type="monotone" dataKey="Rss Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'channelUtil5':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={channelUtil5Data}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area type="monotone" dataKey="Available" stackId="1" stroke={CHART_COLORS.warning} fill={CHART_COLORS.warning} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="ClientData" stackId="1" stroke={CHART_COLORS.purple} fill={CHART_COLORS.purple} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="CoChannel" stackId="1" stroke={CHART_COLORS.cyan} fill={CHART_COLORS.cyan} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="Interference" stackId="1" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'channelUtil24':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={channelUtil24Data}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Area type="monotone" dataKey="Available" stackId="1" stroke={CHART_COLORS.warning} fill={CHART_COLORS.warning} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="ClientData" stackId="1" stroke={CHART_COLORS.purple} fill={CHART_COLORS.purple} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="CoChannel" stackId="1" stroke={CHART_COLORS.cyan} fill={CHART_COLORS.cyan} fillOpacity={0.5} />
                    <Area type="monotone" dataKey="Interference" stackId="1" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'noise':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={noiseData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="ap-insights-charts"
                    onClick={(e: any) => {
                      // Click to toggle lock at current position
                      if (e && e.activePayload && e.activePayload[0]) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.toggleLock();
                      }
                    }}
                    onMouseDown={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && e.shiftKey) {
                        timeline.startTimeWindow(e.activePayload[0].payload.timestamp);
                      }
                    }}
                    onMouseMove={(e: any) => {
                      if (e && e.activePayload && e.activePayload[0] && !timeline.isLocked) {
                        const timestamp = e.activePayload[0].payload.timestamp;
                        timeline.setCurrentTime(timestamp);
                        timeline.updateTimeWindow(timestamp);
                      }
                    }}
                    onMouseUp={() => timeline.endTimeWindow()}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} contentStyle={COMPACT_TOOLTIP_STYLE} />
                    <Legend />
                    {timeline.currentTime !== null && (
                      <ReferenceLine
                        x={timeline.currentTime}
                        stroke={timeline.isLocked ? '#8b5cf6' : '#3b82f6'}
                        strokeWidth={timeline.isLocked ? 2 : 1.5}
                        strokeDasharray={timeline.isLocked ? undefined : '4 4'}
                      />
                    )}
                    {timeline.timeWindow.start !== null && timeline.timeWindow.end !== null && (
                      <ReferenceArea
                        x1={Math.min(timeline.timeWindow.start, timeline.timeWindow.end)}
                        x2={Math.max(timeline.timeWindow.start, timeline.timeWindow.end)}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.15}
                        stroke="hsl(var(--primary))"
                        strokeOpacity={0.3}
                      />
                    )}
                    <Line type="monotone" dataKey="R1" stroke={CHART_COLORS.blue} dot={false} name="R1" />
                    <Line type="monotone" dataKey="R2" stroke={CHART_COLORS.cyan} dot={false} name="R2" />
                    <Line type="monotone" dataKey="R3" stroke={CHART_COLORS.pink} dot={false} name="R3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h2 className="text-lg font-semibold">AP Insights</h2>
              <p className="text-sm text-muted-foreground">{apName} ({serialNumber})</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <Clock className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Timeline Controls */}
        <TimelineControls
          currentTime={timeline.currentTime}
          isLocked={timeline.isLocked}
          hasTimeWindow={timeline.timeWindow.start !== null && timeline.timeWindow.end !== null}
          onToggleLock={timeline.toggleLock}
          onClearTimeWindow={timeline.clearTimeWindow}
          onCopyTimeline={() => {
            // Copy timeline FROM client-insights TO ap-insights
            timeline.syncFromScope('client-insights');
          }}
          sourceLabel="Client Insights"
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-6 pb-12">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
            ) : chartConfigs.some(c => c.hasData) ? (
              <div className="grid grid-cols-2 gap-6">
                {chartConfigs.map(config => renderChart(config))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <BarChart3 className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Insights Data Available</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  No performance data is available for this access point in the selected time period.
                  Try selecting a different duration or check back later.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
