/**
 * Universal FilterBar Component
 *
 * Reusable filter bar with site and time range selections.
 * Supports global state synchronization across dashboards.
 */

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Building, Clock, X, Calendar, Settings2, Layers } from 'lucide-react';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { apiService, Site } from '../services/api';
import { Badge } from './ui/badge';
import { getSiteDisplayName } from '../contexts/SiteContext';
import { useSiteContexts } from '../hooks/useSiteContexts';
import { ContextConfigModal } from './ContextConfigModal';

export interface FilterBarProps {
  showSiteFilter?: boolean;
  showTimeRangeFilter?: boolean;
  showContextFilter?: boolean;
  customFilters?: React.ReactNode;
  onFilterChange?: (filters: { site: string; timeRange: string; context?: string }) => void;
  className?: string;
}

export function FilterBar({
  showSiteFilter = true,
  showTimeRangeFilter = true,
  showContextFilter = false,
  customFilters,
  onFilterChange,
  className = ''
}: FilterBarProps) {
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useGlobalFilters();
  const { contexts, selectedContextId, selectContext } = useSiteContexts();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  useEffect(() => {
    if (showSiteFilter) {
      loadSites();
    }
  }, [showSiteFilter]);

  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        site: filters.site,
        timeRange: filters.timeRange,
        context: selectedContextId
      });
    }
  }, [filters.site, filters.timeRange, selectedContextId, onFilterChange]);

  const loadSites = async () => {
    setIsLoadingSites(true);
    try {
      const sitesData = await apiService.getSites();
      setSites(sitesData);
    } catch (error) {
      console.warn('[FilterBar] Failed to load sites:', error);
    } finally {
      setIsLoadingSites(false);
    }
  };

  const timeRangeOptions = [
    { value: '15m', label: 'Last 15 minutes' },
    { value: '1h', label: 'Last hour' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom range' }
  ];

  return (
    <div className={`flex flex-col sm:flex-row gap-4 items-start sm:items-center ${className}`}>
      <div className="flex flex-wrap gap-2 flex-1">
        {/* Site Filter */}
        {showSiteFilter && (
          <div className="flex items-center gap-2">
            <Select
              value={filters.site}
              onValueChange={(value) => updateFilter('site', value)}
              disabled={isLoadingSites}
            >
              <SelectTrigger className="w-48 h-10">
                <Building className="mr-2 h-4 w-4 flex-shrink-0" />
                <SelectValue placeholder="Select Site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {getSiteDisplayName(site)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Time Range Filter */}
        {showTimeRangeFilter && (
          <div className="flex items-center gap-2">
            <Select
              value={filters.timeRange}
              onValueChange={(value) => updateFilter('timeRange', value)}
            >
              <SelectTrigger className="w-48 h-10">
                <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
                <SelectValue placeholder="Select Time Range" />
              </SelectTrigger>
              <SelectContent>
                {timeRangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Context Filter */}
        {showContextFilter && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedContextId || 'all'}
              onValueChange={selectContext}
            >
              <SelectTrigger className="w-56 h-10">
                <Layers className="mr-2 h-4 w-4 flex-shrink-0" />
                <SelectValue>
                  {selectedContextId === 'all' ? 'All Contexts' : contexts.find(c => c.id === selectedContextId)?.name || 'Select Context'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contexts</SelectItem>
                {contexts.length > 0 ? (
                  contexts.map((context) => (
                    <SelectItem key={context.id} value={context.id}>
                      {context.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="loading" disabled>Loading contexts...</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsContextModalOpen(true)}
              className="h-10"
              title="Configure Contexts"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Custom Filters */}
        {customFilters}
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Filters active
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-10"
          >
            <X className="mr-2 h-4 w-4" />
            Clear all
          </Button>
        </div>
      )}

      {/* Context Configuration Modal */}
      {showContextFilter && (
        <ContextConfigModal
          open={isContextModalOpen}
          onOpenChange={setIsContextModalOpen}
        />
      )}
    </div>
  );
}
