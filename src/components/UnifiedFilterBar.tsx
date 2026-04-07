/**
 * UnifiedFilterBar Component
 *
 * Standardized filter bar used across the entire AURA app.
 * Combines: context-aware search, context selector popover (AI/Site/AP/Switch/Client tabs),
 * global dropdowns (environment, time range), and page-specific filter slots.
 *
 * Replaces: FilterBar.tsx, ContextualInsightsSelector.tsx, and all ad-hoc local filters.
 */

import { useState, useEffect, useMemo } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Search, Brain, Building, Radio, Network, Users, ChevronDown, Check,
  Settings2, Wifi, Signal, MapPin, Clock, Globe, X
} from 'lucide-react';
import { cn } from './ui/utils';
import { apiService, Site } from '../services/api';
import { getSiteDisplayName } from '../contexts/SiteContext';
import { ContextConfigModal } from './ContextConfigModal';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useOperationalContext } from '../hooks/useOperationalContext';

// ── Types ──────────────────────────────────────────────────────────────────

export type SelectorTab = 'ai-insights' | 'site' | 'access-point' | 'switch' | 'client';

interface SelectorItem {
  id: string;
  name: string;
  subtitle?: string;
  status?: 'online' | 'offline' | 'warning';
  model?: string;
  ipAddress?: string;
  clients?: number;
  siteName?: string;
  uptime?: string;
  serialNumber?: string;
  ssid?: string;
  apName?: string;
  rssi?: number;
  vendor?: string;
  macAddress?: string;
  band?: string;
}

export interface UnifiedFilterBarProps {
  // Search — always visible
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;

  // Context selector
  defaultContextTab?: SelectorTab;

  // Global filter visibility (all default true)
  showEnvironment?: boolean;
  showTimeRange?: boolean;

  // Page-specific filters — rendered inline after divider
  extraFilters?: React.ReactNode;

  // Reset callback for page-specific filters
  onResetPageFilters?: () => void;

  // Active page filter count (for badge)
  activePageFilterCount?: number;

