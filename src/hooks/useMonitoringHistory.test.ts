import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useMonitoringHistory, worstState, mostRecentSuccess } from './useMonitoringHistory';
import { MonitoringRequestError } from '../types/monitoring';
import type { HistoryResponse, SourceHealth } from '../types/monitoring';

const getHistory = vi.fn();

// Fully replaced rather than partially mocked: importing the real module pulls
// in `apiService`, which touches localStorage at import time and blows up in
// this jsdom setup. `rangeFromPreset` is reimplemented here to match.
vi.mock('../services/monitoringHistory', () => {
  const HOURS: Record<string, number> = { '15m': 0.25, '1h': 1, '24h': 24, '7d': 168 };
  return {
    monitoringHistory: {
      getHistory: (...args: unknown[]) => getHistory(...args),
      getLatest: vi.fn(),
      getSourceHealth: vi.fn(),
    },
    rangeFromPreset: (preset: string, now: Date = new Date()) => {
      const hours = HOURS[preset] ?? 168;
      return {
        start: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
        end: now.toISOString(),
      };
    },
    lastNDays: (days: number, now: Date = new Date()) => ({
      start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
      end: now.toISOString(),
    }),
    lastNHours: (hours: number, now: Date = new Date()) => ({
      start: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
      end: now.toISOString(),
    }),
  };
});

const source = (overrides: Partial<SourceHealth> = {}): SourceHealth => ({
  sourceId: 'src-a',
  displayName: 'Controller A',
  orgId: 'org-a',
  siteGroupId: 'sg-a',
  enabled: true,
  state: 'fresh',
  lastAttemptAt: '2026-08-05T11:59:00.000Z',
  lastSuccessAt: '2026-08-05T11:59:00.000Z',
  lastFailureAt: null,
  lastSuccessAgeSeconds: 60,
  consecutiveFailures: 0,
  errorClass: null,
  errorLabel: null,
  servingFrom: 'database',
  backfillSupported: true,
  ...overrides,
});

const response = (overrides: Partial<HistoryResponse> = {}): HistoryResponse => ({
  series: [
    {
      key: {
        monitoredSourceId: 'src-a',
        siteId: 'site-1',
        deviceExternalId: null,
        radioExternalId: null,
        wlanExternalId: null,
        metricFamily: 'sle',
        metricName: 'coverage',
        dimensions: {},
      },
      unit: '%',
      metricKind: 'percentage',
      points: [
        {
          observedAt: '2026-08-05T11:00:00.000Z',
          value: 95,
          numerator: 19,
          denominator: 20,
          sampleCount: 20,
          qualityState: 'observed',
        },
      ],
      gaps: [],
    },
  ],
  meta: {
    start: '2026-07-29T12:00:00.000Z',
    end: '2026-08-05T12:00:00.000Z',
    requestedStart: '2026-07-29T12:00:00.000Z',
    clampedToRetention: false,
    retentionStart: '2026-07-29T12:00:00.000Z',
    retentionDays: 7,
    truncated: false,
    maxPoints: 5000,
    pointCount: 1,
    earliestAvailable: '2026-08-01T00:00:00.000Z',
    neverCollected: false,
    servingFrom: 'database',
    sources: [source()],
  },
  ...overrides,
});

beforeEach(() => {
  getHistory.mockReset();
});

describe('worstState', () => {
  it('reports the most severe source state', () => {
    expect(worstState([source({ state: 'fresh' }), source({ state: 'offline' })])).toBe('offline');
    expect(worstState([source({ state: 'fresh' }), source({ state: 'stale' })])).toBe('stale');
  });

  it('is unknown with no sources', () => {
    expect(worstState([])).toBe('unknown');
  });

  it('ranks offline above never_collected', () => {
    expect(worstState([source({ state: 'never_collected' }), source({ state: 'offline' })])).toBe(
      'offline'
    );
  });
});

describe('mostRecentSuccess', () => {
  it('returns the latest successful collection across sources', () => {
    const result = mostRecentSuccess([
      source({ lastSuccessAt: '2026-08-05T10:00:00.000Z' }),
      source({ lastSuccessAt: '2026-08-05T11:00:00.000Z' }),
    ]);
    expect(result).toBe('2026-08-05T11:00:00.000Z');
  });

  it('returns null when nothing ever succeeded', () => {
    expect(mostRecentSuccess([source({ lastSuccessAt: null })])).toBeNull();
  });
});

