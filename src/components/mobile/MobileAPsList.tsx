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
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface MobileAPsListProps {
  currentSite: string;
}

export function MobileAPsList({ currentSite }: MobileAPsListProps) {
  const haptic = useHaptic();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedAP, setSelectedAP] = useState<any | null>(null);
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});

  const { data: aps, loading, refresh } = useOfflineCache(
    `aps_${currentSite}`,
    async () => {
      const data = await apiService.getAccessPoints();
      if (currentSite === 'all') return data;
      // Filter by multiple possible site ID fields
      return data.filter((ap: any) =>
        ap.siteId === currentSite ||
        ap.site === currentSite ||
        ap.hostSite === currentSite
      );
    },
    30000
  );

  const { data: clients } = useOfflineCache(
    `clients_${currentSite}`,
    async () => {
      const data = await apiService.getStations();
      if (currentSite === 'all') return data;
      // Filter by multiple possible site ID fields
      return data.filter((c: any) =>
        c.siteId === currentSite ||
        c.site === currentSite ||
        c.siteName === currentSite
      );
    },
    30000
  );

  // Calculate client counts per AP
  useEffect(() => {
    if (!clients || !aps) return;

    const counts: Record<string, number> = {};

    // Initialize all APs with 0 clients
    aps.forEach((ap: any) => {
      const key = ap.serialNumber || ap.name || ap.displayName;
      if (key) counts[key] = 0;
    });

    // Count clients per AP
    clients.forEach((client: any) => {
      const apKey = client.apSerialNumber || client.apName || client.apSerial;
      if (apKey && counts[apKey] !== undefined) {
        counts[apKey]++;
      }
      // Also try matching by name if serial doesn't match
      if (client.apName) {
        const matchingAP = aps.find((ap: any) =>
          ap.name === client.apName || ap.displayName === client.apName
        );
        if (matchingAP) {
          const key = matchingAP.serialNumber || matchingAP.name || matchingAP.displayName;
          if (key) counts[key] = (counts[key] || 0) + 1;
        }
      }
    });

    setClientCounts(counts);
  }, [clients, aps]);

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

  // Get client count
  const getClientCount = (ap: any): number => {
    const key = ap.serialNumber || ap.name || ap.displayName;
    return key ? (clientCounts[key] || ap.clientCount || ap.clients || ap.numClients || 0) : 0;
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
      {/* Search Bar */}
      <div className="p-4 space-y-3 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search APs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="icon"
            onClick={() => {
              haptic.light();
              setShowFilters(!showFilters);
            }}
            className="h-11 w-11 relative flex-shrink-0"
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filter Pills */}
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={filterStatus === 'all' ? 'outline' : 'default'}
              className="cursor-pointer"
              onClick={() => {
                haptic.light();
                setFilterStatus(filterStatus === 'all' ? 'online' : filterStatus === 'online' ? 'offline' : 'all');
              }}
            >
              {filterStatus === 'all' ? 'All Status' : filterStatus === 'online' ? 'Online' : 'Offline'}
            </Badge>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-6 px-2"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Stats Summary */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">
            {filteredAPs.length} AP{filteredAPs.length !== 1 ? 's' : ''}
          </span>
          <span className="text-green-500 font-medium">{stats.online} online</span>
          {stats.offline > 0 && <span className="text-red-500 font-medium">{stats.offline} offline</span>}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
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

            return (
              <MobileStatusRow
                key={ap.serialNumber || ap.macAddress}
                primaryText={ap.displayName || ap.name || ap.serialNumber || 'Unknown AP'}
                secondaryText={`${clientCount} client${clientCount !== 1 ? 's' : ''} • ${bandText}${afcAnchor ? ' • AFC' : ''}`}
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
            <div>
              <p className="text-sm text-muted-foreground">Serial Number</p>
              <p className="text-base font-medium">{selectedAP.serialNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">MAC Address</p>
              <p className="text-base font-medium">{selectedAP.macAddress || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IP Address</p>
              <p className="text-base font-medium">{selectedAP.ipAddress || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-base font-medium">{isAPOnline(selectedAP) ? 'Online' : 'Offline'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Connected Clients</p>
              <p className="text-base font-medium">{getClientCount(selectedAP)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Band</p>
              <p className="text-base font-medium">{selectedAP.band || selectedAP.radioType || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Model</p>
              <p className="text-base font-medium">{selectedAP.model || selectedAP.deviceType || 'N/A'}</p>
            </div>
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
