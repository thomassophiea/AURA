import { useEffect, useState } from 'react';

import { apiService } from '@/services/api';

interface ApModels {
  /** AP serial -> model, from the controller AP inventory (`/v1/aps/query`). */
  modelBySerial: Map<string, string>;
  loading: boolean;
}

/**
 * Loads the AP inventory once and exposes a serial -> model map. Light-aware
 * aggregates carry only serials + power; sensor-capability derives from the AP
 * model, which lives in the controller inventory rather than the metric store.
 * Failure resolves to an empty map — callers fall back to no sensor detection.
 */
export function useApModels(): ApModels {
  const [modelBySerial, setModelBySerial] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const aps = await apiService.getAccessPoints();
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const ap of aps ?? []) {
          const a = ap as {
            serialNumber?: string;
            model?: string;
            apModel?: string;
            deviceModel?: string;
            platformName?: string;
          };
          const model = a.model ?? a.apModel ?? a.deviceModel ?? a.platformName;
          if (a.serialNumber && model) map.set(a.serialNumber, model);
        }
        setModelBySerial(map);
      } catch {
        if (cancelled) return;
        setModelBySerial(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { modelBySerial, loading };
}
