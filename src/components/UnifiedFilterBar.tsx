/**
 * UnifiedFilterBar Component
 *
 * The Network Overview page's filter row: the standard grouped site picker
 * (the same SourceSiteSelector used on Access Points), an inspect selector
 * for drilling into an AP or client, and the global environment/time
 * dropdowns plus page-specific filter slots.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Search,
  Gauge,
  Radio,
  Users,
  ChevronDown,
  Check,
  Settings2,
  Wifi,
  Signal,
  MapPin,
  Clock,
  Globe,
  X,
} from 'lucide-react';
import { cn } from './ui/utils';
import {
  searchAccessPoints,
  searchClients,
  type ApItem,
  type ClientItem,
} from '../services/deviceSearch';
import { SourceSiteSelector } from './SourceSiteSelector';
import { useSourceSites } from '../hooks/useSourceSites';
import { ContextConfigModal } from './ContextConfigModal';
import { TimeRangeSelector } from './TimeRangeSelector';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { useSelectedTimeRange } from '../hooks/useSelectedTimeRange';
import { DEFAULT_TIME_RANGE_TOKEN } from '../lib/timeRange';

// ── Types ──────────────────────────────────────────────────────────────────

// 'site' remains a valid view state (a site picked in the standard picker
// scopes the classic dashboard view) but is no longer an inspect tab.
export type SelectorTab = 'ai-insights' | 'site' | 'access-point' | 'client';

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
  /** OS1 Staging / XIQ Default Site — marked so it reads as a system location. */
  isSystemSite?: boolean;
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

const TABS: {
  id: SelectorTab;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  noSearch?: boolean;
}[] = [
  {
    id: 'ai-insights',
    label: 'Overview',
    shortLabel: 'Overview',
    icon: Gauge,
    noSearch: true,
  },
  { id: 'access-point', label: 'Access Point', shortLabel: 'AP', icon: Radio },
  { id: 'client', label: 'Client', shortLabel: 'Client', icon: Users },
];

