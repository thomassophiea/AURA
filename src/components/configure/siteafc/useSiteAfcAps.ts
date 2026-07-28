/**
 * Loads the full per-AP config records for a site's access points. The AP set
 * is the union of every device group's `apSerialNumbers`; each serial is read
 * live from `GET /v1/aps/{serial}` (with a `/v3/aps/{serial}` fallback) through
 * the shared configure request layer. Failures per AP are skipped so a single
 * unreachable AP never blanks the grid.
 */
import { useCallback, useEffect, useState } from 'react';
import { configureRequest } from '../../../services/configure';
import { logger } from '../../../services/logger';
import type { ApDetail, SiteConfig } from '../../../types/configure';

/** Distinct AP serial numbers across all of a site's device groups. */
export function siteApSerials(site: SiteConfig | null): string[] {
  if (!site) return [];
  const seen = new Set<string>();
  for (const group of site.deviceGroups ?? []) {
    for (const serial of group.apSerialNumbers ?? []) {
      if (serial) seen.add(serial);
    }
  }
  return [...seen];
}

async function fetchAp(serial: string): Promise<ApDetail | null> {
  for (const path of ['/v1/aps', '/v3/aps']) {
    try {
      return await configureRequest<ApDetail>(`${path}/${encodeURIComponent(serial)}`);
    } catch (error) {
      logger.warn(`[configure/siteafc] AP detail ${path}/${serial} failed`, error);
    }
  }
  return null;
}

export interface UseSiteAfcAps {
  aps: ApDetail[];
  loading: boolean;
  refresh: () => void;
}

export function useSiteAfcAps(site: SiteConfig | null): UseSiteAfcAps {
  const [aps, setAps] = useState<ApDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const serials = siteApSerials(site);
    if (serials.length === 0) {
      setAps([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(serials.map(fetchAp)).then((results) => {
      if (cancelled) return;
      setAps(results.filter((ap): ap is ApDetail => ap != null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [site, nonce]);

  return { aps, loading, refresh };
}
