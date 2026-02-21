/**
 * useBackgroundSync - Detects online status and syncs stale data
 * Queues failed requests for retry when back online
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { offlineStorage } from '@/services/offlineStorage';

interface PendingRequest {
  id: string;
  url: string;
  method: string;
  body?: string;
  timestamp: number;
  retryCount: number;
}

interface BackgroundSyncOptions {
  onOnline?: () => void | Promise<void>;
  onOffline?: () => void;
  autoRefreshStaleData?: boolean;
  showToasts?: boolean;
  staleThresholdMs?: number;
}

const SYNC_QUEUE_KEY = 'background_sync_queue';
const MAX_RETRIES = 3;
const STALE_THRESHOLD_DEFAULT = 5 * 60 * 1000; // 5 minutes

export function useBackgroundSync(options: BackgroundSyncOptions = {}) {
  const {
    onOnline,
    onOffline,
    autoRefreshStaleData = true,
    showToasts = true,
    staleThresholdMs = STALE_THRESHOLD_DEFAULT,
  } = options;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const wasOfflineRef = useRef(!navigator.onLine);
  const syncInProgressRef = useRef(false);

  const loadPendingRequests = useCallback((): PendingRequest[] => {
    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const savePendingRequests = useCallback((requests: PendingRequest[]) => {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(requests));
      setPendingCount(requests.length);
    } catch (e) {
      console.error('[BackgroundSync] Failed to save pending requests:', e);
    }
  }, []);

  const queueRequest = useCallback(
    (url: string, method: string, body?: string): string => {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const pending = loadPendingRequests();
      pending.push({
        id,
        url,
        method,
        body,
        timestamp: Date.now(),
        retryCount: 0,
      });
      savePendingRequests(pending);
      return id;
    },
    [loadPendingRequests, savePendingRequests]
  );

  const removeRequest = useCallback(
    (id: string) => {
      const pending = loadPendingRequests();
      savePendingRequests(pending.filter((r: PendingRequest) => r.id !== id));
    },
    [loadPendingRequests, savePendingRequests]
  );

  const processPendingRequests = useCallback(async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setIsSyncing(true);

    const pending = loadPendingRequests();
    if (pending.length === 0) {
      setIsSyncing(false);
      syncInProgressRef.current = false;
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const remaining: PendingRequest[] = [];

    for (const request of pending) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: request.body,
        });

        if (response.ok) {
          successCount++;
        } else if (request.retryCount < MAX_RETRIES) {
          remaining.push({ ...request, retryCount: request.retryCount + 1 });
        } else {
          failCount++;
        }
      } catch {
        if (request.retryCount < MAX_RETRIES) {
          remaining.push({ ...request, retryCount: request.retryCount + 1 });
        } else {
          failCount++;
        }
      }
    }

    savePendingRequests(remaining);

    if (showToasts && (successCount > 0 || failCount > 0)) {
      if (successCount > 0 && failCount === 0) {
        toast.success(`Synced ${successCount} pending request${successCount > 1 ? 's' : ''}`);
      } else if (failCount > 0) {
        toast.warning(`Synced ${successCount}, failed ${failCount} request(s)`);
      }
    }

    setIsSyncing(false);
    syncInProgressRef.current = false;
  }, [loadPendingRequests, savePendingRequests, showToasts]);

  const refreshStaleData = useCallback(async () => {
    const stats = await offlineStorage.getCacheStats();
    if (!stats.newestEntry) return;

    const isStale = Date.now() - stats.newestEntry > staleThresholdMs;
    if (isStale && autoRefreshStaleData) {
      if (showToasts) {
        toast.info('Back online - refreshing data...', { duration: 2000 });
      }
      await onOnline?.();
    }
  }, [autoRefreshStaleData, showToasts, staleThresholdMs, onOnline]);

  const handleOnline = useCallback(async () => {
    setIsOnline(true);

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      await processPendingRequests();
      await refreshStaleData();
    }
  }, [processPendingRequests, refreshStaleData]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    wasOfflineRef.current = true;
    onOffline?.();

    if (showToasts) {
      toast.warning('You are offline', {
        description: 'Changes will sync when you reconnect',
        duration: 3000,
      });
    }
  }, [onOffline, showToasts]);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setPendingCount(loadPendingRequests().length);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline, loadPendingRequests]);

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      handleOnline();
    }
  }, []);

  const clearPendingRequests = useCallback(() => {
    savePendingRequests([]);
  }, [savePendingRequests]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    queueRequest,
    removeRequest,
    processPendingRequests,
    clearPendingRequests,
  };
}
