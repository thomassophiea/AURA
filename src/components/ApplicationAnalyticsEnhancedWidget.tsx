import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, BarChart3, TrendingUp, TrendingDown, Network, Zap, AlertTriangle } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface ApplicationAnalyticsEnhancedWidgetProps {
  siteId?: string;
  duration?: string;
}

interface AppData {
  name?: string;
  applicationName?: string;
  category?: string;
  throughput?: number;
  bytes?: number;
  clientCount?: number;
  clients?: number;
  usage?: number;
  percentage?: number;
}

export function ApplicationAnalyticsEnhancedWidget({ siteId, duration = '24H' }: ApplicationAnalyticsEnhancedWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appData, setAppData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplicationData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadApplicationData(true);
    }, 300000);

    return () => clearInterval(interval);
  }, [siteId, duration]);

  const loadApplicationData = async (isRefresh = false) => {
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
      console.log('[ApplicationAnalyticsEnhancedWidget] Fetching application data for site:', siteId);

      const data = await apiService.fetchApplicationAnalytics(siteId, duration);

      console.log('[ApplicationAnalyticsEnhancedWidget] Application data received:', data);
      setAppData(data);
      setLastUpdate(new Date());

      if (isRefresh) {
        toast.success('Application analytics refreshed');
      }

    } catch (error) {
      console.error('[ApplicationAnalyticsEnhancedWidget] Error loading application data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load application data');

      if (!isRefresh) {
        toast.error('Failed to load application analytics');
      }
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

  const getAppName = (app: AppData): string => {
    return app.name || app.applicationName || 'Unknown';
  };

  const getAppThroughput = (app: AppData): number => {
    return app.throughput || app.bytes || 0;
  };

  const getAppClients = (app: AppData): number => {
    return app.clientCount || app.clients || 0;
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
              <div className="h-3 w-48 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-32 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !appData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Application Analytics
          </CardTitle>
          <CardDescription>
            Network application usage and performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              {error || 'Application analytics data is not available for this site. This feature may require DPI (Deep Packet Inspection) licensing.'}
            </AlertDescription>
          </Alert>

          <div className="flex justify-end mt-4">
            <Button
              onClick={() => loadApplicationData(true)}
              variant="outline"
              size="sm"
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topByThroughput = appData.topByThroughput || [];
  const topByClients = appData.topByClients || [];
  const topByUsage = appData.topByUsage || [];

  // Calculate totals for percentages
  const totalThroughput = topByThroughput.reduce((sum: number, app: AppData) => sum + getAppThroughput(app), 0);
  const totalClients = topByClients.reduce((sum: number, app: AppData) => sum + getAppClients(app), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Application Analytics
          </h3>
          <p className="text-sm text-muted-foreground">
            Network application usage and performance metrics
            {lastUpdate && (
              <span className="ml-2">• Last updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => loadApplicationData(true)}
          variant="outline"
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Top Applications by Throughput */}
        {topByThroughput.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Top Applications by Throughput
              </CardTitle>
              <CardDescription>Highest bandwidth consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topByThroughput.slice(0, 5).map((app: AppData, index: number) => {
                  const throughput = getAppThroughput(app);
                  const percentage = totalThroughput > 0 ? (throughput / totalThroughput) * 100 : 0;
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate flex items-center gap-1">
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            #{index + 1}
                          </Badge>
                          {getAppName(app)}
                        </span>
                        <span className="text-muted-foreground">{formatBytes(throughput)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{percentage.toFixed(1)}% of total</span>
                        {app.category && <Badge variant="secondary" className="text-xs">{app.category}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Applications by Client Count */}
        {topByClients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-green-500" />
                Top Applications by Users
              </CardTitle>
              <CardDescription>Most popular applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topByClients.slice(0, 5).map((app: AppData, index: number) => {
                  const clients = getAppClients(app);
                  const percentage = totalClients > 0 ? (clients / totalClients) * 100 : 0;
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate flex items-center gap-1">
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            #{index + 1}
                          </Badge>
                          {getAppName(app)}
                        </span>
                        <span className="text-muted-foreground">{formatNumber(clients)} users</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{percentage.toFixed(1)}% of users</span>
                        {app.category && <Badge variant="secondary" className="text-xs">{app.category}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Applications by Usage */}
        {topByUsage.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-500" />
                Top Applications by Usage
              </CardTitle>
              <CardDescription>Total data transferred</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topByUsage.slice(0, 5).map((app: AppData, index: number) => {
                  const usage = app.usage || getAppThroughput(app);
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate flex items-center gap-1">
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            #{index + 1}
                          </Badge>
                          {getAppName(app)}
                        </span>
                        <span className="text-muted-foreground">{formatBytes(usage)}</span>
                      </div>
                      {app.percentage !== undefined && (
                        <>
                          <Progress value={app.percentage} className="h-2" />
                          <div className="text-xs text-muted-foreground">
                            {app.percentage.toFixed(1)}% of total usage
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug info when no structured data */}
      {topByThroughput.length === 0 && topByClients.length === 0 && topByUsage.length === 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="text-sm">Raw Application Data (Debug)</CardTitle>
            <CardDescription>
              The API returned data in an unexpected format. Please review below:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">
              {JSON.stringify(appData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
