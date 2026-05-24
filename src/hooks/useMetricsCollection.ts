import { useEffect, useRef, useState } from 'react';
import { metricsStorage } from '../services/metricsStorage';

interface ServiceMetrics {
  serviceId: string;
  serviceName: string;
  metrics: {
    throughput?: number;
    latency?: number;
    jitter?: number;
    packetLoss?: number;
    reliability?: number;
    uptime?: number;
    clientCount?: number;
    successRate?: number;
    errorRate?: number;
    averageRssi?: number;
    averageSnr?: number;
  };
}

interface UseMetricsCollectionOptions {
  enabled?: boolean;
  intervalMinutes?: number;
  onCollectionComplete?: () => void;
}

/**
 * Hook to manage periodic metrics collection for Network Rewind feature
 */
export function useMetricsCollection(
  getCurrentMetrics: () => ServiceMetrics | null,
  options: UseMetricsCollectionOptions = {}
) {
  const { enabled = true, intervalMinutes = 15, onCollectionComplete } = options;

  const [isCollecting, setIsCollecting] = useState(false);
  const [lastCollectionTime, setLastCollectionTime] = useState<Date | null>(null);
  const [collectionCount, setCollectionCount] = useState(0);
  const [supabaseAvailable, setSupabaseAvailable] = useState<boolean | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownToast = useRef(false);

  // Check Supabase availability on mount
  useEffect(() => {
    checkSupabaseConnection();
  }, []);

  const checkSupabaseConnection = async () => {
    const available = await metricsStorage.checkConnection();
    setSupabaseAvailable(available);

    if (!available && !hasShownToast.current) {
      console.warn(
        '[MetricsCollection] Supabase not configured - historical data will not be saved'
      );
      hasShownToast.current = true;
    }
  };

  const collectMetrics = async () => {
    if (!enabled || !supabaseAvailable) {
      return;
    }

    try {
      setIsCollecting(true);

      const currentMetrics = getCurrentMetrics();
      if (!currentMetrics) {
        return;
      }

      const timestamp = new Date().toISOString();

      // Save service metrics
      await metricsStorage.saveServiceMetrics({
        service_id: currentMetrics.serviceId,
        service_name: currentMetrics.serviceName,
        timestamp,
        metrics: currentMetrics.metrics,
      });

      setLastCollectionTime(new Date());
      setCollectionCount((prev) => prev + 1);

      if (onCollectionComplete) {
        onCollectionComplete();
      }
    } catch (error) {
      console.error('[MetricsCollection] Error collecting metrics:', error);
    } finally {
      setIsCollecting(false);
    }
  };

  // Set up periodic collection
  useEffect(() => {
    if (!enabled || !supabaseAvailable) {
      return;
    }

    // Collect immediately on mount
    collectMetrics();

    // Set up interval for periodic collection
    intervalRef.current = setInterval(
      () => {
        collectMetrics();
      },
      intervalMinutes * 60 * 1000
    );

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMinutes, supabaseAvailable]);

  // Manual collection trigger
  const triggerCollection = async () => {
    await collectMetrics();
  };

  return {
    isCollecting,
    lastCollectionTime,
    collectionCount,
    supabaseAvailable,
    triggerCollection,
  };
}
