/**
 * Site-scoped access-point list for the Device Group membership grid. Reads
 * the controller AP inventory live (GET /v1/aps, /v3/aps fallback) via the
 * shared configure request layer, tolerating both bare-array and enveloped
 * payloads, and filters to the APs whose hostSite matches the site name.
 * Any failure degrades to an empty list.
 */
import { useEffect, useState } from 'react';
import { configureRequest, unwrapList } from '../../../services/configure';
import { logger } from '../../../services/logger';

export interface SiteAp {
  serialNumber: string;
  apName: string;
  hardwareType: string;
  hostSite: string;
}

interface RawAp {
  serialNumber?: string;
  apName?: string;
  name?: string;
  hardwareType?: string;
  model?: string;
  hostSite?: string;
  siteName?: string;
  site?: string;
}

function normalize(raw: RawAp): SiteAp {
  return {
    serialNumber: raw.serialNumber ?? '',
    apName: raw.apName ?? raw.name ?? raw.serialNumber ?? '',
    hardwareType: raw.hardwareType ?? raw.model ?? '',
    hostSite: raw.hostSite ?? raw.siteName ?? raw.site ?? '',
  };
}

async function fetchAps(): Promise<SiteAp[]> {
  for (const path of ['/v1/aps', '/v3/aps']) {
    try {
      const payload = await configureRequest<unknown>(path);
      return unwrapList<RawAp>(payload)
        .map(normalize)
        .filter((a) => a.serialNumber);
    } catch (error) {
      logger.warn(`[configure/sites] AP inventory ${path} failed`, error);
    }
  }
  return [];
}

export function useSiteAps(siteName: string): { aps: SiteAp[]; loading: boolean } {
  const [aps, setAps] = useState<SiteAp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAps().then((all) => {
      if (cancelled) return;
      setAps(all.filter((a) => a.hostSite === siteName));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [siteName]);

  return { aps, loading };
}
