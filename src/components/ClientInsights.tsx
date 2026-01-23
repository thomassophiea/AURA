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
  ResponsiveContainer
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

// Donut chart colors
const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b',
  '#ef4444', '#f97316', '#ec4899', '#6366f1', '#14b8a6'
];

export function ClientInsights({ macAddress, clientName, onOpenFullScreen }: ClientInsightsProps) {
  const [insights, setInsights] = useState<ClientInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState('3H');
  const [expanded, setExpanded] = useState(true);

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  const loadInsights = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getClientInsights(macAddress, duration, durationOption.resolution, 'default');
      setInsights(data);
    } catch (error) {
      console.error('Failed to load Client insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [macAddress, duration]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!insights) return null;

    const throughput = insights.throughputReport?.[0];
    const rfQuality = insights.rfQuality?.[0];

    const avgThroughput = throughput?.statistics?.find(s => s.statName === 'Total')?.values;
    const avgRfQuality = rfQuality?.statistics?.find(s => s.statName === 'rfQuality')?.values;

    // Get top app group
    const topAppGroups = insights.topAppGroupsByThroughputReport?.[0]?.statistics || [];
    const topAppGroup = topAppGroups.length > 0 ? topAppGroups[0] : null;

    return {
      avgThroughput: avgThroughput && avgThroughput.length > 0
        ? avgThroughput.reduce((sum, v) => sum + parseFloat(v.value), 0) / avgThroughput.length
        : 0,
      avgRfQuality: avgRfQuality && avgRfQuality.length > 0
        ? avgRfQuality.reduce((sum, v) => sum + parseFloat(v.value), 0) / avgRfQuality.length
        : 0,
      topAppGroup: topAppGroup?.name || 'N/A'
    };
  }, [insights]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Client Insights</span>
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
                <p className="text-xl font-semibold">{stats.avgRfQuality.toFixed(0)}%</p>
                <p className="text-[10px] text-muted-foreground">RF Quality</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold truncate" title={stats.topAppGroup}>{stats.topAppGroup}</p>
                <p className="text-[10px] text-muted-foreground">Top App Group</p>
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

  const durationOption = DURATION_OPTIONS.find(d => d.value === duration) || DURATION_OPTIONS[0];

  const loadInsights = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getClientInsights(macAddress, duration, durationOption.resolution, 'all');
      setInsights(data);
    } catch (error) {
      console.error('Failed to load Client insights:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [macAddress, duration]);

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

        {/* Content - All charts on one page */}
        <div className="flex-1 scrollbar-auto-hide">
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
                {/* Throughput */}
                {throughputData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Throughput (Band: All)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={throughputData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorTotalClient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                            <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} />
                            <Legend />
                            <Area type="monotone" dataKey="Total" stroke={CHART_COLORS.blue} fill="url(#colorTotalClient)" name="Total" />
                            <Area type="monotone" dataKey="Upload" stroke={CHART_COLORS.cyan} fill="transparent" name="Upload" />
                            <Area type="monotone" dataKey="Download" stroke={CHART_COLORS.pink} fill="transparent" name="Download" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* RF Quality */}
                {rfQualityData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">RF Quality (Band: All)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={rfQualityData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorRfQuality" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(0)}%`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="rfQuality" stroke={CHART_COLORS.success} fill="url(#colorRfQuality)" name="RF Quality" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top App Groups (Donut) */}
                {appGroupsData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Top Categories by Throughput</CardTitle>
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
                            <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} />
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
                )}

                {/* App Groups Detail */}
                {appGroupsDetailData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">App Group Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={appGroupsDetailData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatValue(v, 'bps')} width={70} />
                            <Tooltip formatter={(value: number) => [formatValue(value, 'bps'), '']} />
                            <Legend />
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
                )}

                {/* RFQI */}
                {rfqiData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">RFQI</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={rfqiData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorRfqi" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} width={40} />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="Rfqi Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="Rfqi" stroke={CHART_COLORS.purple} fill="url(#colorRfqi)" name="RFQI" />
                            <Area type="monotone" dataKey="Rfqi Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Wireless RTT */}
                {wirelessRttData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">WirelessRTT</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={wirelessRttData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorWirelessRtt" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} ms`} width={50} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ms`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="WirelessRtt Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="WirelessRtt" stroke={CHART_COLORS.cyan} fill="url(#colorWirelessRtt)" name="Wireless RTT" />
                            <Area type="monotone" dataKey="WirelessRtt Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Network RTT */}
                {networkRttData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">NetworkRTT</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={networkRttData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorNetworkRtt" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.orange} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.orange} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} ms`} width={50} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} ms`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="NetworkRtt Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="NetworkRtt" stroke={CHART_COLORS.orange} fill="url(#colorNetworkRtt)" name="Network RTT" />
                            <Area type="monotone" dataKey="NetworkRtt Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* RSS */}
                {rssData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">RSS</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={rssData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorRssClient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} dBm`} width={60} domain={['auto', 'auto']} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(0)} dBm`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="Rss Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="Rss" stroke={CHART_COLORS.blue} fill="url(#colorRssClient)" name="RSS" />
                            <Area type="monotone" dataKey="Rss Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* RX Rate */}
                {rxRateData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">RxRate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={rxRateData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorRxRate" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} Mbps`} width={60} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} Mbps`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="RxRate Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="RxRate" stroke={CHART_COLORS.success} fill="url(#colorRxRate)" name="RX Rate" />
                            <Area type="monotone" dataKey="RxRate Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* TX Rate */}
                {txRateData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">TxRate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={txRateData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorTxRate" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.pink} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.pink} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} Mbps`} width={60} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)} Mbps`, '']} />
                            <Legend />
                            <Area type="monotone" dataKey="TxRate Upper" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Upper" />
                            <Area type="monotone" dataKey="TxRate" stroke={CHART_COLORS.pink} fill="url(#colorTxRate)" name="TX Rate" />
                            <Area type="monotone" dataKey="TxRate Lower" stroke={CHART_COLORS.secondary} fill="transparent" strokeDasharray="3 3" name="Lower" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Events */}
                {eventsData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={eventsData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} width={40} />
                            <Tooltip />
                            <Legend />
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
                )}

                {/* DL Retries */}
                {dlRetriesData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">DL Retries</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dlRetriesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                              <linearGradient id="colorDlRetries" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} />
                            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} />
                            <Legend />
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
