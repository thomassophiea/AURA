/**
 * Global filter state management hook
 *
 * Provides shared filter state across multiple dashboard components.
 * Filters persist in localStorage and sync across tabs.
 */

import { useState, useEffect } from 'react';

export interface GlobalFilters {
  site: string;
  timeRange: string;
  environment: string; // 'all' | environment ID (e.g., 'lab', 'production')
  dateFrom?: Date;
  dateTo?: Date;
}

const STORAGE_KEY = 'aura_global_filters';

const defaultFilters: GlobalFilters = {
  site: 'all',
  timeRange: '24h',
  environment: 'all'
};

// Global state (shared across all hook instances)
let globalState: GlobalFilters = { ...defaultFilters };
const listeners = new Set<(filters: GlobalFilters) => void>();

// Load from localStorage on initialization
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    globalState = { ...defaultFilters, ...parsed };

    // Convert date strings back to Date objects
    if (parsed.dateFrom) globalState.dateFrom = new Date(parsed.dateFrom);
    if (parsed.dateTo) globalState.dateTo = new Date(parsed.dateTo);
  }
} catch (error) {
  console.warn('[GlobalFilters] Failed to load from localStorage:', error);
}

/**
 * Notify all listeners of filter changes
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
    notifyListeners();
  };

  /**
   * Update multiple filters at once
   */
  const updateFilters = (updates: Partial<GlobalFilters>) => {
    globalState = { ...globalState, ...updates };
    notifyListeners();
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
    hasActiveFilters: filters.site !== 'all' || filters.timeRange !== '24h' || filters.environment !== 'all'
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
  notifyListeners();
}
