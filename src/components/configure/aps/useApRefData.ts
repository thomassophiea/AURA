/**
 * Reference data for the AP editor: sites (for the Site -> Device Group
 * cascade and country gating), profiles + RF policies (resolved-name links on
 * General/Radios), WLAN services (the radioIfList override matrix) and
 * meshpoints (per-AP meshpoint tab labels). Each source loads independently;
 * a failure toasts once and leaves that slice empty rather than blocking.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  sitesService,
  profilesService,
  rfmgmtService,
  servicesService,
  meshpointsService,
} from '../../../services/configure';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import type {
  SiteConfig,
  ApProfile,
  RfMgmtPolicy,
  WlanService,
  Meshpoint,
} from '../../../types/configure';

export interface ApRefData {
  sites: SiteConfig[];
  profiles: ApProfile[];
  rfPolicies: RfMgmtPolicy[];
  services: WlanService[];
  meshpoints: Meshpoint[];
  loading: boolean;
  profileName: (id: string | null | undefined) => string;
  rfPolicyName: (id: string | null | undefined) => string;
  meshpointName: (id: string | null | undefined) => string;
  siteByName: (name: string | null | undefined) => SiteConfig | undefined;
  reload: () => Promise<void>;
}

export function useApRefData(): ApRefData {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [profiles, setProfiles] = useState<ApProfile[]>([]);
  const [rfPolicies, setRfPolicies] = useState<RfMgmtPolicy[]>([]);
  const [services, setServices] = useState<WlanService[]>([]);
  const [meshpoints, setMeshpoints] = useState<Meshpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const load = async <T>(
      fn: () => Promise<T[]>,
      set: (v: T[]) => void,
      label: string
    ): Promise<void> => {
      try {
        const data = await fn();
        if (mounted.current) set(data);
      } catch (err) {
        toast.error(`Failed to load ${label}`, { description: getUserFriendlyMessage(err) });
      }
    };
    await Promise.all([
      load(() => sitesService.list(), setSites, 'sites'),
      load(() => profilesService.list(), setProfiles, 'profiles'),
      load(() => rfmgmtService.list(), setRfPolicies, 'RF policies'),
      load(() => servicesService.list(), setServices, 'WLAN services'),
      load(() => meshpointsService.list(), setMeshpoints, 'meshpoints'),
    ]);
    if (mounted.current) setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nameFrom = <T extends { id: string | null; name?: string }>(
    list: T[],
    id: string | null | undefined
  ): string => {
    if (!id) return '—';
    return list.find((x) => x.id === id)?.name ?? id;
  };

  return {
    sites,
    profiles,
    rfPolicies,
    services,
    meshpoints,
    loading,
    profileName: (id) => nameFrom(profiles, id),
    rfPolicyName: (id) => nameFrom(rfPolicies, id),
    meshpointName: (id) => nameFrom(meshpoints, id),
    siteByName: (name) => (name ? sites.find((s) => s.siteName === name) : undefined),
    reload,
  };
}
