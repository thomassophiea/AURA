import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Users, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react';
import { apiService } from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBitsPerSecond, formatDataVolume } from '../lib/units';

interface VenueStatsWidgetProps {
  siteId?: string;
  duration?: string;
}

export function VenueStatsWidget({ siteId, duration = '24H' }: VenueStatsWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadVenueStatsData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadVenueStatsData(true);
    }, 300000);

    return () => clearInterval(interval);
  }, [siteId, duration]);

  const loadVenueStatsData = async (isRefresh = false) => {
    if (!siteId) {
      setError('No site selected');
      setLoading(false);
      return;
    }

    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      // Fetch venue stats using the v3 endpoint
      const response = await apiService.makeAuthenticatedRequest(
        `/v3/sites/${encodeURIComponent(siteId)}/report/venue?duration=${duration}&resolution=15&statType=sites&widgetList=${encodeURIComponent(
          'ulDlUsageTimeseries,ulDlThroughputTimeseries,uniqueClientsTotalScorecard,uniqueClientsPeakScorecard,ulThroughputPeakScorecard,dlThroughputPeakScorecard'
        )}`,
        { method: 'GET' },
        15000
      );

      const venueData = await response.json();
      console.log('[VenueStatsWidget] Loaded data:', venueData);
      setData(venueData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[VenueStatsWidget] Error loading data:', error);
      setError('Failed to load Venue Stats data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 animate-pulse" />
            <CardTitle>Venue Statistics</CardTitle>
          </div>
          <CardDescription>User group analytics and usage trends</CardDescription>
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

  if (error) {
    return (
      <Card className="w-full border-red-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle>Venue Statistics</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Extract metrics
  const totalClients = data?.uniqueClientsTotalScorecard?.value || 0;
  const peakClients = data?.uniqueClientsPeakScorecard?.value || 0;
  const peakUpload = data?.ulThroughputPeakScorecard?.value || 0;
  const peakDownload = data?.dlThroughputPeakScorecard?.value || 0;

  // Format throughput timeseries data for chart
  const throughputTimeseries = data?.ulDlThroughputTimeseries?.[0]?.statistics || [];
  const chartData = throughputTimeseries.slice(-20).map((stat: any) => {
    const timestamp = new Date(stat.timestamp);
    const timeStr = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return {
      time: timeStr,
      upload: stat.transmittedRate || 0,
      download: stat.receivedRate || 0
    };
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Venue Statistics</CardTitle>
              <CardDescription>
                User group analytics and usage trends
                {lastUpdate && (
                  <span className="ml-2">• Updated {lastUpdate.toLocaleTimeString()}</span>
                )}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Unique Clients */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Total Clients</span>
            </div>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique users</p>
          </div>

          {/* Peak Concurrent Clients */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Peak Concurrent</span>
            </div>
            <div className="text-2xl font-bold">{peakClients}</div>
            <p className="text-xs text-muted-foreground mt-1">Max at once</p>
          </div>

          {/* Peak Upload */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Peak Upload</span>
            </div>
            <div className="text-lg font-bold">{formatBitsPerSecond(peakUpload)}</div>
            <p className="text-xs text-muted-foreground mt-1">Maximum UL</p>
          </div>

          {/* Peak Download */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-cyan-600" />
              <span className="text-sm text-muted-foreground">Peak Download</span>
            </div>
            <div className="text-lg font-bold">{formatBitsPerSecond(peakDownload)}</div>
            <p className="text-xs text-muted-foreground mt-1">Maximum DL</p>
          </div>
        </div>

        {/* Throughput Trend Chart */}
        {chartData.length > 0 && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-semibold mb-3">Throughput Trend (Last {chartData.length} samples)</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => formatBitsPerSecond(value)}
                    labelStyle={{ color: '#000' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="upload"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    name="Upload"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="download"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    name="Download"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Insights */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold mb-3">Venue Insights</h4>
          <div className="space-y-2">
            {totalClients > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <Users className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  <strong>{totalClients}</strong> unique clients served with peak concurrency of <strong>{peakClients}</strong> users.
                </p>
              </div>
            )}
            {peakUpload > 0 || peakDownload > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  Peak throughput: {formatBitsPerSecond(peakUpload * 1000000)} upload, {formatBitsPerSecond(peakDownload * 1000000)} download.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
