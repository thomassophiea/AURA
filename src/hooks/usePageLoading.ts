import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_DISPLAY_TIME = 300;

interface UsePageLoadingOptions<T> {
  loadFn: () => Promise<T>;
  initialData?: T | null;
  loadOnMount?: boolean;
}

interface UsePageLoadingResult<T> {
  isInitialLoad: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  data: T | null;
  error: Error | null;
  refresh: () => Promise<void>;
  load: () => Promise<void>;
}

export function usePageLoading<T>({
  loadFn,
  initialData = null,
  loadOnMount = true,
}: UsePageLoadingOptions<T>): UsePageLoadingResult<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const hasLoadedRef = useRef(!!initialData);
  const loadStartTimeRef = useRef<number>(0);

  const ensureMinDisplayTime = useCallback(async () => {
    const elapsed = Date.now() - loadStartTimeRef.current;
    if (elapsed < MIN_DISPLAY_TIME) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DISPLAY_TIME - elapsed));
    }
  }, []);

  const load = useCallback(async () => {
    loadStartTimeRef.current = Date.now();
    setError(null);

    if (!hasLoadedRef.current) {
      setIsInitialLoad(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const result = await loadFn();
      await ensureMinDisplayTime();
      setData(result);
      hasLoadedRef.current = true;
    } catch (err) {
      await ensureMinDisplayTime();
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setIsInitialLoad(false);
      setIsRefreshing(false);
    }
  }, [loadFn, ensureMinDisplayTime]);

  const refresh = useCallback(async () => {
    if (isRefreshing || isInitialLoad) return;
    await load();
  }, [load, isRefreshing, isInitialLoad]);

  useEffect(() => {
    if (loadOnMount && !hasLoadedRef.current) {
      load();
    }
  }, [loadOnMount, load]);

  return {
    isInitialLoad,
    isRefreshing,
    isLoading: isInitialLoad || isRefreshing,
    data,
    error,
    refresh,
    load,
  };
}

export type { UsePageLoadingOptions, UsePageLoadingResult };
