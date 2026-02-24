/**
 * MobileAPsList - Access Points list for mobile
 * Search, status filters, two-line rows
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, X, Anchor } from 'lucide-react';
import { MobileStatusList } from './MobileStatusList';
import { MobileStatusRow } from './MobileStatusRow';
import { MobileBottomSheet } from './MobileBottomSheet';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { apiService, Site } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface MobileAPsListProps {
  currentSite: string;
  onSiteChange?: (siteId: string) => void;
}

export function MobileAPsList({ currentSite, onSiteChange }: MobileAPsListProps) {
  const haptic = useHaptic();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedAP, setSelectedAP] = useState<any | null>(null);
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  const [sites, setSites] = useState<Site[]>([]);

  // Load sites for selector
  useEffect(() => {
    apiService.getSites().then(setSites).catch(() => {});
  }, []);

  const handleSiteChange = (siteId: string) => {
    haptic.light();
    onSiteChange?.(siteId);
  };

  const { data: aps, loading, refresh } = useOfflineCache(
    `aps_${currentSite}`,
    async () => {
      const data = await apiService.getAccessPoints();
      if (currentSite === 'all') return data;
      
      // Get site name for matching against hostSite field (which contains names, not IDs)
      const sitesList = await apiService.getSites();
      const selectedSite = sitesList.find((s: Site) => 
        s.id === currentSite || s.siteId === currentSite
      );
      const siteName = selectedSite?.name || selectedSite?.siteName;
      
      // Filter by site ID or site name (hostSite contains the name, not ID)
      return data.filter((ap: any) =>
        ap.siteId === currentSite ||
        ap.site === currentSite ||
        (siteName && ap.hostSite === siteName) ||
        (siteName && ap.hostSite?.toLowerCase() === siteName.toLowerCase())
      );
    },
    30000
  );

  // Load client counts per AP using the same approach as desktop AccessPoints:
  // call getAccessPointStations(serial) for each AP in parallel.
  useEffect(() => {
    if (!aps || aps.length === 0) return;

    const loadCounts = async () => {
      const results = await Promise.all(
        aps.map(async (ap: any) => {
          if (!ap.serialNumber) return { serial: '', count: 0 };
          try {
            const stations = await apiService.getAccessPointStations(ap.serialNumber);
            return { serial: ap.serialNumber, count: Array.isArray(stations) ? stations.length : 0 };
          } catch {
            return { serial: ap.serialNumber, count: 0 };
          }
        })
      );
      const counts: Record<string, number> = {};
      results.forEach(({ serial, count }) => {
        if (serial) counts[serial] = count;
      });
      setClientCounts(counts);
    };

    loadCounts();
  }, [aps]);

  // Check if AP is online
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

  // Get client count — prefer per-AP loaded count, fall back to fields on the AP object
  const getClientCount = (ap: any): number => {
    return clientCounts[ap.serialNumber] ?? ap.stationCount ?? ap.clientCount ?? ap.numClients ?? ap.clients ?? 0;
  };

  // Check if AP is an AFC anchor (6 GHz Standard Power)
  const isAfcAnchor = (ap: any): boolean => {
    // Check top-level gpsAnchor flag (from AP detail endpoint)
    if (ap.gpsAnchor === true) {
      return true;
    }
    // Check anchorLocSrc field (from AFC query endpoint - "GPS" means it's an anchor)
    if (ap.anchorLocSrc === 'GPS') {
      return true;
    }
    // Check if any radio has AFC enabled (from AP detail radios array)
    if (ap.radios && Array.isArray(ap.radios)) {
      const hasAfcRadio = ap.radios.some((radio: any) => radio.afc === true);
      if (hasAfcRadio) {
        return true;
      }
    }
    // Check pwrMode field (from AFC query - "SP" = Standard Power)
    if (ap.pwrMode === 'SP') {
      return true;
    }
    // Fallback: check for older field names
    if (ap.afcAnchor === true || ap.isAfcAnchor === true) {
      return true;
    }
    return false;
  };

  // Filter and search
  const filteredAPs = useMemo(() => {
    if (!aps) return [];

    return aps.filter((ap: any) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          ap.displayName?.toLowerCase().includes(query) ||
          ap.name?.toLowerCase().includes(query) ||
          ap.serialNumber?.toLowerCase().includes(query) ||
          ap.macAddress?.toLowerCase().includes(query) ||
          ap.ipAddress?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        const online = isAPOnline(ap);
        if (filterStatus === 'online' && !online) return false;
        if (filterStatus === 'offline' && online) return false;
      }

      return true;
    });
  }, [aps, searchQuery, filterStatus]);

  const handleAPClick = (ap: any) => {
    haptic.light();
    setSelectedAP(ap);
  };

  const handleClearFilters = () => {
    haptic.light();
    setSearchQuery('');
    setFilterStatus('all');
  };

  const activeFilterCount = (filterStatus !== 'all' ? 1 : 0) + (searchQuery ? 1 : 0);

  // Calculate stats
  const stats = useMemo(() => {
    if (!aps) return { total: 0, online: 0, offline: 0 };
    const online = aps.filter(isAPOnline).length;
    return {
      total: aps.length,
      online,
      offline: aps.length - online,
    };
  }, [aps]);

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refresh();
    },
    disabled: loading,
  });

  return (
    <div
      ref={pullToRefresh.containerRef}
      className="flex flex-col h-full relative overflow-y-auto"
      onTouchStart={pullToRefresh.handlers.onTouchStart}
      onTouchMove={pullToRefresh.handlers.onTouchMove}
      onTouchEnd={pullToRefresh.handlers.onTouchEnd}
    >
      <PullToRefreshIndicator state={pullToRefresh.state} />
      {/* Site Selector and Search */}
      <div className="px-3 py-2.5 space-y-2 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        {/* Site Selector */}
        {onSiteChange && (
          <Select value={currentSite} onValueChange={handleSiteChange}>
            <SelectTrigger className="w-full h-10 text-sm">
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id || site.siteId} value={site.id || site.siteId}>
                  {site.name || site.siteName || site.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search APs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'ghost'}
            size="icon"
            onClick={() => {
              haptic.light();
              setShowFilters(!showFilters);
            }}
            className="h-10 w-10 relative flex-shrink-0"
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={filterStatus === 'all' ? 'outline' : 'default'}
              className="cursor-pointer text-xs h-6"
              onClick={() => {
                haptic.light();
                setFilterStatus(filterStatus === 'all' ? 'online' : filterStatus === 'online' ? 'offline' : 'all');
              }}
            >
              {filterStatus === 'all' ? 'All' : filterStatus === 'online' ? 'Online' : 'Offline'}
            </Badge>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-6 px-2 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Stats Summary */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted-foreground">{filteredAPs.length} AP{filteredAPs.length !== 1 ? 's' : ''}</span>
          <span className="text-green-500">{stats.online} online</span>
          {stats.offline > 0 && <span className="text-red-500">{stats.offline} offline</span>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <MobileStatusList loading={loading} emptyMessage="No access points found">
          {filteredAPs.map((ap: any) => {
            const online = isAPOnline(ap);
            const clientCount = getClientCount(ap);
            const afcAnchor = isAfcAnchor(ap);

            // Get band information from various sources
            let band = ap.band || ap.radioType;
            if (!band && ap.radios && ap.radios.length > 0) {
              // Get unique bands from radios
              const bands = ap.radios
                .map((r: any) => r.band || r.frequency)
                .filter((b: any) => b)
                .filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);
              band = bands.length > 0 ? bands.join('/') : null;
            }
            const bandText = band || (ap.model || ap.hardwareType ? 'Dual' : 'Unknown');

            // Get the best available name for the AP
            const apName = ap.displayName || ap.name || ap.hostname || ap.apName || ap.serialNumber || 'Unknown AP';
            // Include model info in secondary if available
            const modelInfo = ap.model || ap.hardwareType || ap.platformName || '';

            return (
              <MobileStatusRow
                key={ap.serialNumber || ap.macAddress}
                primaryText={apName}
                secondaryText={`${clientCount} client${clientCount !== 1 ? 's' : ''}${modelInfo ? ` • ${modelInfo}` : ''}${afcAnchor ? ' • AFC' : ''}`}
                status={{
                  label: online ? 'Online' : 'Offline',
                  variant: online ? 'success' : 'destructive',
                }}
                indicator={online ? 'online' : 'offline'}
                rightContent={afcAnchor ? (
                  <div className="flex items-center gap-2">
                    <Anchor className="h-5 w-5 text-blue-500" title="AFC Anchor" />
                  </div>
                ) : undefined}
                onClick={() => handleAPClick(ap)}
              />
            );
          })}
        </MobileStatusList>
      </div>

      {/* Bottom Sheet Detail */}
      <MobileBottomSheet
        isOpen={!!selectedAP}
        onClose={() => setSelectedAP(null)}
        title={selectedAP?.displayName || selectedAP?.name || 'AP Details'}
      >
        {selectedAP && (
          <div className="p-4 space-y-4">
            {/* Identity grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Serial</p>
                <p className="text-sm font-medium font-mono truncate">{selectedAP.serialNumber || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`text-sm font-semibold ${isAPOnline(selectedAP) ? 'text-green-500' : 'text-red-500'}`}>
                  {isAPOnline(selectedAP) ? 'Online' : 'Offline'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IP Address</p>
                <p className="text-sm font-medium font-mono truncate">{selectedAP.ipAddress || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clients</p>
                <p className="text-sm font-medium">{getClientCount(selectedAP)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MAC</p>
                <p className="text-sm font-medium font-mono truncate">{selectedAP.macAddress || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Model</p>
                <p className="text-sm font-medium truncate">{selectedAP.model || selectedAP.deviceType || 'N/A'}</p>
              </div>
            </div>

            {/* Firmware */}
            {(selectedAP.firmware || selectedAP.firmwareVersion || selectedAP.version) && (
              <div>
                <p className="text-xs text-muted-foreground">Firmware</p>
                <p className="text-sm font-medium font-mono truncate">
                  {selectedAP.firmware || selectedAP.firmwareVersion || selectedAP.version}
                </p>
              </div>
            )}

            {/* Radios */}
            {selectedAP.radios && Array.isArray(selectedAP.radios) && selectedAP.radios.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Radios</p>
                <div className="space-y-2">
                  {selectedAP.radios.map((radio: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border/60 p-2.5 bg-muted/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">
                          Radio {radio.radioIndex ?? radio.index ?? i + 1}
                          {radio.band && <span className="ml-1 text-muted-foreground font-normal">· {radio.band}</span>}
                        </span>
                        <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${radio.adminState === 'disabled' ? 'text-muted-foreground' : 'text-green-600 border-green-500/30'}`}>
                          {radio.adminState === 'disabled' ? 'Off' : 'On'}
                        </Badge>
                      </div>
                      <div className="flex gap-3 text-[11px] text-muted-foreground">
                        {(radio.channel || radio.currentChannel) && (
                          <span>Ch {radio.channel ?? radio.currentChannel}</span>
                        )}
                        {radio.txPower !== undefined && (
                          <span>{radio.txPower} dBm</span>
                        )}
                        {(radio.numClients !== undefined || radio.clientCount !== undefined) && (
                          <span>{radio.numClients ?? radio.clientCount} clients</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AFC Anchor */}
            {isAfcAnchor(selectedAP) && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Anchor className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-blue-500">AFC Anchor</p>
                    <p className="text-xs text-blue-500/70">6 GHz Standard Power enabled</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </MobileBottomSheet>
    </div>
  );
}
