import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, BarChart3, Users, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import { apiService } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatBitsPerSecond, formatDataVolume } from '../lib/units';

interface ApplicationCategoriesWidgetProps {
  siteId?: string;
  duration?: string;
}

interface CategoryData {
  category: string;
  bytes?: number;
  throughput?: number;
  clientCount?: number;
  clients?: number;
  usage?: number;
}

export function ApplicationCategoriesWidget({ siteId, duration = '24H' }: ApplicationCategoriesWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategoryData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadCategoryData(true);
    }, 300000);

    return () => clearInterval(interval);
  }, [siteId, duration]);

  const loadCategoryData = async (isRefresh = false) => {
    if (!siteId) {
      setError('No site selected');
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
      console.log('[ApplicationCategoriesWidget] Fetching application category data for site:', siteId);

      const categoryData = await apiService.fetchApplicationAnalytics(siteId, duration);

      console.log('[ApplicationCategoriesWidget] Category data received:', categoryData);
      setData(categoryData);
      setLastUpdate(new Date());

    } catch (error) {
      console.error('[ApplicationCategoriesWidget] Error loading category data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load application category data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getCategoryName = (cat: CategoryData): string => {
    return cat.category || 'Unknown';
  };

  const getCategoryBytes = (cat: CategoryData): number => {
    return cat.bytes || cat.usage || 0;
  };

  const getCategoryClients = (cat: CategoryData): number => {
    return cat.clientCount || cat.clients || 0;
  };

  const getCategoryThroughput = (cat: CategoryData): number => {
    return cat.throughput || cat.bytes || 0;
  };

  // Color palette for charts - using vibrant, distinct colors
  const COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#f97316', // orange
    '#14b8a6', // teal
    '#a855f7', // violet
    '#84cc16', // lime
    '#6366f1', // indigo
  ];

  if (loading && !data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 animate-pulse" />
            <CardTitle>Application Categories</CardTitle>
          </div>
          <CardDescription>Network traffic by application type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full border-amber-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <CardTitle>Application Categories</CardTitle>
            </div>
            <Button
              onClick={() => loadCategoryData(true)}
              variant="outline"
              size="sm"
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              {error || 'Application category data is not available for this site. This feature may require DPI (Deep Packet Inspection) licensing.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const topByUsage = data.topByUsage || [];
  const topByClients = data.topByClients || [];
  const topByThroughput = data.topByThroughput || [];

  // Prepare data for charts
  const usageChartData = topByUsage.slice(0, 10).map((cat: CategoryData) => ({
    name: getCategoryName(cat),
    value: getCategoryBytes(cat),
    formatted: formatBytes(getCategoryBytes(cat))
  }));

  const clientsChartData = topByClients.slice(0, 8).map((cat: CategoryData, index: number) => ({
    name: getCategoryName(cat),
    value: getCategoryClients(cat),
    fill: COLORS[index % COLORS.length]
  }));

  const throughputChartData = topByThroughput.slice(0, 8).map((cat: CategoryData, index: number) => ({
    name: getCategoryName(cat),
    value: getCategoryThroughput(cat),
    fill: COLORS[index % COLORS.length]
  }));

  // Calculate totals
  const totalThroughput = throughputChartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Application Categories</CardTitle>
              <CardDescription>
                Network traffic by application type
                {lastUpdate && (
                  <span className="ml-2">• Updated {lastUpdate.toLocaleTimeString()}</span>
                )}
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={() => loadCategoryData(true)}
            variant="outline"
            size="sm"
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Top Categories by Usage - Bar Chart */}
          {usageChartData.length > 0 && (
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-500" />
                  Top Categories by Usage
                </CardTitle>
                <CardDescription>Total data transferred</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={usageChartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" fontSize={10} tick={{ fill: 'hsl(var(--foreground))' }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={90}
                        fontSize={10}
                        tick={{ fill: 'hsl(var(--foreground))' }}
                      />
                      <Tooltip
                        formatter={(value: number) => formatBytes(value)}
                        contentStyle={{
                          fontSize: '12px',
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Categories by Client Count - Pie Chart */}
          {clientsChartData.length > 0 && (
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-500" />
                  Top Categories by Client Count
                </CardTitle>
                <CardDescription>Users per category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clientsChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
                          const RADIAN = Math.PI / 180;
                          const radius = outerRadius * 1.2;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              className="fill-foreground text-xs"
                              textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central"
                            >
                              {name} {(percent * 100).toFixed(0)}%
                            </text>
                          );
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {clientsChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `${formatNumber(value)} clients`}
                        contentStyle={{
                          fontSize: '12px',
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Categories by Throughput - Pie Chart with Center Total */}
          {throughputChartData.length > 0 && (
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Top Categories by Throughput
                </CardTitle>
                <CardDescription>Bandwidth per category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={throughputChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {throughputChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => formatBytes(value)}
                        contentStyle={{
                          fontSize: '12px',
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconSize={8}
                        wrapperStyle={{ fontSize: '10px', color: 'hsl(var(--foreground))' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label showing total throughput */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-lg font-bold">{formatBytes(totalThroughput)}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Category Details Table */}
        {topByUsage.length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-semibold mb-3">Category Details</h4>
            <div className="space-y-2">
              {topByUsage.slice(0, 10).map((cat: CategoryData, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <div>
                      <p className="font-medium text-sm">{getCategoryName(cat)}</p>
                      <p className="text-xs text-muted-foreground">
                        {getCategoryClients(cat)} clients
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatBytes(getCategoryBytes(cat))}</p>
                    <p className="text-xs text-muted-foreground">
                      {((getCategoryBytes(cat) / topByUsage.reduce((sum: number, c: CategoryData) => sum + getCategoryBytes(c), 0)) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Data Message */}
        {topByUsage.length === 0 && topByClients.length === 0 && topByThroughput.length === 0 && (
          <Alert>
            <AlertDescription>
              No application category data available for the selected time period.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
