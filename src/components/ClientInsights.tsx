/**
 * Client Insights Component
 *
 * Displays performance metrics charts for a Client/Station
 * Shows throughput, RF quality, app groups, RFQI, RTT, RSS, rates, events, retries
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
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
  Signal,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Maximize2,
  RefreshCw,
  ArrowLeft,
  Clock,
  Wifi,
  Gauge
} from 'lucide-react';
import { apiService, ClientInsightsResponse, APInsightsReport, APInsightsStatistic } from '../services/api';
import { useTimelineNavigation } from '../hooks/useTimelineNavigation';
import { TimelineControls } from './timeline';

interface ClientInsightsProps {
  macAddress: string;
  clientName?: string;
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
  if (unit === 'ms') return `${value.toFixed(1)} ms`;
  if (unit === 'Mbps') return `${value.toFixed(1)} Mbps`;
  return value.toFixed(1);
}

// Find value at a specific timestamp (for locked display)
function getValueAtTimestamp(data: any[], timestamp: number, fields: string[]): Record<string, number | null> {
  if (!data || data.length === 0 || timestamp === null) {
    return fields.reduce((acc, field) => ({ ...acc, [field]: null }), {});
  }

  // Find the data point closest to the timestamp
  let closest = data[0];
  let minDiff = Math.abs(data[0].timestamp - timestamp);

  for (const point of data) {
    const diff = Math.abs(point.timestamp - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }

  // Return values for all requested fields
  return fields.reduce((acc, field) => ({
    ...acc,
    [field]: closest[field] !== undefined ? closest[field] : null
  }), {});
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

// Donut chart colors
const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
  '#ef4444', '#f97316', '#ec4899', '#6366f1', '#14b8a6'
];

export function ClientInsights({ macAddress, clientName, onOpenFullScreen }: ClientInsightsProps) {
  const [insights, setInsights] = useState<ClientInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState('3H');
  const [expanded, setExpanded] = useState(false);

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const resolution = DURATION_OPTIONS.find(d => d.value === duration)?.resolution || 15;
        const data = await apiService.getClientInsights(macAddress, duration, resolution, 'default');
        if (!cancelled) {
          setInsights(data);
        }
      } catch (error) {
        console.error('Failed to load Client insights:', error);
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
  }, [macAddress, duration]);

  // Calculate summary stats - only return valid data
  const stats = useMemo(() => {
    if (!insights) return null;

    const throughput = insights.throughputReport?.[0];
    const rfQuality = insights.rfQuality?.[0];

    const avgThroughputValues = throughput?.statistics?.find(s => s.statName === 'Total')?.values;
    const avgRfQualityValues = rfQuality?.statistics?.find(s => s.statName === 'rfQuality')?.values;

    // Get top app group
    const topAppGroups = insights.topAppGroupsByThroughputReport?.[0]?.statistics || [];
    const topAppGroup = topAppGroups.length > 0 ? topAppGroups[0] : null;

    const avgThroughput = avgThroughputValues && avgThroughputValues.length > 0
      ? avgThroughputValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) / avgThroughputValues.length
      : null;

    const avgRfQuality = avgRfQualityValues && avgRfQualityValues.length > 0
      ? avgRfQualityValues.reduce((sum, v) => sum + (parseFloat(v.value) || 0), 0) / avgRfQualityValues.length
      : null;

    const topAppGroupName = topAppGroup?.name || null;

    // Check if we have any valid data
    const hasValidData = (avgThroughput !== null && !isNaN(avgThroughput) && avgThroughput > 0) ||
                         (avgRfQuality !== null && !isNaN(avgRfQuality) && avgRfQuality > 0) ||
                         (topAppGroupName !== null);

    if (!hasValidData) return null;

    return {
      avgThroughput,
      avgRfQuality,
      topAppGroup: topAppGroupName
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
            <span className="text-sm font-medium">Client Insights</span>
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
              {stats.avgRfQuality !== null && !isNaN(stats.avgRfQuality) && stats.avgRfQuality > 0 && (
                <div className="text-center">
                  <p className="text-xl font-semibold">{stats.avgRfQuality.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">RF Quality</p>
                </div>
              )}
              {stats.topAppGroup && (
                <div className="text-center">
                  <p className="text-lg font-semibold truncate" title={stats.topAppGroup}>{stats.topAppGroup}</p>
                  <p className="text-[10px] text-muted-foreground">Top App Group</p>
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

// Full-screen Client Insights component
interface ClientInsightsFullScreenProps {
  macAddress: string;
  clientName?: string;
  onClose: () => void;
}

export function ClientInsightsFullScreen({ macAddress, clientName, onClose }: ClientInsightsFullScreenProps) {
  const [insights, setInsights] = useState<ClientInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState('3H');
  const [refreshKey, setRefreshKey] = useState(0);

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  const handleRefresh = () => setRefreshKey(k => k + 1);

  // Timeline navigation hook
  const timeline = useTimelineNavigation('client-insights');

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
        const data = await apiService.getClientInsights(macAddress, duration, resolution, 'all');
        if (!cancelled) {
          setInsights(data);
        }
      } catch (error) {
        console.error('Failed to load Client insights:', error);
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
  }, [macAddress, duration, refreshKey]);

  // Soft reset timeline when duration changes (preserve lock state and current time)
  useEffect(() => {
    timeline.softReset();
  }, [duration, timeline.softReset]);

  // Transform data for all charts
  const throughputData = useMemo(() => {
    const report = insights?.throughputReport?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rfQualityData = useMemo(() => {
    const report = insights?.rfQuality?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const appGroupsData = useMemo(() => {
    const stats = insights?.topAppGroupsByThroughputReport?.[0]?.statistics || [];
    return stats.map((s, i) => ({
      name: s.name,
      value: s.value,
      color: DONUT_COLORS[i % DONUT_COLORS.length]
    }));
  }, [insights]);

  const appGroupsDetailData = useMemo(() => {
    const report = insights?.appGroupsThroughputDetails?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rfqiData = useMemo(() => {
    const report = insights?.baseliningRFQI?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const wirelessRttData = useMemo(() => {
    const report = insights?.baseliningWirelessRTT?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const networkRttData = useMemo(() => {
    const report = insights?.baseliningNetworkRTT?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rssData = useMemo(() => {
    const report = insights?.baseliningRss?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const rxRateData = useMemo(() => {
    const report = insights?.baseliningRxRate?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const txRateData = useMemo(() => {
    const report = insights?.baseliningTxRate?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const eventsData = useMemo(() => {
    const report = insights?.muEvent?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  const dlRetriesData = useMemo(() => {
    const report = insights?.dlRetries?.[0];
    return transformReportData(report, duration);
  }, [insights, duration]);

  // Define all charts with their data and render functions
  // Charts with data will appear first, empty charts are hidden
  // Some charts rarely have data or require tests, so they go at the bottom
  const chartConfigs = useMemo(() => {
    // Charts that rarely have data or require tests - always at bottom
    const bottomCharts = ['rfQuality', 'rfqi', 'wirelessRtt', 'networkRtt'];

    const configs = [
      { id: 'throughput', title: 'Throughput (Band: All)', data: throughputData, hasData: hasActualChartData(throughputData) },
      { id: 'appGroups', title: 'Top Categories by Throughput', data: appGroupsData, hasData: appGroupsData.length > 0 && appGroupsData.some(d => d.value > 0) },
      { id: 'appGroupsDetail', title: 'App Group Detail', data: appGroupsDetailData, hasData: hasActualChartData(appGroupsDetailData) },
      { id: 'rss', title: 'RSS', data: rssData, hasData: hasActualChartData(rssData) },
      { id: 'rxRate', title: 'RxRate', data: rxRateData, hasData: hasActualChartData(rxRateData) },
      { id: 'txRate', title: 'TxRate', data: txRateData, hasData: hasActualChartData(txRateData) },
      { id: 'events', title: 'Events', data: eventsData, hasData: hasActualChartData(eventsData) },
      { id: 'dlRetries', title: 'DL Retries', data: dlRetriesData, hasData: hasActualChartData(dlRetriesData) },
      // Charts that rarely have data - at bottom
      { id: 'rfQuality', title: 'RF Quality (Band: All)', data: rfQualityData, hasData: hasActualChartData(rfQualityData) },
      { id: 'rfqi', title: 'RFQI', data: rfqiData, hasData: hasActualChartData(rfqiData) },
      { id: 'wirelessRtt', title: 'WirelessRTT (Requires Test)', data: wirelessRttData, hasData: hasActualChartData(wirelessRttData) },
      { id: 'networkRtt', title: 'NetworkRTT (Requires Test)', data: networkRttData, hasData: hasActualChartData(networkRttData) },
    ];

    // Sort: charts with data first, but bottom charts always at bottom
    return configs.sort((a, b) => {
      const aBottom = bottomCharts.includes(a.id);
      const bBottom = bottomCharts.includes(b.id);

      // Bottom charts go to the bottom
      if (aBottom && !bBottom) return 1;
      if (!aBottom && bBottom) return -1;

      // Within same category, sort by hasData
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      return 0;
    });
  }, [throughputData, rfQualityData, appGroupsData, appGroupsDetailData, rfqiData, wirelessRttData, networkRttData, rssData, rxRateData, txRateData, eventsData, dlRetriesData]);

  // Render individual chart based on id
  const renderChart = (config: { id: string; title: string; data: any[]; hasData: boolean }) => {
    // Don't render charts without data
    if (!config.hasData) {
      return null;
    }

    switch (config.id) {
      case 'throughput':
        const lockedThroughputValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(throughputData, timeline.currentTime, ['Total', 'Upload', 'Download'])
          : null;
        return (
          <Card key={config.id} className="col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedThroughputValues && (
                  <div className="flex gap-3 text-xs">
                    {lockedThroughputValues.Total !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-blue-500 font-semibold mr-1">Total:</span> {formatValue(lockedThroughputValues.Total, 'bps')}
                      </Badge>
                    )}
                    {lockedThroughputValues.Upload !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-cyan-500 font-semibold mr-1">Up:</span> {formatValue(lockedThroughputValues.Upload, 'bps')}
                      </Badge>
                    )}
                    {lockedThroughputValues.Download !== null && (
                      <Badge variant="secondary" className="font-mono">
                        <span className="text-pink-500 font-semibold mr-1">Down:</span> {formatValue(lockedThroughputValues.Download, 'bps')}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={throughputData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorTotalClient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                    <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="Total" stroke={CHART_COLORS.blue} fill="url(#colorTotalClient)" name="Total" />
                    <Area type="monotone" dataKey="Upload" stroke={CHART_COLORS.cyan} fill="transparent" name="Upload" />
                    <Area type="monotone" dataKey="Download" stroke={CHART_COLORS.pink} fill="transparent" name="Download" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'rfQuality':
        const lockedRfQualityValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(rfQualityData, timeline.currentTime, ['rfQuality'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedRfQualityValues && lockedRfQualityValues.rfQuality !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-emerald-500 font-semibold mr-1">Quality:</span> {lockedRfQualityValues.rfQuality.toFixed(0)}%
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rfQualityData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorRfQuality" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)}%`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="rfQuality" stroke={CHART_COLORS.success} fill="url(#colorRfQuality)" name="RF Quality" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'appGroups':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={appGroupsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {appGroupsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1 max-h-56 overflow-auto">
                  {appGroupsData.slice(0, 8).map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="truncate flex-1">{entry.name}</span>
                      <span className="text-muted-foreground">{formatValue(entry.value, 'bps')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'appGroupsDetail':
        // Get all app group keys from the data (excluding timestamp/time)
        const appGroupKeys = appGroupsDetailData.length > 0
          ? Object.keys(appGroupsDetailData[0]).filter(k => k !== 'timestamp' && k !== 'time').slice(0, 5)
          : [];
        const lockedAppGroupsDetailValues = timeline.isLocked && timeline.currentTime !== null && appGroupKeys.length > 0
          ? getValueAtTimestamp(appGroupsDetailData, timeline.currentTime, appGroupKeys)
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedAppGroupsDetailValues && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    {appGroupKeys.map((key, i) => {
                      const value = lockedAppGroupsDetailValues[key];
                      if (value !== null && value !== undefined) {
                        return (
                          <Badge key={key} variant="secondary" className="font-mono">
                            <span className="font-semibold mr-1" style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>{key}:</span>
                            {formatValue(value, 'bps')}
                          </Badge>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={appGroupsDetailData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                    <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    {Object.keys(appGroupsDetailData[0] || {})
                      .filter(k => k !== 'timestamp' && k !== 'time')
                      .slice(0, 5)
                      .map((key, i) => (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stackId="1"
                          stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                          fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                          fillOpacity={0.6}
                        />
                      ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'rfqi':
        const lockedRfqiValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(rfqiData, timeline.currentTime, ['Rfqi'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedRfqiValues && lockedRfqiValues.Rfqi !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-purple-500 font-semibold mr-1">RFQI:</span> {lockedRfqiValues.Rfqi.toFixed(1)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rfqiData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorRfqi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} width={40} />
                    <Tooltip labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="Rfqi Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="Rfqi" stroke={CHART_COLORS.purple} fill="url(#colorRfqi)" name="RFQI" />
                    <Area type="monotone" dataKey="Rfqi Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'wirelessRtt':
        const lockedWirelessRttValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(wirelessRttData, timeline.currentTime, ['WirelessRtt'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedWirelessRttValues && lockedWirelessRttValues.WirelessRtt !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-amber-500 font-semibold mr-1">RTT:</span> {lockedWirelessRttValues.WirelessRtt.toFixed(1)} ms
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={wirelessRttData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorWirelessRtt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} ms`} width={50} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ms`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="WirelessRtt Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="WirelessRtt" stroke={CHART_COLORS.cyan} fill="url(#colorWirelessRtt)" name="Wireless RTT" />
                    <Area type="monotone" dataKey="WirelessRtt Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'networkRtt':
        const lockedNetworkRttValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(networkRttData, timeline.currentTime, ['NetworkRtt'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedNetworkRttValues && lockedNetworkRttValues.NetworkRtt !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-orange-500 font-semibold mr-1">RTT:</span> {lockedNetworkRttValues.NetworkRtt.toFixed(1)} ms
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={networkRttData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorNetworkRtt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.orange} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.orange} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} ms`} width={50} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ms`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="NetworkRtt Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="NetworkRtt" stroke={CHART_COLORS.orange} fill="url(#colorNetworkRtt)" name="Network RTT" />
                    <Area type="monotone" dataKey="NetworkRtt Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'rss':
        const lockedRssValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(rssData, timeline.currentTime, ['Rss'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedRssValues && lockedRssValues.Rss !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-red-500 font-semibold mr-1">RSS:</span> {lockedRssValues.Rss.toFixed(0)} dBm
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rssData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorRssClient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="Rss" stroke={CHART_COLORS.blue} fill="url(#colorRssClient)" name="RSS" />
                    <Area type="monotone" dataKey="Rss Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'rxRate':
        const lockedRxRateValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(rxRateData, timeline.currentTime, ['RxRate'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedRxRateValues && lockedRxRateValues.RxRate !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-green-500 font-semibold mr-1">RxRate:</span> {lockedRxRateValues.RxRate.toFixed(1)} Mbps
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rxRateData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorRxRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} Mbps`} width={60} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} Mbps`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="RxRate Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="RxRate" stroke={CHART_COLORS.success} fill="url(#colorRxRate)" name="RX Rate" />
                    <Area type="monotone" dataKey="RxRate Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'txRate':
        const lockedTxRateValues = timeline.isLocked && timeline.currentTime !== null
          ? getValueAtTimestamp(txRateData, timeline.currentTime, ['TxRate'])
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedTxRateValues && lockedTxRateValues.TxRate !== null && (
                  <Badge variant="secondary" className="font-mono">
                    <span className="text-blue-500 font-semibold mr-1">TxRate:</span> {lockedTxRateValues.TxRate.toFixed(1)} Mbps
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={txRateData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorTxRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.pink} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.pink} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} Mbps`} width={60} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)} Mbps`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    <Area type="monotone" dataKey="TxRate Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                    <Area type="monotone" dataKey="TxRate" stroke={CHART_COLORS.pink} fill="url(#colorTxRate)" name="TX Rate" />
                    <Area type="monotone" dataKey="TxRate Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'events':
        // Get all event keys from the data (excluding timestamp/time)
        const eventKeys = eventsData.length > 0
          ? Object.keys(eventsData[0]).filter(k => k !== 'timestamp' && k !== 'time').slice(0, 5)
          : [];
        const lockedEventsValues = timeline.isLocked && timeline.currentTime !== null && eventKeys.length > 0
          ? getValueAtTimestamp(eventsData, timeline.currentTime, eventKeys)
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedEventsValues && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    {eventKeys.map((key, i) => {
                      const value = lockedEventsValues[key];
                      if (value !== null && value !== undefined) {
                        return (
                          <Badge key={key} variant="secondary" className="font-mono">
                            <span className="font-semibold mr-1" style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}>{key}:</span>
                            {value.toFixed(0)}
                          </Badge>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={eventsData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                    <Tooltip labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    {Object.keys(eventsData[0] || {})
                      .filter(k => k !== 'timestamp' && k !== 'time')
                      .slice(0, 5)
                      .map((key, i) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                          stackId="events"
                        />
                      ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );

      case 'dlRetries':
        // Get all retry keys from the data (excluding timestamp/time)
        const retryKeys = dlRetriesData.length > 0
          ? Object.keys(dlRetriesData[0]).filter(k => k !== 'timestamp' && k !== 'time')
          : [];
        const lockedDlRetriesValues = timeline.isLocked && timeline.currentTime !== null && retryKeys.length > 0
          ? getValueAtTimestamp(dlRetriesData, timeline.currentTime, retryKeys)
          : null;
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                {lockedDlRetriesValues && (
                  <div className="flex gap-2 text-xs flex-wrap">
                    {retryKeys.slice(0, 3).map((key, i) => {
                      const value = lockedDlRetriesValues[key];
                      if (value !== null && value !== undefined) {
                        return (
                          <Badge key={key} variant="secondary" className="font-mono">
                            <span className="font-semibold mr-1" style={{ color: i === 0 ? CHART_COLORS.warning : CHART_COLORS.secondary }}>{key}:</span>
                            {value.toFixed(1)}%
                          </Badge>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dlRetriesData}
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    syncId="client-insights-charts"
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
                      <linearGradient id="colorDlRetries" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} tickFormatter={(ts) => formatXAxisTick(ts, duration)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} labelFormatter={() => ''} contentStyle={COMPACT_TOOLTIP_STYLE} />
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
                    {Object.keys(dlRetriesData[0] || {})
                      .filter(k => k !== 'timestamp' && k !== 'time')
                      .map((key, i) => (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={i === 0 ? CHART_COLORS.warning : CHART_COLORS.secondary}
                          fill={i === 0 ? "url(#colorDlRetries)" : "transparent"}
                          strokeDasharray={i === 0 ? undefined : "3 3"}
                        />
                      ))}
                  </AreaChart>
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
              <h2 className="text-lg font-semibold">Client Insights</h2>
              <p className="text-sm text-muted-foreground">{clientName || macAddress}</p>
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
            // Copy timeline FROM ap-insights TO client-insights
            timeline.syncFromScope('ap-insights');
          }}
          sourceLabel="AP Insights"
        />

        {/* Content - All charts on one page */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6 pb-12">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                {chartConfigs.map(config => renderChart(config))}
              </div>
            )}

            {/* Attribution */}
            <div className="text-center pt-4 border-t mt-6">
              <p className="text-[10px] text-muted-foreground opacity-60">
                UI Design by Karl Benedict, Mgr of Systems Engineering
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
