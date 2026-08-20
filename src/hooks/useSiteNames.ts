import { useEffect, useState } from 'react';

import { apiService } from '@/services/api';

interface SiteNames {
  /** Site id -> human-readable name, from the controller `/v3/sites` catalog. */
  nameById: Map<string, string>;
  loading: boolean;
}

/**
 * Loads the controller site catalog once and exposes an id -> name map. Energy
 * aggregates carry only site ids (the collector tags samples by site UUID), so
 * the UI resolves names here rather than leaking UUIDs. Failure resolves to an
 * empty map — callers fall back to the id.
 */
export function useSiteNames(): SiteNames {
  const [nameById, setNameById] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const sites = await apiService.getSites();
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const s of sites ?? []) {
          const site = s as { id?: string; name?: string; siteName?: string };
          const name = site.name ?? site.siteName;
          if (site.id && name) map.set(site.id, name);
        }
        setNameById(map);
      } catch {
        if (cancelled) return;
        setNameById(new Map());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { nameById, loading };
}
