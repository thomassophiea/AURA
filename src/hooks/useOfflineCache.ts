/**
 * useOfflineCache - Enhanced cache with versioning, IndexedDB, and expiry
 * Features: schema versioning, configurable TTLs, IndexedDB for large data
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { offlineStorage, CURRENT_SCHEMA_VERSION, DEFAULT_TTL } from '@/services/offlineStorage';

interface CacheConfig {
  ttl?: number;
  preload?: boolean;
  schemaVersion?: number;
}

interface UseOfflineCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  lastUpdated: Date | null;
  isCached: boolean;
  cacheAge: number | null;
  refresh: () => Promise<void>;
  clearCache: () => Promise<void>;
}

const CACHE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export function useOfflineCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  refreshInterval: number = 30000,
  config: CacheConfig = {}
): UseOfflineCacheResult<T> {
  const { ttl, preload = false } = config;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [cacheAge, setCacheAge] = useState<number | null>(null);

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;
  const mountedRef = useRef(true);

  const resolveTTL = useCallback((): number => {
    if (ttl !== undefined) return ttl;
    const keyType = key.split('_')[0] as keyof typeof DEFAULT_TTL;
    return DEFAULT_TTL[keyType] ?? DEFAULT_TTL.default ?? 300000;
  }, [key, ttl]);

  const loadFromCache = useCallback(async (): Promise<boolean> => {
    try {
      const cached = await offlineStorage.get<T>(key);
      if (cached && mountedRef.current) {
        setData(cached.data);
        setLastUpdated(new Date(cached.timestamp));
        setIsCached(true);
        setCacheAge(Date.now() - cached.timestamp);
        return true;
      }
    } catch (e) {
      console.error('[useOfflineCache] Failed to load from cache:', e);
    }
    return false;
  }, [key]);

  const saveToCache = useCallback(
    async (result: T) => {
      try {
        await offlineStorage.set(key, result, resolveTTL());
      } catch (e) {
        console.error('[useOfflineCache] Failed to save to cache:', e);
      }
    },
    [key, resolveTTL]
  );

  const clearCache = useCallback(async () => {
    try {
      await offlineStorage.delete(key);
      setIsCached(false);
      setCacheAge(null);
    } catch (e) {
      console.error('[useOfflineCache] Failed to clear cache:', e);
    }
  }, [key]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (!navigator.onLine) {
      const hasCache = await loadFromCache();
      if (hasCache) {
        setError('Offline - showing cached data');
      } else {
        setError('Offline - no cached data available');
      }
      setLoading(false);
      return;
    }

    try {
      // Only show loading on initial load (no existing data)
      if (isInitialLoad && !data) {
        setLoading(true);
      }
      setError(null);
      const result = await fetchFnRef.current();

      if (!mountedRef.current) return;

      setData(result);
      setLastUpdated(new Date());
      setIsCached(false);
      setCacheAge(null);

      await saveToCache(result);
    } catch (e) {
      if (!mountedRef.current) return;

      const errorMsg = e instanceof Error ? e.message : 'Failed to fetch data';
      setError(errorMsg);

      const hasCache = await loadFromCache();
      if (hasCache) {
        setError(`${errorMsg} - showing cached data`);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [loadFromCache, saveToCache, data]);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      if (preload) {
        await loadFromCache();
      }
      await fetchData(true); // Initial load shows loading state
    };
    init();

    let interval: NodeJS.Timeout | undefined;
    if (refreshInterval > 0) {
      interval = setInterval(() => fetchData(false), refreshInterval); // Refresh doesn't blank screen
    }

    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [key, refreshInterval, preload]);

  useEffect(() => {
    if (cacheAge === null) return;
    const updateAge = setInterval(() => {
      if (lastUpdated) {
        setCacheAge(Date.now() - lastUpdated.getTime());
      }
    }, 60000);
    return () => clearInterval(updateAge);
  }, [lastUpdated, cacheAge]);

  return {
    data,
    loading,
    error,
    isOffline,
    lastUpdated,
    isCached,
    cacheAge,
    refresh: fetchData,
    clearCache,
  };
}

export async function preloadCriticalData(
  preloadConfigs: Array<{ key: string; fetchFn: () => Promise<unknown>; ttl?: number }>
): Promise<void> {
  if (!navigator.onLine) return;

  const preloadPromises = preloadConfigs.map(async ({ key, fetchFn, ttl }) => {
    try {
      const cached = await offlineStorage.get(key);
      if (cached) return;

      const data = await fetchFn();
      await offlineStorage.set(key, data, ttl);
      console.log(`[preloadCriticalData] Preloaded: ${key}`);
    } catch (e) {
      console.error(`[preloadCriticalData] Failed to preload ${key}:`, e);
    }
  });

  await Promise.allSettled(preloadPromises);
}

export function formatCacheAge(ageMs: number | null): string {
  if (ageMs === null) return '';

  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export { CACHE_SCHEMA_VERSION };
