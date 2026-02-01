/**
 * App Insights Dashboard - Redesigned
 *
 * Displays application visibility and control metrics with unified top/bottom view
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  AppWindow,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Users,
  Gauge,
  HardDrive,
  AlertCircle,
  Play,
  Globe,
  Cloud,
  ShoppingCart,
  Gamepad2,
  MessageCircle,
  Search,
  Building2,
  FileText,
  Share2,
  Shield,
  Briefcase,
  GraduationCap,
  Heart,
  Plane,
  DollarSign,
  Music,
  Camera,
  Mail,
  Database,
  Layers,
  Activity,
  Zap,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  Building,
  MapPin,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Site } from '../services/api';
import { SaveToWorkspace } from './SaveToWorkspace';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatBytes } from '../lib/units';

// Types for app insights data
interface AppGroupStat {
  id: string;
  name: string;
  value: number;
}

interface AppGroupReport {
  reportName: string;
  reportType: string;
  unit: string;
  fromTimeInMillis: number;
  toTimeInMillis: number;
  distributionStats: AppGroupStat[];
}

interface AppInsightsData {
  topAppGroupsByUsage: AppGroupReport[];
  topAppGroupsByClientCountReport: AppGroupReport[];
  topAppGroupsByThroughputReport: AppGroupReport[];
  worstAppGroupsByUsage: AppGroupReport[];
  worstAppGroupsByClientCountReport: AppGroupReport[];
  worstAppGroupsByThroughputReport: AppGroupReport[];
}

// Modern color palette for charts - VIBRANT colors with excellent contrast for dark mode
const CHART_COLORS = [
  '#818cf8', // Indigo 400 - brighter
  '#a78bfa', // Violet 400 - brighter
  '#f472b6', // Pink 400 - brighter
  '#2dd4bf', // Teal 400 - brighter
  '#fb923c', // Orange 400 - brighter
  '#facc15', // Yellow 400 - brighter
  '#4ade80', // Green 400 - brighter
  '#22d3ee', // Cyan 400 - brighter
  '#60a5fa', // Blue 400 - brighter
  '#c084fc', // Purple 400 - brighter
];

// Category color mapping - VIBRANT, distinct colors for dark mode with excellent readability
const CATEGORY_COLORS: Record<string, string> = {
  streaming: '#f472b6',      // Pink 400 - entertainment
  storage: '#60a5fa',        // Blue 400 - data/storage
  cloud: '#22d3ee',          // Cyan 400 - cloud services
  social: '#a78bfa',         // Violet 400 - social
  gaming: '#fb923c',         // Orange 400 - gaming
  web: '#4ade80',            // Green 400 - web
  search: '#facc15',         // Yellow 400 - search
  communication: '#818cf8',  // Indigo 400 - comms
  business: '#2dd4bf',       // Teal 400 - business
  security: '#f87171',       // Red 400 - security
  realtime: '#c084fc',       // Purple 400 - realtime
  corporate: '#94a3b8',      // Slate 400 - corporate
  content: '#38bdf8',        // Sky 400 - content
  applications: '#34d399',   // Emerald 400 - apps
};

const getCategoryColor = (category: string, index: number): string => {
  const name = category.toLowerCase();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (name.includes(key)) return color;
  }
  return CHART_COLORS[index % CHART_COLORS.length];
};

// Category icon mapping
const getCategoryIcon = (category: string) => {
  const name = category.toLowerCase();
  if (name.includes('stream')) return Play;
  if (name.includes('social')) return MessageCircle;
  if (name.includes('game')) return Gamepad2;
  if (name.includes('cloud') && name.includes('storage')) return Cloud;
  if (name.includes('cloud')) return Cloud;
  if (name.includes('web')) return Globe;
  if (name.includes('search')) return Search;
  if (name.includes('commerce') || name.includes('shopping')) return ShoppingCart;
  if (name.includes('corporate')) return Building2;
  if (name.includes('storage')) return Database;
  if (name.includes('realtime') || name.includes('communication')) return MessageCircle;
  if (name.includes('software') || name.includes('update')) return FileText;
  if (name.includes('share') || name.includes('file')) return Share2;
  if (name.includes('security') || name.includes('certificate')) return Shield;
  if (name.includes('business') || name.includes('enterprise')) return Briefcase;
  if (name.includes('education')) return GraduationCap;
  if (name.includes('health')) return Heart;
  if (name.includes('travel')) return Plane;
  if (name.includes('finance')) return DollarSign;
  if (name.includes('music') || name.includes('audio')) return Music;
  if (name.includes('photo') || name.includes('video')) return Camera;
  if (name.includes('mail') || name.includes('email')) return Mail;
  if (name.includes('peer')) return Share2;
  if (name.includes('database')) return Database;
  if (name.includes('restrict')) return Shield;
  return Layers;
};

const formatThroughput = (bps: number): string => {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} Kbps`;
  return `${bps.toFixed(0)} bps`;
};

const formatThroughputCompact = (bps: number): string => {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)}G`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)}M`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)}K`;
  return `${bps.toFixed(0)}`;
};

const formatNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
};

interface AppInsightsProps {
  api: any;
}

export function AppInsights({ api }: AppInsightsProps) {
  const [data, setData] = useState<AppInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>('14D');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [isLoadingSites, setIsLoadingSites] = useState(false);

  // Load sites
  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      const sitesData = await api.getSites();
      setSites(Array.isArray(sitesData) ? sitesData : []);
    } catch (err) {
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const siteId = selectedSite !== 'all' ? selectedSite : undefined;
      const response = await api.getAppInsights(duration, siteId);
      setData(response);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load application insights data');
    } finally {
      setLoading(false);
    }
  }, [api, duration, selectedSite]);

  useEffect(() => { loadSites(); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data) return null;
    const filterUnknown = (stats: AppGroupStat[]) =>
      stats.filter(item => !item.id?.toLowerCase().includes('unknown') && !item.name?.toLowerCase().includes('unknown'));

    return {
      topUsage: filterUnknown(data.topAppGroupsByUsage?.[0]?.distributionStats || []),
      topClientCount: filterUnknown(data.topAppGroupsByClientCountReport?.[0]?.distributionStats || []),
      topThroughput: filterUnknown(data.topAppGroupsByThroughputReport?.[0]?.distributionStats || []),
      bottomUsage: filterUnknown(data.worstAppGroupsByUsage?.[0]?.distributionStats || []),
      bottomClientCount: filterUnknown(data.worstAppGroupsByClientCountReport?.[0]?.distributionStats || []),
      bottomThroughput: filterUnknown(data.worstAppGroupsByThroughputReport?.[0]?.distributionStats || []),
    };
  }, [data]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!chartData) return null;
    const totalUsage = chartData.topUsage.reduce((sum, item) => sum + item.value, 0);
    const totalThroughput = chartData.topThroughput.reduce((sum, item) => sum + item.value, 0);
    const totalClients = chartData.topClientCount.reduce((sum, item) => sum + item.value, 0);
    const totalCategories = new Set([...chartData.topUsage.map(i => i.id), ...chartData.bottomUsage.map(i => i.id)]).size;
    const topCategoryUsage = chartData.topUsage[0]?.value || 0;
    const topCategoryPercent = totalUsage > 0 ? ((topCategoryUsage / totalUsage) * 100).toFixed(1) : '0';

    return {
      totalUsage,
      totalThroughput,
      totalClients,
      totalCategories,
      topCategory: chartData.topUsage[0]?.name || 'N/A',
      topCategoryPercent,
    };
  }, [chartData]);

  // Generate insights
  const insights = useMemo(() => {
    if (!chartData || !stats) return [];
    const insights: { text: string; type: 'info' | 'success' | 'warning' }[] = [];

    if (parseFloat(stats.topCategoryPercent) > 40) {
      insights.push({
        text: `${stats.topCategory} dominates with ${stats.topCategoryPercent}% of total traffic`,
        type: 'info'
      });
    }

    const streamingApp = chartData.topUsage.find(app => app.name.toLowerCase().includes('stream'));
    if (streamingApp) {
      insights.push({
        text: `Streaming services are actively consuming bandwidth`,
        type: 'info'
      });
    }

    if (chartData.topClientCount[0]?.value > 100) {
      insights.push({
        text: `${chartData.topClientCount[0]?.name} has the highest user engagement`,
        type: 'success'
      });
    }

    return insights.slice(0, 2);
  }, [chartData, stats]);

  // Unified Comparison Card
  const ComparisonCard = ({ topData, bottomData, title, unit, icon: Icon, color, widgetId, endpointRef }: any) => {
    const maxTop = Math.max(...topData.map((d: any) => d.value), 1);
    const maxBottom = Math.max(...bottomData.map((d: any) => d.value), 1);

    const formatValue = (value: number) => {
      if (unit === 'bytes') return formatBytes(value);
      if (unit === 'bps') return formatThroughput(value);
      return value.toLocaleString();
    };

    return (
      <Card className="hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="pb-2 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className={`p-1.5 rounded ${color} shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all`}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <CardTitle className="text-xs font-semibold text-slate-200">{title}</CardTitle>
            </div>
            <SaveToWorkspace
              widgetId={widgetId}
              widgetType="topn_table"
              title={`App Insights: ${title}`}
              endpointRefs={[endpointRef]}
              sourcePage="app-insights"
              catalogId={`app_insights_by_${unit === 'bytes' ? 'throughput' : unit === 'bps' ? 'throughput' : 'impact'}`}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 relative">
          {/* Top Categories */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <ChevronUp className="h-3 w-3 text-emerald-400" />
              <span className="text-[10px] font-medium text-slate-400">Top Performers</span>
            </div>
            {topData.slice(0, 5).map((item: any, index: number) => {
              const percentage = maxTop > 0 ? (item.value / maxTop) * 100 : 0;
              const CategoryIcon = getCategoryIcon(item.name);
              const itemColor = getCategoryColor(item.name, index);

              return (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div 
                      className="p-1 rounded border" 
                      style={{ 
                        backgroundColor: `${itemColor}20`, 
                        borderColor: `${itemColor}50` 
                      }}
                    >
                      <CategoryIcon className="h-3 w-3" style={{ color: itemColor }} />
                    </div>
                    <span className="text-xs font-medium truncate flex-1 text-slate-200" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: itemColor }}>{formatValue(item.value)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800/40 rounded-full overflow-hidden ml-6">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%`, backgroundColor: itemColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Categories */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <ChevronDown className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] font-medium text-slate-500">Low Activity</span>
            </div>
            {bottomData.slice(0, 5).map((item: any, index: number) => {
              const percentage = maxBottom > 0 ? (item.value / maxBottom) * 100 : 0;
              const CategoryIcon = getCategoryIcon(item.name);
              const itemColor = getCategoryColor(item.name, index + 5);

              return (
                <div key={item.id} className="space-y-1 opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2">
                    <div 
                      className="p-1 rounded border" 
                      style={{ 
                        backgroundColor: `${itemColor}15`, 
                        borderColor: `${itemColor}30` 
                      }}
                    >
                      <CategoryIcon className="h-3 w-3" style={{ color: itemColor }} />
                    </div>
                    <span className="text-xs font-medium truncate flex-1 text-slate-400" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">{formatValue(item.value)}</span>
                  </div>
                  <div className="h-1 bg-slate-800/30 rounded-full overflow-hidden ml-6">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%`, backgroundColor: `${itemColor}80` }}
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

  if (loading && !data) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-16 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />)}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2].map(i => <Skeleton key={i} className="h-64 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-80 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-500/20 backdrop-blur-sm overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 opacity-5 animate-pulse" />
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-fuchsia-500/20 rounded-full blur-3xl" />

        <div className="flex items-center gap-2.5 relative z-10">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-violet-500/50 animate-pulse">
            <AppWindow className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              App Insights
            </h1>
            <p className="text-xs text-slate-400">
              Application visibility and traffic analytics
              {selectedSite !== 'all' && (
                <span className="ml-1 text-violet-400 font-medium">
                  • {sites.find(s => s.id === selectedSite)?.name || selectedSite}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[145px] h-8 text-xs">
              <Building className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name || site.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1D">Last 24 Hours</SelectItem>
              <SelectItem value="7D">Last 7 Days</SelectItem>
              <SelectItem value="14D">Last 14 Days</SelectItem>
              <SelectItem value="30D">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 px-3 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    Total Data
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                  </p>
                  <p className="text-lg font-bold text-cyan-400">{formatBytes(stats.totalUsage)}</p>
                  <p className="text-[10px] text-slate-500">{stats.totalCategories} categories</p>
                </div>
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
                  <HardDrive className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    Throughput
                    <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
                  </p>
                  <p className="text-lg font-bold text-emerald-400">{formatThroughput(stats.totalThroughput)}</p>
                  <p className="text-[10px] text-slate-500">Avg bandwidth</p>
                </div>
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
                  <Gauge className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    Active Clients
                    <ArrowUpRight className="h-3 w-3 text-violet-400" />
                  </p>
                  <p className="text-lg font-bold text-violet-400">{formatNumber(stats.totalClients)}</p>
                  <p className="text-[10px] text-slate-500">Using apps</p>
                </div>
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-md group-hover:scale-110 transition-transform">
                  <Users className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    Top Category
                    <Sparkles className="h-3 w-3 text-amber-400" />
                  </p>
                  <p className="text-base font-bold truncate text-amber-400">{stats.topCategory}</p>
                  <p className="text-[10px] text-slate-500">{stats.topCategoryPercent}% of traffic</p>
                </div>
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md group-hover:scale-110 transition-transform">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Insights Banner */}
      {insights.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-2 px-3">
            <div className="flex items-start gap-2">
              <div className="p-1 rounded bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-0.5">Quick Insights</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {insights.map((insight, i) => (
                    <p key={i} className="text-xs text-slate-300 flex items-center gap-1">
                      <Info className="h-3 w-3 text-violet-400" />
                      {insight.text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Distribution Visualizations */}
      {chartData && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {/* Top Categories Donut Chart */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-200">
                  <PieChart className="h-4 w-4 text-violet-400" />
                  Top Categories by Usage
                </CardTitle>
                <SaveToWorkspace
                  widgetId="app-insights-categories-usage"
                  widgetType="topn_table"
                  title="Top App Categories by Usage"
                  endpointRefs={['app_insights.by_category']}
                  sourcePage="app-insights"
                  catalogId="app_insights_by_category"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={chartData.topUsage.slice(0, 6)}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, cx, cy, midAngle, outerRadius }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = outerRadius + 25;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        const displayName = name.length > 15 ? name.substring(0, 15) + '...' : name;

                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#e2e8f0"
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                            fontSize={12}
                            fontWeight={500}
                            style={{
                              paintOrder: 'stroke',
                              stroke: '#0f172a',
                              strokeWidth: 3,
                              strokeLinecap: 'round',
                              strokeLinejoin: 'round'
                            }}
                          >
                            {displayName}
                          </text>
                        );
                      }}
                      labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                    >
                      {chartData.topUsage.slice(0, 6).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name, index)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatBytes(value)}
                      labelFormatter={() => ''}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f1f5f9'
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Applications Bar Chart */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-200">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  Application Bandwidth Distribution
                </CardTitle>
                <SaveToWorkspace
                  widgetId="app-insights-bandwidth-dist"
                  widgetType="topn_table"
                  title="Top Apps by Bandwidth"
                  endpointRefs={['app_insights.top_apps']}
                  sourcePage="app-insights"
                  catalogId="app_insights_by_throughput"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData.topThroughput.slice(0, 8)}
                    layout="horizontal"
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.4} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={0}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={{ stroke: '#475569' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v) => formatThroughputCompact(v)}
                      width={45}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={{ stroke: '#475569' }}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatThroughput(value), 'Throughput']}
                      labelFormatter={(label) => label}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f1f5f9',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}
                      cursor={{ fill: '#334155', opacity: 0.3 }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[6, 6, 0, 0]}
                    >
                      {chartData.topThroughput.slice(0, 8).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name, index)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unified Comparison View */}
      {chartData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          <ComparisonCard
            topData={chartData.topUsage}
            bottomData={chartData.bottomUsage}
            title="Data Usage"
            unit="bytes"
            icon={HardDrive}
            color="bg-gradient-to-br from-blue-500 to-cyan-500"
            widgetId="app-insights-data-usage"
            endpointRef="app_insights.top_apps"
          />
          <ComparisonCard
            topData={chartData.topClientCount}
            bottomData={chartData.bottomClientCount}
            title="Client Count"
            unit="users"
            icon={Users}
            color="bg-gradient-to-br from-violet-500 to-purple-500"
            widgetId="app-insights-client-count"
            endpointRef="app_insights.top_apps"
          />
          <ComparisonCard
            topData={chartData.topThroughput}
            bottomData={chartData.bottomThroughput}
            title="Throughput"
            unit="bps"
            icon={Gauge}
            color="bg-gradient-to-br from-emerald-500 to-green-500"
            widgetId="app-insights-throughput"
            endpointRef="app_insights.top_apps"
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3" />
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
        {selectedSite !== 'all' && (
          <Badge variant="outline" className="text-xs">
            <Building2 className="h-3 w-3 mr-1" />
            Filtered by site
          </Badge>
        )}
      </div>
    </div>
  );
}
