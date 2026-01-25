/**
 * MobileHome - Wireless Status home screen
 * Instant network status at a glance
 */

import React, { useState, useEffect } from 'react';
import { Users, Wifi, AppWindow, AlertCircle, RefreshCw } from 'lucide-react';
import { MobileKPITile } from './MobileKPITile';
import { NetworkHealthScore } from './NetworkHealthScore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';
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

  // Use offline cache for stats
  const { data: cachedStats, isOffline, lastUpdated, refresh } = useOfflineCache(
    `stats_${currentSite}`,
    async () => {
      const [clientsData, apsData, appsData] = await Promise.all([
        apiService.getStations(),
        apiService.getAccessPoints(),
        apiService.getApplications().catch(() => []),
      ]);

      const filteredClients = currentSite === 'all' ? clientsData : clientsData.filter((c: any) => c.siteId === currentSite);
      const filteredAPs = currentSite === 'all' ? apsData : apsData.filter((ap: any) => ap.siteId === currentSite);

      const onlineAPs = filteredAPs.filter((ap: any) => {
        const status = (ap.status || ap.connectionState || ap.operationalState || ap.state || '').toLowerCase();
        return status === 'inservice' || status.includes('up') || status.includes('online') || ap.isUp === true || ap.online === true;
      }).length;

      const offlineAPs = filteredAPs.length - onlineAPs;

      // Calculate health score
      const apScore = filteredAPs.length > 0 ? (onlineAPs / filteredAPs.length) * 100 : 100;
      const issueCount = offlineAPs;
      const healthScore = Math.round(apScore * 0.7 + (issueCount === 0 ? 30 : Math.max(0, 30 - issueCount * 10)));

      return {
        clients: { total: filteredClients.length },
        aps: { total: filteredAPs.length, online: onlineAPs, offline: offlineAPs },
        apps: { total: appsData.length },
        issues: issueCount,
        healthScore,
      };
    },
    30000
  );

  useEffect(() => {
    if (cachedStats) {
      setStats(cachedStats);
    }
  }, [cachedStats]);

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

  const handleTileClick = (tab: MobileTab) => {
    haptic.light();
    onNavigate(tab);
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Offline Banner */}
      {isOffline && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-yellow-500 font-medium">Offline Mode</p>
            {lastUpdated && (
              <p className="text-xs text-yellow-500/70">
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
          disabled={isRefreshing}
          className="h-12 w-12 flex-shrink-0"
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

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
        />
        <MobileKPITile
          icon={AppWindow}
          label="Applications"
          value={stats.apps.total}
          trend={stats.apps.trend}
          onClick={() => handleTileClick('apps')}
        />
      </div>
    </div>
  );
}
