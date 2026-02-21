/**
 * MobileHome - Wireless Status home screen
 * Instant network status at a glance
 */

import React, { useState, useEffect } from 'react';
import { Users, Wifi, AppWindow, AlertCircle, RefreshCw, Loader2, Trash2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { MobileKPITile } from './MobileKPITile';
import { NetworkHealthScore } from './NetworkHealthScore';
import { MobileBottomSheet } from './MobileBottomSheet';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useRealtimePolling } from '@/hooks/useRealtimePolling';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import { offlineStorage } from '@/services/offlineStorage';
import { formatCacheAge } from '@/hooks/useOfflineCache';
import type { MobileTab } from './MobileBottomNav';

interface MobileHomeProps {
  currentSite: string;
  onSiteChange: (siteId: string) => void;
  onNavigate: (tab: MobileTab) => void;
}

interface NetworkStats {
  clients: { total: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  aps: { total: number; online: number; offline: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  apps: { total: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  issues: number;
  healthScore: number;
}

export function MobileHome({ currentSite, onSiteChange, onNavigate }: MobileHomeProps) {
  const haptic = useHaptic();
  const [sites, setSites] = useState<any[]>([]);
  const [stats, setStats] = useState<NetworkStats>({
    clients: { total: 0 },
    aps: { total: 0, online: 0, offline: 0 },
    apps: { total: 0 },
    issues: 0,
    healthScore: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [offlineAPs, setOfflineAPs] = useState<any[]>([]);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const { isOnline, isSyncing } = useBackgroundSync({
    onOnline: async () => {
      await refresh();
    },
    showToasts: true,
  });

  const isOffline = !isOnline;

  const fetchStats = async () => {
    console.log('[MobileHome] Fetching stats for site:', currentSite);
    const [clientsData, apsData, appsData] = await Promise.all([
      apiService.getStations(),
      apiService.getAccessPoints(),
      apiService.getApplications().catch(() => []),
    ]);

    console.log('[MobileHome] Raw data - clients:', clientsData?.length, 'aps:', apsData?.length, 'apps:', appsData?.length);

    const filteredClients = currentSite === 'all'
      ? clientsData
      : clientsData.filter((c: any) =>
          c.siteId === currentSite ||
          c.site === currentSite ||
          c.siteName === currentSite
        );
    const filteredAPs = currentSite === 'all'
      ? apsData
      : apsData.filter((ap: any) =>
          ap.siteId === currentSite ||
          ap.site === currentSite ||
          ap.hostSite === currentSite
        );

    console.log('[MobileHome] Filtered - clients:', filteredClients?.length, 'aps:', filteredAPs?.length);

    const isAPOnline = (ap: any): boolean => {
      const status = (ap.status || ap.connectionState || ap.operationalState || ap.state || '').toLowerCase();
      return (
        status === 'inservice' ||
        status.includes('up') ||
        status.includes('online') ||
        status.includes('connected') ||
        ap.isUp === true ||
        ap.online === true ||
        (!status && ap.isUp !== false && ap.online !== false)
      );
    };

    const onlineAPsList = filteredAPs.filter(isAPOnline);
    const offlineAPsList = filteredAPs.filter((ap: any) => !isAPOnline(ap));

    const onlineAPs = onlineAPsList.length;
    const offlineAPsCount = offlineAPsList.length;

    const apScore = filteredAPs.length > 0 ? (onlineAPs / filteredAPs.length) * 100 : 100;
    const issueCount = offlineAPsCount;
    const healthScore = Math.round(apScore * 0.7 + (issueCount === 0 ? 30 : Math.max(0, 30 - issueCount * 10)));

    return {
      clients: { total: filteredClients.length },
      aps: { total: filteredAPs.length, online: onlineAPs, offline: offlineAPsCount },
      apps: { total: appsData.length },
      issues: issueCount,
      healthScore,
      offlineAPs: offlineAPsList,
    };
  };

  const { data: cachedStats, loading: statsLoading, error: statsError, lastUpdated, isStale, refresh } = useRealtimePolling(
    fetchStats,
    {
      key: `stats_${currentSite}`,
      activeInterval: 10000,
      idleInterval: 30000,
      hiddenInterval: 120000,
      enabled: !isOffline,
    }
  );

  useEffect(() => {
    if (cachedStats) {
      setStats(cachedStats);
      setOfflineAPs(cachedStats.offlineAPs || []);
    }
  }, [cachedStats]);

  useEffect(() => {
    if (!lastUpdated) return;
    setCacheAge(Date.now() - lastUpdated.getTime());
    const interval = setInterval(() => {
      setCacheAge(Date.now() - lastUpdated.getTime());
    }, 60000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleClearCache = async () => {
    setIsClearingCache(true);
    haptic.medium();
    try {
      await offlineStorage.clear();
      toast.success('Cache cleared');
      await refresh();
    } catch (e) {
      toast.error('Failed to clear cache');
    } finally {
      setIsClearingCache(false);
    }
  };

  // Load sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const sitesData = await apiService.getSites();
        setSites(Array.isArray(sitesData) ? sitesData : []);

        // Restore last selected site
        const lastSite = localStorage.getItem('mobile_last_site');
        if (lastSite && sitesData.some((s: any) => s.siteId === lastSite)) {
          onSiteChange(lastSite);
        }
      } catch (error) {
        console.error('Failed to load sites:', error);
      }
    };
    loadSites();
  }, []);

  const handleSiteChange = (siteId: string) => {
    haptic.light();
    localStorage.setItem('mobile_last_site', siteId);
    onSiteChange(siteId);
  };

  const handleRefresh = async () => {
    haptic.medium();
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => {
      setIsRefreshing(false);
      haptic.success();
    }, 500);
  };

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
    },
    disabled: isRefreshing || statsLoading,
  });

