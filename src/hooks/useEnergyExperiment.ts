/**
 * Polling state for the Treatment-vs-Control energy experiment.
 *
 * Everything rendered comes from the server on each poll, so a browser reload,
 * a different browser, or a laptop that was closed for three days all show the
 * same thing — the experiment lives in Postgres, not here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { energyExperimentService } from '@/services/energyExperimentService';
import type {
  ExperimentApRow,
  ExperimentSeriesResponse,
  ExperimentStateResponse,
  ReadinessResponse,
  TriggerView,
} from '@/types/energyExperiment';

/** Faster while something is happening; calmer when nothing is. */
const ACTIVE_STATES = new Set(['collecting_baseline', 'baseline_established', 'darkness_detected', 'optimization_active', 'recovering']);
const ACTIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

export type ExperimentRange = 'live' | '24h' | '3d' | '7d' | 'poc';

interface UseEnergyExperimentResult {
  state: ExperimentStateResponse | null;
  series: ExperimentSeriesResponse | null;
  aps: ExperimentApRow[];
  trigger: TriggerView | null;
  readiness: ReadinessResponse | null;
  range: ExperimentRange;
  setRange: (range: ExperimentRange) => void;
  loading: boolean;
  error: string | null;
  /** Operation in flight, for disabling the control panel. */
  busy: string | null;
  refresh: () => Promise<void>;
  run: (label: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

export function useEnergyExperiment(enabled = true): UseEnergyExperimentResult {
  const [state, setState] = useState<ExperimentStateResponse | null>(null);
  const [series, setSeries] = useState<ExperimentSeriesResponse | null>(null);
  const [aps, setAps] = useState<ExperimentApRow[]>([]);
  const [trigger, setTrigger] = useState<TriggerView | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [range, setRange] = useState<ExperimentRange>('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Guards against a slow response from a previous range overwriting a newer
  // one, and against setState after unmount.
  const mounted = useRef(true);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    try {
      const [nextState, nextSeries, nextAps, nextTrigger] = await Promise.all([
        energyExperimentService.getState(),
        energyExperimentService.getSeries(range),
        energyExperimentService.getAps().catch(() => ({ aps: [] })),
        energyExperimentService.getTrigger().catch(() => ({ active: false }) as TriggerView),
      ]);
      if (!mounted.current || id !== requestId.current) return;
      setState(nextState);
      setSeries(nextSeries);
      setAps(nextAps.aps ?? []);
      setTrigger(nextTrigger);
      setError(null);
    } catch (e) {
      if (!mounted.current || id !== requestId.current) return;
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [enabled, range]);

  const refreshReadiness = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await energyExperimentService.getReadiness();
      if (mounted.current) setReadiness(next);
    } catch {
      // Readiness is advisory; a failure here must not blank the main view.
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    void refreshReadiness();
    const active = state?.experiment && ACTIVE_STATES.has(state.experiment.state);
    const interval = setInterval(() => void refresh(), active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(interval);
    // state?.experiment?.state is the cadence input, not the data — including
    // the whole object would restart the timer on every poll.
  }, [enabled, refresh, refreshReadiness, state?.experiment?.state]);

  /** Run a command, then immediately re-read the server's view of the world. */
  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      setError(null);
      try {
        const result = await fn();
        await refresh();
        await refreshReadiness();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Operation failed');
        // Re-read anyway: a failed command may still have changed something,
        // and a stale screen after a failure is how an AP gets forgotten.
        await refresh().catch(() => undefined);
        throw e;
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [refresh, refreshReadiness]
  );

  return { state, series, aps, trigger, readiness, range, setRange, loading, error, busy, refresh, run };
}
