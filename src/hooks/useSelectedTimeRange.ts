/**
 * The dashboard's single time selection, resolved.
 *
 * Reads the token from `useGlobalFilters` — so it is shared across every view and
 * survives navigation and reload — and turns it into concrete local-timezone
 * bounds plus the coverage annotations the selector and header need.
 *
 * Two behaviours here are deliberate:
 *
 *  - **A live window is resolved once and held still.** `end` for a rolling
 *    window is "now", which changes continuously; recomputing it inline would
 *    give every consumer a new `startIso`/`endIso` on each render and restart
 *    their fetches forever. It used to advance on a minute timer, which was the
 *    dashboard's de-facto refresh trigger — and therefore a page reloading
 *    itself under an idle viewer. The bounds now hold until the user navigates
 *    or refreshes, unless auto-refresh is switched on.
 *  - **A historical window never ticks at all.** A finished calendar day does not
 *    change, so re-resolving it, re-fetching it, or polling a gateway for it is
 *    pure waste. `range.isLive` is what callers gate their polling on.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAutoRefreshEnabled } from '../lib/autoRefresh';

import { useGlobalFilters } from './useGlobalFilters';
import { monitoringHistory } from '../services/monitoringHistory';
import {
  DEFAULT_MAX_DAY_OFFSET,
  localDayAtOffset,
  localTimeZone,
  normalizeTimeRangeToken,
  resolveTimeRange,
  timeRangeOptions,
  type ResolvedTimeRange,
  type TimeRangeOptionGroup,
} from '../lib/timeRange';
import {
  describeSelectedCoverage,
  evaluateDayCoverage,
  type DayCoverageStatus,
} from '../lib/timeRangeAvailability';
import type { CoverageResponse } from '../types/monitoring';

/** How often the clock is re-examined. Bounds only move on a calendar rollover, or under auto-refresh. */
const LIVE_TICK_MS = 60_000;

/**
 * Coverage is shared, not per-component.
 *
 * The filter bar renders the selector and the dashboard header renders the
 * completeness note, so at least two instances of this hook mount together and
 * would otherwise issue the same request twice on every page. Entries are keyed
 * by scope and hold the in-flight promise, so concurrent mounts join one request.
 */
const COVERAGE_TTL_MS = 60_000;

interface CoverageCacheEntry {
  promise: Promise<CoverageResponse>;
  fetchedAt: number;
}

const coverageCache = new Map<string, CoverageCacheEntry>();

/** Exposed for tests, and for a hard refresh after a controller switch. */
export function clearCoverageCache(): void {
  coverageCache.clear();
}

function fetchCoverageShared(
  key: string,
  request: () => Promise<CoverageResponse>,
  now: number
): Promise<CoverageResponse> {
  const cached = coverageCache.get(key);
  if (cached && now - cached.fetchedAt < COVERAGE_TTL_MS) return cached.promise;

  const promise = request();
  coverageCache.set(key, { promise, fetchedAt: now });
  // A rejected request must not be cached, or one blip suppresses coverage for
  // a full TTL and every day stays annotation-less.
  promise.catch(() => {
    if (coverageCache.get(key)?.promise === promise) coverageCache.delete(key);
  });
  return promise;
}

export interface UseSelectedTimeRangeOptions {
  /** Narrow coverage to one site, so a site's own gaps are reported. */
  siteId?: string;
  /** Narrow coverage to one metric family (e.g. 'sle'). */
  metricFamily?: string;
  /** Skip the coverage fetch — for views that only need the bounds. */
  withCoverage?: boolean;
}

export interface UseSelectedTimeRangeResult {
  /** The raw token, e.g. '24h' or 'day-1'. */
  token: string;
  /** Concrete bounds and labels. Stable between live ticks. */
  range: ResolvedTimeRange;
  setToken: (token: string) => void;
  /** Selector options, with the oldest day bounded by real retention. */
  optionGroups: TimeRangeOptionGroup[];
  /** Availability per local date, keyed `YYYY-MM-DD`. */
  dayStatuses: Map<string, DayCoverageStatus>;
  /** Completeness note for the current selection, or null. */
  selectedCoverage: { severity: 'info' | 'warning'; message: string } | null;
  retentionDays: number;
  /** True when the store has never held a sample for this scope. */
  neverCollected: boolean;
  coverageLoading: boolean;
  /** Set when coverage could not be read. The selector still works without it. */
  coverageError: Error | null;
  refreshCoverage: () => void;
}

