/**
 * Read hooks for the Energy Optimization page. Each owns loading/error/success
 * for one API view, re-fetches when the global site or time-range filter
 * changes, and aborts the in-flight request on unmount or filter change so a
 * slow response cannot overwrite a newer one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useGlobalFilters } from './useGlobalFilters';
import {
  getEnergyOverview,
  getEnergySites,
  getEnergyAps,
  getEnergyRecommendations,
  getLightAwareSummary,
  getLightAwareAps,
  getLightAwareObserved,
  getLightAwarePolicy,
  putLightAwarePolicy,
} from '../services/energyService';
import type {
  EnergyOverview,
  EnergySite,
  EnergyAp,
  EnergyRecommendation,
  LightAwareSummary,
  LightAwareApRow,
  LightAwareObserved,
  LightAwarePolicy,
} from '../types/energy';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

/** Shared fetch/abort/state machine. `fetcher` receives the current filters + signal. */
function useEnergyResource<T>(
  fetcher: (
    filters: { site: string; timeRange: string },
    signal: AbortSignal
  ) => Promise<T>,
  enabled = true
): AsyncState<T> {
  const { filters } = useGlobalFilters();
  const { site, timeRange } = filters;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcherRef.current({ site, timeRange }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(messageOf(err));
        setData(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [site, timeRange, nonce, enabled]);

  return { data, loading, error, refetch };
}

export function useEnergyOverview(): AsyncState<EnergyOverview> {
  return useEnergyResource(
    (filters, signal) => getEnergyOverview(filters, signal)
  );
}

export function useEnergySites(): AsyncState<EnergySite[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergySites(filters, signal)).sites
  );
}

export function useEnergyAps(enabled: boolean): AsyncState<EnergyAp[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergyAps(filters, signal)).aps,
    enabled
  );
}

export function useEnergyRecommendations(): AsyncState<EnergyRecommendation[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergyRecommendations(filters, signal)).recommendations
  );
}

export function useLightAwareSummary(): AsyncState<LightAwareSummary> {
  return useEnergyResource((filters, signal) => getLightAwareSummary(filters, signal));
}

export function useLightAwareAps(enabled: boolean): AsyncState<LightAwareApRow[]> {
  return useEnergyResource(
    async (filters, signal) => (await getLightAwareAps(filters, signal)).aps,
    enabled
  );
}

export function useLightAwareObserved(): AsyncState<LightAwareObserved> {
  return useEnergyResource((filters, signal) => getLightAwareObserved(filters, signal));
}

/** Policy is site-scoped and mutable, so it owns a small load+save state rather
 *  than the read-only useEnergyResource machine. */
export function useLightAwarePolicy() {
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<LightAwarePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getLightAwarePolicy({ site: filters.site }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(messageOf(err));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [filters.site, nonce]);

  const save = useCallback(
    async (body: { enabled: boolean; policy: LightAwarePolicy['policy'] }) => {
      const saved = await putLightAwarePolicy({
        ...body,
        siteId: filters.site === 'all' ? undefined : filters.site,
      });
      setData(saved);
      setNonce((n) => n + 1);
      return saved;
    },
    [filters.site]
  );

  return { data, loading, error, save };
}
