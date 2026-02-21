/**
 * MobileSLEView - Mobile-optimized Service Level Experience view
 * Shows SLE metrics in a touch-friendly card format
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Signal, Zap, Clock, Activity, Wifi, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { apiService, Site } from '@/services/api';
import { sleDataCollectionService } from '@/services/sleDataCollection';
import { computeAllWirelessSLEs } from '@/services/sleCalculationEngine';
import { SLE_STATUS_COLORS, getSLEStatus } from '@/types/sle';
import type { SLEMetric } from '@/types/sle';
import { useHaptic } from '@/hooks/useHaptic';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface MobileSLEViewProps {
  currentSite: string;
  onSiteChange?: (siteId: string) => void;
}

const SLE_ICONS: Record<string, React.ElementType> = {
  coverage: Signal,
  throughput: Zap,
  time_to_connect: Clock,
  capacity: Activity,
  roaming: Wifi,
};

function SLECard({ sle }: { sle: SLEMetric }) {
  const status = getSLEStatus(sle.successRate);
  const colors = SLE_STATUS_COLORS[status];
  const Icon = SLE_ICONS[sle.id] || Activity;
  
  // Get trend icon
  const getTrendIcon = () => {
    if (!sle.trend) return null;
    if (sle.trend > 2) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (sle.trend < -2) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div 
      className="rounded-xl p-4 border transition-all active:scale-[0.98]"
      style={{ 
        backgroundColor: `${colors.hex}15`,
        borderColor: `${colors.hex}40`
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${colors.hex}30` }}
          >
            <Icon className="h-5 w-5" style={{ color: colors.hex }} />
          </div>
          <span className="font-medium text-sm">{sle.name}</span>
        </div>
        {getTrendIcon()}
      </div>

      {/* Score */}
      <div className="flex items-end gap-2 mb-3">
        <span 
          className="text-4xl font-bold tabular-nums"
          style={{ color: colors.hex }}
        >
          {Math.round(sle.successRate)}
        </span>
        <span className="text-lg text-muted-foreground mb-1">%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ 
            width: `${sle.successRate}%`,
            backgroundColor: colors.hex 
          }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Affected</span>
          <span className="font-medium">{sle.affectedClients ?? 0} clients</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">{sle.totalClients ?? 0} clients</span>
        </div>
      </div>

      {/* Top classifiers */}
      {sle.classifiers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground mb-2 block">Top Issues</span>
          <div className="flex flex-wrap gap-1">
            {sle.classifiers
              .filter(c => c.impactPercent > 0)
              .slice(0, 3)
              .map((c, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0"
                >
                  {c.name}: {c.impactPercent.toFixed(0)}%
                </Badge>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileSLEView({ currentSite, onSiteChange }: MobileSLEViewProps) {
  const haptic = useHaptic();
  const [sites, setSites] = useState<Site[]>([]);
  const [sles, setSles] = useState<SLEMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState('24h');

  // Load sites
  useEffect(() => {
    apiService.getSites().then(setSites).catch(() => {});
  }, []);

  // Load SLE data
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const siteFilter = currentSite !== 'all' ? currentSite : undefined;

      // Fetch stations and APs
      const [stationsData, apsData] = await Promise.all([
        siteFilter
          ? apiService.getStations().then(all => 
              all.filter((s: any) => s.siteId === siteFilter || s.siteName === siteFilter)
            )
          : apiService.getStations(),
        siteFilter
          ? apiService.getAccessPointsBySite(siteFilter)
          : apiService.getAccessPoints(),
      ]);

      const stationsArr = Array.isArray(stationsData) ? stationsData : [];
      const apsArr = Array.isArray(apsData) ? apsData : [];

      // Get historical data
      const timeRangeMs = timeRange === '1h' ? 3600000 : timeRange === '7d' ? 604800000 : 86400000;
      const historicalData = sleDataCollectionService.getFilteredData({
        siteId: currentSite,
        scope: 'wireless',
        startTimestamp: Date.now() - timeRangeMs,
      });

      // Compute SLEs
      const computedSles = computeAllWirelessSLEs(stationsArr, apsArr, historicalData);
      setSles(computedSles);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[MobileSLE] Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentSite, timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to SLE updates
  useEffect(() => {
    const unsubscribe = sleDataCollectionService.subscribe(() => {
      loadData(true);
    });
    return unsubscribe;
  }, [loadData]);

  const handleRefresh = async () => {
    haptic.medium();
    await loadData(true);
    haptic.success();
  };

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await loadData(true);
    },
    disabled: refreshing || loading,
  });

  const handleSiteChange = (siteId: string) => {
    haptic.light();
    onSiteChange?.(siteId);
  };

  // Calculate overall score
  const overallScore = sles.length > 0
    ? Math.round(sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length)
    : 0;

  const overallStatus = getSLEStatus(overallScore);
  const overallColors = SLE_STATUS_COLORS[overallStatus];

  return (
    <div
      ref={pullToRefresh.containerRef}
      className="p-4 space-y-4 pb-24 relative overflow-y-auto h-full"
      onTouchStart={pullToRefresh.handlers.onTouchStart}
      onTouchMove={pullToRefresh.handlers.onTouchMove}
      onTouchEnd={pullToRefresh.handlers.onTouchEnd}
    >
      <PullToRefreshIndicator state={pullToRefresh.state} />

      {/* Header with site selector */}
      <div className="flex items-center gap-2">
        <Select value={currentSite} onValueChange={handleSiteChange}>
          <SelectTrigger className="flex-1 h-12 text-base">
            <SelectValue placeholder="Select site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name || site.siteName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-20 h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1h</SelectItem>
            <SelectItem value="24h">24h</SelectItem>
            <SelectItem value="7d">7d</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-12 w-12 flex-shrink-0"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading state */}
      {loading && sles.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading SLEs...</span>
        </div>
      )}

      {/* Overall Score Card */}
      {!loading && sles.length > 0 && (
        <div 
          className="rounded-xl p-6 text-center"
          style={{ 
            backgroundColor: `${overallColors.hex}20`,
            border: `2px solid ${overallColors.hex}40`
          }}
        >
          <div className="text-sm text-muted-foreground mb-2">Overall Network Health</div>
          <div 
            className="text-6xl font-bold mb-1"
            style={{ color: overallColors.hex }}
          >
            {overallScore}%
          </div>
          <Badge 
            style={{ 
              backgroundColor: `${overallColors.hex}40`,
              color: overallColors.hex,
              borderColor: overallColors.hex
            }}
          >
            {overallStatus === 'good' ? 'Healthy' : overallStatus === 'warn' ? 'Needs Attention' : 'Critical'}
          </Badge>
          {lastUpdate && (
            <div className="text-xs text-muted-foreground mt-3">
              Updated {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* SLE Cards Grid */}
      {!loading && sles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Service Levels</h2>
            <span className="text-xs text-muted-foreground">{sles.length} metrics</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {sles.map((sle) => (
              <SLECard key={sle.id} sle={sle} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sles.length === 0 && (
        <div className="text-center py-12">
          <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-semibold">No SLE Data</p>
          <p className="text-sm text-muted-foreground mt-1">
            Data will appear once clients connect
          </p>
        </div>
      )}
    </div>
  );
}