export function useSelectedTimeRange(
  options: UseSelectedTimeRangeOptions = {}
): UseSelectedTimeRangeResult {
  const { siteId, metricFamily, withCoverage = true } = options;
  const { filters, updateFilter } = useGlobalFilters();

  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(withCoverage);
  const [coverageError, setCoverageError] = useState<Error | null>(null);
  const [coverageNonce, setCoverageNonce] = useState(0);

  const retentionDays = coverage?.meta.retentionDays ?? DEFAULT_MAX_DAY_OFFSET;
  const token = normalizeTimeRangeToken(filters.timeRange, retentionDays);

  // One clock for the whole hook, advanced on a timer. Everything time-dependent
  // below derives from it, so the selected window, the day options and the
  // coverage evaluation can never disagree about what "now" is — which is how a
  // historical selection ends up computing today's expected hours against a
  // timestamp from whenever the component happened to mount.
  const [now, setNow] = useState(() => new Date());

  // The timer always runs: a selection of "Yesterday" still has to follow the
  // calendar across midnight. What it must NOT do is hand consumers a new window
  // every minute for a window that has not moved — see the memo below.
  //
  // With timer refresh off, that restriction now extends to *live* windows too.
  // A live window's `end` genuinely advances each minute, which produces new
  // bounds, a new resolved-range identity, and a refetch in every consumer —
  // this was the dashboard's real refresh mechanism, and left alone it was the
  // last thing still reloading a page the user was only looking at. Holding
  // `now` steady keeps the window fixed until the user navigates or refreshes.
  //
  // The calendar rollover is preserved regardless: after midnight "Yesterday"
  // means a different day, and returning the previous Date object unchanged
  // means React skips the re-render entirely on every other tick.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow((previous) => {
        const next = new Date();
        if (isAutoRefreshEnabled()) return next;
        return next.toDateString() === previous.toDateString() ? previous : next;
      });
    }, LIVE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const resolved = resolveTimeRange(token, now);
  // Identity is keyed on the bounds, not the tick. A live window produces new
  // bounds each minute and consumers refetch; a finished day produces the same
  // bounds forever and they do not. Without this, selecting a past day would
  // still restart every dashboard fetch once a minute.
  const rangeKey = `${resolved.token}|${resolved.startIso}|${resolved.endIso}`;
  const rangeRef = useRef<{ key: string; value: ResolvedTimeRange } | null>(null);
  if (rangeRef.current?.key !== rangeKey) {
    rangeRef.current = { key: rangeKey, value: resolved };
  }
  const range = rangeRef.current.value;

  const setToken = useCallback(
    (next: string) => updateFilter('timeRange', normalizeTimeRangeToken(next, retentionDays)),
    [updateFilter, retentionDays]
  );

  const optionGroups = useMemo(
    () => timeRangeOptions({ now, maxDayOffset: retentionDays }),
    [retentionDays, now]
  );

  // ── Coverage ─────────────────────────────────────────────────────────────
  // Queried over the whole retention window rather than the selected range: the
  // selector has to annotate every day it offers, not just the current one.
  useEffect(() => {
    if (!withCoverage) {
      setCoverageLoading(false);
      return undefined;
    }

    let active = true;
    const windowStart = localDayAtOffset(retentionDays, new Date());
    const timeZone = localTimeZone();
    const cacheKey = [siteId ?? '*', metricFamily ?? '*', timeZone, retentionDays, coverageNonce].join(
      '|'
    );

    setCoverageLoading(true);
    fetchCoverageShared(
      cacheKey,
      () =>
        monitoringHistory.getCoverage({
          start: windowStart.toISOString(),
          end: new Date().toISOString(),
          timeZone,
          siteId,
          metricFamily,
        }),
      Date.now()
    )
      .then((response) => {
        if (!active) return;
        setCoverage(response);
        setCoverageError(null);
      })
      .catch((caught: Error) => {
        if (!active) return;
        // Deliberately non-fatal, and the previous coverage is kept. Without
        // coverage every day reads as 'unknown' and stays selectable, which
        // degrades to the old behaviour instead of locking the selector.
        setCoverageError(caught);
      })
      .finally(() => {
        if (active) setCoverageLoading(false);
      });

    // No AbortController: the request is shared between mounted instances, so
    // one unmounting must not cancel it for the others. `active` gates the
    // state write instead.
    return () => {
      active = false;
    };
    // Intentionally not keyed on the clock: coverage is a per-day summary and
    // does not need re-fetching every minute.
  }, [withCoverage, siteId, metricFamily, retentionDays, coverageNonce]);

  const refreshCoverage = useCallback(() => setCoverageNonce((value) => value + 1), []);

  const dayOptions = useMemo(
    () => optionGroups.find((group) => group.id === 'day')?.options ?? [],
    [optionGroups]
  );

  const dayStatuses = useMemo(
    () =>
      evaluateDayCoverage({
        options: dayOptions,
        days: coverage ? coverage.days : null,
        retentionStart: coverage ? new Date(coverage.meta.retentionStart) : null,
        retentionDays,
        neverCollected: coverage?.meta.neverCollected ?? false,
        // The real current time, not the selected window's end — a past day's
        // 23:59 would make today look like it should already have 24 hours.
        now,
      }),
    [dayOptions, coverage, retentionDays, now]
  );

  const selectedCoverage = useMemo(
    () =>
      range.localDate ? describeSelectedCoverage(dayStatuses.get(range.localDate)) : null,
    [range.localDate, dayStatuses]
  );

  return {
    token,
    range,
    setToken,
    optionGroups,
    dayStatuses,
    selectedCoverage,
    retentionDays,
    neverCollected: coverage?.meta.neverCollected ?? false,
    coverageLoading,
    coverageError,
    refreshCoverage,
  };
}
