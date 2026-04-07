/**
 * Context Scope Hook - STRICT ENFORCEMENT
 *
 * Provides context-aware data scoping for all insight components.
 * Ensures metrics, counts, and statistics are filtered by the active context
 * (environment, site, AP, client, WLAN) with NO data leakage across scopes.
 *
 * Core principle: Context is authoritative. Every insight query,
 * aggregation, and visualization must be scoped to the active context.
 *
 * STRICT MODE: deny_global_fallback = true
 *   - When a scope is active, NEVER fall back to global/unfiltered data
 *   - On failure: return empty dataset, NOT global data
 *   - On context change: invalidate all cached data, requery
 *   - Log all context violations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGlobalFilters } from './useGlobalFilters';
import { apiService, AccessPoint, Station, Service } from '../services/api';

export type ScopeLevel = 'organization' | 'site' | 'ap' | 'client' | 'wlan';

export interface ContextScope {
  level: ScopeLevel;
  siteId: string | null;
  siteName: string | null;
  environment: string; // 'all' or specific environment ID
  label: string;
  isSiteScoped: boolean;
  isEnvironmentScoped: boolean;
  /** Fingerprint changes when any scope dimension changes - use for cache invalidation */
  contextFingerprint: string;
}

interface ScopedData {
  accessPoints: AccessPoint[];
  stations: Station[];
  services: Service[];
  loading: boolean;
  error: string | null;
  lastRefresh: number;
  /** Context fingerprint at time of last successful fetch */
  dataFingerprint: string;
}

// Cache resolved site names to avoid repeated lookups
const siteNameCache = new Map<string, string>();

// Violation log (console + retained for debugging)
const contextViolations: Array<{ timestamp: number; message: string; scope: string }> = [];

function logViolation(message: string, scope: string): void {
  const entry = { timestamp: Date.now(), message, scope };
  contextViolations.push(entry);
  if (contextViolations.length > 100) contextViolations.shift();
  console.warn(`[ContextScope VIOLATION] ${message} | scope=${scope}`);
}

function buildFingerprint(site: string, environment: string): string {
  return `${environment}::${site}`;
}

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
  const isEnvironmentScoped = filters.environment !== 'all';
  const contextFingerprint = buildFingerprint(filters.site, filters.environment);

  let label = 'All Sites';
  if (isSiteScoped) {
    label = siteName ? `Site: ${siteName}` : `Site: ${filters.site}`;
  }
  if (isEnvironmentScoped) {
    label = `${filters.environment.charAt(0).toUpperCase() + filters.environment.slice(1)} / ${label}`;
  }

  return {
    level: isSiteScoped ? 'site' : 'organization',
    siteId: isSiteScoped ? filters.site : null,
    siteName: isSiteScoped ? siteName : null,
    environment: filters.environment,
    label,
    isSiteScoped,
    isEnvironmentScoped,
    contextFingerprint
  };
}

/**
 * Hook that provides context-scoped data (APs, stations, services).
 * Automatically refetches when context changes (cache invalidation).
 *
 * STRICT MODE enforced:
 *   - Site-scoped: only returns data for that site, NEVER global
 *   - On API failure: returns EMPTY dataset, NOT global fallback
 *   - On context change: immediately invalidates and refetches
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
    lastRefresh: 0,
    dataFingerprint: ''
  });
  const abortRef = useRef<AbortController | null>(null);
  const lastFingerprintRef = useRef<string>('');

  const fetchScopedData = useCallback(async () => {
    const currentFingerprint = buildFingerprint(filters.site, filters.environment);

    // Cache invalidation: if context changed, clear data immediately
    if (currentFingerprint !== lastFingerprintRef.current) {
      setData({
        accessPoints: [],
        stations: [],
        services: [],
        loading: true,
        error: null,
        lastRefresh: 0,
        dataFingerprint: ''
      });
      lastFingerprintRef.current = currentFingerprint;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const siteId = filters.site !== 'all' ? filters.site : undefined;

      // Fetch APs, stations, and services with STRICT site scoping
      const [aps, stations, services] = await Promise.all([
        fetchScopedAPs(siteId),
        fetchScopedStations(siteId),
        fetchScopedServices(siteId)
      ]);

      setData({
        accessPoints: aps,
        stations,
        services,
        loading: false,
        error: null,
        lastRefresh: Date.now(),
        dataFingerprint: currentFingerprint
      });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('[ContextScope] Error fetching scoped data:', error);
        // STRICT: return empty on error, never fall back to global
        setData({
          accessPoints: [],
          stations: [],
          services: [],
          loading: false,
          error: error?.message || 'Failed to load scoped data',
          lastRefresh: Date.now(),
          dataFingerprint: currentFingerprint
        });
      }
    }
  }, [filters.site, filters.environment]);

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
 * STRICT: Fetch APs scoped by site.
 * When site is selected, only returns APs for that site.
 * On failure: returns EMPTY, never global.
 */
