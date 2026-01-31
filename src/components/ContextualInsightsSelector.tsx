/**
 * Contextual Insights Selector Component
 *
 * Professional dropdown selector for filtering by AI Insights, Site, Access Point, Switch, or Client.
 * Compact trigger button that opens a popover with tabs, search, and filterable list.
 */

import { useState, useEffect, useMemo } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Search, Brain, Building, Radio, Network, Users, ChevronDown, Check, Settings2, Wifi, Signal, MapPin, Clock } from 'lucide-react';
import { cn } from './ui/utils';
import { apiService, Site } from '../services/api';
import { getSiteDisplayName } from '../contexts/SiteContext';
import { ContextConfigModal } from './ContextConfigModal';

export type SelectorTab = 'ai-insights' | 'site' | 'access-point' | 'switch' | 'client';

interface SelectorItem {
  id: string;
  name: string;
  subtitle?: string;
  status?: 'online' | 'offline' | 'warning';
  // Extended AP fields
  model?: string;
  ipAddress?: string;
  clients?: number;
  siteName?: string;
  uptime?: string;
  serialNumber?: string;
  // Extended Client fields
  ssid?: string;
  apName?: string;
  rssi?: number;
  vendor?: string;
  macAddress?: string;
  band?: string;
}

interface ContextualInsightsSelectorProps {
  activeTab?: SelectorTab;
  selectedId?: string;
  onTabChange?: (tab: SelectorTab) => void;
  onSelectionChange?: (tab: SelectorTab, id: string | null, name?: string) => void;
  className?: string;
}

const tabs: { id: SelectorTab; label: string; shortLabel: string; icon: React.ElementType; beta?: boolean; noSearch?: boolean }[] = [
  { id: 'ai-insights', label: 'AI Insights', shortLabel: 'AI Insights', icon: Brain, noSearch: true },
  { id: 'site', label: 'Site', shortLabel: 'Site', icon: Building },
  { id: 'access-point', label: 'Access Point', shortLabel: 'AP', icon: Radio },
  { id: 'switch', label: 'Switch', shortLabel: 'Switch', icon: Network, beta: true },
  { id: 'client', label: 'Client', shortLabel: 'Client', icon: Users },
];