  const handleTileClick = (tab: MobileTab) => {
    haptic.light();
    onNavigate(tab);
  };

  const handleIssuesClick = () => {
    haptic.light();
    setShowIssues(true);
  };

  return (
    <div
      ref={pullToRefresh.containerRef}
      className="p-4 space-y-4 pb-24 relative overflow-y-auto h-full"
      onTouchStart={pullToRefresh.handlers.onTouchStart}
      onTouchMove={pullToRefresh.handlers.onTouchMove}
      onTouchEnd={pullToRefresh.handlers.onTouchEnd}
    >
      <PullToRefreshIndicator state={pullToRefresh.state} />

      {/* Offline Banner */}
      {isOffline && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-500 font-medium">Offline Mode</p>
            {lastUpdated && (
              <p className="text-xs text-amber-500/70">
                Last updated {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cache Status Banner */}
      {cacheAge !== null && cacheAge > 60000 && !isOffline && !isStale && (
        <div className="p-3 bg-muted/50 border border-border rounded-lg flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-xs text-muted-foreground flex-1">
            Using cached data from {formatCacheAge(cacheAge)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCache}
            disabled={isClearingCache}
            className="h-7 px-2 text-xs"
          >
            {isClearingCache ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}

      {/* Syncing indicator */}
      {isSyncing && (
        <div className="p-2 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs text-primary">Syncing pending changes...</p>
        </div>
      )}

      {/* Stale Data Banner */}
      {isStale && !isOffline && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-500 font-medium">Data may be stale</p>
            {lastUpdated && (
              <p className="text-xs text-blue-500/70">
                Last updated {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Site Selector */}
      <div className="flex items-center gap-2">
        <Select value={currentSite} onValueChange={handleSiteChange}>
          <SelectTrigger className="flex-1 h-12 text-base">
            <SelectValue placeholder="Select site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites.map((site) => (
              <SelectItem key={site.siteId} value={site.siteId}>
                {site.displayName || site.name || site.siteName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing || statsLoading}
          className="h-12 w-12 flex-shrink-0"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing || statsLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading State */}
      {statsLoading && !cachedStats && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading stats...</span>
        </div>
      )}

      {/* Error State */}
      {statsError && !cachedStats && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-500">Failed to load stats: {statsError}</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Network Health Score */}
      <NetworkHealthScore score={stats.healthScore} />

      {/* KPI Grid - 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <MobileKPITile
          icon={Users}
          label="Clients"
          value={stats.clients.total}
          trend={stats.clients.trend}
          onClick={() => handleTileClick('clients')}
        />
        <MobileKPITile
          icon={Wifi}
          label="Access Points"
          value={`${stats.aps.online}/${stats.aps.total}`}
          status={stats.aps.offline > 0 ? (stats.aps.offline > 2 ? 'critical' : 'warning') : 'good'}
          badge={stats.aps.offline}
          trend={stats.aps.trend}
          onClick={() => handleTileClick('aps')}
        />
        <MobileKPITile
          icon={AlertCircle}
          label="Issues"
          value={stats.issues}
          status={stats.issues > 0 ? (stats.issues > 2 ? 'critical' : 'warning') : 'good'}
          badge={stats.issues}
          onClick={handleIssuesClick}
        />
        <MobileKPITile
          icon={AppWindow}
          label="Applications"
          value={stats.apps.total}
          trend={stats.apps.trend}
          onClick={() => handleTileClick('apps')}
        />
      </div>

      {/* Issues Bottom Sheet */}
      <MobileBottomSheet
        isOpen={showIssues}
        onClose={() => setShowIssues(false)}
        title="Network Issues"
      >
        <div className="p-4 space-y-3">
          {offlineAPs.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-foreground">No Issues Found</p>
              <p className="text-sm text-muted-foreground mt-1">
                All access points are operating normally
              </p>
            </div>
          ) : (
            <>
              <div className="pb-2">
                <p className="text-sm text-muted-foreground">
                  {offlineAPs.length} offline access point{offlineAPs.length !== 1 ? 's' : ''}
                </p>
              </div>
              {offlineAPs.map((ap: any) => (
                <div
                  key={ap.serialNumber || ap.macAddress}
                  className="p-3 rounded-lg border border-red-500/20 bg-red-500/5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {ap.displayName || ap.name || ap.serialNumber || 'Unknown AP'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {ap.serialNumber || 'No serial number'}
                      </p>
                      {ap.ipAddress && (
                        <p className="text-sm text-muted-foreground">
                          IP: {ap.ipAddress}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 ml-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
                        Offline
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </MobileBottomSheet>
    </div>
  );
}