async function fetchScopedAPs(siteId?: string): Promise<AccessPoint[]> {
  if (!siteId) {
    return apiService.getAccessPoints();
  }

  try {
    const aps = await apiService.getAccessPointsBySite(siteId);
    return aps;
  } catch (error) {
    logViolation(`AP fetch failed for site ${siteId}, returning empty`, `site:${siteId}`);
    return []; // STRICT: empty on failure
  }
}

/**
 * STRICT: Fetch stations scoped by site.
 * When site is selected, only returns stations for that site.
 * On failure: returns EMPTY, never global.
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
    // Fall through to client-side filtering of site-scoped data only
  }

  // Fallback: fetch all and filter by site - but ONLY return matches
  try {
    const allStations = await apiService.getStations();
    const site = await apiService.getSiteById(siteId);
    const siteName = site?.name || site?.siteName || siteId;

    const filtered = allStations.filter(s =>
      s.siteName === siteName ||
      s.siteId === siteId ||
      s.siteName === siteId
    );

    // STRICT: return filtered results even if empty - no global fallback
    return filtered;
  } catch (error) {
    logViolation(`Station fetch failed for site ${siteId}, returning empty`, `site:${siteId}`);
    return []; // STRICT: empty on failure
  }
}

/**
 * STRICT: Fetch services scoped by site.
 * When site is selected, only returns services for that site.
 * On failure: returns EMPTY, never global.
 */
async function fetchScopedServices(siteId?: string): Promise<Service[]> {
  if (!siteId) {
    return apiService.getServices();
  }

  try {
    const services = await apiService.getServicesBySite(siteId);
    if (services.length > 0) {
      return services;
    }
  } catch {
    // Fall through to client-side filtering
  }

  // Fallback: fetch all and filter by site
  try {
    const allServices = await apiService.getServices();
    const site = await apiService.getSiteById(siteId);
    const siteName = site?.name || site?.siteName || siteId;

    const filtered = allServices.filter((s: any) =>
      s.siteName === siteName ||
      s.site === siteId ||
      s.site === siteName ||
      s.location === siteName
    );

    // STRICT: return filtered results even if empty
    return filtered;
  } catch (error) {
    logViolation(`Service fetch failed for site ${siteId}, returning empty`, `site:${siteId}`);
    return []; // STRICT: empty on failure
  }
}

/**
 * STRICT: Filter APs by context. Returns only matches, never global.
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
 * STRICT: Filter stations by context. Returns only matches, never global.
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
 * STRICT: Filter services by context. Returns only matches, never global.
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

/**
 * Get site-associated AP serial numbers/names for filtering alerts/events.
 * Returns a Set of lowercase device identifiers.
 * STRICT: returns empty set on failure, never null.
 */
export async function getSiteDeviceIdentifiers(siteId: string): Promise<Set<string>> {
  const identifiers = new Set<string>();
  try {
    const siteAPs = await apiService.getAccessPointsBySite(siteId);
    siteAPs.forEach(ap => {
      if (ap.name) identifiers.add(ap.name.toLowerCase());
      if (ap.serialNumber) identifiers.add(ap.serialNumber.toLowerCase());
      if ((ap as any).hostname) identifiers.add((ap as any).hostname.toLowerCase());
      if ((ap as any).macAddress) identifiers.add((ap as any).macAddress.toLowerCase());
    });
  } catch (error) {
    logViolation(`Failed to resolve device identifiers for site ${siteId}`, `site:${siteId}`);
  }
  return identifiers;
}

/**
 * STRICT: Filter alerts/events by site device correlation.
 * Only includes items whose source/device matches an AP at the site.
 * Items with source='system' are EXCLUDED in site-scoped mode (they are org-level).
 */
export function filterBySiteDevices<T extends { source: string; device?: string; affectedDevices?: string[] }>(
  items: T[],
  siteDeviceIds: Set<string>
): T[] {
  if (siteDeviceIds.size === 0) {
    // STRICT: if we have no device IDs for this site, return empty
    // (no devices = no alerts can be correlated)
    return [];
  }

  return items.filter(item => {
    const source = item.source.toLowerCase();
    const device = (item.device || '').toLowerCase();
    const affected = (item.affectedDevices || []).map(d => d.toLowerCase());

    // STRICT: system-wide alerts are NOT shown in site-scoped views
    // Only show alerts correlated to devices at this site
    return (
      siteDeviceIds.has(source) ||
      siteDeviceIds.has(device) ||
      affected.some(d => siteDeviceIds.has(d))
    );
  });
}

/** Export violation log for debugging */
export function getContextViolations() {
  return [...contextViolations];
}
