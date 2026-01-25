/**
 * useOfflineCache - Cache data for offline viewing
 * Stores last successful fetch in localStorage
 */

import { useState, useEffect } from 'react';

interface CacheMetadata {
  timestamp: number;
  data: any;
}

export function useOfflineCache<T>(key: string, fetchFn: () => Promise<T>, refreshInterval: number = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load from cache on mount
  useEffect(() => {
    const cached = localStorage.getItem(`cache_${key}`);
    if (cached) {
      try {
        const parsed: CacheMetadata = JSON.parse(cached);
        setData(parsed.data);
        setLastUpdated(new Date(parsed.timestamp));
      } catch (e) {
        console.error('Failed to parse cache:', e);
      }
    }
  }, [key]);

  // Listen for online/offline events
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

  // Fetch data
  const fetchData = async () => {
    if (!navigator.onLine) {
      setError('Offline - showing cached data');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      setData(result);
      setLastUpdated(new Date());

      // Cache the result
      const cacheData: CacheMetadata = {
        timestamp: Date.now(),
        data: result,
      };
      localStorage.setItem(`cache_${key}`, JSON.stringify(cacheData));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to fetch data';
      setError(errorMsg);

      // If we have cached data, show it
      if (!data) {
        const cached = localStorage.getItem(`cache_${key}`);
        if (cached) {
          try {
            const parsed: CacheMetadata = JSON.parse(cached);
            setData(parsed.data);
            setLastUpdated(new Date(parsed.timestamp));
          } catch (parseError) {
            console.error('Failed to parse cache:', parseError);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh
  useEffect(() => {
    fetchData();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [key, refreshInterval]);

  return {
    data,
    loading,
    error,
    isOffline,
    lastUpdated,
    refresh: fetchData,
  };
}
