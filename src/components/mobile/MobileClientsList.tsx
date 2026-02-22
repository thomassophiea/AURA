/**
 * MobileClientsList - Clean clients view for mobile
 * Search, filters, two-line rows. No tables, no experience scores.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Search, 
  SlidersHorizontal, 
  X, 
  ArrowLeftRight, 
  LogIn, 
  LogOut,
  Wifi,
  Clock,
  Radio
} from 'lucide-react';
import { MobileStatusList } from './MobileStatusList';
import { MobileStatusRow } from './MobileStatusRow';
import { MobileBottomSheet } from './MobileBottomSheet';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { apiService, StationEvent } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface MobileClientsListProps {
  currentSite: string;
}

type DetailTab = 'info' | 'connection' | 'history';

function formatTimeAgo(timestamp: string | number): string {
  const now = Date.now();
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  const diffMs = now - ts;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
}

function formatDuration(startTime: string | number): string {
  const now = Date.now();
  const start = typeof startTime === 'string' ? parseInt(startTime, 10) : startTime;
  const diffMs = now - start;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h ${diffMin % 60}m`;
  return `${diffDay}d ${diffHour % 24}h`;
}

function getEventIcon(eventType: string) {
  const type = eventType?.toLowerCase() || '';
  if (type.includes('roam')) return ArrowLeftRight;
  if (type.includes('associate') && !type.includes('disassociate')) return LogIn;
  if (type.includes('disassociate') || type.includes('disconnect')) return LogOut;
  return Wifi;
}

function getEventColor(eventType: string): string {
  const type = eventType?.toLowerCase() || '';
  if (type.includes('roam')) return 'text-blue-500';
  if (type.includes('associate') && !type.includes('disassociate')) return 'text-green-500';
  if (type.includes('disassociate') || type.includes('disconnect')) return 'text-red-500';
  return 'text-muted-foreground';
}

function getSignalColor(rssi: number | undefined): string {
  if (rssi === undefined || rssi === null) return 'bg-muted';
  if (rssi >= -60) return 'bg-green-500';
  if (rssi >= -75) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getSignalPercentage(rssi: number | undefined): number {
  if (rssi === undefined || rssi === null) return 0;
  // Map RSSI range (-100 to -30) to percentage (0 to 100)
  const min = -100;
  const max = -30;
  const clamped = Math.max(min, Math.min(max, rssi));
  return Math.round(((clamped - min) / (max - min)) * 100);
}

export function MobileClientsList({ currentSite }: MobileClientsListProps) {
  const haptic = useHaptic();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterSignal, setFilterSignal] = useState<'all' | 'good' | 'fair' | 'poor'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [clientEvents, setClientEvents] = useState<StationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const { data: clients, loading, refresh } = useOfflineCache(
    `clients_${currentSite}`,
    async () => {
      const data = await apiService.getStations();
      if (currentSite === 'all') return data;
      
      // Get site name for matching (siteName field may contain name, not ID)
      const sitesList = await apiService.getSites();
      const selectedSite = sitesList.find((s: any) => 
        s.id === currentSite || s.siteId === currentSite
      );
      const siteNameToMatch = selectedSite?.name || selectedSite?.siteName;
      
      // Filter by site ID or site name
      return data.filter((c: any) =>
        c.siteId === currentSite ||
        c.site === currentSite ||
        c.siteName === currentSite ||
        (siteNameToMatch && c.siteName === siteNameToMatch) ||
        (siteNameToMatch && c.siteName?.toLowerCase() === siteNameToMatch.toLowerCase())
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
    setActiveTab('info');
    setClientEvents([]);
  };

  const fetchClientEvents = useCallback(async (macAddress: string) => {
    setEventsLoading(true);
    try {
      const response = await apiService.fetchStationEventsWithCorrelation(macAddress, '24H', 15);
      setClientEvents(response.stationEvents || []);
    } catch (error) {
      console.error('Failed to fetch client events:', error);
      setClientEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history' && selectedClient?.macAddress && clientEvents.length === 0 && !eventsLoading) {
      fetchClientEvents(selectedClient.macAddress);
    }
  }, [activeTab, selectedClient, clientEvents.length, eventsLoading, fetchClientEvents]);

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
      <div className="px-3 py-2.5 space-y-2 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search clients..."
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
            <Badge
              variant={filterSignal === 'all' ? 'outline' : 'default'}
              className="cursor-pointer text-xs h-6"
              onClick={() => {
                haptic.light();
                const next = filterSignal === 'all' ? 'good' : filterSignal === 'good' ? 'fair' : filterSignal === 'fair' ? 'poor' : 'all';
                setFilterSignal(next);
              }}
            >
              {filterSignal === 'all' ? 'Signal' : filterSignal.charAt(0).toUpperCase() + filterSignal.slice(1)}
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

        {/* Result Count */}
        <p className="text-[11px] text-muted-foreground">
          {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && ` (of ${clients?.length || 0})`}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <MobileStatusList loading={loading} emptyMessage="No clients found">
          {filteredClients.map((client: any) => {
            const isOnline =
              client.connectionState?.toLowerCase() === 'connected' ||
              client.status?.toLowerCase() === 'connected' ||
              client.status?.toLowerCase() === 'associated' ||
              client.status?.toLowerCase() === 'active';

            // Get hostname - prefer hostname over MAC
            const hostname = client.hostName || client.hostname || client.deviceName || null;
            const primaryText = hostname || client.macAddress || 'Unknown Client';

            // Get IP address
            const ipAddress = client.ipAddress || client.ip || null;

            // Get signal strength (RSSI)
            const rssi = client.rssi ?? client.signalStrength ?? client.rss ?? null;
            const signalText = rssi !== null ? `${rssi} dBm` : null;

            // Build secondary text with available info
            const secondaryParts: string[] = [];
            if (ipAddress) secondaryParts.push(ipAddress);
            if (signalText) secondaryParts.push(signalText);
            if (secondaryParts.length === 0) {
              // Fall back to showing MAC if we used hostname as primary
              if (hostname) secondaryParts.push(client.macAddress);
            }
            const secondaryText = secondaryParts.join(' • ') || 'No details';

            return (
              <MobileStatusRow
                key={client.macAddress}
                primaryText={primaryText}
                secondaryText={secondaryText}
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
          <div className="flex flex-col h-full">
            {/* Tab Buttons */}
            <div className="flex border-b border-border px-4">
              {(['info', 'connection', 'history'] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    haptic.light();
                    setActiveTab(tab);
                  }}
                  className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                    activeTab === tab
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Info Tab */}
              {activeTab === 'info' && (
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
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="text-base font-medium">{selectedClient.status || selectedClient.connectionState || '—'}</p>
                  </div>
                </div>
              )}

              {/* Connection Tab */}
              {activeTab === 'connection' && (
                <div className="p-4 space-y-4">
                  {/* Signal Strength with Visual Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Wifi className="h-4 w-4" />
                        Signal Strength
                      </p>
                      <p className="text-sm font-medium">
                        {selectedClient.rssi ? `${selectedClient.rssi} dBm` : '—'}
                      </p>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${getSignalColor(selectedClient.rssi)}`}
                        style={{ width: `${getSignalPercentage(selectedClient.rssi)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedClient.rssi >= -60 ? 'Excellent' : selectedClient.rssi >= -75 ? 'Good' : selectedClient.rssi ? 'Poor' : '—'}
                    </p>
                  </div>

                  {/* Channel & Band */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        Channel
                      </p>
                      <p className="text-base font-medium">
                        {selectedClient.channel || selectedClient.radioChannel || '—'}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Band</p>
                      <p className="text-base font-medium">
                        {selectedClient.band || selectedClient.radioBand || selectedClient.frequency || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Data Rates */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">PHY Rate</p>
                      <p className="text-base font-medium">
                        {selectedClient.dataRate || selectedClient.phyRate || selectedClient.rxRate || '—'}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Protocol</p>
                      <p className="text-base font-medium">
                        {selectedClient.protocol || selectedClient.capabilities || '—'}
                      </p>
                    </div>
                  </div>

                  {/* Time Connected */}
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Time Connected
                    </p>
                    <p className="text-base font-medium">
                      {selectedClient.associationTime 
                        ? formatDuration(selectedClient.associationTime)
                        : selectedClient.sessionDuration || '—'
                      }
                    </p>
                  </div>

                  {/* VLAN Info */}
                  <div>
                    <p className="text-sm text-muted-foreground">VLAN</p>
                    <p className="text-base font-medium">
                      {selectedClient.vlan || selectedClient.vlanId || selectedClient.vlanTag || selectedClient.dot1dPortNumber || '—'}
                    </p>
                  </div>

                  {/* SNR if available */}
                  {(selectedClient.snr || selectedClient.signalToNoise) && (
                    <div>
                      <p className="text-sm text-muted-foreground">Signal-to-Noise Ratio</p>
                      <p className="text-base font-medium">
                        {selectedClient.snr || selectedClient.signalToNoise} dB
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="p-4">
                  {eventsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                      <span className="ml-3 text-sm text-muted-foreground">Loading events...</span>
                    </div>
                  ) : clientEvents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No recent events</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clientEvents.map((event, index) => {
                        const EventIcon = getEventIcon(event.eventType);
                        const colorClass = getEventColor(event.eventType);
                        return (
                          <div
                            key={event.id || `${event.timestamp}-${index}`}
                            className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                          >
                            <div className={`mt-0.5 ${colorClass}`}>
                              <EventIcon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm font-medium ${colorClass}`}>
                                  {event.eventType || 'Event'}
                                </p>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatTimeAgo(event.timestamp)}
                                </span>
                              </div>
                              {event.apName && (
                                <p className="text-sm text-foreground mt-0.5">
                                  AP: {event.apName}
                                </p>
                              )}
                              {event.details && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {event.details}
                                </p>
                              )}
                              {event.channel && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Channel {event.channel} • {event.band || '—'}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </MobileBottomSheet>
    </div>
  );
}
