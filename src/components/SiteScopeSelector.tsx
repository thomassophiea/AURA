/**
 * Site Scope Selector Component
 *
 * Dropdown selector for choosing which site to scope all dashboard content to.
 * Uses popover with search and site list.
 */

import { useState, useEffect, useMemo } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Search, Building, ChevronDown, Check, Settings2 } from 'lucide-react';
import { cn } from './ui/utils';
import { apiService, Site } from '../services/api';
import { getSiteDisplayName } from '../contexts/SiteContext';
import { ContextConfigModal } from './ContextConfigModal';

interface SiteItem {
  id: string;
  name: string;
  subtitle?: string;
}

interface SiteScopeSelectorProps {
  selectedSiteId?: string | null;
  onSiteChange?: (siteId: string | null, siteName: string) => void;
  className?: string;
}

export function SiteScopeSelector({
  selectedSiteId = null,
  onSiteChange,
  className = ''
}: SiteScopeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(selectedSiteId);
  const [currentSiteName, setCurrentSiteName] = useState<string>('All Sites');
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  // Load sites when popover opens
  useEffect(() => {
    if (open && sites.length === 0) {
      loadSites();
    }
  }, [open]);

  const loadSites = async () => {
    setLoading(true);
    try {
      const siteData = await apiService.getSites();
      const siteItems: SiteItem[] = [
        { id: 'all', name: 'All Sites', subtitle: `${siteData.length} sites` }
      ];
      siteData.forEach((site: Site) => {
        siteItems.push({
          id: site.id,
          name: getSiteDisplayName(site),
          subtitle: site.siteGroup || undefined
        });
      });
      setSites(siteItems);
    } catch (error) {
      console.warn('[SiteScopeSelector] Failed to load sites:', error);
      setSites([{ id: 'all', name: 'All Sites', subtitle: 'Unable to load sites' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSiteSelect = (site: SiteItem) => {
    const newId = site.id === 'all' ? null : site.id;
    setCurrentSiteId(newId);
    setCurrentSiteName(site.name);
    onSiteChange?.(newId, site.name);
    setOpen(false);
  };

  // Filter sites based on search query
  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) return sites;
    const query = searchQuery.toLowerCase();
    return sites.filter(site =>
      site.name.toLowerCase().includes(query) ||
      site.subtitle?.toLowerCase().includes(query)
    );
  }, [sites, searchQuery]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 justify-between gap-2 px-3 font-normal min-w-[180px] max-w-[260px]"
          >
            <div className="flex items-center gap-2 truncate">
              <Building className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{currentSiteName}</span>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          {/* Search Box */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Sites List */}
          <ScrollArea className="h-[280px]">
            <div className="p-1">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Loading sites...
                  </div>
                </div>
              ) : filteredSites.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  {searchQuery ? 'No sites found' : 'No sites available'}
                </div>
              ) : (
                filteredSites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => handleSiteSelect(site)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2",
                      "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                      (currentSiteId === site.id || (currentSiteId === null && site.id === 'all')) && "bg-primary/5"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{site.name}</div>
                      {site.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{site.subtitle}</div>
                      )}
                    </div>
                    {(currentSiteId === site.id || (currentSiteId === null && site.id === 'all')) && (
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
