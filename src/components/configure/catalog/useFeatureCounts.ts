/**
 * useFeatureCounts — fires every list-capable Configure service in parallel and
 * returns a count map keyed by CountKey. Resilient: a failed or missing list
 * resolves to null (rendered as a dash) and never blocks the catalog grid.
 */
import { useEffect, useState } from 'react';
import {
  aaaPolicyService,
  acCertificatesService,
  acGroupsService,
  acLdapConfigurationsService,
  acLocalPasswordUsersService,
  acRadiusServersService,
  acRulesService,
  administratorsService,
  adspService,
  analyticsService,
  cosService,
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
  xlocationService,
} from '../../../services/configure';
import { ppskService } from '../../../services/ppskService';
import { privateSaeService } from '../../../services/privateSaeService';
import type { CountKey } from './catalogData';

type Loader = () => Promise<unknown[]>;

/** PPSK + Private SAE together back the Private Credentials card. Either API
 *  may be independently unavailable (Private SAE is server-flag-gated), so the
 *  count is the sum of whichever lists answered; only a double failure shows
 *  the unavailable dash. */
async function loadPrivateCredentials(): Promise<unknown[]> {
  const loaders: Array<Promise<unknown[]>> = [ppskService.list(), privateSaeService.list()];
  const results = await Promise.allSettled(loaders);
  const fulfilled = results.filter(
    (r): r is PromiseFulfilledResult<unknown[]> => r.status === 'fulfilled'
  );
  if (fulfilled.length === 0) throw new Error('private credentials unavailable');
  return fulfilled.flatMap((r) => r.value);
}

const LOADERS: Record<CountKey, Loader> = {
  privateCredentials: loadPrivateCredentials,
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
  adsp: () => adspService.list(),
  iot: () => iotProfileService.list(),
  rtls: () => rtlsProfileService.list(),
  esl: () => eslProfileService.list(),
  positioning: () => positioningService.list(),
  analytics: () => analyticsService.list(),
  xlocation: () => xlocationService.list(),
  acradius: () => acRadiusServersService.list(),
  acldap: () => acLdapConfigurationsService.list(),
  acrepos: () => acLocalPasswordUsersService.list(),
  acgroups: () => acGroupsService.list(),
  acrules: () => acRulesService.list(),
  accerts: () => acCertificatesService.list(),
  administrators: () => administratorsService.list(),
};

/** number = live count, null = unavailable (dash), undefined = still loading. */
export type FeatureCounts = Partial<Record<CountKey, number | null>>;

export interface UseFeatureCountsResult {
  counts: FeatureCounts;
  loading: boolean;
}

/**
 * @param scopeKey identity of the active configuration scope (Site Group id).
 *   Counts re-fetch when it changes so the catalog never shows the previous
 *   Gateway's numbers after a scope switch.
 */
export function useFeatureCounts(scopeKey?: string): UseFeatureCountsResult {
  const [counts, setCounts] = useState<FeatureCounts>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setCounts({});
    setLoading(true);
    const keys = Object.keys(LOADERS) as CountKey[];

    /* Bounded concurrency: the catalog backs two dozen list calls; firing them
       all at once spikes the gateway and trips its rate limiting on slow links.
       A small worker pool keeps at most BATCH in flight, and counts land on the
       grid incrementally as each resolves (cards show skeletons meanwhile). */
    const BATCH = 6;
    let cursor = 0;

    const runOne = async (key: CountKey) => {
      let value: number | null = null;
      try {
        const rows = await LOADERS[key]();
        value = Array.isArray(rows) ? rows.length : null;
      } catch {
        value = null;
      }
      if (alive) setCounts((prev) => ({ ...prev, [key]: value }));
    };

    const worker = async (): Promise<void> => {
      while (alive && cursor < keys.length) {
        const key = keys[cursor];
        cursor += 1;
        await runOne(key);
      }
    };

    void Promise.all(Array.from({ length: Math.min(BATCH, keys.length) }, worker)).then(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [scopeKey]);

  return { counts, loading };
}
