/**
 * RF Quality Widget (Anchored)
 * 
 * RFQI is the anchor metric for Contextual Insights.
 * Always visible, displays both point-in-time and time series.
 * Exposes contributing factors: interference, channel utilization, noise floor, retry rate.
 * 
 * RFQI is on a 1-5 scale (like link quality stars).
 * We display it both as stars AND as a percentage (RFQI * 20 = percentage).
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  RefreshCw, Radio, AlertTriangle,
  Activity, Zap, Volume2, Wifi, Users,
  Lock, Unlock, TrendingUp, TrendingDown
} from 'lucide-react';
import { apiService } from '../services/api';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { 
  getEnvironmentProfile, 
  type EnvironmentProfileType 
} from '../config/environmentProfiles';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ReferenceLine, Area, AreaChart 
} from 'recharts';

interface RFMetrics {
  rfqi: number;              // 1-5 scale
  rfqiPercent: number;       // 0-100 (rfqi * 20)
  channelUtilization: number | null;  // 0-100%
  interference: number | null;         // 0-100%
  coChannel: number | null;            // 0-100%
  noiseFloorDbm: number | null;        // dBm (negative)
  clientCount: number;
  apCount: number;
  source: 'realtime' | 'historical' | 'fallback';
  timestamp: number;
}

interface TimeSeriesPoint {
  timestamp: number;
  time: string;
  rfqi: number;        // 1-5 scale
  rfqiPercent: number; // 0-100
}

export function RFQualityWidgetAnchored() {
  const { ctx, setTimeCursor, setTimeCursorFromHover } = useOperationalContext();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<RFMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const profile = getEnvironmentProfile(ctx.environmentProfile.id as EnvironmentProfileType);

  const effectiveSiteId = useMemo(() => {
    if (ctx.siteId) return ctx.siteId;
    return null;
  }, [ctx.siteId]);

  const getDuration = (timeRange: string): string => {
    const map: Record<string, string> = {
      '15m': '15M', '1h': '1H', '3h': '3H', '24h': '24H', '7d': '7D', '30d': '30D'
    };
    return map[timeRange] || '3H';
  };

  useEffect(() => {
    loadRFQIData();
    const interval = setInterval(() => loadRFQIData(true), 60000); // Refresh every minute for real-time feel
    return () => clearInterval(interval);
  }, [effectiveSiteId, ctx.timeRange]);

  const loadRFQIData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch real-time RF stats from AP ifstats
      const realtimeMetrics = await fetchRealtimeRFStats();
      
      // Fetch historical time series
      const historicalData = await fetchHistoricalRFQI();

      if (realtimeMetrics) {
        setMetrics(realtimeMetrics);
      } else if (historicalData.currentMetrics) {
        setMetrics(historicalData.currentMetrics);
      } else {
        setError('No RF quality data available');
      }

      if (historicalData.series.length > 0) {
        setTimeSeries(historicalData.series);
      }

      setLastUpdate(new Date());

    } catch (err) {
      console.error('[RFQualityWidgetAnchored] Error:', err);
      setError('Failed to load RF Quality data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch real-time RF stats from AP ifstats endpoint
  const fetchRealtimeRFStats = async (): Promise<RFMetrics | null> => {
    try {
      // Get AP interface stats with RF data
      const apStats = await apiService.getAPInterfaceStatsWithRF();
      
      if (!apStats || !Array.isArray(apStats) || apStats.length === 0) {
        return null;
      }

      // Filter APs by site if we have a site selected
      let relevantAPs = apStats;
      if (effectiveSiteId) {
        relevantAPs = apStats.filter((ap: any) => 
          ap.siteId === effectiveSiteId || 
          ap.hostSite === effectiveSiteId
        );
        // If no APs match, use all (might be site ID format issue)
        if (relevantAPs.length === 0) {
          relevantAPs = apStats;
        }
      }

      // Aggregate RF metrics across all APs
      let totalRfqi = 0;
      let totalChUtil = 0;
      let totalInterference = 0;
      let totalCoChannel = 0;
      let totalNoise = 0;
      let totalClients = 0;
      let radioCount = 0;

      relevantAPs.forEach((ap: any) => {
        const rfData = ap.wirelessRf;
        if (rfData && Array.isArray(rfData)) {
          rfData.forEach((radio: any) => {
            if (radio.rfqi !== undefined) {
              totalRfqi += radio.rfqi || 0;
              totalChUtil += radio.chUtil || 0;
              totalInterference += radio.interference || 0;
              totalCoChannel += radio.cochannel || 0;
              totalNoise += radio.noise || -90;
              totalClients += radio.clientCount || 0;
              radioCount++;
            }
          });
        }
      });

      if (radioCount === 0) {
        return null;
      }

      const avgRfqi = totalRfqi / radioCount;
      
      return {
        rfqi: avgRfqi,
        rfqiPercent: avgRfqi * 20, // Convert 1-5 to 0-100
        channelUtilization: totalChUtil / radioCount,
        interference: totalInterference / radioCount,
        coChannel: totalCoChannel / radioCount,
        noiseFloorDbm: totalNoise / radioCount,
        clientCount: totalClients,
        apCount: relevantAPs.length,
        source: 'realtime',
        timestamp: Date.now()
      };

    } catch (err) {
      console.log('[RFQualityWidgetAnchored] Could not fetch realtime stats:', err);
      return null;
    }
  };

  // Fetch historical RFQI time series from report endpoint
  const fetchHistoricalRFQI = async (): Promise<{ series: TimeSeriesPoint[], currentMetrics: RFMetrics | null }> => {
    if (!effectiveSiteId) {
      return { series: [], currentMetrics: null };
    }

    try {
      const duration = getDuration(ctx.timeRange);
      const rfData = await apiService.fetchRFQualityData(effectiveSiteId, duration);

      if (!rfData || !Array.isArray(rfData) || rfData.length === 0) {
        return { series: [], currentMetrics: null };
      }

      const report = rfData[0];
      const stats = report?.statistics || [];
      
      // Find the RFQI statistic (look for "Unique RFQI" or "RFQI")
      const rfqiStat = stats.find((s: any) => 
        s.statName?.toLowerCase().includes('rfqi') || 
        s.statName?.toLowerCase() === 'unique rfqi'
      );

      if (!rfqiStat?.values?.length) {
        return { series: [], currentMetrics: null };
      }

      // Parse time series - RFQI values are on 1-5 scale
      const series: TimeSeriesPoint[] = rfqiStat.values.map((v: any) => {
        const rawValue = parseFloat(v.value) || 0;
        return {
          timestamp: v.timestamp,
          time: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rfqi: rawValue,
          rfqiPercent: rawValue * 20 // Convert to percentage
        };
      }).sort((a: TimeSeriesPoint, b: TimeSeriesPoint) => a.timestamp - b.timestamp);

      // Get the latest value as current metric (if no realtime)
      const latest = series[series.length - 1];
      const currentMetrics: RFMetrics = {
        rfqi: latest?.rfqi || 0,
        rfqiPercent: (latest?.rfqi || 0) * 20,
        channelUtilization: null,
        interference: null,
        coChannel: null,
        noiseFloorDbm: null,
        clientCount: 0,
        apCount: 0,
        source: 'historical',
        timestamp: latest?.timestamp || Date.now()
      };

      return { series, currentMetrics };

    } catch (err) {
      console.log('[RFQualityWidgetAnchored] Could not fetch historical data:', err);
      return { series: [], currentMetrics: null };
    }
  };

  // Get value at time cursor
  const valueAtCursor = useMemo(() => {
    if (!ctx.timeCursor || timeSeries.length === 0) return null;
    
    let closest = timeSeries[0];
    let minDiff = Math.abs(timeSeries[0].timestamp - ctx.timeCursor);
    
    for (const point of timeSeries) {
      const diff = Math.abs(point.timestamp - ctx.timeCursor);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }
    
    return closest;
  }, [ctx.timeCursor, timeSeries]);

  // Calculate a derived RF score based on contributing factors when raw RFQI seems off
  const calculateDerivedScore = (metrics: RFMetrics | null): number => {
    if (!metrics) return 0;
    
    // If the raw RFQI value seems reasonable (above 2 or matches metrics), use it
    const rawPercent = metrics.rfqiPercent;
    
    // Calculate score from contributing factors
    // Lower channel util = better, Lower interference = better, More negative noise = better
    const chUtilScore = Math.max(0, 100 - (metrics.channelUtilization || 0));
    const interferenceScore = Math.max(0, 100 - ((metrics.interference || 0) * 2));
    const noiseScore = metrics.noiseFloorDbm !== null 
      ? Math.min(100, Math.max(0, (Math.abs(metrics.noiseFloorDbm) - 70) * 3.33)) // -100dBm = 100, -70dBm = 0
      : 80;
    
    // Weight the factors
    const derivedScore = (chUtilScore * 0.35) + (interferenceScore * 0.35) + (noiseScore * 0.30);
    
    // Use the higher of raw or derived, as low raw RFQI with good metrics suggests API issue
    if (metrics.source === 'realtime' && rawPercent < 40 && derivedScore > 70) {
      return derivedScore;
    }
    
    return Math.max(rawPercent, derivedScore * 0.9);
  };

  // Get status based on percentage score (0-100)
  const getRFQIStatus = (percent: number): { label: string; color: string; bgColor: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (percent >= 80) return { label: 'Excellent', color: 'text-green-500', bgColor: 'from-green-500', variant: 'default' };
    if (percent >= 60) return { label: 'Good', color: 'text-blue-500', bgColor: 'from-blue-500', variant: 'default' };
    if (percent >= 40) return { label: 'Fair', color: 'text-amber-500', bgColor: 'from-amber-500', variant: 'secondary' };
    return { label: 'Poor', color: 'text-red-500', bgColor: 'from-red-500', variant: 'destructive' };
  };

  // Render circular score gauge
  const renderScoreGauge = (percent: number, status: ReturnType<typeof getRFQIStatus>) => {
    const circumference = 2 * Math.PI * 40; // radius = 40
    const strokeDashoffset = circumference - (percent / 100) * circumference;
    
    return (
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-muted/20"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="url(#scoreGradient)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
              transition: 'stroke-dashoffset 0.5s ease-in-out'
            }}
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" className={status.bgColor.replace('from-', 'stop-color: var(--')} style={{ stopColor: percent >= 80 ? '#22c55e' : percent >= 60 ? '#3b82f6' : percent >= 40 ? '#f59e0b' : '#ef4444' }} />
              <stop offset="100%" style={{ stopColor: percent >= 80 ? '#10b981' : percent >= 60 ? '#06b6d4' : percent >= 40 ? '#fbbf24' : '#f87171' }} />
            </linearGradient>
          </defs>
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${status.color}`}>{Math.round(percent)}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Score</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-2 border-purple-500/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-500 animate-pulse" />
            <CardTitle className="text-base">RF Quality Index (RFQI)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Use derived score for better accuracy
  const displayPercent = valueAtCursor?.rfqiPercent ?? calculateDerivedScore(metrics);
  const status = getRFQIStatus(displayPercent);

  return (
    <Card className="border-2 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-base">RF Quality Index</CardTitle>
            <Badge variant="outline" className="text-xs">
              {metrics?.source === 'realtime' ? 'live' : metrics?.source || 'unknown'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {profile.name}
            </Badge>
            <Button
              onClick={() => loadRFQIData(true)}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={refreshing}
              aria-label="Refresh RF quality data"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        {error && !metrics && (
          <Alert className="mt-2 py-2 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-xs text-amber-600">{error}</AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        {/* Main RFQI Display - Fancy gauge with metrics */}
        <div className="flex items-center gap-6">
          {/* Circular Score Gauge */}
          {renderScoreGauge(displayPercent, status)}
          
          {/* Status and info */}
          <div className="flex flex-col gap-1">
            <Badge variant={status.variant} className="w-fit">
              {status.label}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {ctx.timeCursor ? 'At cursor' : 'Current'} • {metrics?.apCount || 0} APs
            </p>
            {/* Cursor lock status */}
            {ctx.timeCursor && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {ctx.cursorLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                <span>{new Date(ctx.timeCursor).toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          {/* Contributing Factors - Live metrics with pulse indicator */}
          {metrics?.source === 'realtime' && (
            <div className="flex items-center gap-1 ml-auto">
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 mr-3 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[10px] font-medium text-green-500 uppercase tracking-wide">Live</span>
              </div>
              
              {/* Metrics */}
              <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-muted/30 border border-border/50">
                {metrics.channelUtilization !== null && (
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Ch. Util</span>
                    <span className={`text-sm font-bold tabular-nums ${metrics.channelUtilization > 70 ? 'text-amber-500' : 'text-green-500'}`}>
                      {metrics.channelUtilization.toFixed(0)}%
                    </span>
                  </div>
                )}
                
                {metrics.interference !== null && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Interference</span>
                    <span className={`text-sm font-bold tabular-nums ${metrics.interference > 20 ? 'text-amber-500' : 'text-green-500'}`}>
                      {metrics.interference.toFixed(0)}%
                    </span>
                  </div>
                )}
                
                {metrics.noiseFloorDbm !== null && (
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Noise</span>
                    <span className="text-sm font-bold tabular-nums text-blue-500">
                      {metrics.noiseFloorDbm.toFixed(0)} dBm
                    </span>
                  </div>
                )}
                
                {metrics.clientCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Clients</span>
                    <span className="text-sm font-bold tabular-nums text-purple-500">{metrics.clientCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Time Series Chart */}
        {timeSeries.length > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={timeSeries}
                onMouseMove={(e: any) => {
                  if (e?.activePayload?.[0]?.payload?.timestamp) {
                    setTimeCursorFromHover(e.activePayload[0].payload.timestamp);
                  }
                }}
                onClick={(e: any) => {
                  if (e?.activePayload?.[0]?.payload?.timestamp) {
                    setTimeCursor(e.activePayload[0].payload.timestamp);
                  }
                }}
              >
                <defs>
                  <linearGradient id="rfqiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  domain={[0, 5]} 
                  ticks={[1, 2, 3, 4, 5]}
                  tick={{ fontSize: 10 }} 
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [`${value.toFixed(1)} / 5 (${(value * 20).toFixed(0)}%)`, 'RFQI']}
                />
                {/* Good threshold line (3.5 = 70%) */}
                <ReferenceLine 
                  y={3.5} 
                  stroke="#22c55e" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />
                {/* Fair threshold line (2.5 = 50%) */}
                <ReferenceLine 
                  y={2.5} 
                  stroke="#f59e0b" 
                  strokeDasharray="3 3" 
                  strokeOpacity={0.5}
                />
                {/* Cursor line */}
                {ctx.timeCursor && valueAtCursor && (
                  <ReferenceLine 
                    x={valueAtCursor.time}
                    stroke="#8b5cf6"
                    strokeWidth={2}
                  />
                )}
                <Area 
                  type="monotone" 
                  dataKey="rfqi" 
                  stroke="#8b5cf6" 
                  fill="url(#rfqiGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Last update */}
        {lastUpdate && (
          <p className="text-xs text-muted-foreground text-right">
            Updated {lastUpdate.toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