describe('useMonitoringHistory', () => {
  it('loads history on mount', async () => {
    getHistory.mockResolvedValue(response());
    const { result } = renderHook(() => useMonitoringHistory({ siteId: 'site-1' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('defaults to the last seven days', async () => {
    getHistory.mockResolvedValue(response());
    renderHook(() => useMonitoringHistory());

    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    const { start, end } = getHistory.mock.calls[0][0];
    const spanDays =
      (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(spanDays)).toBe(7);
  });

  it('honours a shorter preset', async () => {
    getHistory.mockResolvedValue(response());
    renderHook(() => useMonitoringHistory({ preset: '24h' }));

    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    const { start, end } = getHistory.mock.calls[0][0];
    const spanHours = (new Date(end).getTime() - new Date(start).getTime()) / (60 * 60 * 1000);
    expect(Math.round(spanHours)).toBe(24);
  });

  it('keeps existing data visible when a refresh fails', async () => {
    getHistory.mockResolvedValueOnce(response());
    const { result } = renderHook(() => useMonitoringHistory());
    await waitFor(() => expect(result.current.series).toHaveLength(1));

    getHistory.mockRejectedValueOnce(new Error('network down'));
    await result.current.refresh();

    await waitFor(() => expect(result.current.error).toBeTruthy());
    // The whole point: a failed poll must not blank the chart.
    expect(result.current.series).toHaveLength(1);
    expect(result.current.series[0].points[0].value).toBe(95);
  });

  it('never substitutes zeros for a failed refresh', async () => {
    getHistory.mockResolvedValueOnce(response());
    const { result } = renderHook(() => useMonitoringHistory());
    await waitFor(() => expect(result.current.series).toHaveLength(1));

    getHistory.mockRejectedValueOnce(new Error('gateway unreachable'));
    await result.current.refresh();

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.series[0].points.every((p) => p.value !== 0)).toBe(true);
  });

  it('separates a range rejection from a transport error', async () => {
    getHistory.mockRejectedValue(
      new MonitoringRequestError(400, { error: 'range_too_large', detail: 'too wide' })
    );
    const { result } = renderHook(() => useMonitoringHistory());

    await waitFor(() => expect(result.current.rangeError).toBeTruthy());
    expect(result.current.error).toBeNull();
    expect(result.current.rangeError?.body.error).toBe('range_too_large');
  });

  it('distinguishes never-collected from an empty window', async () => {
    getHistory.mockResolvedValue(
      response({
        series: [],
        meta: { ...response().meta, neverCollected: true, earliestAvailable: null },
      })
    );
    const { result: never } = renderHook(() => useMonitoringHistory());
    await waitFor(() => expect(never.current.loading).toBe(false));
    expect(never.current.neverCollected).toBe(true);
    expect(never.current.emptyRange).toBe(false);

    getHistory.mockResolvedValue(response({ series: [] }));
    const { result: empty } = renderHook(() => useMonitoringHistory({ siteId: 'other' }));
    await waitFor(() => expect(empty.current.loading).toBe(false));
    expect(empty.current.neverCollected).toBe(false);
    expect(empty.current.emptyRange).toBe(true);
  });

  it('surfaces the worst source state and the last successful collection', async () => {
    getHistory.mockResolvedValue(
      response({
        meta: {
          ...response().meta,
          sources: [
            source({ state: 'offline', lastSuccessAt: '2026-08-03T09:00:00.000Z' }),
            source({ sourceId: 'src-b', state: 'fresh', lastSuccessAt: '2026-08-05T11:00:00.000Z' }),
          ],
        },
      })
    );
    const { result } = renderHook(() => useMonitoringHistory());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.worstSourceState).toBe('offline');
    expect(result.current.lastSuccessfulCollectionAt).toBe('2026-08-05T11:00:00.000Z');
  });

  it('exposes gap metadata from the backend', async () => {
    getHistory.mockResolvedValue(
      response({
        series: [
          {
            ...response().series[0],
            gaps: [
              { from: '2026-08-02T00:00:00.000Z', to: '2026-08-04T00:00:00.000Z', durationSeconds: 172800 },
            ],
          },
        ],
      })
    );
    const { result } = renderHook(() => useMonitoringHistory());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series[0].gaps).toHaveLength(1);
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useMonitoringHistory({ enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getHistory).not.toHaveBeenCalled();
  });

  it('reports refreshing separately from the initial load', async () => {
    getHistory.mockResolvedValue(response());
    const { result } = renderHook(() => useMonitoringHistory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const refreshPromise = result.current.refresh();
    await refreshPromise;
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(result.current.loading).toBe(false);
  });
});
