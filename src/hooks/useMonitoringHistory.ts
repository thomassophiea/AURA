/**
 * Reads persisted monitoring history from the AURA backend.
 *
 * The defining behaviour: **a failed refresh never clears what is already
 * displayed.** Previously-loaded history stays on screen and the hook reports
 * the error separately, so a gateway blip does not blank a week of charts.
 *
 * The hook also keeps loading / empty / never-collected / stale / error as
 * distinct states, because they mean very different things to an operator.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { whenAutoRefresh } from '../lib/autoRefresh';

import { monitoringHistory, rangeFromPreset } from '../services/monitoringHistory';
import type { HistoryQuery } from '../services/monitoringHistory';
import type {
  HistoryResponse,
  MetricSeries,
  SourceHealth,
  SourceState,
} from '../types/monitoring';
import { MonitoringRequestError } from '../types/monitoring';

export interface UseMonitoringHistoryOptions extends Omit<HistoryQuery, 'start' | 'end'> {
  /** Time-range preset ('1h' | '24h' | '7d'). Defaults to the full 7-day window. */
  preset?: string;
  /** Explicit range; overrides `preset` when supplied. */
  start?: string;
  end?: string;
  /** Auto-refresh cadence in ms. 0 disables. */
  refreshIntervalMs?: number;
  enabled?: boolean;
}

export interface UseMonitoringHistoryResult {
  series: MetricSeries[];
  meta: HistoryResponse['meta'] | null;
  sources: SourceHealth[];
  /** True only on the first load, when there is nothing to show yet. */
  loading: boolean;
  /** True while refreshing with data already on screen. */
  refreshing: boolean;
  error: Error | null;
  /** Set when the backend refused the requested range. */
  rangeError: MonitoringRequestError | null;
  /** No sample has ever been stored for this scope. */
  neverCollected: boolean;
  /** Data exists overall, but none in the selected window. */
  emptyRange: boolean;
  /** Worst state across the sources backing this view. */
  worstSourceState: SourceState;
  /** Most recent successful collection across those sources. */
  lastSuccessfulCollectionAt: string | null;
  /** When this data was last read from the backend. */
  lastLoadedAt: Date | null;
  refresh: () => Promise<void>;
}

const STATE_SEVERITY: Record<SourceState, number> = {
  fresh: 0,
  unknown: 1,
  stale: 2,
  never_collected: 3,
  offline: 4,
};

export function worstState(sources: SourceHealth[]): SourceState {
  if (sources.length === 0) return 'unknown';
  return sources.reduce<SourceState>(
    (worst, source) =>
      STATE_SEVERITY[source.state] > STATE_SEVERITY[worst] ? source.state : worst,
    'fresh'
  );
}

export function mostRecentSuccess(sources: SourceHealth[]): string | null {
  let latest: string | null = null;
  for (const source of sources) {
    if (!source.lastSuccessAt) continue;
    if (!latest || source.lastSuccessAt > latest) latest = source.lastSuccessAt;
  }
  return latest;
}

export function useMonitoringHistory(
  options: UseMonitoringHistoryOptions = {}
): UseMonitoringHistoryResult {
  const {
    preset = '7d',
    start,
    end,
    refreshIntervalMs = 0,
    enabled = true,
    siteId,
    deviceId,
    radioId,
    wlanId,
    metricFamily,
    metricNames,
    resolutionMinutes,
  } = options;

  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rangeError, setRangeError] = useState<MonitoringRequestError | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Read inside the callback so a re-render does not restart the fetch loop.
  const hasDataRef = useRef(false);
  hasDataRef.current = data !== null;

  const metricNamesKey = metricNames?.join(',') ?? '';

  const load = useCallback(async () => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      const range = start && end ? { start, end } : rangeFromPreset(preset);
      const response = await monitoringHistory.getHistory(
        {
          ...range,
          siteId,
          deviceId,
          radioId,
          wlanId,
          metricFamily,
          metricNames: metricNamesKey ? metricNamesKey.split(',') : undefined,
          resolutionMinutes,
        },
        controller.signal
      );

      setData(response);
      setError(null);
      setRangeError(null);
      setLastLoadedAt(new Date());
    } catch (caught) {
      if ((caught as Error)?.name === 'AbortError') return;

      // Deliberately do NOT clear `data`. Losing a week of history because one
      // refresh failed is worse than showing it with a staleness warning.
      if (caught instanceof MonitoringRequestError && caught.isRangeError) {
        setRangeError(caught);
        setError(null);
      } else {
        setError(caught as Error);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    enabled,
    preset,
    start,
    end,
    siteId,
    deviceId,
    radioId,
    wlanId,
    metricFamily,
    metricNamesKey,
    resolutionMinutes,
  ]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!enabled || refreshIntervalMs <= 0) return undefined;
    const timer = setInterval(whenAutoRefresh(load), refreshIntervalMs);
    return () => clearInterval(timer);
  }, [enabled, refreshIntervalMs, load]);

  return useMemo(() => {
    const sources = data?.meta.sources ?? [];
    return {
      series: data?.series ?? [],
      meta: data?.meta ?? null,
      sources,
      loading,
      refreshing,
      error,
      rangeError,
      neverCollected: data?.meta.neverCollected ?? false,
      // "No data in this window" is not "never collected" — the UI says
      // different things for each.
      emptyRange: Boolean(data && data.series.length === 0 && !data.meta.neverCollected),
      worstSourceState: worstState(sources),
      lastSuccessfulCollectionAt: mostRecentSuccess(sources),
      lastLoadedAt,
      refresh: load,
    };
  }, [data, loading, refreshing, error, rangeError, lastLoadedAt, load]);
}
