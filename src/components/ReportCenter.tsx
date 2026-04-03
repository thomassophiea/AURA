import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  FileText, Download, Printer, Share2, Clock, ChevronRight,
  Wifi, Users, Activity, Server, Shield, BarChart3, Radio,
  AppWindow, MapPin, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp,
  Gauge, Zap, Eye, Globe, Hash, Timer, Signal, ArrowUpRight,
  ArrowDownRight, Minus, Brain, Layers, Target, PieChart,
  Network, Router, Monitor, Smartphone, Laptop, HardDrive,
  Calendar, Filter, Building2, Copy
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart as RechartsPieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { cn } from './ui/utils';
import { apiService } from '../services/api';
import { fetchWidgetData, parseTimeseriesData, parseRankingData, WIDGET_CATEGORIES } from '../services/widgetService';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { toast } from 'sonner';
import { formatBitsPerSecond, formatBytes } from '../lib/units';

// ── Report Page Definitions ──

interface ReportPage {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: 'overview' | 'network' | 'rf' | 'clients' | 'apps';
}

const REPORT_PAGES: ReportPage[] = [
  { id: 'executive', label: 'Executive Summary', icon: FileText, description: 'High-level KPI overview', category: 'overview' },
  { id: 'network-health', label: 'Network Health', icon: Activity, description: 'System health and best practices', category: 'network' },
  { id: 'access-points', label: 'Access Points', icon: Wifi, description: 'AP inventory, performance, and RF health', category: 'network' },
  { id: 'clients', label: 'Clients', icon: Users, description: 'Client distribution, manufacturers, and experience', category: 'clients' },
  { id: 'throughput', label: 'Throughput & Usage', icon: BarChart3, description: 'Traffic volume and bandwidth utilization', category: 'network' },
  { id: 'rf-analytics', label: 'RF Analytics', icon: Radio, description: 'Channel distribution, SNR, and interference', category: 'rf' },
  { id: 'applications', label: 'Applications', icon: AppWindow, description: 'Application visibility and traffic analytics', category: 'apps' },
  { id: 'sites', label: 'Sites', icon: MapPin, description: 'Site-level performance rankings', category: 'overview' },
];

const DURATION_OPTIONS = [
  { value: '3H', label: '3 Hours' },
  { value: '24H', label: '24 Hours' },
  { value: '7D', label: '7 Days' },
  { value: '30D', label: '30 Days' },
];

const CHART_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#f97316'];

// ── Utility ──

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Main Component ──