export function ContextualInsightsSelector({
  activeTab = 'ai-insights',
  selectedId,
  onTabChange,
  onSelectionChange,
  className = ''
}: ContextualInsightsSelectorProps) {
  const [open, setOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<SelectorTab>(activeTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<SelectorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(selectedId || null);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  // Load items based on active tab
  useEffect(() => {
    if (open) {
      loadItems(currentTab);
    }
  }, [currentTab, open]);

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

        case 'site':
          const sites = await apiService.getSites();
          const siteItems: SelectorItem[] = [
            { id: 'all', name: 'All Sites', subtitle: `${sites.length} sites` }
          ];
          sites.forEach((site: Site) => {
            siteItems.push({
              id: site.id,
              name: getSiteDisplayName(site),
              subtitle: site.siteGroup || undefined,
              status: 'online' as const
            });
          });
          setItems(siteItems);
          break;

        case 'access-point':
          const aps = await apiService.getAccessPoints();
          // Also fetch stations to count clients per AP
          let stationsForAPs: any[] = [];
          try {
            stationsForAPs = await apiService.getStations();
          } catch (e) {
            console.warn('[ContextualInsightsSelector] Could not fetch stations for client count');
          }

          // Build client count map by AP serial
          const clientCountByAP: Record<string, number> = {};
          stationsForAPs.forEach((station: any) => {
            const apSerial = station.apSerialNumber || station.apSerial;
            if (apSerial) {
              clientCountByAP[apSerial] = (clientCountByAP[apSerial] || 0) + 1;
            }
          });

          const onlineCount = aps.filter((ap: any) => {
            const statusStr = (ap.status || ap.connectionState || ap.operationalState || '').toLowerCase();
            return statusStr === 'inservice' || statusStr.includes('up') || statusStr.includes('online') || statusStr.includes('connected') || ap.isUp === true || ap.online === true;
          }).length;

          const apItems: SelectorItem[] = [
            { id: 'all', name: 'All Access Points', subtitle: `${aps.length} APs (${onlineCount} online)` }
          ];

          // Format uptime helper
          const formatUptime = (seconds: number): string => {
            if (!seconds || seconds <= 0) return '';
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            if (days > 0) return `${days}d ${hours}h`;
            const mins = Math.floor((seconds % 3600) / 60);
            return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          };

          aps.forEach((ap: any) => {
            // Determine AP name - prioritize friendly names over serial
            const apName = ap.displayName || ap.name || ap.hostname || ap.serialNumber;

            // Determine online status using same logic as DashboardEnhanced
            const statusStr = (ap.status || ap.connectionState || ap.operationalState || '').toLowerCase();
            const isUp = ap.isUp;
            const isOnline = ap.online;
            const apIsOnline = (
              statusStr === 'inservice' ||
              statusStr.includes('up') ||
              statusStr.includes('online') ||
              statusStr.includes('connected') ||
              isUp === true ||
              isOnline === true ||
              (!statusStr && isUp !== false && isOnline !== false)
            );

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
              serialNumber: serialNum
            });
          });
          setItems(apItems);
          break;

        case 'switch':
          try {
            const switches = await apiService.getSwitches?.() || [];
            const switchItems: SelectorItem[] = [
              { id: 'all', name: 'All Switches', subtitle: `${switches.length} switches` }
            ];
            switches.slice(0, 50).forEach((sw: any) => {
              const swName = sw.displayName || sw.name || sw.hostname || sw.serialNumber;
              const swStatusStr = (sw.status || sw.connectionState || sw.operationalState || '').toLowerCase();
              const swIsOnline = (
                swStatusStr === 'inservice' ||
                swStatusStr.includes('up') ||
                swStatusStr.includes('online') ||
                swStatusStr.includes('connected') ||
                sw.isUp === true ||
                sw.online === true ||
                (!swStatusStr && sw.isUp !== false && sw.online !== false)
              );
              switchItems.push({
                id: sw.serialNumber || sw.id,
                name: swName,
                subtitle: sw.siteName || sw.model || undefined,
                status: swIsOnline ? 'online' : 'offline'
              });
            });
            setItems(switchItems);
          } catch {
            setItems([{ id: 'all', name: 'All Switches', subtitle: 'No switches available' }]);
          }
          break;

        case 'client':
          const clients = await apiService.getStations();

          // Determine band from channel or frequency
          const getBandFromChannel = (channel: number | undefined, freq: string | undefined): string => {
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
          };

          const clientItems: SelectorItem[] = [
            { id: 'all', name: 'All Clients', subtitle: `${clients.length} connected` }
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
              ipAddress: client.ipAddress
            });
          });
          setItems(clientItems);
          break;
      }
    } catch (error) {
      console.warn('[ContextualInsightsSelector] Failed to load items:', error);
      setItems([{ id: 'all', name: 'All', subtitle: 'Unable to load' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: SelectorTab) => {
    setCurrentTab(tab);
    setSearchQuery('');

    // AI Insights doesn't need selection - just select the tab and close
    if (tab === 'ai-insights') {
      setSelectedItemId(null);
      setSelectedItemName(null);
      onTabChange?.(tab);
      onSelectionChange?.(tab, null, undefined);
      setOpen(false);
    }
  };

  const handleItemSelect = (item: SelectorItem) => {
    setSelectedItemId(item.id);
    setSelectedItemName(item.id === 'all' ? null : item.name);
    onTabChange?.(currentTab);
    onSelectionChange?.(currentTab, item.id === 'all' ? null : item.id, item.name);
    setOpen(false);
  };

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
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
  }, [items, searchQuery]);

  // Get current display text for trigger
  const currentTabInfo = tabs.find(t => t.id === currentTab);
  const CurrentIcon = currentTabInfo?.icon || Brain;
  const displayText = selectedItemName || currentTabInfo?.label || 'Select Context';

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 justify-between gap-2 px-3 font-normal min-w-[200px] max-w-[280px]"
          >
            <div className="flex items-center gap-2 truncate">
              <CurrentIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{displayText}</span>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        {/* Tabs - horizontal layout */}
        <div className="flex border-b overflow-x-auto">
          {tabs.map((tab) => (
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
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400">
                  Beta
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Search Box - Not shown for AI Insights */}
        {currentTab !== 'ai-insights' && (
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${currentTabInfo?.label || ''}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        )}

        {/* Items List - Not shown for AI Insights */}
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
                {searchQuery ? 'No matches found' : 'No items available'}
              </div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemSelect(item)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3",
                    "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                    selectedItemId === item.id && currentTab === tabs.find(t => t.id === currentTab)?.id && "bg-primary/5"
                  )}
                >
                  {/* Status indicator for non-all items */}
                  {item.id !== 'all' && (
                    <div className="pt-1">
                      <span className={cn(
                        "block w-2 h-2 rounded-full flex-shrink-0",
                        item.status === 'online' && "bg-green-500",
                        item.status === 'offline' && "bg-red-500",
                        item.status === 'warning' && "bg-amber-500"
                      )} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Main name row */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{item.name}</span>
                      {/* Band badge for clients */}
                      {item.band && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal">
                          {item.band}
                        </Badge>
                      )}
                    </div>

                    {/* AP-specific details */}
                    {currentTab === 'access-point' && item.id !== 'all' && (
                      <div className="mt-1 space-y-0.5">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {item.model && (
                            <span className="truncate max-w-[120px]">{item.model}</span>
                          )}
                          {item.ipAddress && (
                            <span className="font-mono text-[10px]">{item.ipAddress}</span>
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

                    {/* Client-specific details */}
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
                              item.rssi >= -60 ? "text-green-600" : item.rssi >= -70 ? "text-amber-600" : "text-red-600"
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

                    {/* Site-specific details */}
                    {currentTab === 'site' && item.id !== 'all' && item.subtitle && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</div>
                    )}

                    {/* Switch-specific details */}
                    {currentTab === 'switch' && item.id !== 'all' && item.subtitle && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</div>
                    )}

                    {/* All items subtitle */}
                    {item.id === 'all' && item.subtitle && (
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

      {/* Context Configuration Modal */}
      <ContextConfigModal
        open={isContextModalOpen}
        onOpenChange={setIsContextModalOpen}
      />
    </div>
  );
}
