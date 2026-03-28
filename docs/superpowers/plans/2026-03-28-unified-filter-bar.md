# UnifiedFilterBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FilterBar.tsx, ContextualInsightsSelector.tsx, and all ad-hoc local filter UIs with a single `UnifiedFilterBar` component used across the entire AURA app.

**Architecture:** New `UnifiedFilterBar` component combines a context-aware search input, a rich context selector popover (AI/Site/AP/Switch/Client tabs), global dropdowns (environment, time range), and an `extraFilters` slot for page-specific filters — all in one horizontal row. Internally uses existing `useGlobalFilters` and `useOperationalContext` hooks. Each page passes search state and optional extra filter elements as props.

**Tech Stack:** React, TypeScript, shadcn/ui (Popover, Select, ScrollArea, Input, Badge, Button), Radix primitives, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-28-unified-filter-bar-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/UnifiedFilterBar.tsx` | Main component: search input, context selector popover, environment/time dropdowns, extra filters slot, active filter badge |
| Modify | `src/components/DashboardEnhanced.tsx` | Replace `FilterBar` + `ContextualInsightsSelector` imports with `UnifiedFilterBar` |
| Modify | `src/components/AccessPoints.tsx` | Replace local search/site UI with `UnifiedFilterBar`, keep local `searchTerm` state |
| Modify | `src/components/ConnectedClients.tsx` | Replace local search/site UI with `UnifiedFilterBar`, keep local `searchTerm` state |
| Modify | `src/components/NetworkInsightsEnhanced.tsx` | Replace `FilterBar` import with `UnifiedFilterBar` |
| Modify | `src/components/NetworkInsights.tsx` | Replace `FilterBar` import with `UnifiedFilterBar` |
| Modify | `src/components/NetworkInsightsSimplified.tsx` | Replace `FilterBar` import with `UnifiedFilterBar` |
| Delete | `src/components/FilterBar.tsx` | Fully replaced |
| Delete | `src/components/ContextualInsightsSelector.tsx` | Fully replaced |

---

### Task 1: Build UnifiedFilterBar Component

**Files:**
- Create: `src/components/UnifiedFilterBar.tsx`

This is the core task. The component merges FilterBar.tsx (global dropdowns) and ContextualInsightsSelector.tsx (context popover with tabs) into a single component, and adds an always-visible search input and extra filters slot.

- [ ] **Step 1: Create UnifiedFilterBar.tsx with full implementation**

Create `src/components/UnifiedFilterBar.tsx` with the following content:

```tsx
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
  const { ctx, setMode, selectSite, selectAP, selectClient } = useOperationalContext();

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
      <div className="relative flex-1 min-w-[220px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-10"
        />
      </div>

      {/* Context Selector — popover with tabs */}
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

      {/* Context Settings Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsContextModalOpen(true)}
        className="h-10 w-10"
        title="Configure Context Settings"
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      {/* Environment Dropdown */}
      {showEnvironment && (
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
      )}

      {/* Time Range Dropdown */}
      {showTimeRange && (
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
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npx tsc --noEmit src/components/UnifiedFilterBar.tsx 2>&1 | head -20`

If there are import errors, fix them. The component should compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/UnifiedFilterBar.tsx
git commit -m "feat: add UnifiedFilterBar component

Merges FilterBar + ContextualInsightsSelector into a single standardized
filter bar with search input, context selector popover, global dropdowns,
and page-specific filter slot."
```

---

### Task 2: Integrate on DashboardEnhanced

**Files:**
- Modify: `src/components/DashboardEnhanced.tsx`

The Dashboard currently uses both `FilterBar` (for time range) and `ContextualInsightsSelector` (for context tabs). Replace both with `UnifiedFilterBar`.

- [ ] **Step 1: Read the current Dashboard filter section**

Read `src/components/DashboardEnhanced.tsx` around lines 56-58 (imports) and lines 1550-1580 (FilterBar + ContextualInsightsSelector rendering) to understand the exact current usage.

- [ ] **Step 2: Update imports**

Replace:
```tsx
import { FilterBar } from './FilterBar';
```
and:
```tsx
import { ContextualInsightsSelector, SelectorTab } from './ContextualInsightsSelector';
```
with:
```tsx
import { UnifiedFilterBar, SelectorTab } from './UnifiedFilterBar';
```

- [ ] **Step 3: Add search state**

Add near the other state declarations:
```tsx
const [dashboardSearch, setDashboardSearch] = useState('');
```

- [ ] **Step 4: Replace the FilterBar + ContextualInsightsSelector rendering**

Find the section where `<FilterBar` and `<ContextualInsightsSelector` are rendered (around lines 1570-1580). Replace both components with a single:
```tsx
<UnifiedFilterBar
  searchPlaceholder="Search widgets, metrics..."
  searchValue={dashboardSearch}
  onSearchChange={setDashboardSearch}
  defaultContextTab="site"
  showEnvironment={true}
  showTimeRange={true}
/>
```

Keep the `EnvironmentProfileSelector` and `TimelineCursorControls` that follow — those are separate components.

- [ ] **Step 5: Remove unused ContextualInsightsSelector callback props**

If there were `onTabChange` or `onSelectionChange` callbacks passed to `ContextualInsightsSelector`, remove the callback handler functions that are now unused. The UnifiedFilterBar manages context internally via `useOperationalContext`.

- [ ] **Step 6: Verify it compiles and renders**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npm run build 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components/DashboardEnhanced.tsx
git commit -m "refactor(dashboard): replace FilterBar + ContextualInsightsSelector with UnifiedFilterBar"
```

---

### Task 3: Integrate on AccessPoints

**Files:**
- Modify: `src/components/AccessPoints.tsx`

The AP page has local `searchTerm`, `selectedSite`, `sites` state and inline search+site UI in CardHeader (~lines 2081-2113). Replace the inline UI with `UnifiedFilterBar` while keeping the local `searchTerm` for client-side filtering.

- [ ] **Step 1: Read the current filter state and UI**

Read `src/components/AccessPoints.tsx` at:
- Lines 410-430 (state declarations for `searchTerm`, `selectedSite`, `sites`, `isLoadingSites`)
- Lines 555-575 (`loadSites` function)
- Lines 2060-2120 (inline filter UI in CardHeader)

- [ ] **Step 2: Remove site-related state and loadSites**

Remove these local state declarations (the UnifiedFilterBar manages them internally):
- `const [selectedSite, setSelectedSite] = useState<string>('all');`
- `const [sites, setSites] = useState<Site[]>([]);`
- `const [isLoadingSites, setIsLoadingSites] = useState(false);`
- The `loadSites` async function
- The `loadSites()` call inside `loadData()`

Keep `searchTerm` — it's still used for client-side filtering.

- [ ] **Step 3: Wire site filter to useGlobalFilters**

Add at the top of the component:
```tsx
const { filters } = useGlobalFilters();
```

Replace all references to `selectedSite` with `filters.site`. This includes:
- The `useEffect` that watches `selectedSite` to call `loadAccessPointsForSite()`
- The `loadAccessPointsForSite` function which checks `if (!selectedSite || selectedSite === 'all')`
- The CardDescription conditional on `selectedSite !== 'all'`

- [ ] **Step 4: Replace inline filter UI with UnifiedFilterBar**

In the CardHeader, replace the entire `<div className="flex items-center gap-3">` block containing the Search Input and Site Select (lines ~2081-2113) with:
```tsx
<UnifiedFilterBar
  searchPlaceholder="Search APs by name, serial, model, IP, or site..."
  searchValue={searchTerm}
  onSearchChange={setSearchTerm}
  defaultContextTab="access-point"
  showEnvironment={true}
  showTimeRange={true}
/>
```

- [ ] **Step 5: Update imports**

Add `import { UnifiedFilterBar } from './UnifiedFilterBar';` and `import { useGlobalFilters } from '../hooks/useGlobalFilters';`. Remove unused `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports if they are no longer used elsewhere in the file (check first — the table column selector may still use them).

- [ ] **Step 6: Verify it compiles**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npm run build 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components/AccessPoints.tsx
git commit -m "refactor(ap): replace local search/site filters with UnifiedFilterBar"
```

---

### Task 4: Integrate on ConnectedClients

**Files:**
- Modify: `src/components/ConnectedClients.tsx`

Same pattern as AccessPoints — replace local `searchTerm`, `siteFilter`, `sites` state and inline UI with `UnifiedFilterBar`.

- [ ] **Step 1: Read the current filter state and UI**

Read `src/components/ConnectedClients.tsx` at:
- Lines 30-50 (state declarations)
- Lines 800-860 (filter UI)
- Find the filtering logic that uses `siteFilter` and `searchTerm`

- [ ] **Step 2: Remove site-related state**

Remove these:
- `const [siteFilter, setSiteFilter] = useState<string>('all');`
- `const [sites, setSites] = useState<Site[]>([]);`
- `const [isLoadingSites, setIsLoadingSites] = useState(false);`
- The `loadSites` function and its call

Keep `searchTerm`.

- [ ] **Step 3: Wire site filter to useGlobalFilters**

Add `const { filters } = useGlobalFilters();` and replace all `siteFilter` references with `filters.site`.

- [ ] **Step 4: Replace inline filter UI with UnifiedFilterBar**

Replace the search + site dropdown block (lines ~817-845) with:
```tsx
<UnifiedFilterBar
  searchPlaceholder="Search by hostname, MAC, IP, AP, or site..."
  searchValue={searchTerm}
  onSearchChange={setSearchTerm}
  defaultContextTab="client"
  showEnvironment={true}
  showTimeRange={true}
/>
```

- [ ] **Step 5: Update imports**

Add `UnifiedFilterBar` and `useGlobalFilters` imports. Remove unused Select/site-related imports.

- [ ] **Step 6: Verify it compiles**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npm run build 2>&1 | tail -20`

- [ ] **Step 7: Commit**

```bash
git add src/components/ConnectedClients.tsx
git commit -m "refactor(clients): replace local search/site filters with UnifiedFilterBar"
```

---

### Task 5: Integrate on Network Insights Pages

**Files:**
- Modify: `src/components/NetworkInsightsEnhanced.tsx`
- Modify: `src/components/NetworkInsights.tsx`
- Modify: `src/components/NetworkInsightsSimplified.tsx`

All three import `FilterBar` and use it with simple props. Replace with `UnifiedFilterBar`.

- [ ] **Step 1: Read each file's FilterBar usage**

Read the import line and the `<FilterBar .../>` rendering in each of the three files.

- [ ] **Step 2: Update NetworkInsightsEnhanced.tsx**

Replace import:
```tsx
import { FilterBar } from './FilterBar';
// →
import { UnifiedFilterBar } from './UnifiedFilterBar';
```

Add search state:
```tsx
const [insightsSearch, setInsightsSearch] = useState('');
```

Replace rendering:
```tsx
<FilterBar showSiteFilter={true} showTimeRangeFilter={true} />
// →
<UnifiedFilterBar
  searchPlaceholder="Search insights, anomalies..."
  searchValue={insightsSearch}
  onSearchChange={setInsightsSearch}
  defaultContextTab="ai-insights"
/>
```

- [ ] **Step 3: Update NetworkInsights.tsx**

Same pattern. Replace `FilterBar` import with `UnifiedFilterBar`. Add search state. Replace rendering with:
```tsx
<UnifiedFilterBar
  searchPlaceholder="Search insights..."
  searchValue={insightsSearch}
  onSearchChange={setInsightsSearch}
  defaultContextTab="ai-insights"
/>
```

- [ ] **Step 4: Update NetworkInsightsSimplified.tsx**

Same pattern. This one had `showTimeRangeFilter` disabled, so pass `showTimeRange={false}`:
```tsx
<UnifiedFilterBar
  searchPlaceholder="Search insights..."
  searchValue={insightsSearch}
  onSearchChange={setInsightsSearch}
  defaultContextTab="site"
  showTimeRange={false}
/>
```

- [ ] **Step 5: Verify all compile**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npm run build 2>&1 | tail -20`

- [ ] **Step 6: Commit**

```bash
git add src/components/NetworkInsightsEnhanced.tsx src/components/NetworkInsights.tsx src/components/NetworkInsightsSimplified.tsx
git commit -m "refactor(insights): replace FilterBar with UnifiedFilterBar on all Network Insights pages"
```

---

### Task 6: Delete Deprecated Components

**Files:**
- Delete: `src/components/FilterBar.tsx`
- Delete: `src/components/ContextualInsightsSelector.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -r "import.*FilterBar\|import.*ContextualInsightsSelector" src/`

Expected: No results. If any remain, fix them first.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/FilterBar.tsx
rm src/components/ContextualInsightsSelector.tsx
```

- [ ] **Step 3: Final build check**

Run: `cd "/Users/m4pro/Library/CloudStorage/OneDrive-ExtremeNetworks,Inc/Visual Studio/AURA" && npm run build 2>&1 | tail -20`

Expected: Clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add -u src/components/FilterBar.tsx src/components/ContextualInsightsSelector.tsx
git commit -m "chore: delete deprecated FilterBar and ContextualInsightsSelector

Replaced by UnifiedFilterBar across all pages."
```

---

### Task 7: Smoke Test

- [ ] **Step 1: Start dev server and test each page**

Run: `npm run dev`

Manually verify on each page:
1. **Dashboard** — UnifiedFilterBar renders with context selector, environment, time range
2. **Access Points** — Search filters APs by name/serial/model/IP. Context selector defaults to AP tab.
3. **Connected Clients** — Search filters clients. Context selector defaults to Client tab.
4. **Network Insights Enhanced** — Context selector defaults to AI Insights tab.
5. **Network Insights** — Same as above.
6. **Network Insights Simplified** — Time range dropdown hidden.

- [ ] **Step 2: Test context selector popover**

Click the context selector on any page:
- Tabs switch correctly (AI Insights, Site, AP, Switch, Client)
- Search within popover filters items
- Selecting a site/AP/client updates the page data
- "All" option resets selection

- [ ] **Step 3: Test filter reset**

Click the "X" button next to the active filter badge:
- All global filters reset to defaults
- Search input clears
- Context selector resets
