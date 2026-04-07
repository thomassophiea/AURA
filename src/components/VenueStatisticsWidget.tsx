import { useState, useEffect ,  memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BarChart3, TrendingUp, Users, Activity, Download, Upload } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { apiService } from '../services/api';
import { formatCompactNumber } from '../lib/units';

interface VenueStatisticsWidgetProps {
  siteId: string;
  duration?: string;
}

interface VenueStats {
  ulDlUsageTimeseries?: Array<{
    timestamp: number;
    upload: number;
    download: number;
  }>;
  ulDlThroughputTimeseries?: Array<{
    timestamp: number;
    uploadThroughput: number;
    downloadThroughput: number;
  }>;
  uniqueClientsTotalScorecard?: number;
  uniqueClientsPeakScorecard?: number;
  totalTrafficScorecard?: number;
  averageThroughputScorecard?: number;
}

/**
 * Venue Statistics Widget
 *
 * Displays comprehensive venue analytics including:
 * - Upload/Download usage timeseries
 * - Upload/Download throughput timeseries
 * - Unique clients (total & peak)
 * - Total traffic volume
 * - Average throughput
 *
 * Uses Extreme Platform ONE API: GET /v3/sites/{siteId}/report/venue
 */
export function VenueStatisticsWidget({ siteId, duration = '24H' }: VenueStatisticsWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<VenueStats | null>(null);

  useEffect(() => {
    loadVenueStatistics();
  }, [siteId, duration]);

  const loadVenueStatistics = async () => {
    if (!siteId) {
      console.warn('[VenueStatisticsWidget] No site ID provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`[VenueStatisticsWidget] Loading venue statistics for site: ${siteId}`);
      const data = await apiService.getVenueStatistics(siteId, duration);

      if (!data) {
        setError('No venue statistics available');
        setStats(null);
      } else {
        setStats(data);
        console.log('[VenueStatisticsWidget] Loaded venue statistics:', Object.keys(data));
      }
    } catch (err) {
      console.error('[VenueStatisticsWidget] Error loading venue statistics:', err);
      setError('Failed to load venue statistics');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatBps = (bps: number): string => {
    if (bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${(bps / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Venue Statistics
          </CardTitle>
          <CardDescription>Comprehensive venue analytics and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading venue statistics...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Venue Statistics
          </CardTitle>
          <CardDescription>Comprehensive venue analytics and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">{error || 'No data available'}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Venue Statistics
        </CardTitle>
        <CardDescription>
          Comprehensive venue analytics for the last {duration}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scorecards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Unique Clients Total */}
          {stats.uniqueClientsTotalScorecard !== undefined && (
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-blue-500" />
                <div className="text-sm font-medium text-muted-foreground">Total Clients</div>
              </div>
              <div className="text-2xl font-bold">{formatCompactNumber(stats.uniqueClientsTotalScorecard)}</div>
            </div>
          )}

          {/* Unique Clients Peak */}
          {stats.uniqueClientsPeakScorecard !== undefined && (
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <div className="text-sm font-medium text-muted-foreground">Peak Clients</div>
              </div>
              <div className="text-2xl font-bold">{formatCompactNumber(stats.uniqueClientsPeakScorecard)}</div>
            </div>
          )}

          {/* Total Traffic */}
          {stats.totalTrafficScorecard !== undefined && (
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-purple-500" />
                <div className="text-sm font-medium text-muted-foreground">Total Traffic</div>
              </div>
              <div className="text-2xl font-bold">{formatBytes(stats.totalTrafficScorecard)}</div>
            </div>
          )}

          {/* Average Throughput */}
          {stats.averageThroughputScorecard !== undefined && (
            <div className="p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                <div className="text-sm font-medium text-muted-foreground">Avg Throughput</div>
              </div>
              <div className="text-2xl font-bold">{formatBps(stats.averageThroughputScorecard)}</div>
            </div>
          )}
        </div>

        {/* Upload/Download Usage Chart */}
        {stats.ulDlUsageTimeseries && stats.ulDlUsageTimeseries.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Upload/Download Usage Over Time
            </h4>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={stats.ulDlUsageTimeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) => formatBytes(value)}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  labelFormatter={(label) => formatTimestamp(Number(label))}
                  formatter={(value: number, name: string) => [
                    formatBytes(value),
                    name === 'upload' ? 'Upload' : 'Download'
                  ]}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.6}
                  name="Upload"
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  name="Download"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Upload/Download Throughput Chart */}
        {stats.ulDlThroughputTimeseries && stats.ulDlThroughputTimeseries.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Upload/Download Throughput Over Time
            </h4>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.ulDlThroughputTimeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) => formatBps(value)}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                  labelFormatter={(label) => formatTimestamp(Number(label))}
                  formatter={(value: number, name: string) => [
                    formatBps(value),
                    name === 'uploadThroughput' ? 'Upload' : 'Download'
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="uploadThroughput"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Upload"
                />
                <Line
                  type="monotone"
                  dataKey="downloadThroughput"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Download"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* No Data Message */}
        {!stats.ulDlUsageTimeseries?.length && !stats.ulDlThroughputTimeseries?.length && (
          <div className="text-center py-8 text-muted-foreground">
            No timeseries data available for this time period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
