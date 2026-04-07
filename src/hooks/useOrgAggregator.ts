/**
 * useOrgAggregator — React hook for org-level data aggregation.
 *
 * When navigation scope is 'global', fetches from all controllers and merges.
 * When scope is 'site-group', uses the single active controller as-is.
 *
 * Also exposes a siteGroupFilter state for the UI dropdown.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { OrgDataAggregator, type AggregatedMeta, type AggregatedResult } from '../services/orgDataAggregator';

export interface OrgAggregatorState {
  /** Current site group filter — null means "All Site Groups". */
  siteGroupFilter: string | null;
  /** Set the site group filter. Pass null to show all. */
  setSiteGroupFilter: (sgId: string | null) => void;
  /** Filter aggregated data by the current siteGroupFilter. */
  filterBySiteGroup: <T extends AggregatedMeta>(data: T[]) => T[];
  /** Create an aggregator instance for the current context. */
  createAggregator: () => OrgDataAggregator;
  /** Convenience: fetch, merge, and filter in one call. */
  fetchFiltered: <T = any>(
    endpoint: string,
    options?: { extractArray?: (json: any) => T[]; timeoutMs?: number },
  ) => Promise<AggregatedResult<T>>;
}

export function useOrgAggregator(): OrgAggregatorState {
  const { siteGroups, navigationScope } = useAppContext();
  const [siteGroupFilter, setSiteGroupFilter] = useState<string | null>(null);

  const createAggregator = useCallback(() => {
    return new OrgDataAggregator(siteGroups);
  }, [siteGroups]);

  const filterBySiteGroup = useCallback(
    <T extends AggregatedMeta>(data: T[]): T[] => {
      if (!siteGroupFilter) return data;
      return data.filter(d => d._siteGroupId === siteGroupFilter);
    },
    [siteGroupFilter],
  );

  const fetchFiltered = useCallback(
    async <T = any>(
      endpoint: string,
      options?: { extractArray?: (json: any) => T[]; timeoutMs?: number },
    ): Promise<AggregatedResult<T>> => {
      const aggregator = new OrgDataAggregator(siteGroups);
      const result = await aggregator.fetchAll<T>(endpoint, options);

      // Apply site group filter to the result
      if (siteGroupFilter) {
        result.data = result.data.filter(d => d._siteGroupId === siteGroupFilter);
      }

      return result;
    },
    [siteGroups, siteGroupFilter],
  );

  return useMemo(
    () => ({
      siteGroupFilter,
      setSiteGroupFilter,
      filterBySiteGroup,
      createAggregator,
      fetchFiltered,
    }),
    [siteGroupFilter, filterBySiteGroup, createAggregator, fetchFiltered],
  );
}
