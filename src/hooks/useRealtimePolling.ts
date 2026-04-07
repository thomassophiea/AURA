/**
 * useRealtimePolling - Smart polling for live data updates
 * Features: adaptive intervals, visibility-aware, battery-conscious
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface BatteryManager {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

interface RealtimePollingOptions {
  key: string;
  activeInterval?: number;
  idleInterval?: number;
  hiddenInterval?: number | false;
  enabled?: boolean;
}

interface RealtimePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  isStale: boolean;
  refresh: () => Promise<void>;
}

const IDLE_TIMEOUT = 60000;
const VISIBILITY_STALE_THRESHOLD = 30000;
const LOW_BATTERY_THRESHOLD = 0.2;

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) {
      return false;
    }
  }
  return true;
}

export function useRealtimePolling<T>(
  fetcher: () => Promise<T>,
  options: RealtimePollingOptions
): RealtimePollingResult<T> {
  const {
    key,
    activeInterval = 10000,
    idleInterval = 30000,
    hiddenInterval = 120000,
    enabled = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const dataRef = useRef<T | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIdleRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const lastVisibleRef = useRef(Date.now());
  const batteryRef = useRef<BatteryManager | null>(null);
  const isLowBatteryRef = useRef(false);

  const getCurrentInterval = useCallback((): number | null => {
    const isHidden = document.visibilityState === 'hidden';

    if (isHidden) {
      return hiddenInterval === false ? null : hiddenInterval;
    }

    if (isLowBatteryRef.current) {
      return idleInterval * 2;
    }

    return isIdleRef.current ? idleInterval : activeInterval;
  }, [activeInterval, idleInterval, hiddenInterval]);

  const fetchData = useCallback(async (showLoading = false) => {
    try {
      // Only show loading on initial load (when no data exists)
      if (showLoading && !dataRef.current) {
        setLoading(true);
      }
      setError(null);
      const result = await fetcherRef.current();

      if (!shallowEqual(result, dataRef.current)) {
        dataRef.current = result;
        setData(result);
        setLastUpdated(new Date());
        setIsStale(false);

        try {
          localStorage.setItem(`realtime_${key}`, JSON.stringify({
            data: result,
            timestamp: Date.now(),
          }));
        } catch (e) {
          console.warn('[useRealtimePolling] Failed to cache data:', e);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  }, [key]);

  const refresh = useCallback(async () => {
    // Don't blank the screen - just fetch in background
    await fetchData(false);
  }, [fetchData]);

  const setupInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled) return;

    const interval = getCurrentInterval();
    if (interval === null) return;

    intervalRef.current = setInterval(fetchData, interval);
  }, [enabled, getCurrentInterval, fetchData]);

  useEffect(() => {
    if (!enabled) return;

    const cached = localStorage.getItem(`realtime_${key}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        dataRef.current = parsed.data;
        setData(parsed.data);
        setLastUpdated(new Date(parsed.timestamp));

        const age = Date.now() - parsed.timestamp;
        setIsStale(age > activeInterval * 3);
      } catch (e) {
        console.warn('[useRealtimePolling] Failed to parse cache:', e);
      }
    }

    fetchData(true); // Show loading on initial fetch
  }, [key, enabled, fetchData, activeInterval]);

  useEffect(() => {
    setupInterval();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [setupInterval]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const hiddenDuration = Date.now() - lastVisibleRef.current;

        if (hiddenDuration > VISIBILITY_STALE_THRESHOLD) {
          setIsStale(true);
          fetchData();
        }

        setupInterval();
      } else {
        lastVisibleRef.current = Date.now();
        setupInterval();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchData, setupInterval]);

  useEffect(() => {
    if (!enabled) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();

      if (isIdleRef.current) {
        isIdleRef.current = false;
        setupInterval();
      }
    };

    const checkIdle = () => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;

      if (timeSinceActivity > IDLE_TIMEOUT && !isIdleRef.current) {
        isIdleRef.current = true;
        setupInterval();
      }
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    const idleCheckInterval = setInterval(checkIdle, 10000);

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity);
      });
      clearInterval(idleCheckInterval);
    };
  }, [enabled, setupInterval]);

  useEffect(() => {
    if (!enabled) return;

    const nav = navigator as NavigatorWithBattery;
    if (!nav.getBattery) return;

    let mounted = true;

    nav.getBattery().then((battery) => {
      if (!mounted) return;

      batteryRef.current = battery;

      const updateBatteryStatus = () => {
        const wasLow = isLowBatteryRef.current;
        isLowBatteryRef.current = !battery.charging && battery.level < LOW_BATTERY_THRESHOLD;

        if (wasLow !== isLowBatteryRef.current) {
          setupInterval();
        }
      };

      updateBatteryStatus();
      battery.addEventListener('levelchange', updateBatteryStatus);
      battery.addEventListener('chargingchange', updateBatteryStatus);

      return () => {
        battery.removeEventListener('levelchange', updateBatteryStatus);
        battery.removeEventListener('chargingchange', updateBatteryStatus);
      };
    }).catch(() => {
      // Battery API not available
    });

    return () => {
      mounted = false;
    };
  }, [enabled, setupInterval]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isStale,
    refresh,
  };
}
