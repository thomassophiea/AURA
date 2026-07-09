/**
 * Reference data for the Site editor selects: AP profiles, RF policies and AAA
 * policies. Loaded once per page mount; individual failures degrade to empty
 * lists so the selects still render.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  aaaPolicyService,
  profilesService,
  rfmgmtService,
} from '../../../services/configure';
import { logger } from '../../../services/logger';
import type { AaaPolicy, ApProfile, RfMgmtPolicy } from '../../../types/configure';

export interface SiteRefs {
  profiles: ApProfile[];
  rfPolicies: RfMgmtPolicy[];
  aaaPolicies: AaaPolicy[];
  loading: boolean;
}

export function useSiteRefs(): SiteRefs & { reload: () => Promise<void> } {
  const [refs, setRefs] = useState<SiteRefs>({
    profiles: [],
    rfPolicies: [],
    aaaPolicies: [],
    loading: true,
  });

  const reload = useCallback(async () => {
    const [profiles, rfPolicies, aaaPolicies] = await Promise.allSettled([
      profilesService.list(),
      rfmgmtService.list(),
      aaaPolicyService.list(),
    ]);
    const settle = <T,>(r: PromiseSettledResult<T[]>, label: string): T[] => {
      if (r.status === 'fulfilled') return r.value;
      logger.warn(`[configure/sites] failed to load ${label} refs`, r.reason);
      return [];
    };
    setRefs({
      profiles: settle(profiles, 'profiles'),
      rfPolicies: settle(rfPolicies, 'rfmgmt'),
      aaaPolicies: settle(aaaPolicies, 'aaapolicy'),
      loading: false,
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...refs, reload };
}
