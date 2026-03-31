/**
 * App Insights Dashboard - Redesigned
 *
 * Displays application visibility and control metrics with unified top/bottom view
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
// Button imported by PageHeader internally
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  AppWindow,
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
import { Site, apiService } from '../services/api';
import { PageHeader } from './PageHeader';
import { SaveToWorkspace } from './SaveToWorkspace';
import { useAppContext } from '@/contexts/AppContext';
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

// Chart color palette — works across dark, light, and dev themes
// Uses mid-saturation values that read well on both white and dark surfaces
const CHART_COLORS = [
  '#7c6fcd', // Indigo — readable on light + dark
  '#9066e0', // Violet
  '#d6568f', // Pink
  '#0d9488', // Teal 600 — deeper for light mode readability
  '#ea7025', // Orange
  '#c9a009', // Yellow/gold — darker for light readability
  '#16a34a', // Green 600
  '#0891b2', // Cyan 600
  '#2563eb', // Blue 600
  '#9333ea', // Purple 600
];

// Category color mapping — mid-saturation for cross-theme readability
const CATEGORY_COLORS: Record<string, string> = {
  streaming: '#d6568f',      // Pink — entertainment
  storage: '#2563eb',        // Blue 600 — data/storage
  cloud: '#0891b2',          // Cyan 600 — cloud services
  social: '#9066e0',         // Violet — social
  gaming: '#ea7025',         // Orange — gaming
  web: '#16a34a',            // Green 600 — web
  search: '#c9a009',         // Gold — search
  communication: '#7c6fcd',  // Indigo — comms
  business: '#0d9488',       // Teal 600 — business
  security: '#dc2626',       // Red 600 — security
  realtime: '#9333ea',       // Purple 600 — realtime
  corporate: '#64748b',      // Slate 500 — corporate
  content: '#0284c7',        // Sky 600 — content
  applications: '#059669',   // Emerald 600 — apps
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
  const { navigationScope, siteGroups } = useAppContext();
  const [data, setData] = useState<AppInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>('14D');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [isLoadingSites, setIsLoadingSites] = useState(false);

  // Load sites from all controllers at org scope
  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      let allSites: Site[] = [];
      if (navigationScope === 'global' && siteGroups.length > 0) {
        const originalBaseUrl = apiService.getBaseUrl();
        for (const sg of siteGroups) {
          try {
            apiService.setBaseUrl(`${sg.controller_url}/management`);
            const sgSites = await apiService.getSites();
            allSites.push(...(Array.isArray(sgSites) ? sgSites : []));
          } catch (err) {
            console.warn(`[AppInsights] Failed to fetch sites from ${sg.name}:`, err);
          }
        }
        apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
      } else {
        const sitesData = await api.getSites();
        allSites = Array.isArray(sitesData) ? sitesData : [];
      }
      // Normalize name and deduplicate by id
      const seen = new Set<string>();
      const normalized = allSites
        .map(s => ({ ...s, name: s.name || s.siteName || 'Unnamed Site' }))
        .filter(s => {
          const key = s.id || s.name;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setSites(normalized);
    } catch (err) {
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  };

  // Merge two AppInsightsData by summing distributionStats values per id
  const mergeInsights = (a: AppInsightsData, b: AppInsightsData): AppInsightsData => {
    const mergeReports = (ra: AppGroupReport[], rb: AppGroupReport[]): AppGroupReport[] => {
      if (!ra?.length) return rb || [];
      if (!rb?.length) return ra;
      const base = { ...ra[0] };
      const map = new Map<string, AppGroupStat>();
      for (const s of base.distributionStats) map.set(s.id, { ...s });
      for (const s of (rb[0]?.distributionStats || [])) {
        const existing = map.get(s.id);
        if (existing) existing.value += s.value;
        else map.set(s.id, { ...s });
      }
      base.distributionStats = Array.from(map.values()).sort((x, y) => y.value - x.value);
      return [base];
    };
    return {
      topAppGroupsByUsage: mergeReports(a.topAppGroupsByUsage, b.topAppGroupsByUsage),
      topAppGroupsByClientCountReport: mergeReports(a.topAppGroupsByClientCountReport, b.topAppGroupsByClientCountReport),
      topAppGroupsByThroughputReport: mergeReports(a.topAppGroupsByThroughputReport, b.topAppGroupsByThroughputReport),
      worstAppGroupsByUsage: mergeReports(a.worstAppGroupsByUsage, b.worstAppGroupsByUsage),
      worstAppGroupsByClientCountReport: mergeReports(a.worstAppGroupsByClientCountReport, b.worstAppGroupsByClientCountReport),
      worstAppGroupsByThroughputReport: mergeReports(a.worstAppGroupsByThroughputReport, b.worstAppGroupsByThroughputReport),
    };
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const siteId = selectedSite !== 'all' ? selectedSite : undefined;
      const isOrgScope = navigationScope === 'global' && siteGroups.length > 0;

      if (isOrgScope) {
        const originalBaseUrl = apiService.getBaseUrl();
        let merged: AppInsightsData | null = null;

        for (const sg of siteGroups) {
          try {
            apiService.setBaseUrl(`${sg.controller_url}/management`);
            const response = await api.getAppInsights(duration, siteId);
            merged = merged ? mergeInsights(merged, response) : response;
          } catch (err) {
            console.warn(`[AppInsights] Failed to fetch from ${sg.name}:`, err);
          }
        }

        apiService.setBaseUrl(originalBaseUrl === '/api/management' ? null : originalBaseUrl);
        if (merged) setData(merged);
      } else {
        const response = await api.getAppInsights(duration, siteId);
        setData(response);
      }
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load application insights data');
    } finally {
      setLoading(false);
    }
  }, [api, duration, selectedSite, navigationScope, siteGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSites(); }, [navigationScope, siteGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps
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
              <CardTitle className="text-xs font-semibold text-foreground">{title}</CardTitle>
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
              <ChevronUp className="h-3 w-3 text-[color:var(--status-success)]" />
              <span className="text-[10px] font-medium text-muted-foreground">Top Performers</span>
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
                    <span className="text-xs font-medium truncate flex-1 text-foreground" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: itemColor }}>{formatValue(item.value)}</span>
                  </div>
                  <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden ml-6">
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
              <ChevronDown className="h-3 w-3 text-[color:var(--warning)]" />
              <span className="text-[10px] font-medium text-muted-foreground">Low Activity</span>
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
                    <span className="text-xs font-medium truncate flex-1 text-muted-foreground" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatValue(item.value)}</span>
                  </div>
                  <div className="h-1 bg-muted/50 rounded-full overflow-hidden ml-6">
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
      <PageHeader
        title="App Insights"
        subtitle={`Application visibility and traffic analytics${selectedSite !== 'all' ? ` • ${sites.find(s => s.id === selectedSite)?.name || selectedSite}` : ''}`}
        icon={AppWindow}
        onRefresh={fetchData}
        refreshing={loading}
        actions={
          <>
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
          </>
        }
      />

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Total Data
                    <TrendingUp className="h-3 w-3 text-[color:var(--status-success)]" />
                  </p>
                  <p className="text-lg font-bold" style={{ color: 'var(--chart-2)' }}>{formatBytes(stats.totalUsage)}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.totalCategories} categories</p>
                </div>
                <div className="p-1.5 rounded-lg badge-gradient-blue shadow-md group-hover:scale-110 transition-transform">
                  <HardDrive className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Throughput
                    <Activity className="h-3 w-3 text-[color:var(--status-success)] animate-pulse" />
                  </p>
                  <p className="text-lg font-bold" style={{ color: 'var(--chart-5)' }}>{formatThroughput(stats.totalThroughput)}</p>
                  <p className="text-[10px] text-muted-foreground">Avg bandwidth</p>
                </div>
                <div className="p-1.5 rounded-lg badge-gradient-green shadow-md group-hover:scale-110 transition-transform">
                  <Gauge className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Active Clients
                    <ArrowUpRight className="h-3 w-3 text-primary" />
                  </p>
                  <p className="text-lg font-bold text-primary">{formatNumber(stats.totalClients)}</p>
                  <p className="text-[10px] text-muted-foreground">Using apps</p>
                </div>
                <div className="p-1.5 rounded-lg badge-gradient-violet shadow-md group-hover:scale-110 transition-transform">
                  <Users className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
            <div className="absolute -right-6 -top-6 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
            <CardContent className="p-3 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    Top Category
                    <Sparkles className="h-3 w-3 text-[color:var(--warning)]" />
                  </p>
                  <p className="text-base font-bold truncate" style={{ color: 'var(--chart-3)' }}>{stats.topCategory}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.topCategoryPercent}% of traffic</p>
                </div>
                <div className="p-1.5 rounded-lg badge-gradient-amber shadow-md group-hover:scale-110 transition-transform">
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
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Quick Insights</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {insights.map((insight, i) => (
                    <p key={i} className="text-xs text-foreground/80 flex items-center gap-1">
                      <Info className="h-3 w-3 text-primary" />
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
          {/* Top Categories Donut Chart — no external labels (avoids overlap); legend below */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <PieChart className="h-4 w-4 text-primary" />
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
            <CardContent className="pb-3">
              {/* Donut — compact height, labels removed to prevent overlap */}
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={chartData.topUsage.slice(0, 6)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={true}
                    >
                      {chartData.topUsage.slice(0, 6).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name, index)} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [formatBytes(value), name]}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--popover-foreground)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend grid — two columns, no overlap possible */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 px-1">
                {chartData.topUsage.slice(0, 6).map((entry, index) => {
                  const color = getCategoryColor(entry.name, index);
                  const pct = stats.totalUsage > 0
                    ? ((entry.value / stats.totalUsage) * 100).toFixed(0)
                    : '0';
                  return (
                    <div key={entry.id} className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className="text-[11px] text-foreground/80 truncate flex-1"
                        title={entry.name}
                      >
                        {entry.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Application Bandwidth Distribution — horizontal bars eliminate label rotation / overlap */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <BarChart3 className="h-4 w-4 text-[color:var(--chart-2)]" />
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
            <CardContent className="pb-3">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData.topThroughput.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 2, right: 64, left: 4, bottom: 2 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(v) => formatThroughputCompact(v)}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      width={110}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => v.length > 15 ? v.substring(0, 15) + '…' : v}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatThroughput(value), 'Throughput']}
                      labelFormatter={(label) => label}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--popover-foreground)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                      }}
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      label={{
                        position: 'right',
                        fontSize: 10,
                        fill: 'var(--muted-foreground)',
                        formatter: (v: number) => formatThroughputCompact(v)
                      }}
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
            color="badge-gradient-blue"
            widgetId="app-insights-data-usage"
            endpointRef="app_insights.top_apps"
          />
          <ComparisonCard
            topData={chartData.topClientCount}
            bottomData={chartData.bottomClientCount}
            title="Client Count"
            unit="users"
            icon={Users}
            color="badge-gradient-violet"
            widgetId="app-insights-client-count"
            endpointRef="app_insights.top_apps"
          />
          <ComparisonCard
            topData={chartData.topThroughput}
            bottomData={chartData.bottomThroughput}
            title="Throughput"
            unit="bps"
            icon={Gauge}
            color="badge-gradient-green"
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