const MODE_MAP: Record<SelectorTab, 'AI_INSIGHTS' | 'SITE' | 'AP' | 'CLIENT'> = {
  'ai-insights': 'AI_INSIGHTS',
  site: 'SITE',
  'access-point': 'AP',
  client: 'CLIENT',
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

function mapApSearchItem(ap: ApItem): SelectorItem {
  return {
    id: ap.id,
    name: ap.name,
    subtitle: ap.siteName || undefined,
    status: isDeviceOnline(ap.status || '') ? 'online' : 'offline',
    ipAddress: ap.ipAddress || undefined,
    siteName: ap.siteName || undefined,
    serialNumber: ap.serialNumber,
  };
}

function mapClientSearchItem(client: ClientItem): SelectorItem {
  return {
    id: client.id,
    name: client.name,
    subtitle: client.ssid || undefined,
    status: 'online',
    ssid: client.ssid || undefined,
    apName: client.apName || undefined,
    macAddress: client.macAddress,
    ipAddress: client.ipAddress || undefined,
  };
}

// Debounce window for the popover's search-driven typeahead requests — long
// enough that a fast typist does not fire one request per keystroke, short
// enough that the list still feels live.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * True when `requestId` is not the most recently issued request. Guards every
 * setState call in the typeahead's async path so an earlier, slower response
 * (e.g. a stale query, or the AP tab's response landing after switching to
 * Client) can never overwrite a newer one — the newest request always wins.
 */
export function isStaleRequest(requestId: number, latestRequestId: number): boolean {
  return requestId !== latestRequestId;
}

// ── Component ──────────────────────────────────────────────────────────────

export function UnifiedFilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  defaultContextTab = 'ai-insights',
  showEnvironment = true,
  showTimeRange = true,
  extraFilters,
  onResetPageFilters,
  activePageFilterCount = 0,
  className = '',
}: UnifiedFilterBarProps) {
  // Global state hooks
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useGlobalFilters();
  // The standard grouped site list, shared with Access Points / Service Levels
  // so the site picker cannot drift between pages.
  const { sites: srcSites } = useSourceSites();
  const { setMode, selectSite, selectAP, selectClient } = useOperationalContext();
  // The time selection is global, so it is read here rather than owned here —
  // switching pages must not reset it. Coverage is scoped to the active site so
  // a site with its own collection gap is reported accurately.
  const {
    token: timeRangeToken,
    setToken: setTimeRangeToken,
    optionGroups,
    dayStatuses,
    retentionDays,
    neverCollected,
  } = useSelectedTimeRange({
    siteId: filters.site !== 'all' ? filters.site : undefined,
    withCoverage: showTimeRange,
  });

  // Context selector state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<SelectorTab>(defaultContextTab);
  const [popoverSearch, setPopoverSearch] = useState('');
  const [items, setItems] = useState<SelectorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [popoverCapped, setPopoverCapped] = useState(false);
  const [popoverTotal, setPopoverTotal] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [popoverError, setPopoverError] = useState(false);

  // Generation counter for the search-driven typeahead: each fired request
  // captures the id current at send time, and every setState in its async
  // path is guarded by isStaleRequest(...) against the ref's latest value —
  // a superseded request (stale query, or a tab switch mid-flight) can never
  // clobber a newer one's result.
  const latestRequestIdRef = useRef(0);
  // Flips false on unmount so an in-flight request's setState calls — which
  // the generation guard alone would still let through, since nothing bumps
  // the counter on unmount — are also suppressed.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load items when popover opens or tab changes. The `access-point` /
  // `client` tabs are server-side typeahead: the search box value is also a
  // dependency here, debounced, so a fast typist does not fire one request
  // per keystroke. The AbortController cancels an in-flight controller
  // round-trip when a newer request supersedes it (search edited again, tab
  // switched, or the popover closes) so it doesn't do wasted work.
  useEffect(() => {
    if (!popoverOpen) return;

    if (currentTab === 'access-point' || currentTab === 'client') {
      setLoading(true);
      setPopoverError(false);
      const controller = new AbortController();
      const handle = setTimeout(() => {
        const requestId = ++latestRequestIdRef.current;
        void loadSearchItems(currentTab, popoverSearch, requestId, controller.signal);
      }, SEARCH_DEBOUNCE_MS);
      return () => {
        clearTimeout(handle);
        controller.abort();
      };
    }

    loadItems(currentTab);
    return undefined;
  }, [currentTab, popoverOpen, popoverSearch]);

  // ── Data Loading ───────────────────────────────────────────────────────

  // 'ai-insights' / 'site' have nothing to pick from this popover — Overview
  // returns to the whole-network view, and site scoping is owned by the
  // standard site picker beside this control (SourceSiteSelector).
  const loadItems = (_tab: 'ai-insights' | 'site') => {
    setItems([]);
    setPopoverCapped(false);
    setPopoverTotal(0);
    setPopoverError(false);
    setLoading(false);
  };

  // Server-side typeahead for the `access-point` / `client` tabs (Task 1
  // search endpoints). `q` empty returns the first N of the inventory.
  // `requestId` + `signal` guard against a stale/superseded response (see
  // isStaleRequest above) and against setState after unmount.
  const loadSearchItems = async (
    tab: 'access-point' | 'client',
    q: string,
    requestId: number,
    signal: AbortSignal
  ) => {
    const canApply = () =>
      isMountedRef.current && !isStaleRequest(requestId, latestRequestIdRef.current);

    try {
      if (tab === 'access-point') {
        const result = await searchAccessPoints(q, undefined, signal);
        if (!canApply()) return;
        setItems(result.items.map(mapApSearchItem));
        setPopoverCapped(result.capped);
        setPopoverTotal(result.total);
      } else {
        const result = await searchClients(q, undefined, signal);
        if (!canApply()) return;
        setItems(result.items.map(mapClientSearchItem));
        setPopoverCapped(result.capped);
        setPopoverTotal(result.total);
      }
      setPopoverError(false);
    } catch (error) {
      if (signal.aborted || !canApply()) return;
      console.warn('[UnifiedFilterBar] Failed to search devices:', error);
      setItems([]);
      setPopoverCapped(false);
      setPopoverTotal(0);
      setPopoverError(true);
    } finally {
      if (canApply()) setLoading(false);
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
    // access-point / client are server-side typeahead now — `items` already
    // matches `popoverSearch` (see loadSearchItems), so render it as-is.
    if (currentTab === 'access-point' || currentTab === 'client') return items;

    if (!popoverSearch.trim()) return items;
    const query = popoverSearch.toLowerCase();
    return items.filter(
      (item) =>
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
  }, [items, popoverSearch, currentTab]);

  const currentTabInfo = TABS.find((t) => t.id === currentTab);
  const CurrentIcon = currentTabInfo?.icon || Gauge;
  const contextDisplayText = selectedItemName || currentTabInfo?.label || 'Select Context';

  const totalActiveFilters =
    (hasActiveFilters
      ? (filters.site !== 'all' ? 1 : 0) +
        (filters.environment !== 'all' ? 1 : 0) +
        (timeRangeToken !== DEFAULT_TIME_RANGE_TOKEN ? 1 : 0)
      : 0) +
    (searchValue ? 1 : 0) +
    activePageFilterCount;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
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

      {/* Site scope — the same grouped picker used on Access Points and
          Service Levels, so site selection behaves identically everywhere. */}
      <SourceSiteSelector
        value={filters.site || 'all'}
        onValueChange={(value) => {
          updateFilter('site', value);
          if (value === 'all') {
            setMode('AI_INSIGHTS');
          } else {
            selectSite(value);
          }
        }}
        sites={srcSites}
        // This page reads the controller only — an IQ Engine site key would
        // silently scope to nothing, so XIQ sites are not offered here.
        xiqSites={[]}
        osSiteValue="id"
        triggerClassName="w-[200px] h-10"
      />

      {/* Inspect selector — drill into an AP or client */}
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
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                    'hover:bg-muted/50 focus:outline-none focus-visible:bg-muted',
                    currentTab === tab.id
                      ? 'text-primary border-b-2 border-primary -mb-[1px]'
                      : 'text-muted-foreground'
                  )}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{tab.shortLabel}</span>
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
                      {popoverError
                        ? 'Unable to load — try again'
                        : popoverSearch
                          ? 'No matches found'
                          : 'No items available'}
                    </div>
                  ) : (
                    filteredItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemSelect(item)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3',
                          'hover:bg-muted focus:outline-none focus-visible:bg-muted',
                          selectedItemId === item.id && 'bg-primary/5'
                        )}
                      >
                        {/* Status indicator. A system location has no
                            reachability of its own, so it gets no dot. */}
                        {item.id !== 'all' && !item.isSystemSite && (
                          <div className="pt-1">
                            <span
                              className={cn(
                                'block w-2 h-2 rounded-full flex-shrink-0',
                                item.status === 'online' && 'bg-[color:var(--status-success)]',
                                item.status === 'offline' && 'bg-[color:var(--status-error)]',
                                item.status === 'warning' && 'bg-[color:var(--status-warning)]'
                              )}
                            />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{item.name}</span>
                            {item.isSystemSite && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 font-normal text-muted-foreground"
                              >
                                System
                              </Badge>
                            )}
                            {item.band && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 font-normal"
                              >
                                {item.band}
                              </Badge>
                            )}
                          </div>

                          {/* AP details */}
                          {currentTab === 'access-point' && item.id !== 'all' && (
                            <div className="mt-1 space-y-0.5">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {item.model && (
                                  <span className="truncate max-w-[120px]">{item.model}</span>
                                )}
                                {item.ipAddress && (
                                  <span className="font-mono text-xs">{item.ipAddress}</span>
                                )}
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
                                  <span
                                    className={cn(
                                      'flex items-center gap-1',
                                      item.rssi >= -60
                                        ? 'text-[color:var(--status-success)]'
                                        : item.rssi >= -70
                                          ? 'text-[color:var(--status-warning)]'
                                          : 'text-[color:var(--status-error)]'
                                    )}
                                  >
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
                                <div className="text-xs font-mono text-muted-foreground/70">
                                  {item.ipAddress}
                                </div>
                              )}
                            </div>
                          )}

                          {/* All-items subtitle */}
                          {item.id === 'all' && item.subtitle && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {item.subtitle}
                            </div>
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

            {/* Server-side search truncated the result set — say so, rather
                than silently implying the list is complete. */}
            {(currentTab === 'access-point' || currentTab === 'client') &&
              !loading &&
              popoverCapped && (
                <div className="px-3 py-1.5 border-t text-xs text-muted-foreground text-center">
                  Showing first {items.length} of {popoverTotal} — refine search
                </div>
              )}

            {/* Overview has nothing to pick — say what the tabs are for. */}
            {currentTab === 'ai-insights' && (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                Showing the whole network. Choose <strong>AP</strong> or <strong>Client</strong> to
                inspect a specific device.
              </div>
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

      {/* Time Range — rolling windows plus every named day inside retention.
          One control, so the selection stays the same object on every page. */}
      {showTimeRange && (
        <TimeRangeSelector
          value={timeRangeToken}
          onChange={setTimeRangeToken}
          optionGroups={optionGroups}
          dayStatuses={dayStatuses}
          retentionDays={retentionDays}
          neverCollected={neverCollected}
        />
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
      <ContextConfigModal open={isContextModalOpen} onOpenChange={setIsContextModalOpen} />
    </div>
  );
}
