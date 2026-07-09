/**
 * Loads every dropdown reference pool the profile editor needs (WLANs, roles,
 * topologies, meshpoints and the six specialized-profile subtypes) in one pass.
 * Each pool degrades to [] independently so an unsupported feature service
 * never blocks the editor. Pools are fetched once when the sheet opens.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  adspService,
  analyticsService,
  eslProfileService,
  iotProfileService,
  meshpointsService,
  positioningService,
  rolesService,
  rtlsProfileService,
  servicesService,
  topologiesService,
} from '../../../services/configure';
import type { Opt, RefPools } from './types';

const EMPTY: RefPools = {
  services: [],
  roles: [],
  topologies: [],
  meshpoints: [],
  airdefense: [],
  iot: [],
  esl: [],
  rtls: [],
  positioning: [],
  analytics: [],
};

interface NamedRecord {
  id: string | number;
  name?: string;
  serviceName?: string;
}

async function toOpts(
  loader: () => Promise<NamedRecord[]>,
  nameKey: 'name' | 'serviceName' = 'name'
): Promise<Opt[]> {
  try {
    const rows = await loader();
    return rows.map((r) => ({ id: String(r.id), label: String(r[nameKey] ?? r.id) }));
  } catch {
    return [];
  }
}

export function useRefPools(enabled: boolean) {
  const [pools, setPools] = useState<RefPools>(EMPTY);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [services, roles, topologies, meshpoints, airdefense, iot, esl, rtls, positioning, analytics] =
      await Promise.all([
        toOpts(() => servicesService.list() as Promise<NamedRecord[]>, 'serviceName'),
        toOpts(() => rolesService.list() as Promise<NamedRecord[]>),
        toOpts(() => topologiesService.list() as Promise<NamedRecord[]>),
        toOpts(() => meshpointsService.list() as Promise<NamedRecord[]>),
        toOpts(() => adspService.list() as Promise<NamedRecord[]>),
        toOpts(() => iotProfileService.list() as Promise<NamedRecord[]>),
        toOpts(() => eslProfileService.list() as Promise<NamedRecord[]>),
        toOpts(() => rtlsProfileService.list() as Promise<NamedRecord[]>),
        toOpts(() => positioningService.list() as Promise<NamedRecord[]>),
        toOpts(() => analyticsService.list() as Promise<NamedRecord[]>),
      ]);
    setPools({ services, roles, topologies, meshpoints, airdefense, iot, esl, rtls, positioning, analytics });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { pools, loading };
}
