import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, Radio, Signal, AlertTriangle, CheckCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface RFQualityWidgetProps {
  siteId?: string;
  duration?: string;
}

interface RFMetrics {
  score?: number;
  status?: 'excellent' | 'good' | 'fair' | 'poor';
  channelUtilization?: number;
  interference?: number;
  retryRate?: number;
  snr?: number;
}

export function RFQualityWidget({ siteId, duration = '24H' }: RFQualityWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rfData, setRFData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRFQualityData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadRFQualityData(true);
    }, 300000);

    return () => clearInterval(interval);
  }, [siteId, duration]);

  const loadRFQualityData = async (isRefresh = false) => {
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
      console.log('[RFQualityWidget] Fetching RF quality data for site:', siteId);

      const data = await apiService.fetchRFQualityData(siteId, duration);

      console.log('[RFQualityWidget] RF quality data received:', data);
      setRFData(data);
      setLastUpdate(new Date());

      if (isRefresh) {
        toast.success('RF quality data refreshed');
      }

    } catch (error) {
      console.error('[RFQualityWidget] Error loading RF quality data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load RF quality data');

      if (!isRefresh) {
        toast.error('Failed to load RF quality data');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getScoreColor = (score?: number): string => {
    if (!score) return 'text-muted-foreground';
    if (score >= 90) return 'text-green-500';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreStatus = (score?: number): { label: string; variant: any; icon: any } => {
    if (!score) return { label: 'Unknown', variant: 'outline', icon: AlertTriangle };
    if (score >= 90) return { label: 'Excellent', variant: 'default', icon: CheckCircle };
    if (score >= 75) return { label: 'Good', variant: 'default', icon: CheckCircle };
    if (score >= 60) return { label: 'Fair', variant: 'secondary', icon: TrendingDown };
    return { label: 'Poor', variant: 'destructive', icon: AlertTriangle };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
          <div className="h-3 w-48 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (error || !rfData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            RF Quality Index (RFQI)
          </CardTitle>
          <CardDescription>
            Wireless signal quality and interference monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              {error || 'RF quality data is not available for this site. This feature may require additional licensing or Extreme Platform ONE configuration.'}
            </AlertDescription>
          </Alert>

          <div className="flex justify-end mt-4">
            <Button
              onClick={() => loadRFQualityData(true)}
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

  // Extract metrics from data - handle multiple API response structures
  // Structure 1: Direct score (rfData.score or rfData.overall.score)
  // Structure 2: Time-series array from /v1/report/sites (rfData is an array with statistics)
  let overallScore = 0;
  let channelUtilization: number | undefined;
  let interference: number | undefined;

  if (rfData.score !== undefined) {
    // Direct score format
    overallScore = rfData.score;
    channelUtilization = rfData.channelUtilization;
    interference = rfData.interference;
  } else if (rfData.overall?.score !== undefined) {
    // Nested overall format
    overallScore = rfData.overall.score;
    channelUtilization = rfData.metrics?.channelUtilization;
    interference = rfData.metrics?.interference;
  } else if (Array.isArray(rfData) && rfData.length > 0) {
    // Time-series array format from /v1/report/sites endpoint
    const report = rfData[0];
    const stats = report?.statistics;
    if (stats && Array.isArray(stats)) {
      // Look for RFQI or rfQuality stat
      const rfqiStat = stats.find((s: any) => 
        s.statName?.toLowerCase().includes('rfqi') || 
        s.statName?.toLowerCase().includes('rfquality') ||
        s.statName?.toLowerCase().includes('rf quality')
      );
      
      if (rfqiStat?.values && rfqiStat.values.length > 0) {
        // Calculate average from recent values
        const values = rfqiStat.values.slice(-10); // Last 10 data points
        const sum = values.reduce((acc: number, v: any) => acc + (parseFloat(v.value) || 0), 0);
        overallScore = sum / values.length;
      }
    }
  } else if (rfData.statistics && Array.isArray(rfData.statistics)) {
    // Single report object with statistics
    const rfqiStat = rfData.statistics.find((s: any) => 
      s.statName?.toLowerCase().includes('rfqi') || 
      s.statName?.toLowerCase().includes('rfquality') ||
      s.statName?.toLowerCase().includes('rf quality')
    );
    
    if (rfqiStat?.values && rfqiStat.values.length > 0) {
      const values = rfqiStat.values.slice(-10);
      const sum = values.reduce((acc: number, v: any) => acc + (parseFloat(v.value) || 0), 0);
      overallScore = sum / values.length;
    }
  }

  const status = getScoreStatus(overallScore);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            RF Quality Index (RFQI)
          </h3>
          <p className="text-sm text-muted-foreground">
            Wireless signal quality and interference metrics
            {lastUpdate && (
              <span className="ml-2">• Last updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => loadRFQualityData(true)}
          variant="outline"
          size="sm"
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Overall RF Quality Score */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Signal className="h-4 w-4 text-blue-500" />
              Overall RF Quality
            </CardTitle>
            <CardDescription>Current network RF health</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-4xl font-bold ${getScoreColor(overallScore)}`}>
                  {overallScore.toFixed(0)}
                </span>
                <Badge variant={status.variant} className="flex items-center gap-1">
                  <status.icon className="h-3 w-3" />
                  {status.label}
                </Badge>
              </div>
              <Progress value={overallScore} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Score out of 100 - Higher is better
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Channel Utilization */}
        {channelUtilization !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Channel Utilization
              </CardTitle>
              <CardDescription>Airtime usage percentage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-3xl font-bold">
                  {(channelUtilization * 100).toFixed(1)}%
                </div>
                <Progress
                  value={channelUtilization * 100}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {channelUtilization > 0.8 ? 'High utilization detected' : 'Normal range'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interference Level */}
        {interference !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Interference Level
              </CardTitle>
              <CardDescription>RF interference detected</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-3xl font-bold">
                  {(interference * 100).toFixed(1)}%
                </div>
                <Progress
                  value={interference * 100}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {interference > 0.3 ? 'Interference detected' : 'Low interference'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug info when no structured data */}
      {overallScore === 0 && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="text-sm">Raw RF Data (Debug)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">
              {JSON.stringify(rfData, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
