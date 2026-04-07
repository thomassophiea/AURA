/**
 * useTimeRangeFilter — time range selection with session persistence and row filtering.
 *
 * Manages a time range preset (15m, 1h, 24h, 7d, 30d) or custom range.
 * Provides a filterByTime utility that filters rows using a caller-supplied
 * timestamp extractor. Persisted to sessionStorage.
 */

import { useState, useCallback, useMemo } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export type TimePreset = '15m' | '1h' | '24h' | '7d' | '30d' | 'custom';

export interface TimeRange {
  preset: TimePreset;
  from?: Date;
  to?: Date;
}

export interface TimeRangeFilterResult {
  timeRange: TimeRange;
  setPreset: (preset: TimePreset) => void;
  setCustomRange: (from: Date, to: Date) => void;
  filterByTime: <T>(rows: T[], getTimestamp: (item: T) => Date | string | number | null | undefined) => T[];
  clearTimeRange: () => void;
  hasActiveTimeFilter: boolean;
  label: string;
}

// ── Preset Durations ───────────────────────────────────────────────────────

const PRESET_MS: Record<Exclude<TimePreset, 'custom'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const PRESET_LABELS: Record<TimePreset, string> = {
  '15m': 'Last 15 minutes',
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'custom': 'Custom range',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseTimestamp(ts: Date | string | number | null | undefined): number | null {
  if (ts == null) return null;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') {
    // If it looks like seconds (< year 2100 in ms), convert to ms
    return ts < 4102444800 ? ts * 1000 : ts;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function loadState(key: string): TimeRange {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        preset: parsed.preset || '24h',
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
      };
    }
  } catch { /* ignore */ }
  return { preset: '24h' };
}

function saveState(key: string, range: TimeRange) {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      preset: range.preset,
      from: range.from?.toISOString(),
      to: range.to?.toISOString(),
    }));
  } catch { /* quota exceeded */ }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTimeRangeFilter(storageKey: string): TimeRangeFilterResult {
  const [timeRange, setTimeRange] = useState<TimeRange>(() => loadState(storageKey));

  const setPreset = useCallback((preset: TimePreset) => {
    const next: TimeRange = { preset };
    setTimeRange(next);
    saveState(storageKey, next);
  }, [storageKey]);

  const setCustomRange = useCallback((from: Date, to: Date) => {
    const next: TimeRange = { preset: 'custom', from, to };
    setTimeRange(next);
    saveState(storageKey, next);
  }, [storageKey]);

  const clearTimeRange = useCallback(() => {
    setPreset('24h');
  }, [setPreset]);

  const hasActiveTimeFilter = timeRange.preset !== '24h';

  const label = PRESET_LABELS[timeRange.preset];

  const filterByTime = useCallback(<T,>(
    rows: T[],
    getTimestamp: (item: T) => Date | string | number | null | undefined,
  ): T[] => {
    const now = Date.now();
    let fromMs: number;
    let toMs: number = now;

    if (timeRange.preset === 'custom') {
      if (!timeRange.from || !timeRange.to) return rows;
      fromMs = timeRange.from.getTime();
      toMs = timeRange.to.getTime();
    } else {
      fromMs = now - PRESET_MS[timeRange.preset];
    }

    return rows.filter(row => {
      const ts = parseTimestamp(getTimestamp(row));
      if (ts === null) return true; // Keep rows with no timestamp
      return ts >= fromMs && ts <= toMs;
    });
  }, [timeRange]);

  return { timeRange, setPreset, setCustomRange, filterByTime, clearTimeRange, hasActiveTimeFilter, label };
}
