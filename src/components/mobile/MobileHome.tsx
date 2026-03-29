/**
 * MobileHome - Wireless Status home screen
 * Instant network status at a glance
 */

import React, { useState, useEffect } from 'react';
import { Users, Wifi, Network, AlertCircle, RefreshCw, Loader2, Trash2, Clock } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { toast } from 'sonner';
import { MobileKPITile } from './MobileKPITile';
import { NetworkHealthScore } from './NetworkHealthScore';
import { MobileBottomSheet } from './MobileBottomSheet';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
// Native <select> used instead of Radix Select to avoid composedRefs infinite loop
// bug in @radix-ui/react-select@2.1.6 (setRef recursion on mobile viewports)
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
  onStatsUpdate?: (offlineAPs: number, totalClients: number) => void;
}

interface NetworkStats {
  clients: { total: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  aps: { total: number; online: number; offline: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  networks: { total: number; trend?: { direction: 'up' | 'down' | 'neutral'; value: string } };
  issues: number;
  healthScore: number;
  disabledNetworks?: any[];
}

export function MobileHome({ currentSite, onSiteChange, onNavigate, onStatsUpdate }: MobileHomeProps) {
  const haptic = useHaptic();
  const [sites, setSites] = useState<any[]>([]);
  const [stats, setStats] = useState<NetworkStats>({
    clients: { total: 0 },
    aps: { total: 0, online: 0, offline: 0 },
    networks: { total: 0 },
    issues: 0,
    healthScore: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [offlineAPs, setOfflineAPs] = useState<any[]>([]);
  const [disabledNetworks, setDisabledNetworks] = useState<any[]>([]);
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
    const [clientsData, apsData, networksData] = await Promise.all([
      apiService.getStations(),
      apiService.getAccessPoints(),
      apiService.getServices().catch(() => []),
    ]);

    console.log('[MobileHome] Raw data - clients:', clientsData?.length, 'aps:', apsData?.length, 'networks:', networksData?.length);

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

    // Count enabled/disabled networks
    const enabledNetworks = networksData.filter((n: any) => n.status === 'enabled').length;
    const disabledNetworksList = networksData.filter((n: any) => n.status && n.status !== 'enabled');

    const totalIssues = offlineAPsCount + disabledNetworksList.length;

    // Health score: AP availability (60%) + issue severity (20%) + network health (20%)
    const issueScore = totalIssues === 0 ? 100 : Math.max(0, 100 - (totalIssues / Math.max(filteredAPs.length, 1)) * 200);
    const networkScore = networksData.length > 0 ? (enabledNetworks / networksData.length) * 100 : 100;
    const healthScore = Math.round(apScore * 0.6 + issueScore * 0.2 + networkScore * 0.2);

    return {
      clients: { total: filteredClients.length },
      aps: { total: filteredAPs.length, online: onlineAPs, offline: offlineAPsCount },
      networks: { total: enabledNetworks || networksData.length },
      issues: totalIssues,
      healthScore,
      offlineAPs: offlineAPsList,
      disabledNetworks: disabledNetworksList,
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
      setDisabledNetworks(cachedStats.disabledNetworks || []);
      onStatsUpdate?.(cachedStats.aps?.offline ?? 0, cachedStats.clients?.total ?? 0);
    }
  }, [cachedStats, onStatsUpdate]);

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
        <div className="p-3 bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-[color:var(--status-warning)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[color:var(--status-warning)] font-medium">Offline Mode</p>
            {lastUpdated && (
              <p className="text-xs text-[color:var(--status-warning)]/70">
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
        <div className="p-3 bg-[color:var(--status-info-bg)] border border-[color:var(--status-info)]/30 rounded-lg flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-[color:var(--status-info)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[color:var(--status-info)] font-medium">Data may be stale</p>
            {lastUpdated && (
              <p className="text-xs text-[color:var(--status-info)]/70">
                Last updated {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Site Selector — native <select> for mobile (avoids Radix composedRefs bug) */}
      <div className="flex items-center gap-2">
        <select
          value={currentSite}
          onChange={(e) => handleSiteChange(e.target.value)}
          className="flex-1 h-12 text-base rounded-md border border-border bg-input-background text-foreground px-3 py-2 outline-none focus:ring-2 focus:ring-ring appearance-none"
        >
          <option value="all">All Sites</option>
          {sites.map((site) => (
            <option key={site.siteId} value={site.siteId}>
              {site.displayName || site.name || site.siteName}
            </option>
          ))}
        </select>
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

      {/* Loading State — skeleton tiles matching the real layout */}
      {statsLoading && !cachedStats && (
        <>
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border-2 border-border p-4 min-h-[120px] flex flex-col gap-2">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-20 mt-auto" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Error State */}
      {statsError && !cachedStats && (
        <div className="p-4 bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30 rounded-lg">
          <p className="text-sm text-[color:var(--status-error)]">Failed to load stats: {statsError}</p>
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
          icon={Network}
          label="Networks"
          value={stats.networks.total}
          trend={stats.networks.trend}
          onClick={() => handleTileClick('networks')}
        />
      </div>

      {/* Issues Bottom Sheet */}
      <MobileBottomSheet
        isOpen={showIssues}
        onClose={() => setShowIssues(false)}
        title="Network Issues"
      >
        <div className="p-4 space-y-3">
          {offlineAPs.length === 0 && disabledNetworks.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-[color:var(--status-success)] mx-auto mb-3" />
              <p className="text-lg font-semibold text-foreground">No Issues Found</p>
              <p className="text-sm text-muted-foreground mt-1">
                All access points and networks are operating normally
              </p>
            </div>
          ) : (
            <>
              {/* Offline APs */}
              {offlineAPs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Offline Access Points ({offlineAPs.length})
                  </p>
                  {offlineAPs.map((ap: any) => (
                    <div
                      key={ap.serialNumber || ap.macAddress}
                      className="p-3 rounded-lg border border-[color:var(--status-error)]/20 bg-[color:var(--status-error-bg)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {ap.displayName || ap.name || ap.serialNumber || 'Unknown AP'}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {ap.serialNumber || 'No serial number'}
                            {ap.ipAddress ? ` · ${ap.ipAddress}` : ''}
                          </p>
                        </div>
                        <span className="flex-shrink-0 ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[color:var(--status-error-bg)] text-[color:var(--status-error)]">
                          Offline
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Disabled Networks */}
              {disabledNetworks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Disabled Networks ({disabledNetworks.length})
                  </p>
                  {disabledNetworks.map((n: any) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-lg border border-[color:var(--status-warning)]/20 bg-[color:var(--status-warning-bg)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {n.ssid || n.serviceName || n.name || 'Unknown Network'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {n.security || 'Unknown security'}
                          </p>
                        </div>
                        <span className="flex-shrink-0 ml-3 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)]">
                          Disabled
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </MobileBottomSheet>
    </div>
  );
}
