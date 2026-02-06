/**
 * MobileClientsList - Clean clients view for mobile
 * Search, filters, two-line rows. No tables, no experience scores.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { MobileStatusList } from './MobileStatusList';
import { MobileStatusRow } from './MobileStatusRow';
import { MobileBottomSheet } from './MobileBottomSheet';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';

interface MobileClientsListProps {
  currentSite: string;
}

export function MobileClientsList({ currentSite }: MobileClientsListProps) {
  const haptic = useHaptic();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterSignal, setFilterSignal] = useState<'all' | 'good' | 'fair' | 'poor'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  const { data: clients, loading, refresh } = useOfflineCache(
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

  // Get signal bucket
  const getSignalBucket = (rssi: number | undefined): 'good' | 'fair' | 'poor' | 'unknown' => {
    if (rssi === undefined || rssi === null) return 'unknown';
    if (rssi >= -60) return 'good';
    if (rssi >= -75) return 'fair';
    return 'poor';
  };

  // Filter and search
  const filteredClients = useMemo(() => {
    if (!clients) return [];

    return clients.filter((client: any) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          client.hostName?.toLowerCase().includes(query) ||
          client.macAddress?.toLowerCase().includes(query) ||
          client.ipAddress?.toLowerCase().includes(query) ||
          client.apName?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        const isOnline =
          client.connectionState?.toLowerCase() === 'connected' ||
          client.status?.toLowerCase() === 'connected' ||
          client.status?.toLowerCase() === 'associated' ||
          client.status?.toLowerCase() === 'active';
        if (filterStatus === 'online' && !isOnline) return false;
        if (filterStatus === 'offline' && isOnline) return false;
      }

      // Signal filter
      if (filterSignal !== 'all') {
        const bucket = getSignalBucket(client.rssi);
        if (bucket !== filterSignal) return false;
      }

      return true;
    });
  }, [clients, searchQuery, filterStatus, filterSignal]);

  const handleClientClick = (client: any) => {
    haptic.light();
    setSelectedClient(client);
  };

  const handleClearFilters = () => {
    haptic.light();
    setSearchQuery('');
    setFilterStatus('all');
    setFilterSignal('all');
  };

  const activeFilterCount =
    (filterStatus !== 'all' ? 1 : 0) +
    (filterSignal !== 'all' ? 1 : 0) +
    (searchQuery ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 space-y-3 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
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
            <Badge
              variant={filterSignal === 'all' ? 'outline' : 'default'}
              className="cursor-pointer"
              onClick={() => {
                haptic.light();
                const next = filterSignal === 'all' ? 'good' : filterSignal === 'good' ? 'fair' : filterSignal === 'fair' ? 'poor' : 'all';
                setFilterSignal(next);
              }}
            >
              {filterSignal === 'all' ? 'All Signals' : filterSignal.charAt(0).toUpperCase() + filterSignal.slice(1)}
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

        {/* Result Count */}
        <p className="text-xs text-muted-foreground">
          {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && ` (filtered from ${clients?.length || 0})`}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        <MobileStatusList loading={loading} emptyMessage="No clients found">
          {filteredClients.map((client: any) => {
            const isOnline =
              client.connectionState?.toLowerCase() === 'connected' ||
              client.status?.toLowerCase() === 'connected' ||
              client.status?.toLowerCase() === 'associated' ||
              client.status?.toLowerCase() === 'active';

            // Get band
            const band = client.band || client.radioBand || client.frequency || '—';

            // Get signal strength
            const signalText = client.rssi ? `${client.rssi} dBm` : '—';

            return (
              <MobileStatusRow
                key={client.macAddress}
                primaryText={client.hostName || client.hostname || client.macAddress || 'Unknown Client'}
                secondaryText={`${band} • ${signalText}`}
                status={{
                  label: isOnline ? 'Online' : 'Offline',
                  variant: isOnline ? 'success' : 'destructive',
                }}
                indicator={isOnline ? 'online' : 'offline'}
                onClick={() => handleClientClick(client)}
              />
            );
          })}
        </MobileStatusList>
      </div>

      {/* Bottom Sheet Detail */}
      <MobileBottomSheet
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        title={selectedClient?.hostName || selectedClient?.hostname || selectedClient?.macAddress || 'Client Details'}
      >
        {selectedClient && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Hostname</p>
              <p className="text-base font-medium">{selectedClient.hostName || selectedClient.hostname || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Device Info</p>
              <p className="text-base font-medium">{selectedClient.manufacturer || selectedClient.deviceType || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">MAC Address</p>
              <p className="text-base font-medium font-mono">{selectedClient.macAddress}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">IP Address</p>
              <p className="text-base font-medium">{selectedClient.ipAddress || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">User & Network</p>
              <p className="text-base font-medium">{selectedClient.username || '—'}</p>
              <p className="text-sm text-muted-foreground mt-1">{selectedClient.networkName || selectedClient.ssid || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Access Point</p>
              <p className="text-base font-medium">{selectedClient.apName || selectedClient.apDisplayName || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Band</p>
              <p className="text-base font-medium">{selectedClient.band || selectedClient.radioBand || selectedClient.frequency || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signal Strength</p>
              <p className="text-base font-medium">{selectedClient.rssi ? `${selectedClient.rssi} dBm` : '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-base font-medium">{selectedClient.status || selectedClient.connectionState || '—'}</p>
            </div>
          </div>
        )}
      </MobileBottomSheet>
    </div>
  );
}
