/**
 * Universal Report Widget Renderer
 *
 * Dispatches rendering of a ReportWidgetConfig based on its displayType.
 * Handles both platform_report widgets (from fetchWidgetData) and
 * metric_computed widgets (from local AP/station data).
 */

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  ArrowUpRight, ArrowDownRight, Minus, CheckCircle, AlertTriangle, XCircle,
  Wifi, Users, Zap, Shield, Building2, Network, Signal, Router,
  Activity, BarChart3, Radio, AppWindow, MapPin, FileText, TrendingUp,
  ArrowUpRight as Up, ArrowDownRight as Down, Hash, Timer, Gauge, Globe,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { cn } from '../ui/utils';
import { parseTimeseriesData, parseRankingData } from '../../services/widgetService';
import { formatBitsPerSecond, formatBytes } from '../../lib/units';
import type { ReportWidgetConfig } from '../../types/reportConfig';

const CHART_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#8b5cf6', '#f97316'];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// ── Metric icons mapping ──
const METRIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '_metric_aps': Wifi, '_metric_total_aps': Wifi, '_metric_online_aps': CheckCircle, '_metric_offline_aps': XCircle,
  '_metric_clients': Users, '_metric_total_clients': Users, '_metric_authenticated': Shield, '_metric_active_clients': Users,
  '_metric_throughput': Zap, '_metric_total_throughput': Zap, '_metric_upload': ArrowUpRight, '_metric_download': ArrowDownRight,
  '_metric_health': Shield, '_metric_sites': Building2, '_metric_total_sites': Building2,
  '_metric_networks': Network, '_metric_client_networks': Network, '_metric_avg_rssi': Signal, '_metric_avg_signal': Signal,
  '_metric_ap_models': Router, '_metric_band_24': Radio, '_metric_band_5': Radio, '_metric_band_6': Radio,
  '_metric_bp_summary': CheckCircle,
};

const METRIC_COLORS: Record<string, string> = {
  '_metric_aps': 'bg-blue-500', '_metric_total_aps': 'bg-blue-500', '_metric_online_aps': 'bg-emerald-500', '_metric_offline_aps': 'bg-red-500',
  '_metric_clients': 'bg-violet-500', '_metric_total_clients': 'bg-violet-500', '_metric_authenticated': 'bg-emerald-500', '_metric_active_clients': 'bg-violet-500',
  '_metric_throughput': 'bg-emerald-500', '_metric_total_throughput': 'bg-emerald-500', '_metric_upload': 'bg-blue-500', '_metric_download': 'bg-cyan-500',
  '_metric_health': 'bg-emerald-500', '_metric_sites': 'bg-sky-500', '_metric_total_sites': 'bg-sky-500',
  '_metric_networks': 'bg-indigo-500', '_metric_client_networks': 'bg-indigo-500', '_metric_avg_rssi': 'bg-emerald-500', '_metric_avg_signal': 'bg-emerald-500',
  '_metric_ap_models': 'bg-orange-500', '_metric_band_24': 'bg-amber-500', '_metric_band_5': 'bg-blue-500', '_metric_band_6': 'bg-violet-500',
  '_metric_bp_summary': 'bg-emerald-500',
};

export interface ReportMetrics {
  totalAps: number; onlineAps: number; offlineAps: number;
  totalClients: number; authenticated: number;
  totalUpload: number; totalDownload: number; totalThroughput: number;
  bands: Record<string, number>;
  rssiRanges: { excellent: number; good: number; fair: number; poor: number };
  avgRssi: number;
  apModels: { model: string; count: number }[];
  ssidDist: { name: string; count: number; pct: number }[];
  totalSites: number; totalServices: number;
  bpGood: number; bpWarn: number; bpError: number; bpScore: number; bpTotal: number;
  bestPractices: any[];
}

interface Props {
  widget: ReportWidgetConfig;
  widgetData: Record<string, any>;
  metrics: ReportMetrics;
}

