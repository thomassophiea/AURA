/**
 * Data layer for the aggregated Device Groups page: sites (the wire home of
 * deviceGroups[]), profiles, RF policies, and the cluster-wide AP inventory
 * (with platformName, which the site-scoped useSiteAps normalization drops).
 * Loads on mount + manual refresh only (AURA no-auto-refresh rule).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sitesService } from '../../../services/configure/sitesService';
import { profilesService } from '../../../services/configure/profilesService';
import { rfmgmtService } from '../../../services/configure/rfmgmtService';
import { configureRequest, unwrapList } from '../../../services/configure/resourceClient';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { logger } from '../../../services/logger';
import type { ApProfile, RfMgmtPolicy, SiteConfig } from '../../../types/configure';
import type { DeviceGroupAp } from './devicegroupsModel';

interface RawAp {
  serialNumber?: string;
  apName?: string;
  name?: string;
  hardwareType?: string;
  model?: string;
  platformName?: string;
  hostSite?: string;
  siteName?: string;
  site?: string;
}

function normalizeAp(raw: RawAp): DeviceGroupAp {
  return {
    serialNumber: raw.serialNumber ?? '',
    apName: raw.apName ?? raw.name ?? raw.serialNumber ?? '',
    hardwareType: raw.hardwareType ?? raw.model ?? '',
    platformName: raw.platformName ?? '',
    hostSite: raw.hostSite ?? raw.siteName ?? raw.site ?? '',
  };
}

async function fetchAps(): Promise<DeviceGroupAp[]> {
  for (const path of ['/v1/aps', '/v3/aps']) {
    try {
      const payload = await configureRequest<unknown>(path);
      return unwrapList<RawAp>(payload)
        .map(normalizeAp)
        .filter((a) => a.serialNumber);
    } catch (error) {
      logger.warn(`[configure/devicegroups] AP inventory ${path} failed`, error);
    }
  }
  return [];
}

export interface DeviceGroupsData {
  sites: SiteConfig[];
  profiles: ApProfile[];
  rfPolicies: RfMgmtPolicy[];
  aps: DeviceGroupAp[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDeviceGroupsData(): DeviceGroupsData {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [profiles, setProfiles] = useState<ApProfile[]>([]);
  const [rfPolicies, setRfPolicies] = useState<RfMgmtPolicy[]>([]);
  const [aps, setAps] = useState<DeviceGroupAp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [siteRes, profileRes, rfRes, apRes] = await Promise.allSettled([
      sitesService.list(),
      profilesService.list(),
      rfmgmtService.list(),
      fetchAps(),
    ]);
    if (!mountedRef.current) return;

    if (siteRes.status === 'fulfilled') {
      setSites(siteRes.value);
    } else {
      const message = getUserFriendlyMessage(siteRes.reason);
      setSites([]);
      setError(message);
      toast.error('Failed to load device groups', { description: message });
    }
    // Reference data degrades to empty lists so the grid still renders.
    const settle = <T>(r: PromiseSettledResult<T[]>, label: string): T[] => {
      if (r.status === 'fulfilled') return r.value;
      logger.warn(`[configure/devicegroups] failed to load ${label}`, r.reason);
      return [];
    };
    setProfiles(settle(profileRes, 'profiles'));
    setRfPolicies(settle(rfRes, 'rfmgmt'));
    setAps(apRes.status === 'fulfilled' ? apRes.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sites, profiles, rfPolicies, aps, loading, error, refresh };
}
