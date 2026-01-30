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
import { Search, Sparkles, Building, Radio, Network, Users, ChevronDown, Check, Settings2 } from 'lucide-react';
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
}

interface ContextualInsightsSelectorProps {
  activeTab?: SelectorTab;
  selectedId?: string;
  onTabChange?: (tab: SelectorTab) => void;
  onSelectionChange?: (tab: SelectorTab, id: string | null, name?: string) => void;
  className?: string;
}

const tabs: { id: SelectorTab; label: string; shortLabel: string; icon: React.ElementType; beta?: boolean }[] = [
  { id: 'ai-insights', label: 'AI Insights', shortLabel: 'AI Insights', icon: Sparkles },
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
          const apItems: SelectorItem[] = [
            { id: 'all', name: 'All Access Points', subtitle: `${aps.length} APs` }
          ];
          aps.slice(0, 50).forEach((ap: any) => {
            apItems.push({
              id: ap.serialNumber || ap.id,
              name: ap.displayName || ap.name || ap.serialNumber,
              subtitle: ap.siteName || ap.model || undefined,
              status: ap.connectionState === 'Connected' || ap.status === 'online' ? 'online' : 'offline'
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
              switchItems.push({
                id: sw.serialNumber || sw.id,
                name: sw.displayName || sw.name || sw.serialNumber,
                subtitle: sw.siteName || sw.model || undefined,
                status: sw.connectionState === 'Connected' || sw.status === 'online' ? 'online' : 'offline'
              });
            });
            setItems(switchItems);
          } catch {
            setItems([{ id: 'all', name: 'All Switches', subtitle: 'No switches available' }]);
          }
          break;

        case 'client':
          const clients = await apiService.getStations();
          const clientItems: SelectorItem[] = [
            { id: 'all', name: 'All Clients', subtitle: `${clients.length} connected` }
          ];
          clients.slice(0, 50).forEach((client: any) => {
            clientItems.push({
              id: client.macAddress || client.id,
              name: client.hostName || client.macAddress,
              subtitle: client.ssid || client.serviceName || undefined,
              status: 'online' as const
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
    // Don't reset selection when switching tabs - let user browse
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
      item.subtitle?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  // Get current display text for trigger
  const currentTabInfo = tabs.find(t => t.id === currentTab);
  const CurrentIcon = currentTabInfo?.icon || Sparkles;
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
      <PopoverContent className="w-[420px] p-0" align="start">
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

        {/* Search Box */}
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

        {/* Items List */}
        <ScrollArea className="h-[240px]">
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
                    "w-full text-left px-2 py-2 rounded-md transition-colors flex items-center gap-2",
                    "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                    selectedItemId === item.id && currentTab === tabs.find(t => t.id === currentTab)?.id && "bg-primary/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{item.name}</span>
                      {item.status && item.id !== 'all' && (
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                          item.status === 'online' && "bg-green-500",
                          item.status === 'offline' && "bg-red-500",
                          item.status === 'warning' && "bg-amber-500"
                        )} />
                      )}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                    )}
                  </div>
                  {selectedItemId === item.id && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
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
