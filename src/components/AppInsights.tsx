/**
 * App Insights Dashboard
 *
 * Displays application visibility and control metrics including:
 * - Top/Bottom categories by usage (bytes)
 * - Top/Bottom categories by client count
 * - Top/Bottom categories by throughput (bps)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';
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
  MapPin
} from 'lucide-react';
import { Site } from '../services/api';
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

// Color palette for charts - vibrant gradient-friendly colors
const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
];

// Category color mapping for consistency
const CATEGORY_COLORS: Record<string, string> = {
  streaming: '#ec4899',
  storage: '#3b82f6',
  cloud: '#06b6d4',
  social: '#8b5cf6',
  gaming: '#f43f5e',
  web: '#22c55e',
  search: '#f97316',
  communication: '#6366f1',
  business: '#14b8a6',
  security: '#eab308',
};

// Get consistent color for a category
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
  if (name.includes('web') && name.includes('content')) return Globe;
  if (name.includes('web') && name.includes('app')) return Globe;
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

// Format throughput value
const formatThroughput = (bps: number): string => {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(2)} Kbps`;
  return `${bps.toFixed(0)} bps`;
};

// Format throughput for compact display
const formatThroughputCompact = (bps: number): string => {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)}G`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)}M`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)}K`;
  return `${bps.toFixed(0)}`;
};

// Format large numbers
const formatNumber = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
};

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, unit }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const name = payload[0].name || payload[0].payload?.name;
    let formattedValue = value;

    if (unit === 'bytes') {
      formattedValue = formatBytes(value);
    } else if (unit === 'bps') {
      formattedValue = formatThroughput(value);
    } else if (unit === 'users') {
      formattedValue = `${value.toLocaleString()} clients`;
    }

    const Icon = getCategoryIcon(name);

    return (
      <div className="bg-popover/95 backdrop-blur-sm border rounded-lg shadow-xl p-3 min-w-[160px]">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-primary" />
          <p className="font-medium text-sm truncate max-w-[140px]">{name}</p>
        </div>
        <p className="text-lg font-bold">{formattedValue}</p>
      </div>
    );
  }
  return null;
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
  const [viewMode, setViewMode] = useState<'charts' | 'bars'>('charts');

  // Site filtering
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [isLoadingSites, setIsLoadingSites] = useState(false);

  // Load sites for filtering
  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      console.log('[AppInsights] Loading sites for filter...');
      const sitesData = await api.getSites();
      const sitesArray = Array.isArray(sitesData) ? sitesData : [];
      setSites(sitesArray);
      console.log(`[AppInsights] Loaded ${sitesArray.length} sites`);
    } catch (err) {
      console.warn('[AppInsights] Failed to load sites:', err);
      setSites([]);
    } finally {
      setIsLoadingSites(false);
    }
  };

  // Fetch app insights data
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const siteId = selectedSite !== 'all' ? selectedSite : undefined;
      const response = await api.getAppInsights(duration, siteId);
      setData(response);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch app insights:', err);
      setError('Failed to load application insights data');
    } finally {
      setLoading(false);
    }
  };

  // Load sites on mount
  useEffect(() => {
    loadSites();
  }, []);

  // Reload data when duration or site changes
  useEffect(() => {
    fetchData();
  }, [duration, selectedSite]);

  // Prepare chart data - filter out "UnknownApps" as it's not meaningful
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

  // Calculate totals and summary stats
  const stats = useMemo(() => {
    if (!chartData) return null;

    const totalUsage = chartData.topUsage.reduce((sum, item) => sum + item.value, 0);
    const totalThroughput = chartData.topThroughput.reduce((sum, item) => sum + item.value, 0);
    const totalClients = chartData.topClientCount.reduce((sum, item) => sum + item.value, 0);
    const totalCategories = new Set([
      ...chartData.topUsage.map(i => i.id),
      ...chartData.bottomUsage.map(i => i.id)
    ]).size;

    // Calculate percentages for top category
    const topCategoryUsage = chartData.topUsage[0]?.value || 0;
    const topCategoryPercent = totalUsage > 0 ? ((topCategoryUsage / totalUsage) * 100).toFixed(1) : '0';

    return {
      totalUsage,
      totalThroughput,
      totalClients,
      totalCategories,
      topCategory: chartData.topUsage[0]?.name || 'N/A',
      topCategoryPercent,
      topClientCount: chartData.topClientCount.reduce((sum, item) => sum + item.value, 0),
      bottomClientCount: chartData.bottomClientCount.reduce((sum, item) => sum + item.value, 0),
      bottomThroughput: chartData.bottomThroughput.reduce((sum, item) => sum + item.value, 0),
    };
  }, [chartData]);

  // Generate insights based on data
  const insights = useMemo(() => {
    if (!chartData || !stats) return [];

    const insights: { text: string; type: 'info' | 'success' | 'warning' }[] = [];

    // Top category dominance
    if (parseFloat(stats.topCategoryPercent) > 40) {
      insights.push({
        text: `${stats.topCategory} dominates with ${stats.topCategoryPercent}% of total traffic`,
        type: 'info'
      });
    }

    // Streaming detection
    const streamingApp = chartData.topUsage.find(app => app.name.toLowerCase().includes('stream'));
    if (streamingApp) {
      insights.push({
        text: `Streaming services are actively consuming bandwidth`,
        type: 'info'
      });
    }

    // High client count apps
    if (chartData.topClientCount[0]?.value > 100) {
      insights.push({
        text: `${chartData.topClientCount[0]?.name} has the highest user engagement`,
        type: 'success'
      });
    }

    return insights.slice(0, 2);
  }, [chartData, stats]);

  // Summary Card Component
  const SummaryCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    gradient,
    trend,
    trendValue
  }: {
    title: string;
    value: string;
    subtitle: string;
    icon: any;
    gradient: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
  }) => (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-card to-card/50">
      <div className={`absolute inset-0 opacity-[0.08] ${gradient}`} />
      <div className={`absolute top-0 right-0 w-32 h-32 ${gradient} opacity-[0.15] blur-2xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:opacity-[0.25] transition-opacity`} />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              {trend && trendValue && (
                <Badge variant={trend === 'up' ? 'default' : trend === 'down' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0">
                  {trend === 'up' ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                  {trendValue}
                </Badge>
              )}
            </div>
          </div>
          <div className={`p-2.5 rounded-xl ${gradient} shadow-lg`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Horizontal Bar Chart Widget Component
  const HorizontalBarChartWidget = ({
    title,
    description,
    data,
    unit,
    icon: Icon,
    accentColor
  }: {
    title: string;
    description: string;
    data: AppGroupStat[];
    unit: string;
    icon: any;
    accentColor: string;
  }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
      <Card className="h-full hover:shadow-lg transition-all duration-300 border-muted/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${accentColor} shadow-md`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">{title}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-medium border-muted-foreground/30">
              {data.length} apps
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {data.slice(0, 8).map((item, index) => {
              const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
              const sharePercent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
              const CategoryIcon = getCategoryIcon(item.name);
              const color = getCategoryColor(item.name, index);
              let displayValue = item.value.toString();

              if (unit === 'bytes') {
                displayValue = formatBytes(item.value);
              } else if (unit === 'bps') {
                displayValue = formatThroughput(item.value);
              }

              return (
                <div key={item.id} className="group">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="p-1 rounded-md transition-colors"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <CategoryIcon
                        className="h-3.5 w-3.5 transition-colors"
                        style={{ color }}
                      />
                    </div>
                    <span className="text-xs font-medium truncate flex-1" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{sharePercent}%</span>
                    <span className="text-xs font-semibold tabular-nums min-w-[60px] text-right">{displayValue}</span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out group-hover:opacity-90"
                      style={{
                        width: `${percentage}%`,
                        background: `linear-gradient(90deg, ${color}, ${color}dd)`
                      }}
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

  // Donut Chart Widget Component - Vertical Layout to prevent overlap
  const DonutChartWidget = ({
    title,
    description,
    data,
    unit,
    icon: Icon,
    centerValue,
    centerLabel,
    accentColor
  }: {
    title: string;
    description: string;
    data: AppGroupStat[];
    unit: string;
    icon: any;
    centerValue: string;
    centerLabel: string;
    accentColor: string;
  }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
      <Card className="h-full hover:shadow-lg transition-all duration-300 border-muted/50">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${accentColor} shadow-md`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Vertical stacked layout */}
          <div className="flex flex-col items-center">
            {/* Donut Chart - Centered */}
            <div className="relative w-[130px] h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={data.slice(0, 8)}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={0}
                  >
                    {data.slice(0, 8).map((item, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getCategoryColor(item.name, index)}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip unit={unit} />} />
                </RechartsPieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-bold leading-none">{centerValue}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">{centerLabel}</span>
              </div>
            </div>

            {/* Legend - Below chart in 2 columns */}
            <div className="w-full mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {data.slice(0, 6).map((item, index) => {
                const CategoryIcon = getCategoryIcon(item.name);
                const color = getCategoryColor(item.name, index);
                const percent = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
                return (
                  <div key={item.id} className="flex items-center gap-1 text-[11px] group cursor-default overflow-hidden">
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <CategoryIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate group-hover:text-foreground transition-colors text-muted-foreground" title={item.name}>
                      {item.name.length > 14 ? item.name.substring(0, 14) + '...' : item.name}
                    </span>
                  </div>
                );
              })}
            </div>
            {data.length > 6 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                +{data.length - 6} more categories
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Compact Bar Chart Widget for comparison view
  const CompactBarWidget = ({
    title,
    data,
    unit,
    color
  }: {
    title: string;
    data: AppGroupStat[];
    unit: string;
    color: string;
  }) => {
    const chartData = data.slice(0, 6).map(item => ({
      ...item,
      shortName: item.name.length > 12 ? item.name.substring(0, 12) + '...' : item.name
    }));

    return (
      <Card className="hover:shadow-lg transition-all duration-300 border-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => {
                    if (unit === 'bytes') return formatBytes(value).replace(' ', '');
                    if (unit === 'bps') return formatThroughputCompact(value);
                    return formatNumber(value);
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  width={80}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                <Bar
                  dataKey="value"
                  fill={color}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-[140px]" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-4 py-8">
            <div className="p-3 rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Unable to Load Data</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-violet-500/25">
            <AppWindow className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">App Insights</h1>
            <p className="text-sm text-muted-foreground">
              Application visibility and traffic analytics
              {selectedSite !== 'all' && (
                <span className="ml-1">
                  • <span className="text-primary font-medium">{sites.find(s => s.id === selectedSite)?.name || selectedSite}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Site Selector */}
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[180px]">
              <Building className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Select Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  All Sites
                </div>
              </SelectItem>
              {sites.length > 0 ? (
                sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      {site.name || site.siteName || site.id}
                    </div>
                  </SelectItem>
                ))
              ) : isLoadingSites ? (
                <SelectItem value="loading" disabled>
                  Loading sites...
                </SelectItem>
              ) : (
                <SelectItem value="no-sites" disabled>
                  No sites available
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {/* View Toggle */}
          <div className="flex items-center border rounded-lg p-1 bg-muted/30">
            <Button
              variant={viewMode === 'charts' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('charts')}
            >
              <PieChart className="h-4 w-4 mr-1.5" />
              Charts
            </Button>
            <Button
              variant={viewMode === 'bars' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3"
              onClick={() => setViewMode('bars')}
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Bars
            </Button>
          </div>

          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1D">Last 24 Hours</SelectItem>
              <SelectItem value="7D">Last 7 Days</SelectItem>
              <SelectItem value="14D">Last 14 Days</SelectItem>
              <SelectItem value="30D">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Data Usage"
            value={formatBytes(stats.totalUsage)}
            subtitle={`Across ${stats.totalCategories} categories`}
            icon={HardDrive}
            gradient="bg-gradient-to-br from-blue-500 to-cyan-500"
          />
          <SummaryCard
            title="Avg Throughput"
            value={formatThroughput(stats.totalThroughput)}
            subtitle="Combined bandwidth"
            icon={Gauge}
            gradient="bg-gradient-to-br from-emerald-500 to-green-500"
          />
          <SummaryCard
            title="Active Clients"
            value={formatNumber(stats.totalClients)}
            subtitle="Using applications"
            icon={Users}
            gradient="bg-gradient-to-br from-violet-500 to-purple-500"
          />
          <SummaryCard
            title="Top Category"
            value={stats.topCategory}
            subtitle={`${stats.topCategoryPercent}% of traffic`}
            icon={Zap}
            gradient="bg-gradient-to-br from-amber-500 to-orange-500"
          />
        </div>
      )}

      {/* Insights Banner */}
      {insights.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Quick Insights</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {insights.map((insight, i) => (
                    <p key={i} className="text-sm text-muted-foreground flex items-center gap-1.5">
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

      {/* Last updated & context indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          Last updated: {lastRefresh.toLocaleString()}
        </div>
        {selectedSite !== 'all' && (
          <Badge variant="outline" className="text-xs">
            <Building2 className="h-3 w-3 mr-1" />
            Filtered by site
          </Badge>
        )}
      </div>

      {viewMode === 'charts' ? (
        <>
          {/* Top Categories Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Top Categories</h2>
                <p className="text-xs text-muted-foreground">Highest traffic application categories</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {chartData && (
                <HorizontalBarChartWidget
                  title="By Data Usage"
                  description="Total bytes transferred"
                  data={chartData.topUsage}
                  unit="bytes"
                  icon={HardDrive}
                  accentColor="bg-gradient-to-br from-blue-500 to-cyan-500"
                />
              )}

              {chartData && stats && (
                <DonutChartWidget
                  title="By Client Count"
                  description="Number of active clients"
                  data={chartData.topClientCount}
                  unit="users"
                  icon={Users}
                  centerValue={formatNumber(stats.topClientCount)}
                  centerLabel="clients"
                  accentColor="bg-gradient-to-br from-violet-500 to-purple-500"
                />
              )}

              {chartData && stats && (
                <DonutChartWidget
                  title="By Throughput"
                  description="Average bandwidth consumption"
                  data={chartData.topThroughput}
                  unit="bps"
                  icon={Gauge}
                  centerValue={formatThroughputCompact(stats.totalThroughput)}
                  centerLabel="throughput"
                  accentColor="bg-gradient-to-br from-emerald-500 to-green-500"
                />
              )}
            </div>
          </div>

          {/* Bottom Categories Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <TrendingDown className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Bottom Categories</h2>
                <p className="text-xs text-muted-foreground">Lowest traffic application categories</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {chartData && (
                <HorizontalBarChartWidget
                  title="By Data Usage"
                  description="Total bytes transferred"
                  data={chartData.bottomUsage}
                  unit="bytes"
                  icon={HardDrive}
                  accentColor="bg-gradient-to-br from-amber-500 to-orange-500"
                />
              )}

              {chartData && stats && (
                <DonutChartWidget
                  title="By Client Count"
                  description="Number of active clients"
                  data={chartData.bottomClientCount}
                  unit="users"
                  icon={Users}
                  centerValue={formatNumber(stats.bottomClientCount)}
                  centerLabel="clients"
                  accentColor="bg-gradient-to-br from-rose-500 to-pink-500"
                />
              )}

              {chartData && stats && (
                <DonutChartWidget
                  title="By Throughput"
                  description="Average bandwidth consumption"
                  data={chartData.bottomThroughput}
                  unit="bps"
                  icon={Gauge}
                  centerValue={formatThroughputCompact(stats.bottomThroughput)}
                  centerLabel="throughput"
                  accentColor="bg-gradient-to-br from-slate-500 to-slate-600"
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Bar Chart View */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Top Categories Comparison</h2>
                <p className="text-xs text-muted-foreground">Side-by-side view of highest traffic categories</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {chartData && (
                <>
                  <CompactBarWidget
                    title="Data Usage"
                    data={chartData.topUsage}
                    unit="bytes"
                    color="#3b82f6"
                  />
                  <CompactBarWidget
                    title="Client Count"
                    data={chartData.topClientCount}
                    unit="users"
                    color="#8b5cf6"
                  />
                  <CompactBarWidget
                    title="Throughput"
                    data={chartData.topThroughput}
                    unit="bps"
                    color="#22c55e"
                  />
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <TrendingDown className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Bottom Categories Comparison</h2>
                <p className="text-xs text-muted-foreground">Side-by-side view of lowest traffic categories</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {chartData && (
                <>
                  <CompactBarWidget
                    title="Data Usage"
                    data={chartData.bottomUsage}
                    unit="bytes"
                    color="#f97316"
                  />
                  <CompactBarWidget
                    title="Client Count"
                    data={chartData.bottomClientCount}
                    unit="users"
                    color="#ec4899"
                  />
                  <CompactBarWidget
                    title="Throughput"
                    data={chartData.bottomThroughput}
                    unit="bps"
                    color="#64748b"
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
