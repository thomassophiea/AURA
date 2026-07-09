/**
 * useFeatureCounts — fires every list-capable Configure service in parallel and
 * returns a count map keyed by CountKey. Resilient: a failed or missing list
 * resolves to null (rendered as a dash) and never blocks the catalog grid.
 */
import { useEffect, useState } from 'react';
import {
  aaaPolicyService,
  administratorsService,
  adspService,
  analyticsService,
  cosService,
  eguestService,
  eslProfileService,
  iotProfileService,
  meshpointsService,
  positioningService,
  profilesService,
  rateLimitersService,
  rfmgmtService,
  rolesService,
  rtlsProfileService,
  servicesService,
  sitesService,
  topologiesService,
  vlanGroupsService,
} from '../../../services/configure';
import type { CountKey } from './catalogData';

type Loader = () => Promise<unknown[]>;

const LOADERS: Record<CountKey, Loader> = {
  profiles: () => profilesService.list(),
  services: () => servicesService.list(),
  roles: () => rolesService.list(),
  topologies: () => topologiesService.list(),
  vlangroups: () => vlanGroupsService.list(),
  cos: () => cosService.list(),
  aaapolicy: () => aaaPolicyService.list(),
  ratelimiters: () => rateLimitersService.list(),
  rfmgmt: () => rfmgmtService.list(),
  meshpoints: () => meshpointsService.list(),
  sites: () => sitesService.list(),
  eguest: () => eguestService.list(),
  adsp: () => adspService.list(),
  iot: () => iotProfileService.list(),
  rtls: () => rtlsProfileService.list(),
  esl: () => eslProfileService.list(),
  positioning: () => positioningService.list(),
  analytics: () => analyticsService.list(),
  administrators: () => administratorsService.list(),
};

/** number = live count, null = unavailable (dash), undefined = still loading. */
export type FeatureCounts = Partial<Record<CountKey, number | null>>;

export interface UseFeatureCountsResult {
  counts: FeatureCounts;
  loading: boolean;
}

export function useFeatureCounts(): UseFeatureCountsResult {
  const [counts, setCounts] = useState<FeatureCounts>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const keys = Object.keys(LOADERS) as CountKey[];

    Promise.allSettled(keys.map((key) => LOADERS[key]())).then((results) => {
      if (!alive) return;
      const next: FeatureCounts = {};
      results.forEach((result, index) => {
        const key = keys[index];
        next[key] =
          result.status === 'fulfilled' && Array.isArray(result.value)
            ? result.value.length
            : null;
      });
      setCounts(next);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  return { counts, loading };
}
