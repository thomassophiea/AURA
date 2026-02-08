/**
 * Context Scope Hook
 *
 * Provides context-aware data scoping for all insight components.
 * Ensures metrics, counts, and statistics are filtered by the active context
 * (site, AP, client, WLAN) with no data leakage across scopes.
 *
 * Core principle: Context is authoritative. Every insight query,
 * aggregation, and visualization must be scoped to the active context.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGlobalFilters } from './useGlobalFilters';
import { apiService, AccessPoint, Station, Service } from '../services/api';

export type ScopeLevel = 'organization' | 'site' | 'ap' | 'client' | 'wlan';

export interface ContextScope {
  level: ScopeLevel;
  siteId: string | null;
  siteName: string | null;
  label: string; // e.g., "All Sites" or "Site: Pete Miller"
  isSiteScoped: boolean;
}

interface ScopedData {
  accessPoints: AccessPoint[];
  stations: Station[];
  services: Service[];
  loading: boolean;
  error: string | null;
  lastRefresh: number;
}

// Cache resolved site names to avoid repeated lookups
const siteNameCache = new Map<string, string>();

/**
 * Hook that provides the current context scope and label.
 * Use this for components that need to know the scope but fetch data themselves.
 */
export function useContextScope(): ContextScope {
  const { filters } = useGlobalFilters();
  const [siteName, setSiteName] = useState<string | null>(null);

  useEffect(() => {
    if (filters.site === 'all') {
      setSiteName(null);
      return;
    }

    // Check cache first
    const cached = siteNameCache.get(filters.site);
    if (cached) {
      setSiteName(cached);
      return;
    }

    // Resolve site name from ID
    apiService.getSiteById(filters.site).then(site => {
      const name = site?.name || site?.siteName || filters.site;
      siteNameCache.set(filters.site, name);
      setSiteName(name);
    }).catch(() => {
      setSiteName(filters.site);
    });
  }, [filters.site]);

  const isSiteScoped = filters.site !== 'all';

  return {
    level: isSiteScoped ? 'site' : 'organization',
    siteId: isSiteScoped ? filters.site : null,
    siteName: isSiteScoped ? siteName : null,
    label: isSiteScoped ? (siteName ? `Site: ${siteName}` : `Site: ${filters.site}`) : 'All Sites',
    isSiteScoped
  };
}

/**
 * Hook that provides context-scoped data (APs, stations, services).
 * Automatically refetches when context changes.
 * Use this for components that need pre-filtered datasets.
 */
export function useContextScopedData(refreshInterval?: number): ScopedData & { scope: ContextScope; refresh: () => void } {
  const scope = useContextScope();
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<ScopedData>({
    accessPoints: [],
    stations: [],
    services: [],
    loading: true,
    error: null,
    lastRefresh: 0
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchScopedData = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const siteId = filters.site !== 'all' ? filters.site : undefined;

      // Fetch APs, stations, and services with site scoping
      const [aps, stations, services] = await Promise.all([
        siteId
          ? apiService.getAccessPointsBySite(siteId)
          : apiService.getAccessPoints(),
        fetchScopedStations(siteId),
        fetchScopedServices(siteId)
      ]);

      setData({
        accessPoints: aps,
        stations,
        services,
        loading: false,
        error: null,
        lastRefresh: Date.now()
      });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('[ContextScope] Error fetching scoped data:', error);
        setData(prev => ({
          ...prev,
          loading: false,
          error: error?.message || 'Failed to load data'
        }));
      }
    }
  }, [filters.site]);

  useEffect(() => {
    fetchScopedData();

    if (refreshInterval) {
      const interval = setInterval(fetchScopedData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchScopedData, refreshInterval]);

  return { ...data, scope, refresh: fetchScopedData };
}

/**
 * Fetch stations scoped by site.
 * When a site is selected, filters stations to only those belonging to the site.
 */
async function fetchScopedStations(siteId?: string): Promise<Station[]> {
  if (!siteId) {
    return apiService.getStations();
  }

  // Try site-specific stations endpoint first
  try {
    const response = await apiService.makeAuthenticatedRequest(
      `/v3/sites/${siteId}/stations`,
      { method: 'GET' },
      15000
    );
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data) ? data : (data.stations || data.clients || data.data || []);
    }
  } catch {
    // Fall through to manual filtering
  }

  // Fallback: fetch all and filter by site
  const allStations = await apiService.getStations();
  const site = await apiService.getSiteById(siteId);
  const siteName = site?.name || site?.siteName || siteId;

  return allStations.filter(s =>
    s.siteName === siteName ||
    s.siteId === siteId ||
    s.siteName === siteId
  );
}

/**
 * Fetch services scoped by site.
 * When a site is selected, only returns services assigned to that site.
 */
async function fetchScopedServices(siteId?: string): Promise<Service[]> {
  if (!siteId) {
    return apiService.getServices();
  }

  try {
    // Use the site-specific services method which traverses device groups -> profiles -> services
    const services = await apiService.getServicesBySite(siteId);
    if (services.length > 0) {
      return services;
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: fetch all services and filter by site name
  const allServices = await apiService.getServices();
  const site = await apiService.getSiteById(siteId);
  const siteName = site?.name || site?.siteName || siteId;

  return allServices.filter((s: any) =>
    s.siteName === siteName ||
    s.site === siteId ||
    s.site === siteName ||
    s.location === siteName
  );
}

/**
 * Filter an existing array of APs by the current context.
 * Useful when data is already fetched and needs re-filtering.
 */
export function filterAPsByContext(aps: AccessPoint[], siteId?: string | null, siteName?: string | null): AccessPoint[] {
  if (!siteId) return aps;
  return aps.filter(ap => {
    const apAny = ap as any;
    return (
      apAny.hostSite === siteName ||
      apAny.hostSite === siteId ||
      apAny.siteId === siteId ||
      apAny.siteName === siteName ||
      apAny.siteName === siteId
    );
  });
}

/**
 * Filter an existing array of stations by the current context.
 */
export function filterStationsByContext(stations: Station[], siteId?: string | null, siteName?: string | null): Station[] {
  if (!siteId) return stations;
  return stations.filter(s =>
    s.siteName === siteName ||
    s.siteId === siteId ||
    s.siteName === siteId
  );
}

/**
 * Filter an existing array of services by the current context.
 */
export function filterServicesByContext(services: Service[], siteId?: string | null, siteName?: string | null): Service[] {
  if (!siteId) return services;
  return services.filter((s: any) =>
    s.siteName === siteName ||
    s.site === siteId ||
    s.site === siteName ||
    s.location === siteName
  );
}
