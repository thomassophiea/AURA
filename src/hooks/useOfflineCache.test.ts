import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOfflineCache, formatCacheAge, preloadCriticalData } from './useOfflineCache';

vi.mock('@/services/offlineStorage', () => ({
  offlineStorage: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  CURRENT_SCHEMA_VERSION: 1,
  DEFAULT_TTL: {
    stations: 300000,
    accessPoints: 300000,
    default: 300000,
  },
}));

import { offlineStorage } from '@/services/offlineStorage';

describe('useOfflineCache', () => {
  const mockFetchFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  describe('initial loading', () => {
    it('should start in loading state', async () => {
      mockFetchFn.mockResolvedValue({ data: 'test' });
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should fetch data on mount', async () => {
      const mockData = { items: [1, 2, 3] };
      mockFetchFn.mockResolvedValue(mockData);
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      expect(mockFetchFn).toHaveBeenCalledTimes(1);
    });

    it('should save fetched data to cache', async () => {
      const mockData = { value: 'cached' };
      mockFetchFn.mockResolvedValue(mockData);
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      expect(offlineStorage.set).toHaveBeenCalledWith(
        'test_key',
        mockData,
        expect.any(Number)
      );
    });
  });

  describe('cache retrieval', () => {
    it('should load from cache when preload is enabled', async () => {
      const cachedData = { cached: true };
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: cachedData,
        timestamp: Date.now() - 60000,
      });
      mockFetchFn.mockResolvedValue({ fresh: true });

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0, { preload: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set isCached when using cached data', async () => {
      const cachedData = { cached: true };
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: cachedData,
        timestamp: Date.now() - 60000,
      });
      mockFetchFn.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.isCached).toBe(true);
      });
    });

    it('should calculate cache age', async () => {
      const timestamp = Date.now() - 120000;
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: { test: 'data' },
        timestamp,
      });
      mockFetchFn.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.cacheAge).toBeGreaterThan(0);
      });
    });
  });

  describe('offline behavior', () => {
    it('should detect offline state', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.isOffline).toBe(true);
      });
    });

    it('should use cached data when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      const cachedData = { offline: true };
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: cachedData,
        timestamp: Date.now(),
      });

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(cachedData);
        expect(result.current.error).toContain('Offline');
      });

      expect(mockFetchFn).not.toHaveBeenCalled();
    });

    it('should show error when offline with no cache', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.error).toContain('no cached data');
      });
    });
  });

  describe('error handling', () => {
    it('should set error on fetch failure', async () => {
      mockFetchFn.mockRejectedValue(new Error('API error'));
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.error).toBe('API error');
      });
    });

    it('should fallback to cache on fetch error', async () => {
      const cachedData = { fallback: true };
      mockFetchFn.mockRejectedValue(new Error('Network failure'));
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: cachedData,
        timestamp: Date.now(),
      });

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(cachedData);
        expect(result.current.error).toContain('showing cached data');
      });
    });
  });

  describe('refresh functionality', () => {
    it('should refresh data when refresh is called', async () => {
      const initialData = { version: 1 };
      const refreshedData = { version: 2 };
      mockFetchFn
        .mockResolvedValueOnce(initialData)
        .mockResolvedValueOnce(refreshedData);
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(initialData);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.data).toEqual(refreshedData);
    });
  });

  describe('clearCache', () => {
    it('should clear cache and reset state', async () => {
      mockFetchFn.mockResolvedValue({ data: 'test' });
      vi.mocked(offlineStorage.get).mockResolvedValue({
        data: { cached: true },
        timestamp: Date.now(),
      });
      vi.mocked(offlineStorage.delete).mockResolvedValue();

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.clearCache();
      });

      expect(offlineStorage.delete).toHaveBeenCalledWith('test_key');
      expect(result.current.isCached).toBe(false);
      expect(result.current.cacheAge).toBeNull();
    });
  });

  describe('TTL resolution', () => {
    it('should use custom TTL when provided', async () => {
      mockFetchFn.mockResolvedValue({ data: 'test' });
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('test_key', mockFetchFn, 0, { ttl: 60000 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(offlineStorage.set).toHaveBeenCalledWith(
        'test_key',
        expect.anything(),
        60000
      );
    });

    it('should use default TTL based on key prefix', async () => {
      mockFetchFn.mockResolvedValue({ data: 'test' });
      vi.mocked(offlineStorage.get).mockResolvedValue(null);

      const { result } = renderHook(() =>
        useOfflineCache('stations_all', mockFetchFn, 0)
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(offlineStorage.set).toHaveBeenCalledWith(
        'stations_all',
        expect.anything(),
        300000
      );
    });
  });
});

describe('formatCacheAge', () => {
  it('should return empty string for null age', () => {
    expect(formatCacheAge(null)).toBe('');
  });

  it('should return "just now" for age < 1 minute', () => {
    expect(formatCacheAge(30000)).toBe('just now');
  });

  it('should return "1 minute ago" for 1 minute', () => {
    expect(formatCacheAge(60000)).toBe('1 minute ago');
  });

  it('should return plural minutes', () => {
    expect(formatCacheAge(300000)).toBe('5 minutes ago');
  });

  it('should return "1 hour ago" for 1 hour', () => {
    expect(formatCacheAge(3600000)).toBe('1 hour ago');
  });

  it('should return plural hours', () => {
    expect(formatCacheAge(7200000)).toBe('2 hours ago');
  });

  it('should return "1 day ago" for 1 day', () => {
    expect(formatCacheAge(86400000)).toBe('1 day ago');
  });

  it('should return plural days', () => {
    expect(formatCacheAge(172800000)).toBe('2 days ago');
  });
});

describe('preloadCriticalData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
  });

  it('should skip preloading when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const fetchFn = vi.fn();

    await preloadCriticalData([{ key: 'test', fetchFn }]);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('should skip items already in cache', async () => {
    vi.mocked(offlineStorage.get).mockResolvedValue({
      data: { cached: true },
      timestamp: Date.now(),
    });
    const fetchFn = vi.fn();

    await preloadCriticalData([{ key: 'test', fetchFn }]);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('should fetch and cache items not in cache', async () => {
    vi.mocked(offlineStorage.get).mockResolvedValue(null);
    const mockData = { preloaded: true };
    const fetchFn = vi.fn().mockResolvedValue(mockData);

    await preloadCriticalData([{ key: 'test', fetchFn, ttl: 60000 }]);

    expect(fetchFn).toHaveBeenCalled();
    expect(offlineStorage.set).toHaveBeenCalledWith('test', mockData, 60000);
  });

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(offlineStorage.get).mockResolvedValue(null);
    const fetchFn = vi.fn().mockRejectedValue(new Error('Failed'));

    await expect(
      preloadCriticalData([{ key: 'test', fetchFn }])
    ).resolves.not.toThrow();
  });

  it('should preload multiple items in parallel', async () => {
    vi.mocked(offlineStorage.get).mockResolvedValue(null);
    const fetchFn1 = vi.fn().mockResolvedValue({ id: 1 });
    const fetchFn2 = vi.fn().mockResolvedValue({ id: 2 });

    await preloadCriticalData([
      { key: 'item1', fetchFn: fetchFn1 },
      { key: 'item2', fetchFn: fetchFn2 },
    ]);

    expect(fetchFn1).toHaveBeenCalled();
    expect(fetchFn2).toHaveBeenCalled();
  });
});
