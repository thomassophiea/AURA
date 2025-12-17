import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { RefreshCw, BarChart3, TrendingUp, Network, Zap, Database, Activity } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface Application {
  name: string;
  bytes: number;
  flows: number;
  packets?: number;
  site?: string;
  category?: string;
  protocol?: string;
}

interface ApplicationWidgetsProps {
  selectedService?: string;
  timeRange?: string;
}

export function ApplicationWidgets({ selectedService, timeRange = '24h' }: ApplicationWidgetsProps) {
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalTraffic, setTotalTraffic] = useState(0);

  useEffect(() => {
    loadApplications();

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      loadApplications(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedService, timeRange]);

  const loadApplications = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      console.log('[ApplicationWidgets] Fetching applications from /v1/applications...');

      const response = await apiService.makeAuthenticatedRequest(
        '/v1/applications',
        { method: 'GET' },
        15000
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      console.log('[ApplicationWidgets] Raw API response:', data);

      // Parse application data with flexible schema detection
      const parsedApps = parseApplicationData(data);

      // Filter by selected service if provided
      let filteredApps = parsedApps;
      if (selectedService) {
        filteredApps = parsedApps.filter(app =>
          app.site === selectedService || !app.site
        );
      }

      // Sort by bytes (traffic) and take top 10
      const topApps = filteredApps
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 10);

      setApplications(topApps);

      // Calculate total traffic
      const total = topApps.reduce((sum, app) => sum + app.bytes, 0);
      setTotalTraffic(total);

      setLastUpdate(new Date());

      if (isRefresh) {
        toast.success('Applications refreshed');
      }

    } catch (error) {
      console.error('[ApplicationWidgets] Error loading applications:', error);
      // Suppress analytics errors - don't show toast to user
      console.log('SUPPRESSED_ANALYTICS_ERROR: Failed to load application widgets');

      // Set empty data instead of showing error
      setApplications([]);
      setTotalTraffic(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const parseApplicationData = (data: any): Application[] => {
    const apps: Application[] = [];

    // Strategy 1: Direct array
    if (Array.isArray(data)) {
      data.forEach((app: any) => {
        apps.push({
          name: app.name || app.applicationName || app.application || app.app || 'Unknown',
          bytes: app.bytes || app.totalBytes || app.byteCount || 0,
          flows: app.flows || app.sessionCount || app.sessions || app.flowCount || 0,
          packets: app.packets || app.packetCount || undefined,
          site: app.site || app.siteName || app.location || undefined,
          category: app.category || app.type || undefined,
          protocol: app.protocol || undefined
        });
      });
    }
    // Strategy 2: Object with applications array
    else if (data && typeof data === 'object') {
      const possibleKeys = ['applications', 'apps', 'data', 'items', 'results'];

      for (const key of possibleKeys) {
        if (data[key] && Array.isArray(data[key])) {
          data[key].forEach((app: any) => {
            apps.push({
              name: app.name || app.applicationName || app.application || app.app || 'Unknown',
              bytes: app.bytes || app.totalBytes || app.byteCount || 0,
              flows: app.flows || app.sessionCount || app.sessions || app.flowCount || 0,
              packets: app.packets || app.packetCount || undefined,
              site: app.site || app.siteName || app.location || undefined,
              category: app.category || app.type || undefined,
              protocol: app.protocol || undefined
            });
          });
          break;
        }
      }
    }

    return apps;
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

  // If no applications found, don't show anything (fail silently for analytics)
  if (applications.length === 0) {
    return null;
  }

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
            Top applications by network traffic
            {lastUpdate && (
              <span className="ml-2">• Last updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => loadApplications(true)}
          variant="outline"
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Top Applications by Traffic */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Top Applications by Traffic
            </CardTitle>
            <CardDescription>Bandwidth consumption</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {applications.slice(0, 5).map((app, index) => {
                const percentage = totalTraffic > 0 ? (app.bytes / totalTraffic) * 100 : 0;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate flex items-center gap-1">
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          #{index + 1}
                        </Badge>
                        {app.name}
                      </span>
                      <span className="text-muted-foreground">{formatBytes(app.bytes)}</span>
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

        {/* Top Applications by Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4 text-green-500" />
              Top Applications by Sessions
            </CardTitle>
            <CardDescription>Active connections</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {applications
                .sort((a, b) => b.flows - a.flows)
                .slice(0, 5)
                .map((app, index) => {
                  const totalFlows = applications.reduce((sum, a) => sum + a.flows, 0);
                  const percentage = totalFlows > 0 ? (app.flows / totalFlows) * 100 : 0;
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate flex items-center gap-1">
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            #{index + 1}
                          </Badge>
                          {app.name}
                        </span>
                        <span className="text-muted-foreground">{formatNumber(app.flows)} flows</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{percentage.toFixed(1)}% of sessions</span>
                        {app.protocol && <Badge variant="secondary" className="text-xs">{app.protocol}</Badge>}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Application Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Application Summary
            </CardTitle>
            <CardDescription>Overall statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Total Traffic</span>
                </div>
                <span className="text-sm font-bold">{formatBytes(totalTraffic)}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Applications</span>
                </div>
                <span className="text-sm font-bold">{applications.length}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Total Sessions</span>
                </div>
                <span className="text-sm font-bold">
                  {formatNumber(applications.reduce((sum, app) => sum + app.flows, 0))}
                </span>
              </div>

              {applications.length > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Avg per App</span>
                  </div>
                  <span className="text-sm font-bold">
                    {formatBytes(totalTraffic / applications.length)}
                  </span>
                </div>
              )}
            </div>

            {applications.length > 5 && (
              <div className="mt-4 text-center">
                <Badge variant="outline" className="text-xs">
                  Showing top 5 of {applications.length} applications
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