export function ReportWidgetRenderer({ widget, widgetData, metrics }: Props) {
  const { displayType, widgetKey, title, config: wCfg } = widget;

  // ── Scorecard ──
  if (displayType === 'scorecard') {
    return renderScorecard(widget, metrics);
  }

  // ── Timeseries ──
  if (displayType === 'timeseries') {
    return renderTimeseries(widget, widgetData);
  }

  // ── Ranking ──
  if (displayType === 'ranking') {
    if (widgetKey.startsWith('_metric_')) {
      return renderComputedRanking(widget, metrics);
    }
    return renderApiRanking(widget, widgetData);
  }

  // ── Pie Chart ──
  if (displayType === 'pie_chart') {
    return renderPieChart(widget, metrics);
  }

  // ── Bar Chart ──
  if (displayType === 'bar_chart') {
    return renderBarChart(widget, metrics);
  }

  // ── Distribution ──
  if (displayType === 'distribution') {
    return renderDistribution(widget, metrics);
  }

  return (
    <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">Unknown widget type: {displayType}</CardContent></Card>
  );
}

// ── Renderers ──

function renderScorecard(widget: ReportWidgetConfig, m: ReportMetrics) {
  const key = widget.widgetKey;
  const Icon = METRIC_ICONS[key] || Activity;
  const color = METRIC_COLORS[key] || 'bg-slate-500';

  let value: string = '—';
  let sub: string | undefined;

  switch (key) {
    case '_metric_aps': value = `${m.onlineAps}/${m.totalAps}`; sub = `${m.offlineAps} offline`; break;
    case '_metric_total_aps': value = m.totalAps.toString(); break;
    case '_metric_online_aps': value = m.onlineAps.toString(); sub = `${((m.onlineAps / Math.max(m.totalAps, 1)) * 100).toFixed(0)}%`; break;
    case '_metric_offline_aps': value = m.offlineAps.toString(); break;
    case '_metric_clients': case '_metric_total_clients': case '_metric_active_clients': value = fmtNum(m.totalClients); sub = `${m.authenticated} authenticated`; break;
    case '_metric_authenticated': value = fmtNum(m.authenticated); sub = `${m.totalClients > 0 ? ((m.authenticated / m.totalClients) * 100).toFixed(0) : 0}%`; break;
    case '_metric_throughput': case '_metric_total_throughput': value = formatBitsPerSecond(m.totalThroughput); sub = `${formatBitsPerSecond(m.totalUpload)} up / ${formatBitsPerSecond(m.totalDownload)} down`; break;
    case '_metric_upload': value = formatBitsPerSecond(m.totalUpload); break;
    case '_metric_download': value = formatBitsPerSecond(m.totalDownload); break;
    case '_metric_health': value = `${m.bpScore}%`; sub = `${m.bpGood} pass / ${m.bpWarn + m.bpError} issues`; break;
    case '_metric_sites': case '_metric_total_sites': value = m.totalSites.toString(); break;
    case '_metric_networks': case '_metric_client_networks': value = m.totalServices.toString(); break;
    case '_metric_avg_rssi': case '_metric_avg_signal': value = `${m.avgRssi} dBm`; break;
    case '_metric_ap_models': value = m.apModels.length.toString(); break;
    case '_metric_bp_summary': value = `${m.bpGood}/${m.bpTotal}`; sub = `${m.bpWarn} warnings, ${m.bpError} errors`; break;
    case '_metric_band_24': value = (m.bands['2.4 GHz'] || 0).toString(); break;
    case '_metric_band_5': value = (m.bands['5 GHz'] || 0).toString(); break;
    case '_metric_band_6': value = (m.bands['6 GHz'] || 0).toString(); break;
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{widget.title || key}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn('p-2 rounded-lg', color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function renderTimeseries(widget: ReportWidgetConfig, widgetData: Record<string, any>) {
  const raw = widgetData[widget.widgetKey];
  const parsed = parseTimeseriesData(raw);

  if (!parsed.length || !parsed[0]?.statistics?.length) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || widget.widgetKey}</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-muted-foreground text-center py-8">No data available</p></CardContent>
      </Card>
    );
  }

  const stats = parsed[0].statistics;
  const chartData = stats[0]?.values?.map((v: any, idx: number) => {
    const point: any = { time: new Date(v.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) };
    stats.forEach((s: any, si: number) => {
      point[s.name || `series${si}`] = s.values?.[idx]?.value || 0;
    });
    return point;
  }) || [];

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || widget.widgetKey}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
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
}

