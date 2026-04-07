/**
 * SearchFilterBar — unified search + time range for table pages.
 *
 * One search input (compound tokenized AND) + one time range dropdown.
 * Shared between Access Points and Connected Clients.
 */

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Search, Clock, X, Calendar, Building } from 'lucide-react';
import { cn } from './ui/utils';
import { type TimePreset } from '../hooks/useTimeRangeFilter';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchFilterBarProps {
  /** Search input */
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;

  /** Time range */
  showTimeRange?: boolean;
  timePreset?: TimePreset;
  onTimePresetChange?: (preset: TimePreset) => void;
  onCustomRange?: (from: Date, to: Date) => void;

  /** Site filter */
  showSiteFilter?: boolean;
  sites?: string[];
  selectedSite?: string;
  onSiteChange?: (site: string) => void;

  /** Active filter indicators */
  resultCount?: number;
  totalCount?: number;

  /** Styling */
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SearchFilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  showTimeRange = true,
  timePreset = '24h',
  onTimePresetChange,
  onCustomRange,
  showSiteFilter = false,
  sites = [],
  selectedSite = 'all',
  onSiteChange,
  resultCount,
  totalCount,
  className = '',
}: SearchFilterBarProps) {
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const hasActiveFilters = searchValue.trim().length > 0 || (showTimeRange && timePreset !== '24h') || (showSiteFilter && selectedSite !== 'all');
  const showResultCount = resultCount !== undefined && totalCount !== undefined && hasActiveFilters;

  const handleClear = () => {
    onSearchChange('');
    if (onTimePresetChange) onTimePresetChange('24h');
    if (onSiteChange) onSiteChange('all');
  };

  const handleCustomApply = () => {
    if (customFrom && customTo && onCustomRange) {
      onCustomRange(new Date(customFrom), new Date(customTo));
    }
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)} style={{ maxWidth: '100%' }}>
      {/* Search Input */}
      <div className="relative" style={{ flex: '1 1 0%', minWidth: 200, maxWidth: 480 }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-10"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Time Range Dropdown */}
      {showTimeRange && onTimePresetChange && (
      <div className="shrink-0">
        <Select value={timePreset} onValueChange={(v) => onTimePresetChange(v as TimePreset)}>
          <SelectTrigger className="w-48 h-10">
            <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15m">Last 15 minutes</SelectItem>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Custom Date Range Picker */}
      {showTimeRange && timePreset === 'custom' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-2 shrink-0">
              <Calendar className="h-4 w-4" />
              {customFrom && customTo
                ? `${new Date(customFrom).toLocaleDateString()} – ${new Date(customTo).toLocaleDateString()}`
                : 'Select dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                <Input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                <Input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Site Filter */}
      {showSiteFilter && onSiteChange && (
        <div className="shrink-0">
          <Select value={selectedSite} onValueChange={onSiteChange}>
            <SelectTrigger className="w-48 h-10">
              <Building className="mr-2 h-4 w-4 flex-shrink-0" />
              <SelectValue placeholder="All Sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site} value={site}>
                  {site}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Result Count + Clear */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1.5 shrink-0">
          {showResultCount && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {resultCount} of {totalCount}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 px-2 text-xs text-muted-foreground"
            title="Clear all filters"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