  // Styling
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TABS: { id: SelectorTab; label: string; shortLabel: string; icon: React.ElementType; beta?: boolean; noSearch?: boolean }[] = [
  { id: 'ai-insights', label: 'AI Insights', shortLabel: 'AI Insights', icon: Brain, noSearch: true },
  { id: 'site', label: 'Site', shortLabel: 'Site', icon: Building },
  { id: 'access-point', label: 'Access Point', shortLabel: 'AP', icon: Radio },
  { id: 'switch', label: 'Switch', shortLabel: 'Switch', icon: Network, beta: true },
  { id: 'client', label: 'Client', shortLabel: 'Client', icon: Users },
];

const TIME_RANGE_OPTIONS = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

const MODE_MAP: Record<SelectorTab, 'AI_INSIGHTS' | 'SITE' | 'AP' | 'CLIENT'> = {
  'ai-insights': 'AI_INSIGHTS',
  'site': 'SITE',
  'access-point': 'AP',
  'switch': 'SITE',
  'client': 'CLIENT',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function isDeviceOnline(statusStr: string, isUp?: boolean, online?: boolean): boolean {
  const s = (statusStr || '').toLowerCase();
  return (
    s === 'inservice' ||
    s.includes('up') ||
    s.includes('online') ||
    s.includes('connected') ||
    isUp === true ||
    online === true ||
    (!s && isUp !== false && online !== false)
  );
}

function getBandFromChannel(channel: number | undefined, freq: string | undefined): string {
  if (freq) {
    if (freq.includes('2.4') || freq.includes('2G')) return '2.4G';
    if (freq.includes('5') && !freq.includes('6')) return '5G';
    if (freq.includes('6')) return '6G';
  }
  if (channel) {
    if (channel >= 1 && channel <= 14) return '2.4G';
    if (channel >= 36 && channel <= 165) return '5G';
    if (channel > 165) return '6G';
  }
  return '';
}

// ── Component ──────────────────────────────────────────────────────────────

export function UnifiedFilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  defaultContextTab = 'site',
  showEnvironment = true,
  showTimeRange = true,
  extraFilters,
  onResetPageFilters,
  activePageFilterCount = 0,
  className = '',
}: UnifiedFilterBarProps) {
  // Global state hooks
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useGlobalFilters();
  const { setMode, selectSite, selectAP, selectClient } = useOperationalContext();

  // Context selector state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<SelectorTab>(defaultContextTab);
  const [popoverSearch, setPopoverSearch] = useState('');
  const [items, setItems] = useState<SelectorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  // Load items when popover opens or tab changes
  useEffect(() => {
    if (popoverOpen) {
      loadItems(currentTab);
    }
  }, [currentTab, popoverOpen]);

  // ── Data Loading ───────────────────────────────────────────────────────

  const loadItems = async (tab: SelectorTab) => {
    setLoading(true);
    setItems([]);

    try {
      switch (tab) {
        case 'ai-insights':
          setItems([
            { id: 'all', name: 'All Insights', subtitle: 'Complete network overview' },
            { id: 'network-health', name: 'Network Health', subtitle: 'Performance metrics' },
            { id: 'anomaly-detection', name: 'Anomaly Detection', subtitle: 'Unusual patterns' },
            { id: 'capacity-planning', name: 'Capacity Planning', subtitle: 'Utilization trends' },
            { id: 'predictive-maintenance', name: 'Predictive Maintenance', subtitle: 'Issue forecast' },
          ]);
          break;

        case 'site': {
          const sites = await apiService.getSites();
          const siteItems: SelectorItem[] = [
            { id: 'all', name: 'All Sites', subtitle: `${sites.length} sites` },
          ];
          sites.forEach((site: Site) => {
            siteItems.push({
              id: site.id,
              name: getSiteDisplayName(site),
              subtitle: site.siteGroup || undefined,
              status: 'online' as const,
            });
          });
          setItems(siteItems);
          break;
        }

        case 'access-point': {
          const aps = await apiService.getAccessPoints();
          let stationsForAPs: any[] = [];
          try {
            stationsForAPs = await apiService.getStations();
          } catch {
            console.warn('[UnifiedFilterBar] Could not fetch stations for client count');
          }

          const clientCountByAP: Record<string, number> = {};
          stationsForAPs.forEach((station: any) => {
            const apSerial = station.apSerialNumber || station.apSerial;
            if (apSerial) {
              clientCountByAP[apSerial] = (clientCountByAP[apSerial] || 0) + 1;
            }
          });

          const onlineCount = aps.filter((ap: any) =>
            isDeviceOnline(ap.status || ap.connectionState || ap.operationalState || '', ap.isUp, ap.online)
          ).length;

          const apItems: SelectorItem[] = [
            { id: 'all', name: 'All Access Points', subtitle: `${aps.length} APs (${onlineCount} online)` },
          ];

          aps.forEach((ap: any) => {
            const apName = ap.displayName || ap.name || ap.hostname || ap.serialNumber;
            const statusStr = ap.status || ap.connectionState || ap.operationalState || '';
            const apIsOnline = isDeviceOnline(statusStr, ap.isUp, ap.online);
            const serialNum = ap.serialNumber || ap.id;
            const clientCount = clientCountByAP[serialNum] || 0;
            const uptimeStr = formatUptime(ap.sysUptime || ap.uptime || 0);

            apItems.push({
              id: serialNum,
              name: apName,
              subtitle: ap.siteName || ap.hostSite || undefined,
              status: apIsOnline ? 'online' : 'offline',
              model: ap.model || ap.hardwareType || ap.platformName,
              ipAddress: ap.ipAddress,
              clients: clientCount,
              siteName: ap.siteName || ap.hostSite,
              uptime: uptimeStr,
              serialNumber: serialNum,
            });
          });
          setItems(apItems);
          break;
        }

        case 'switch': {
          try {
            const switches = await apiService.getSwitches?.() || [];
            const switchItems: SelectorItem[] = [
              { id: 'all', name: 'All Switches', subtitle: `${switches.length} switches` },
            ];
            switches.slice(0, 50).forEach((sw: any) => {
              const swName = sw.displayName || sw.name || sw.hostname || sw.serialNumber;
              const swStatusStr = sw.status || sw.connectionState || sw.operationalState || '';
              const swIsOnline = isDeviceOnline(swStatusStr, sw.isUp, sw.online);
              switchItems.push({
                id: sw.serialNumber || sw.id,
                name: swName,
                subtitle: sw.siteName || sw.model || undefined,
                status: swIsOnline ? 'online' : 'offline',
              });
            });
            setItems(switchItems);
          } catch {
            setItems([{ id: 'all', name: 'All Switches', subtitle: 'No switches available' }]);
          }
          break;
        }

        case 'client': {
          const clients = await apiService.getStations();
          const clientItems: SelectorItem[] = [
            { id: 'all', name: 'All Clients', subtitle: `${clients.length} connected` },
          ];
          clients.forEach((client: any) => {
            const mac = client.macAddress || client.id;
            const band = getBandFromChannel(client.channel, client.band || client.frequency);
            clientItems.push({
              id: mac,
              name: client.hostName || mac,
              subtitle: client.ssid || client.serviceName || undefined,
              status: 'online' as const,
              ssid: client.ssid || client.serviceName,
              apName: client.apName || client.apHostname,
              rssi: client.rssi || client.signalStrength,
              macAddress: mac,
              band: band,
              ipAddress: client.ipAddress,
            });
          });
          setItems(clientItems);
          break;
        }
      }
    } catch (error) {
      console.warn('[UnifiedFilterBar] Failed to load items:', error);
      setItems([{ id: 'all', name: 'All', subtitle: 'Unable to load' }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleTabChange = (tab: SelectorTab) => {
    setCurrentTab(tab);
    setPopoverSearch('');
    setMode(MODE_MAP[tab]);

    if (tab === 'ai-insights') {
      setSelectedItemId(null);
      setSelectedItemName(null);
      setPopoverOpen(false);
    }
  };

  const handleItemSelect = (item: SelectorItem) => {
    setSelectedItemId(item.id);
    setSelectedItemName(item.id === 'all' ? null : item.name);

    const effectiveId = item.id === 'all' ? null : item.id;
    switch (currentTab) {
      case 'site':
        if (effectiveId) {
          selectSite(effectiveId);
          updateFilter('site', effectiveId);
        } else {
          setMode('AI_INSIGHTS');
          updateFilter('site', 'all');
        }
        break;
      case 'access-point':
        if (effectiveId) {
          selectAP(effectiveId, item.siteName);
        } else {
          setMode('SITE');
        }
        break;
      case 'client':
        if (effectiveId) {
          selectClient(effectiveId, item.apName, item.siteName);
        } else {
          setMode('SITE');
        }
        break;
      default:
        break;
    }

    setPopoverOpen(false);
  };

  const handleResetAll = () => {
    resetFilters();
    onSearchChange('');
    setSelectedItemId(null);
    setSelectedItemName(null);
    setCurrentTab(defaultContextTab);
    setMode(MODE_MAP[defaultContextTab]);
    onResetPageFilters?.();
  };

  // ── Derived State ──────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!popoverSearch.trim()) return items;
    const query = popoverSearch.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.subtitle?.toLowerCase().includes(query) ||
      item.model?.toLowerCase().includes(query) ||
      item.ipAddress?.toLowerCase().includes(query) ||
      item.siteName?.toLowerCase().includes(query) ||
      item.serialNumber?.toLowerCase().includes(query) ||
      item.ssid?.toLowerCase().includes(query) ||
      item.apName?.toLowerCase().includes(query) ||
      item.vendor?.toLowerCase().includes(query) ||
      item.macAddress?.toLowerCase().includes(query)
    );
  }, [items, popoverSearch]);

  const currentTabInfo = TABS.find(t => t.id === currentTab);
  const CurrentIcon = currentTabInfo?.icon || Brain;
  const contextDisplayText = selectedItemName || currentTabInfo?.label || 'Select Context';

  const totalActiveFilters =
    (hasActiveFilters ? (filters.site !== 'all' ? 1 : 0) + (filters.environment !== 'all' ? 1 : 0) + (filters.timeRange !== '24h' ? 1 : 0) : 0) +
    (searchValue ? 1 : 0) +
    activePageFilterCount;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Search Input — always visible */}
      <div className="relative w-[280px] shrink min-w-[140px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-10"
        />
      </div>

      {/* Context Selector — popover with tabs */}
      <div className="shrink-0">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={popoverOpen}
            className="h-10 justify-between gap-2 px-3 font-normal min-w-[160px] max-w-[240px]"
          >
            <div className="flex items-center gap-2 truncate">
              <CurrentIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{contextDisplayText}</span>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[480px] p-0" align="start">
          {/* Tabs */}
          <div className="flex border-b overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                  "hover:bg-muted/50 focus:outline-none focus-visible:bg-muted",
                  currentTab === tab.id
                    ? "text-primary border-b-2 border-primary -mb-[1px]"
                    : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                <span>{tab.shortLabel}</span>
                {tab.beta && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]">
                    Beta
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Popover Search — not shown for AI Insights */}
          {currentTab !== 'ai-insights' && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={`Search ${currentTabInfo?.label || ''}...`}
                  value={popoverSearch}
                  onChange={(e) => setPopoverSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Items List */}
          {currentTab !== 'ai-insights' && (
            <ScrollArea className="h-[320px]">
              <div className="p-1">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading...
                    </div>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                    {popoverSearch ? 'No matches found' : 'No items available'}
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3",
                        "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                        selectedItemId === item.id && "bg-primary/5"
                      )}
                    >
                      {/* Status indicator */}
                      {item.id !== 'all' && (
                        <div className="pt-1">
                          <span className={cn(
                            "block w-2 h-2 rounded-full flex-shrink-0",
                            item.status === 'online' && "bg-[color:var(--status-success)]",
                            item.status === 'offline' && "bg-[color:var(--status-error)]",
                            item.status === 'warning' && "bg-[color:var(--status-warning)]"
                          )} />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          {item.band && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal">
                              {item.band}
                            </Badge>
                          )}
                        </div>

                        {/* AP details */}
                        {currentTab === 'access-point' && item.id !== 'all' && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {item.model && <span className="truncate max-w-[120px]">{item.model}</span>}
                              {item.ipAddress && <span className="font-mono text-[10px]">{item.ipAddress}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {item.siteName && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate max-w-[100px]">{item.siteName}</span>
                                </span>
                              )}
                              {typeof item.clients === 'number' && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {item.clients}
                                </span>
                              )}
                              {item.uptime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {item.uptime}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Client details */}
                        {currentTab === 'client' && item.id !== 'all' && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {item.ssid && (
                                <span className="flex items-center gap-1">
                                  <Wifi className="h-3 w-3" />
                                  <span className="truncate max-w-[100px]">{item.ssid}</span>
                                </span>
                              )}
                              {item.rssi !== undefined && (
                                <span className={cn(
                                  "flex items-center gap-1",
                                  item.rssi >= -60 ? "text-[color:var(--status-success)]" : item.rssi >= -70 ? "text-[color:var(--status-warning)]" : "text-[color:var(--status-error)]"
                                )}>
                                  <Signal className="h-3 w-3" />
                                  {item.rssi} dBm
                                </span>
                              )}
                            </div>
                            {item.apName && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Radio className="h-3 w-3" />
                                <span className="truncate max-w-[140px]">{item.apName}</span>
                              </div>
                            )}
                            {item.ipAddress && (
                              <div className="text-[10px] font-mono text-muted-foreground/70">
                                {item.ipAddress}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Site/Switch/All subtitle */}
                        {(currentTab === 'site' || currentTab === 'switch' || item.id === 'all') && item.subtitle && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</div>
                        )}
                      </div>

                      {selectedItemId === item.id && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {/* AI Insights list (static, no search) */}
          {currentTab === 'ai-insights' && (
            <ScrollArea className="h-[240px]">
              <div className="p-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemSelect(item)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3",
                      "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                      selectedItemId === item.id && "bg-primary/5"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{item.name}</span>
                      {item.subtitle && (
                        <div className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</div>
                      )}
                    </div>
                    {selectedItemId === item.id && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>
      </div>

      {/* Context Settings Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsContextModalOpen(true)}
        className="h-10 w-10 shrink-0"
        title="Configure Context Settings"
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      {/* Environment Dropdown */}
      {showEnvironment && (
        <div className="shrink-0">
          <Select
            value={filters.environment}
            onValueChange={(value) => updateFilter('environment', value)}
          >
            <SelectTrigger className="w-44 h-10">
              <Globe className="mr-2 h-4 w-4 flex-shrink-0" />
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="lab">Lab</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Time Range Dropdown */}
      {showTimeRange && (
        <div className="shrink-0">
          <Select
            value={filters.timeRange}
            onValueChange={(value) => updateFilter('timeRange', value)}
          >
            <SelectTrigger className="w-48 h-10">
              <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Divider + Page-Specific Filters */}
      {extraFilters && (
        <>
          <div className="w-px h-7 bg-border" />
          {extraFilters}
        </>
      )}

      {/* Active Filter Badge + Clear */}
      {totalActiveFilters > 0 && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-xs px-2 py-0.5">
            {totalActiveFilters} active
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetAll}
            className="h-7 w-7"
            title="Clear all filters"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Context Configuration Modal */}
      <ContextConfigModal
        open={isContextModalOpen}
        onOpenChange={setIsContextModalOpen}
      />
    </div>
  );
}