function renderApiRanking(widget: ReportWidgetConfig, widgetData: Record<string, any>) {
  const raw = widgetData[widget.widgetKey];
  const parsed = parseRankingData(raw);
  if (!parsed.length) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || widget.widgetKey}</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-muted-foreground text-center py-4">No data available</p></CardContent>
      </Card>
    );
  }

  const items = parsed.slice(0, widget.config?.maxItems || 10);
  const maxVal = Math.max(...items.map((d: any) => d.value), 1);
  const unit = items[0]?.unit || '';

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || widget.widgetKey}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item: any, i: number) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[200px] font-medium">{item.name}</span>
                <span className="text-muted-foreground font-mono">
                  {unit === 'bps' ? formatBitsPerSecond(item.value) : unit === 'bytes' ? formatBytes(item.value) : `${fmtNum(item.value)} ${unit}`}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${(item.value / maxVal) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function renderComputedRanking(widget: ReportWidgetConfig, m: ReportMetrics) {
  const key = widget.widgetKey;

  if (key === '_metric_best_practices_full') {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || 'Best Practices'}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {m.bestPractices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No data available</p>
            ) : m.bestPractices.map((bp: any, i: number) => (
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
    );
  }

  if (key === '_metric_ap_inventory') {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || 'AP Inventory'}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {m.apModels.map((mod, i) => (
              <div key={mod.model} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="font-medium truncate max-w-[180px]">{mod.model}</span>
                </div>
                <span className="text-muted-foreground font-mono">{mod.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function renderPieChart(widget: ReportWidgetConfig, m: ReportMetrics) {
  const key = widget.widgetKey;
  let data: { name: string; value: number; fill: string }[] = [];

  if (key === '_metric_band_distribution') {
    data = [
      { name: '2.4 GHz', value: m.bands['2.4 GHz'] || 0, fill: '#f59e0b' },
      { name: '5 GHz', value: m.bands['5 GHz'] || 0, fill: '#3b82f6' },
      { name: '6 GHz', value: m.bands['6 GHz'] || 0, fill: '#8b5cf6' },
    ].filter(d => d.value > 0);
  } else if (key === '_metric_ap_model_distribution') {
    data = m.apModels.slice(0, 8).map((mod, i) => ({
      name: mod.model, value: mod.count, fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }

  if (!data.length) {
    return <Card><CardContent className="py-8 text-center text-xs text-muted-foreground">No data</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || widget.widgetKey}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function renderBarChart(widget: ReportWidgetConfig, m: ReportMetrics) {
  const key = widget.widgetKey;

  if (key === '_metric_ssid_distribution') {
    const data = m.ssidDist.slice(0, 8);
    if (!data.length) return null;
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || 'Clients by Network'}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((s, i) => (
              <div key={s.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[180px]">{s.name}</span>
                  <span className="text-muted-foreground">{s.count} ({s.pct.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (key === '_metric_rssi_distribution') {
    const data = [
      { range: 'Excellent', count: m.rssiRanges.excellent, fill: '#10b981' },
      { range: 'Good', count: m.rssiRanges.good, fill: '#22d3ee' },
      { range: 'Fair', count: m.rssiRanges.fair, fill: '#f59e0b' },
      { range: 'Poor', count: m.rssiRanges.poor, fill: '#ef4444' },
    ];
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || 'Signal Quality'}</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function renderDistribution(widget: ReportWidgetConfig, m: ReportMetrics) {
  if (widget.widgetKey === '_metric_best_practices') {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{widget.title || 'Best Practices'}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={m.bpScore >= 80 ? '#10b981' : m.bpScore >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="3" strokeDasharray={`${m.bpScore} ${100 - m.bpScore}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold">{m.bpScore}%</span>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" />{m.bpGood} Passing</div>
              <div className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-amber-500" />{m.bpWarn} Warnings</div>
              <div className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" />{m.bpError} Errors</div>
            </div>
          </div>
          {m.bestPractices.filter((b: any) => b.status !== 'Good').slice(0, 4).map((bp: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-t border-border/50">
              {bp.status === 'Error' ? <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />}
              <span className="text-muted-foreground">{bp.criteria}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }
  return null;
}
