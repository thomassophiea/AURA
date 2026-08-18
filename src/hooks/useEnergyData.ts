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
} from '../services/energyService';
import type {
  EnergyOverview,
  EnergySite,
  EnergyAp,
  EnergyRecommendation,
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
  const { site, timeRange } = useGlobalFilters();
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
