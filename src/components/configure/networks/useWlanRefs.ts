/**
 * Reference data for the WLAN editor dropdowns: roles, topologies, CoS, AAA
 * policies, ExtremeGuest servers and AP profiles. Loaded once per page mount;
 * individual failures degrade to empty lists (dropdowns still render).
 */
import { useEffect, useState } from 'react';
import {
  aaaPolicyService,
  cosService,
  eguestService,
  profilesService,
  rolesService,
  topologiesService,
} from '../../../services/configure';
import { logger } from '../../../services/logger';
import type {
  AaaPolicy,
  ApProfile,
  Cos,
  EGuestProfile,
  Role,
  Topology,
} from '../../../types/configure';

export interface WlanRefs {
  roles: Role[];
  topologies: Topology[];
  cos: Cos[];
  aaaPolicies: AaaPolicy[];
  eguests: EGuestProfile[];
  profiles: ApProfile[];
  loading: boolean;
}

const EMPTY: WlanRefs = {
  roles: [],
  topologies: [],
  cos: [],
  aaaPolicies: [],
  eguests: [],
  profiles: [],
  loading: true,
};

export function useWlanRefs(): WlanRefs & { reloadProfiles: () => Promise<void> } {
  const [refs, setRefs] = useState<WlanRefs>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [roles, topologies, cos, aaaPolicies, eguests, profiles] = await Promise.allSettled([
        rolesService.list(),
        topologiesService.list(),
        cosService.list(),
        aaaPolicyService.list(),
        eguestService.list(),
        profilesService.list(),
      ]);
      const settle = <T,>(result: PromiseSettledResult<T[]>, label: string): T[] => {
        if (result.status === 'fulfilled') return result.value;
        logger.warn(`[configure/networks] failed to load ${label} refs`, result.reason);
        return [];
      };
      if (cancelled) return;
      setRefs({
        roles: settle(roles, 'roles'),
        topologies: settle(topologies, 'topologies'),
        cos: settle(cos, 'cos'),
        aaaPolicies: settle(aaaPolicies, 'aaapolicy'),
        eguests: settle(eguests, 'eguest'),
        profiles: settle(profiles, 'profiles'),
        loading: false,
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadProfiles = async () => {
    try {
      const profiles = await profilesService.list();
      setRefs((prev) => ({ ...prev, profiles }));
    } catch (error) {
      logger.warn('[configure/networks] failed to reload profiles', error);
    }
  };

  return { ...refs, reloadProfiles };
}

/** Union of RADIUS server IPs configured across AAA policies (proxy pickers). */
export function radiusServerIps(policies: AaaPolicy[]): string[] {
  const seen = new Set<string>();
  for (const policy of policies) {
    for (const server of [
      ...(policy.authenticationRadiusServers ?? []),
      ...(policy.accountingRadiusServers ?? []),
    ]) {
      if (server.ipAddress) seen.add(server.ipAddress);
    }
  }
  return [...seen];
}