export function ReportCenter() {
  const { filters } = useGlobalFilters();
  const [activePage, setActivePage] = useState('executive');
  const [duration, setDuration] = useState('24H');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // ── Data state ──
  const [apData, setApData] = useState<any[]>([]);
  const [stationData, setStationData] = useState<any[]>([]);
  const [siteData, setSiteData] = useState<any[]>([]);
  const [serviceData, setServiceData] = useState<any[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [bestPractices, setBestPractices] = useState<any[]>([]);

  const siteId = filters.site !== 'all' ? filters.site : undefined;

  // ── Data Loading ──
  const loadAllData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      // Fetch core data + widget reports in parallel
      const [aps, stations, sites, services, widgets, bpResponse] = await Promise.allSettled([
        apiService.getAccessPointsBySite(siteId),
        apiService.getAllStations(),
        apiService.getSites(),
        apiService.getServices(),
        fetchWidgetData({
          siteId,
          duration,
          widgets: [
            'throughputReport', 'countOfUniqueUsersReport',
            'topAccessPointsByThroughput', 'topAccessPointsByUserCount',
            'worstApsBySnr', 'worstApsByChannelUtil',
            'topClientsByUsage', 'topManufacturersByClientCount',
            'clientDistributionByRFProtocol',
            'topAppGroupsByUsage', 'topAppGroupsByClientCountReport',
            'topSitesByThroughput', 'topSitesByClientCount',
            'rfQuality', 'channelDistributionRadio1', 'channelDistributionRadio2',
            'systemHealth', 'networkHealth', 'deploymentQoE',
            'ulDlThroughputTimeseries', 'ulDlUsageTimeseries',
          ],
        }),
        apiService.makeAuthenticatedRequest('/v1/bestpractices/evaluate', { method: 'GET' }, 10000),
      ]);

      if (aps.status === 'fulfilled') setApData(aps.value || []);
      if (stations.status === 'fulfilled') setStationData(stations.value || []);
      if (sites.status === 'fulfilled') setSiteData(sites.value || []);
      if (services.status === 'fulfilled') setServiceData(services.value || []);
      if (widgets.status === 'fulfilled') setWidgetData(widgets.value || {});

      if (bpResponse.status === 'fulfilled') {
        try {
          const resp = bpResponse.value;
          if (resp.ok) {
            const data = await resp.json();
            setBestPractices(data?.conditions || []);
          }
        } catch { /* ignore */ }
      }

      setLastUpdated(new Date());
      if (isRefresh) toast.success('Report data refreshed');
    } catch (error) {
      console.error('[ReportCenter] Failed to load data:', error);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId, duration]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ── Computed Metrics ──
  const metrics = useMemo(() => {
    const totalAps = apData.length;
    const onlineAps = apData.filter((a: any) => {
      const s = (a.status || a.connectionState || '').toLowerCase();
      return s === 'connected' || s === 'online' || s === 'active';
    }).length;
    const offlineAps = totalAps - onlineAps;

    const totalClients = stationData.length;
    const authenticated = stationData.filter((s: any) =>
      s.authenticated === undefined || s.authenticated === true || s.authenticated === 1
    ).length;

    let totalUpload = 0;
    let totalDownload = 0;
    stationData.forEach((s: any) => {
      const tx = s.transmittedRate || s.txRate || 0;
      const rx = s.receivedRate || s.rxRate || 0;
      totalUpload += tx > 1000 ? tx : tx * 1_000_000;
      totalDownload += rx > 1000 ? rx : rx * 1_000_000;
    });

    // Band distribution
    const bands: Record<string, number> = { '2.4 GHz': 0, '5 GHz': 0, '6 GHz': 0 };
    stationData.forEach((s: any) => {
      const band = s.band || s.frequencyBand || '';
      const rate = Math.max(s.transmittedRate || s.txRate || 0, s.receivedRate || s.rxRate || 0);
      if (band.includes('6') || band.includes('6E')) bands['6 GHz']++;
      else if (band.includes('5')) bands['5 GHz']++;
      else if (band.includes('2')) bands['2.4 GHz']++;
      else if (rate > 0) {
        const mbps = rate > 1000 ? rate / 1_000_000 : rate;
        if (mbps > 1200) bands['6 GHz']++;
        else if (mbps > 150) bands['5 GHz']++;
        else bands['2.4 GHz']++;
      }
    });

    // RSSI distribution
    const rssiRanges = { excellent: 0, good: 0, fair: 0, poor: 0 };
    let rssiSum = 0;
    let rssiCount = 0;
    stationData.forEach((s: any) => {
      const rssi = s.rssi || s.rss || 0;
      if (rssi < 0) {
        rssiSum += rssi;
        rssiCount++;
        if (rssi >= -50) rssiRanges.excellent++;
        else if (rssi >= -60) rssiRanges.good++;
        else if (rssi >= -70) rssiRanges.fair++;
        else rssiRanges.poor++;
      }
    });

    // AP model distribution
    const modelMap = new Map<string, number>();
    apData.forEach((a: any) => {
      const model = a.model || a.hardwareType || a.platformName || 'Unknown';
      modelMap.set(model, (modelMap.get(model) || 0) + 1);
    });
    const apModels = Array.from(modelMap.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);

    // Service/SSID distribution
    const ssidMap = new Map<string, number>();
    stationData.forEach((s: any) => {
      const name = s.ssid || s.serviceName || 'Unknown';
      ssidMap.set(name, (ssidMap.get(name) || 0) + 1);
    });
    const ssidDist = Array.from(ssidMap.entries())
      .map(([name, count]) => ({ name, count, pct: totalClients > 0 ? (count / totalClients) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    // Best practices summary
    const bpGood = bestPractices.filter((b: any) => b.status === 'Good').length;
    const bpWarn = bestPractices.filter((b: any) => b.status === 'Warning').length;
    const bpError = bestPractices.filter((b: any) => b.status === 'Error').length;
    const bpScore = bestPractices.length > 0
      ? Math.round((bpGood / bestPractices.length) * 100)
      : 100;

    return {
      totalAps, onlineAps, offlineAps, totalClients, authenticated,
      totalUpload, totalDownload, totalThroughput: totalUpload + totalDownload,
      bands, rssiRanges, avgRssi: rssiCount > 0 ? Math.round(rssiSum / rssiCount) : 0,
      apModels, ssidDist, totalSites: siteData.length, totalServices: serviceData.length,
      bpGood, bpWarn, bpError, bpScore, bpTotal: bestPractices.length,
    };
  }, [apData, stationData, siteData, serviceData, bestPractices]);

  // ── Print handler ──
  const handlePrint = () => {
    window.print();
  };

  // ── Export handler ──
  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      duration,
      site: siteId || 'All Sites',
      page: activePage,
      metrics: {
        accessPoints: { total: metrics.totalAps, online: metrics.onlineAps, offline: metrics.offlineAps },
        clients: { total: metrics.totalClients, authenticated: metrics.authenticated },
        throughput: { upload: metrics.totalUpload, download: metrics.totalDownload, total: metrics.totalThroughput },
        bestPractices: { score: metrics.bpScore, good: metrics.bpGood, warnings: metrics.bpWarn, errors: metrics.bpError },
      },
      widgetData,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-report-${activePage}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  // ── Shared Widget Renderers ──
  const renderScoreCard = (label: string, value: string | number, icon: React.ComponentType<{ className?: string }>, color: string, sub?: string, trend?: 'up' | 'down' | 'neutral') => {
    const Icon = icon;
    return (
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
              {sub && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                  {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                  {trend === 'neutral' && <Minus className="h-3 w-3" />}
                  {sub}
                </p>
              )}
            </div>
            <div className={cn('p-2 rounded-lg', color)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRankingTable = (title: string, data: any[], nameKey: string, valueKey: string, unit: string, icon: React.ComponentType<{ className?: string }>, maxItems = 10) => {
    const Icon = icon;
    const items = Array.isArray(data) ? data.slice(0, maxItems) : [];
    if (items.length === 0) return null;
    const maxVal = Math.max(...items.map((d: any) => parseFloat(d[valueKey]) || 0), 1);

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {items.map((item: any, i: number) => {
              const val = parseFloat(item[valueKey]) || 0;
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[200px] font-medium">{item[nameKey] || `#${i + 1}`}</span>
                    <span className="text-muted-foreground font-mono">{unit === 'bps' ? formatBitsPerSecond(val) : unit === 'bytes' ? formatBytes(val) : `${fmtNum(val)} ${unit}`}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${(val / maxVal) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderWidgetTimeseries = (title: string, widgetKey: string, icon: React.ComponentType<{ className?: string }>) => {
    const Icon = icon;
    const raw = widgetData[widgetKey];
    const parsed = parseTimeseriesData(raw);
    if (!parsed.length || !parsed[0]?.statistics?.length) {
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground text-center py-8">No data available for this time range</p></CardContent>
        </Card>
      );
    }

    const stats = parsed[0].statistics;
    // Build chart data from first statistic's values
    const chartData = stats[0]?.values?.map((v: any, idx: number) => {
      const point: any = { time: new Date(v.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) };
      stats.forEach((s: any, si: number) => {
        point[s.name || `series${si}`] = s.values?.[idx]?.value || 0;
      });
      return point;
    }) || [];

    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              {stats.map((s: any, i: number) => (
                <Area key={s.name} type="monotone" dataKey={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.15} strokeWidth={1.5} />
              ))}
              {stats.length > 1 && <Legend iconType="line" wrapperStyle={{ fontSize: 10 }} />}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const renderWidgetRanking = (title: string, widgetKey: string, icon: React.ComponentType<{ className?: string }>, unit = '') => {
    const raw = widgetData[widgetKey];
    const parsed = parseRankingData(raw);
    return renderRankingTable(title, parsed, 'name', 'value', unit || parsed[0]?.unit || '', icon);
  };

  // ── Page Renderers ──

  const renderExecutiveSummary = () => (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Access Points', `${metrics.onlineAps}/${metrics.totalAps}`, Wifi, 'bg-blue-500', `${metrics.offlineAps} offline`, metrics.offlineAps === 0 ? 'up' : 'down')}
        {renderScoreCard('Connected Clients', fmtNum(metrics.totalClients), Users, 'bg-violet-500', `${metrics.authenticated} authenticated`)}
        {renderScoreCard('Total Throughput', formatBitsPerSecond(metrics.totalThroughput), Zap, 'bg-emerald-500', `${formatBitsPerSecond(metrics.totalUpload)} up / ${formatBitsPerSecond(metrics.totalDownload)} down`)}
        {renderScoreCard('Health Score', `${metrics.bpScore}%`, Shield, metrics.bpScore >= 80 ? 'bg-emerald-500' : metrics.bpScore >= 60 ? 'bg-amber-500' : 'bg-red-500', `${metrics.bpGood} pass / ${metrics.bpWarn + metrics.bpError} issues`, metrics.bpScore >= 80 ? 'up' : 'down')}
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Sites', metrics.totalSites, Building2, 'bg-sky-500')}
        {renderScoreCard('Networks', metrics.totalServices, Network, 'bg-indigo-500')}
        {renderScoreCard('Avg RSSI', `${metrics.avgRssi} dBm`, Signal, metrics.avgRssi >= -60 ? 'bg-emerald-500' : metrics.avgRssi >= -70 ? 'bg-amber-500' : 'bg-red-500')}
        {renderScoreCard('AP Models', metrics.apModels.length.toString(), Router, 'bg-orange-500')}
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Band Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Radio className="h-4 w-4 text-primary" />Client Band Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPieChart>
                <Pie
                  data={[
                    { name: '2.4 GHz', value: metrics.bands['2.4 GHz'], fill: '#f59e0b' },
                    { name: '5 GHz', value: metrics.bands['5 GHz'], fill: '#3b82f6' },
                    { name: '6 GHz', value: metrics.bands['6 GHz'], fill: '#8b5cf6' },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {[
                    { fill: '#f59e0b' },
                    { fill: '#3b82f6' },
                    { fill: '#8b5cf6' },
                  ].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SSID Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Network className="h-4 w-4 text-primary" />Clients by Network</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.ssidDist.slice(0, 8).map((s, i) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[180px]">{s.name}</span>
                    <span className="text-muted-foreground">{s.count} ({fmtPct(s.pct)})</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RSSI Distribution + Best Practices */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Signal className="h-4 w-4 text-primary" />Signal Quality Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={[
                { range: 'Excellent (>-50)', count: metrics.rssiRanges.excellent, fill: '#10b981' },
                { range: 'Good (-50 to -60)', count: metrics.rssiRanges.good, fill: '#22d3ee' },
                { range: 'Fair (-60 to -70)', count: metrics.rssiRanges.fair, fill: '#f59e0b' },
                { range: 'Poor (<-70)', count: metrics.rssiRanges.poor, fill: '#ef4444' },
              ]}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {[
                    { fill: '#10b981' },
                    { fill: '#22d3ee' },
                    { fill: '#f59e0b' },
                    { fill: '#ef4444' },
                  ].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Best Practices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={metrics.bpScore >= 80 ? '#10b981' : metrics.bpScore >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeDasharray={`${metrics.bpScore} ${100 - metrics.bpScore}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{metrics.bpScore}%</span>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" />{metrics.bpGood} Passing</div>
                <div className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-amber-500" />{metrics.bpWarn} Warnings</div>
                <div className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" />{metrics.bpError} Errors</div>
              </div>
            </div>
            {bestPractices.filter((b: any) => b.status !== 'Good').slice(0, 4).map((bp: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-t border-border/50">
                {bp.status === 'Error' ? <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />}
                <span className="text-muted-foreground">{bp.criteria}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Throughput Trend */}
      {renderWidgetTimeseries('Throughput Trend', 'ulDlThroughputTimeseries', TrendingUp)}
    </div>
  );

  const renderNetworkHealth = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Health Score', `${metrics.bpScore}%`, Shield, metrics.bpScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
        {renderScoreCard('Online APs', `${metrics.onlineAps}/${metrics.totalAps}`, Wifi, 'bg-blue-500', `${((metrics.onlineAps / Math.max(metrics.totalAps, 1)) * 100).toFixed(0)}% availability`)}
        {renderScoreCard('Best Practices', `${metrics.bpGood}/${metrics.bpTotal}`, CheckCircle, 'bg-emerald-500', `${metrics.bpWarn} warnings, ${metrics.bpError} errors`)}
        {renderScoreCard('Active Networks', metrics.totalServices.toString(), Network, 'bg-indigo-500')}
      </div>

      {/* Full Best Practices List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Configuration Best Practices</CardTitle>
          <CardDescription>Automated evaluation of network configuration against recommended standards</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {bestPractices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No best practice data available</p>
            ) : bestPractices.map((bp: any, i: number) => (
              <div key={i} className={cn('flex items-start gap-3 p-3 rounded-lg border text-xs',
                bp.status === 'Error' ? 'border-red-500/30 bg-red-500/5' :
                bp.status === 'Warning' ? 'border-amber-500/30 bg-amber-500/5' :
                'border-emerald-500/30 bg-emerald-500/5'
              )}>
                {bp.status === 'Good' ? <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> :
                 bp.status === 'Error' ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" /> :
                 <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="font-medium">{bp.criteria}</p>
                  {bp.detailedDescription && <p className="text-muted-foreground mt-1">{bp.detailedDescription}</p>}
                </div>
                <Badge variant="outline" className="ml-auto flex-shrink-0 text-[10px]">{bp.type || 'Config'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Worst APs by SNR', 'worstApsBySnr', Signal, 'dB')}
        {renderWidgetRanking('Worst APs by Channel Utilization', 'worstApsByChannelUtil', Radio, '%')}
      </div>
    </div>
  );

  const renderAccessPoints = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Total APs', metrics.totalAps.toString(), Wifi, 'bg-blue-500')}
        {renderScoreCard('Online', metrics.onlineAps.toString(), CheckCircle, 'bg-emerald-500', `${((metrics.onlineAps / Math.max(metrics.totalAps, 1)) * 100).toFixed(0)}%`)}
        {renderScoreCard('Offline', metrics.offlineAps.toString(), XCircle, metrics.offlineAps > 0 ? 'bg-red-500' : 'bg-slate-500')}
        {renderScoreCard('Models', metrics.apModels.length.toString(), Router, 'bg-orange-500')}
      </div>

      {/* AP Model Distribution */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Router className="h-4 w-4 text-primary" />AP Model Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPieChart>
                <Pie
                  data={metrics.apModels.slice(0, 8)}
                  cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="model"
                  label={({ model, percent }) => `${(model as string).slice(0, 15)} ${(percent * 100).toFixed(0)}%`}
                >
                  {metrics.apModels.slice(0, 8).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AP Inventory Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><HardDrive className="h-4 w-4 text-primary" />Inventory by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {metrics.apModels.map((m, i) => (
                <div key={m.model} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="font-medium truncate max-w-[180px]">{m.model}</span>
                  </div>
                  <span className="text-muted-foreground font-mono">{m.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Top APs by Throughput', 'topAccessPointsByThroughput', TrendingUp, 'bps')}
        {renderWidgetRanking('Top APs by Client Count', 'topAccessPointsByUserCount', Users)}
      </div>
    </div>
  );

  const renderClients = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Total Clients', fmtNum(metrics.totalClients), Users, 'bg-violet-500')}
        {renderScoreCard('Authenticated', fmtNum(metrics.authenticated), Shield, 'bg-emerald-500', `${metrics.totalClients > 0 ? ((metrics.authenticated / metrics.totalClients) * 100).toFixed(0) : 0}%`)}
        {renderScoreCard('Avg Signal', `${metrics.avgRssi} dBm`, Signal, metrics.avgRssi >= -60 ? 'bg-emerald-500' : 'bg-amber-500')}
        {renderScoreCard('Networks', metrics.ssidDist.length.toString(), Network, 'bg-indigo-500')}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Top Clients by Usage', 'topClientsByUsage', TrendingUp, 'bytes')}
        {renderWidgetRanking('Top Manufacturers by Client Count', 'topManufacturersByClientCount', Monitor)}
      </div>

      {renderWidgetTimeseries('Unique Clients Over Time', 'countOfUniqueUsersReport', Users)}
    </div>
  );

  const renderThroughput = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderScoreCard('Total Throughput', formatBitsPerSecond(metrics.totalThroughput), Zap, 'bg-emerald-500')}
        {renderScoreCard('Upload', formatBitsPerSecond(metrics.totalUpload), ArrowUpRight, 'bg-blue-500')}
        {renderScoreCard('Download', formatBitsPerSecond(metrics.totalDownload), ArrowDownRight, 'bg-cyan-500')}
        {renderScoreCard('Active Clients', fmtNum(metrics.totalClients), Users, 'bg-violet-500')}
      </div>

      {renderWidgetTimeseries('Throughput Over Time', 'ulDlThroughputTimeseries', TrendingUp)}
      {renderWidgetTimeseries('Usage Over Time', 'ulDlUsageTimeseries', BarChart3)}
      {renderWidgetTimeseries('Throughput Report', 'throughputReport', Gauge)}
    </div>
  );

  const renderRFAnalytics = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {renderScoreCard('2.4 GHz Clients', metrics.bands['2.4 GHz'].toString(), Radio, 'bg-amber-500')}
        {renderScoreCard('5 GHz Clients', metrics.bands['5 GHz'].toString(), Radio, 'bg-blue-500')}
        {renderScoreCard('6 GHz Clients', metrics.bands['6 GHz'].toString(), Radio, 'bg-violet-500')}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('RF Quality', 'rfQuality', Signal)}
        {renderWidgetRanking('Channel Distribution (Radio 1)', 'channelDistributionRadio1', Radio)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Channel Distribution (Radio 2)', 'channelDistributionRadio2', Radio)}
        {renderWidgetRanking('Worst APs by SNR', 'worstApsBySnr', Signal, 'dB')}
      </div>
    </div>
  );

  const renderApplications = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Top Applications by Usage', 'topAppGroupsByUsage', AppWindow, 'bytes')}
        {renderWidgetRanking('Top Applications by Client Count', 'topAppGroupsByClientCountReport', Users)}
      </div>
    </div>
  );

  const renderSites = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {renderScoreCard('Total Sites', metrics.totalSites.toString(), Building2, 'bg-sky-500')}
        {renderScoreCard('Total APs', metrics.totalAps.toString(), Wifi, 'bg-blue-500')}
        {renderScoreCard('Total Clients', fmtNum(metrics.totalClients), Users, 'bg-violet-500')}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {renderWidgetRanking('Top Sites by Throughput', 'topSitesByThroughput', TrendingUp, 'bps')}
        {renderWidgetRanking('Top Sites by Client Count', 'topSitesByClientCount', Users)}
      </div>
    </div>
  );

  const renderActivePage = () => {
    switch (activePage) {
      case 'executive': return renderExecutiveSummary();
      case 'network-health': return renderNetworkHealth();
      case 'access-points': return renderAccessPoints();
      case 'clients': return renderClients();
      case 'throughput': return renderThroughput();
      case 'rf-analytics': return renderRFAnalytics();
      case 'applications': return renderApplications();
      case 'sites': return renderSites();
      default: return renderExecutiveSummary();
    }
  };

  const currentPageDef = REPORT_PAGES.find(p => p.id === activePage) || REPORT_PAGES[0];

  // ── Loading State ──
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 -m-4 sm:-m-6 h-[calc(100vh-120px)]" ref={printRef}>
      {/* ── Report Page Sidebar ── */}
      <div className={cn(
        'flex-shrink-0 border-r border-border/50 bg-card/50 transition-all duration-200 print:hidden',
        sidebarCollapsed ? 'w-12' : 'w-56'
      )}>
        <div className="flex flex-col h-full">
          {/* Sidebar header */}
          <div className="px-3 py-3 border-b border-border/50 flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider">Report Pages</span>
              </div>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              {sidebarCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 rotate-90" />}
            </Button>
          </div>

          {/* Page list */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {REPORT_PAGES.map((page) => {
                const Icon = page.icon;
                const isActive = activePage === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => setActivePage(page.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs transition-colors text-left',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-card-foreground'
                    )}
                    title={page.label}
                  >
                    <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', isActive && 'text-primary')} />
                    {!sidebarCollapsed && (
                      <span className="truncate">{page.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Report Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 bg-card/30 print:bg-white print:border-b-2 print:border-black">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <currentPageDef.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{currentPageDef.label}</h1>
                <p className="text-xs text-muted-foreground">{currentPageDef.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              {/* Duration selector */}
              <div className="flex items-center border border-border/50 rounded-md overflow-hidden">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-medium transition-colors',
                      duration === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <Button variant="outline" size="sm" onClick={() => loadAllData(true)} disabled={refreshing}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print
              </Button>
            </div>
          </div>

          {lastUpdated && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last updated {lastUpdated.toLocaleTimeString()} &middot; Duration: {duration} &middot; {siteId ? `Site: ${siteId}` : 'All Sites'}
            </div>
          )}
        </div>

        {/* Report Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6">
            {renderActivePage()}

            {/* Report Footer */}
            <div className="mt-8 pt-4 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground print:mt-12 print:border-t-2 print:border-black">
              <span>AURA Network Report &middot; {currentPageDef.label} &middot; Generated {new Date().toLocaleDateString()}</span>
              <span>Extreme Networks &middot; Powered by Platform ONE</span>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
