import { useEffect, useRef, useState } from 'react';
import { metricsStorage } from '../services/metricsStorage';

interface ServiceMetrics {
  serviceId: string;
  serviceName: string;
  metrics: any;
}

interface UseMetricsCollectionOptions {
  enabled?: boolean;
  intervalMinutes?: number;
}

export function useMetricsCollection(
  getCurrentMetrics: () => ServiceMetrics | null,
  options: UseMetricsCollectionOptions = {}
) {
  const { enabled = true, intervalMinutes = 15 } = options;
  const [lastCollectionTime, setLastCollectionTime] = useState<Date | null>(null);
  const [supabaseAvailable, setSupabaseAvailable] = useState<boolean | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    metricsStorage.checkConnection().then(setSupabaseAvailable);
  }, []);

  const collectMetrics = async () => {
    if (!enabled || !supabaseAvailable) return;

    const currentMetrics = getCurrentMetrics();
    if (!currentMetrics) return;

    await metricsStorage.saveServiceMetrics({
      service_id: currentMetrics.serviceId,
      service_name: currentMetrics.serviceName,
      timestamp: new Date().toISOString(),
      metrics: currentMetrics.metrics
    });

    setLastCollectionTime(new Date());
  };

  useEffect(() => {
    if (!enabled || !supabaseAvailable) return;

    console.log(`[MetricsCollection] Starting every ${intervalMinutes} min`);
    collectMetrics();

    intervalRef.current = setInterval(collectMetrics, intervalMinutes * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('[MetricsCollection] Stopped');
      }
    };
  }, [enabled, intervalMinutes, supabaseAvailable]);

  return { lastCollectionTime, supabaseAvailable };
}
