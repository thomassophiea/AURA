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
  ResponsiveContainer
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

  const loadInsights = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getAccessPointInsights(serialNumber, duration, durationOption.resolution);
      setInsights(data);
    } catch (error) {
      console.error('Failed to load AP insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [serialNumber, duration]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!insights) return null;

    const throughput = insights.throughputReport?.[0];
    const power = insights.apPowerConsumptionTimeseries?.[0];
    const clients = insights.countOfUniqueUsersReport?.[0];

    const avgThroughput = throughput?.statistics?.find(s => s.statName === 'Total')?.values;
    const avgPower = power?.statistics?.find(s => s.statName === 'Power Consumption')?.values;
    const avgClients = clients?.statistics?.find(s => s.statName === 'tntUniqueUsers')?.values;

    return {
      avgThroughput: avgThroughput && avgThroughput.length > 0
        ? avgThroughput.reduce((sum, v) => sum + parseFloat(v.value), 0) / avgThroughput.length
        : 0,
      avgPower: avgPower && avgPower.length > 0
        ? avgPower.reduce((sum, v) => sum + parseFloat(v.value), 0) / avgPower.length
        : 0,
      avgClients: avgClients && avgClients.length > 0
        ? Math.round(avgClients.reduce((sum, v) => sum + parseFloat(v.value), 0) / avgClients.length)
        : 0,
      peakClients: avgClients && avgClients.length > 0
        ? Math.max(...avgClients.map(v => parseFloat(v.value)))
        : 0
    };
  }, [insights]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>AP Insights</span>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
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
                variant="outline"
                size="icon"
                onClick={onOpenFullScreen}
                className="h-8 w-8"
                title="Open Full Insights View"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 px-2"
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
              <div className="text-center">
                <p className="text-xl font-semibold">{formatValue(stats.avgThroughput, 'bps')}</p>
                <p className="text-[10px] text-muted-foreground">Avg Throughput</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold">{stats.peakClients}</p>
                <p className="text-[10px] text-muted-foreground">Peak Clients</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold">{stats.avgPower.toFixed(1)}W</p>
                <p className="text-[10px] text-muted-foreground">Avg Power</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">No data available</p>
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

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  const loadInsights = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getAccessPointInsights(serialNumber, duration, durationOption.resolution);
      setInsights(data);
    } catch (error) {
      console.error('Failed to load AP insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [serialNumber, duration]);

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

  // Define all charts with their data - charts with data appear first, empty charts at bottom
  const chartConfigs = useMemo(() => {
    const configs = [
      { id: 'throughput', title: 'Throughput', data: throughputData, hasData: throughputData.length > 0 },
      { id: 'power', title: 'Power Consumption', data: powerData, hasData: powerData.length > 0 },
      { id: 'clients', title: 'Unique Client Count', data: clientData, hasData: clientData.length > 0 },
      { id: 'rss', title: 'RSS (Signal Strength)', data: rssData, hasData: rssData.length > 0 },
      { id: 'channelUtil5', title: 'Channel Utilization 5GHz', data: channelUtil5Data, hasData: channelUtil5Data.length > 0 },
      { id: 'channelUtil24', title: 'Channel Utilization 2.4GHz', data: channelUtil24Data, hasData: channelUtil24Data.length > 0 },
      { id: 'noise', title: 'Noise Per Channel', data: noiseData, hasData: noiseData.length > 0 },
    ];

    // Sort: charts with data first, empty charts last
    return configs.sort((a, b) => {
      if (a.hasData && !b.hasData) return -1;
      if (!a.hasData && b.hasData) return 1;
      return 0;
    });
  }, [throughputData, powerData, clientData, rssData, channelUtil5Data, channelUtil24Data, noiseData]);

  // Render individual chart based on id
  const renderChart = (config: { id: string; title: string; data: any[]; hasData: boolean }) => {
    if (!config.hasData) {
      return (
        <Card key={config.id} className="opacity-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{config.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No data available</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    switch (config.id) {
      case 'throughput':
        return (
          <Card key={config.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughputData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorTotalFull" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                    <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} />
                    <Legend />
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
                  <LineChart data={powerData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} W`} width={50} />
                    <Tooltip />
                    <Legend />
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
                  <LineChart data={clientData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip />
                    <Legend />
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
                  <AreaChart data={rssData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorRss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} />
                    <Legend />
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
                  <AreaChart data={channelUtil5Data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} />
                    <Legend />
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
                  <AreaChart data={channelUtil24Data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} />
                    <Legend />
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
                  <LineChart data={noiseData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} />
                    <Legend />
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
              <SelectTrigger className="w-[150px] h-8">
                <Clock className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadInsights} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 scrollbar-auto-hide">
          <div className="p-6 space-y-6 pb-12">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-6">
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
          </div>
        </div>
      </div>
    </div>
  );
}
