import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Radio, TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { apiService } from '../services/api';

interface SmartRFWidgetProps {
  siteId?: string;
  duration?: string;
}

interface RFOptimization {
  siteName?: string;
  channelChanges?: number;
  powerChanges?: number;
  channelUtilization?: number;
  snr?: number;
}

export function SmartRFWidget({ siteId, duration = '24H' }: SmartRFWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSmartRFData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadSmartRFData(true);
    }, 300000);

    return () => clearInterval(interval);
  }, [siteId, duration]);

  const loadSmartRFData = async (isRefresh = false) => {
    if (!siteId) {
      setError('No site selected');
      setLoading(false);
      return;
    }

    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      // Fetch Smart RF optimization data
      const widgetList = [
        'topSitesByChannelChanges',
        'topSitesByPowerChanges',
        'topSitesByChannelUtil|2_4',
        'topSitesBySnr|all'
      ];

      const response = await apiService.fetchWidgetData(siteId, widgetList, duration);

      console.log('[SmartRFWidget] Loaded data:', response);
      setData(response);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[SmartRFWidget] Error loading data:', error);
      setError('Failed to load Smart RF data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 animate-pulse" />
            <CardTitle>Site RRM</CardTitle>
          </div>
          <CardDescription>Radio Resource Management optimization insights</CardDescription>
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
            <CardTitle>Site RRM</CardTitle>
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

  // Extract optimization metrics
  const channelChanges = data?.topSitesByChannelChanges?.statistics?.reduce((sum: number, stat: any) => sum + (stat.value || 0), 0) || 0;
  const powerChanges = data?.topSitesByPowerChanges?.statistics?.reduce((sum: number, stat: any) => sum + (stat.value || 0), 0) || 0;
  const avgChannelUtil = data?.topSitesByChannelUtil?.statistics?.[0]?.value || 0;
  const avgSnr = data?.topSitesBySnr?.statistics?.[0]?.value || 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Site RRM</CardTitle>
              <CardDescription>
                Radio Resource Management optimization insights
                {lastUpdate && (
                  <span className="ml-2">• Updated {lastUpdate.toLocaleTimeString()}</span>
                )}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* RF Optimization Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Channel Changes */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Channel Changes</span>
            </div>
            <div className="text-2xl font-bold">{channelChanges}</div>
            <Badge variant={channelChanges > 10 ? "outline" : "default"} className="mt-2 text-xs">
              {channelChanges > 10 ? 'High Activity' : 'Optimized'}
            </Badge>
          </div>

          {/* Power Changes */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Power Changes</span>
            </div>
            <div className="text-2xl font-bold">{powerChanges}</div>
            <Badge variant={powerChanges > 10 ? "outline" : "default"} className="mt-2 text-xs">
              {powerChanges > 10 ? 'Active Tuning' : 'Stable'}
            </Badge>
          </div>

          {/* Channel Utilization */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Channel Util</span>
            </div>
            <div className="text-2xl font-bold">{Math.round(avgChannelUtil)}%</div>
            <Badge
              variant={avgChannelUtil > 70 ? "destructive" : avgChannelUtil > 50 ? "outline" : "default"}
              className="mt-2 text-xs"
            >
              {avgChannelUtil > 70 ? 'High' : avgChannelUtil > 50 ? 'Moderate' : 'Low'}
            </Badge>
          </div>

          {/* Signal-to-Noise Ratio */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="h-4 w-4 text-cyan-600" />
              <span className="text-sm text-muted-foreground">Avg SNR</span>
            </div>
            <div className="text-2xl font-bold">{Math.round(avgSnr)} dB</div>
            <Badge
              variant={avgSnr > 30 ? "default" : avgSnr > 20 ? "secondary" : "destructive"}
              className="mt-2 text-xs"
            >
              {avgSnr > 30 ? 'Excellent' : avgSnr > 20 ? 'Good' : 'Poor'}
            </Badge>
          </div>
        </div>

        {/* Insights */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold mb-3">Optimization Insights</h4>
          <div className="space-y-2">
            {channelChanges > 10 && (
              <div className="flex items-start gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  High channel change activity detected. Site RRM is actively optimizing for interference.
                </p>
              </div>
            )}
            {avgChannelUtil > 70 && (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  Channel utilization is high. Consider adding more APs or optimizing channel assignments.
                </p>
              </div>
            )}
            {avgSnr < 20 && (
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  Low SNR detected. Check for interference sources or adjust AP placement.
                </p>
              </div>
            )}
            {channelChanges <= 5 && powerChanges <= 5 && avgSnr > 30 && (
              <div className="flex items-start gap-2 text-sm">
                <Radio className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">
                  RF environment is stable with excellent signal quality. Site RRM optimizations are minimal.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
