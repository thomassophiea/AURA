/**
 * Global filter state management hook
 *
 * Provides shared filter state across multiple dashboard components.
 * Filters persist in localStorage and sync across tabs.
 */

import { useState, useEffect } from 'react';

import { DEFAULT_TIME_RANGE_TOKEN, normalizeTimeRangeToken } from '../lib/timeRange';

export interface GlobalFilters {
  site: string;
  /**
   * Time-range token from `src/lib/timeRange.ts` — a rolling window ('24h') or
   * a local calendar day ('day-1'). This is the app's single time selection:
   * because it lives here it survives navigation between views, and every page
   * resolves it through `resolveTimeRange` rather than interpreting it locally.
   */
  timeRange: string;
  environment: string; // 'all' | environment ID (e.g., 'lab', 'production')
  dateFrom?: Date;
  dateTo?: Date;
}

const STORAGE_KEY = 'aura_global_filters';

const defaultFilters: GlobalFilters = {
  site: 'all',
  timeRange: DEFAULT_TIME_RANGE_TOKEN,
  environment: 'all'
};

// Global state (shared across all hook instances)
let globalState: GlobalFilters = { ...defaultFilters };
const listeners = new Set<(filters: GlobalFilters) => void>();

// Debounce timer — rapid filter changes (e.g. quick site/time-range switching)
// are coalesced so components only re-render and fire API calls once per burst.
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const NOTIFY_DEBOUNCE_MS = 300;

// Load from localStorage on initialization
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    globalState = { ...defaultFilters, ...parsed };

    // Convert date strings back to Date objects
    if (parsed.dateFrom) globalState.dateFrom = new Date(parsed.dateFrom);
    if (parsed.dateTo) globalState.dateTo = new Date(parsed.dateTo);

    // A token stored by an earlier build ('30d', 'custom') is migrated rather
    // than trusted. An unresolvable token would leave the dashboard unable to
    // compute a window at all on the very first render after an upgrade.
    globalState.timeRange = normalizeTimeRangeToken(globalState.timeRange);
  }
} catch (error) {
  console.warn('[GlobalFilters] Failed to load from localStorage:', error);
}

/**
 * Notify all listeners of filter changes (immediate — used for resets).
 */
function notifyListeners() {
  listeners.forEach(listener => listener(globalState));

  // Persist to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
  } catch (error) {
    console.warn('[GlobalFilters] Failed to save to localStorage:', error);
  }
}

/**
 * Debounced notify — coalesces rapid changes so components only re-render
 * once per burst (e.g. quickly switching sites or time ranges).
 */
function notifyListenersDebounced() {
  if (notifyTimer !== null) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyListeners();
  }, NOTIFY_DEBOUNCE_MS);
}

/**
 * Hook for accessing and updating global filters
 */
export function useGlobalFilters() {
  const [filters, setFilters] = useState<GlobalFilters>(globalState);

  useEffect(() => {
    // Register listener
    const listener = (newFilters: GlobalFilters) => {
      setFilters(newFilters);
    };
    listeners.add(listener);

    // Cleanup
    return () => {
      listeners.delete(listener);
    };
  }, []);

  /**
   * Update a single filter value
   */
  const updateFilter = <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K]
  ) => {
    globalState = { ...globalState, [key]: value };
    notifyListenersDebounced();
  };

  /**
   * Update multiple filters at once
   */
  const updateFilters = (updates: Partial<GlobalFilters>) => {
    globalState = { ...globalState, ...updates };
    notifyListenersDebounced();
  };

  /**
   * Reset all filters to defaults
   */
  const resetFilters = () => {
    globalState = { ...defaultFilters };
    notifyListeners();
  };

  /**
   * Reset a specific filter to default
   */
  const resetFilter = <K extends keyof GlobalFilters>(key: K) => {
    globalState = { ...globalState, [key]: defaultFilters[key] };
    notifyListeners();
  };

  return {
    filters,
    updateFilter,
    updateFilters,
    resetFilters,
    resetFilter,
    hasActiveFilters:
      filters.site !== 'all' ||
      filters.timeRange !== DEFAULT_TIME_RANGE_TOKEN ||
      filters.environment !== 'all'
  };
}

/**
 * Get current global filters without subscribing to changes
 */
export function getGlobalFilters(): GlobalFilters {
  return { ...globalState };
}

/**
 * Set global filters without using a hook
 */
export function setGlobalFilters(updates: Partial<GlobalFilters>) {
  globalState = { ...globalState, ...updates };
  notifyListenersDebounced();
}
