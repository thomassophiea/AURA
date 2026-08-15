import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useSelectedTimeRange, clearCoverageCache } from './useSelectedTimeRange';
import { setGlobalFilters } from './useGlobalFilters';
import { localDateKey, localDayAtOffset } from '../lib/timeRange';
import { monitoringHistory } from '../services/monitoringHistory';
import type { CoverageResponse } from '../types/monitoring';

// The policy is storage-backed and Node's experimental `localStorage` global
// shadows jsdom's in this runtime, so drive it directly instead of through
// storage — these tests are about the clock, not about persistence.
const { autoRefreshState } = vi.hoisted(() => ({ autoRefreshState: { enabled: false } }));
vi.mock('../lib/autoRefresh', () => ({
  isAutoRefreshEnabled: () => autoRefreshState.enabled,
  setAutoRefreshEnabled: (v: boolean) => {
    autoRefreshState.enabled = v;
  },
  whenAutoRefresh:
    <T extends (...a: never[]) => unknown>(cb: T) =>
    (...a: Parameters<T>) =>
      autoRefreshState.enabled ? cb(...a) : undefined,
}));
const setAutoRefreshEnabled = (v: boolean) => {
  autoRefreshState.enabled = v;
};


const NOW = new Date(2026, 7, 6, 15, 50, 0, 0);
const dateOf = (offset: number) => localDateKey(localDayAtOffset(offset, NOW));

function coverage(overrides: Partial<CoverageResponse['meta']> = {}): CoverageResponse {
  const retentionStart = new Date(NOW.getTime() - 7 * 24 * 3_600_000);
  return {
    days: [
      {
        localDate: dateOf(1),
        sampleCount: 288,
        hoursPresent: 24,
        firstObservedAt: localDayAtOffset(1, NOW).toISOString(),
        lastObservedAt: NOW.toISOString(),
      },
    ],
    meta: {
      timeZone: 'UTC',
      start: retentionStart.toISOString(),
      end: NOW.toISOString(),
      requestedStart: retentionStart.toISOString(),
      clampedToRetention: false,
      retentionStart: retentionStart.toISOString(),
      retentionDays: 7,
      earliestAvailable: retentionStart.toISOString(),
      neverCollected: false,
      servingFrom: 'database',
      sources: [],
      ...overrides,
    },
  };
}

let getCoverage: MockInstance<typeof monitoringHistory.getCoverage>;

beforeEach(() => {
  // `shouldAdvanceTime` keeps the fake clock moving with real time, so
  // `waitFor` can still resolve while `setSystemTime` and `advanceTimersByTime`
  // remain available for the clock-advance cases below.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  clearCoverageCache();
  // A known starting point: the hook reads the shared global filter, which
  // persists across mounts by design.
  setGlobalFilters({ timeRange: '24h', site: 'all', environment: 'all' });
  vi.advanceTimersByTime(400); // flush the filter store's notify debounce
  getCoverage = vi.spyOn(monitoringHistory, 'getCoverage').mockResolvedValue(coverage());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useSelectedTimeRange — resolution', () => {
  it('resolves the stored token into explicit bounds', () => {
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    expect(result.current.token).toBe('24h');
    // Bounds are explicit ISO instants spanning exactly the window, ending now.
    expect(result.current.range.startIso).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.current.range.endIso).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(
      new Date(result.current.range.endIso).getTime() -
        new Date(result.current.range.startIso).getTime()
    ).toBe(24 * 3_600_000);
    expect(result.current.range.end.getTime()).toBeCloseTo(Date.now(), -3);
  });

  it('resolves a calendar-day token to that local day', () => {
    setGlobalFilters({ timeRange: 'day-1' });
    vi.advanceTimersByTime(400);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));

    expect(result.current.range.kind).toBe('calendar-day');
    expect(result.current.range.start.getHours()).toBe(0);
    expect(result.current.range.localDate).toBe(dateOf(1));
    expect(result.current.range.isLive).toBe(false);
  });

  it('migrates a legacy stored token instead of failing to resolve it', () => {
    setGlobalFilters({ timeRange: '30d' });
    vi.advanceTimersByTime(400);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    expect(result.current.token).toBe('7d');
  });
});

describe('useSelectedTimeRange — persistence across views', () => {
  it('writes the selection to the shared filter so another view sees it', () => {
    const first = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    act(() => first.result.current.setToken('day-3'));
    act(() => vi.advanceTimersByTime(400));

    // A different component mounting later — the equivalent of navigating away
    // and back — reads the same selection.
    const second = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    expect(second.result.current.token).toBe('day-3');
    expect(second.result.current.range.localDate).toBe(dateOf(3));
  });

  it('keeps two concurrently mounted views on the same window', () => {
    const bar = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    const page = renderHook(() => useSelectedTimeRange({ withCoverage: false }));

    act(() => bar.result.current.setToken('day-2'));
    act(() => vi.advanceTimersByTime(400));

    expect(page.result.current.token).toBe('day-2');
    expect(page.result.current.range.startIso).toBe(bar.result.current.range.startIso);
  });
});

describe('useSelectedTimeRange — the clock', () => {
  it('holds a live window still while auto-refresh is off', () => {
    // A live window's `end` advancing every  was the dashboard's de-facto
    // refresh trigger: new bounds meant a new range identity and a refetch in
    // every consumer. With timer refresh off that is exactly the page reloading
    // itself under an idle viewer, so the window stays put until the user
    // navigates or presses Refresh.
    setAutoRefreshEnabled(false);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    const before = result.current.range.endIso;

    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 5 * 61_000));
      vi.advanceTimersByTime(5 * 61_000);
    });

    expect(result.current.range.endIso).toBe(before);
  });

  it('advances a live window as time passes when auto-refresh is on', () => {
    setAutoRefreshEnabled(true);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    const before = result.current.range.endIso;

    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 61_000));
      vi.advanceTimersByTime(61_000);
    });

    expect(result.current.range.endIso).not.toBe(before);
    setAutoRefreshEnabled(false);
  });

  it('still follows the calendar across midnight with auto-refresh off', () => {
    // The window must not advance minute to minute, but "Yesterday" genuinely
    // means a different day once the date rolls over.
    setAutoRefreshEnabled(false);
    setGlobalFilters({ timeRange: 'day-1' });
    vi.advanceTimersByTime(400);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    const before = result.current.range.startIso;

    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 36 * 60 * 60 * 1000));
      vi.advanceTimersByTime(61_000);
    });

    expect(result.current.range.startIso).not.toBe(before);
  });

  it('holds a finished day perfectly still, so consumers do not refetch it', () => {
    setGlobalFilters({ timeRange: 'day-1' });
    vi.advanceTimersByTime(400);
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    const before = result.current.range;

    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 5 * 61_000));
      vi.advanceTimersByTime(5 * 61_000);
    });

    // Same object identity, not merely equal values: a new object would restart
    // every downstream fetch keyed on the range.
    expect(result.current.range).toBe(before);
  });
});

describe('useSelectedTimeRange — coverage', () => {
  it('requests coverage with explicit bounds and the local zone', async () => {
    renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(getCoverage).toHaveBeenCalled());

    const query = getCoverage.mock.calls[0][0];
    expect(query.start).toBeTruthy();
    expect(query.end).toBeTruthy();
    expect(query.timeZone).toBeTruthy();
    expect(new Date(query.start).getTime()).toBeLessThan(new Date(query.end).getTime());
  });

  it('scopes coverage to the requested site and metric family', async () => {
    renderHook(() => useSelectedTimeRange({ siteId: 'site-1', metricFamily: 'sle' }));
    await waitFor(() => expect(getCoverage).toHaveBeenCalled());

    const query = getCoverage.mock.calls[0][0];
    expect(query.siteId).toBe('site-1');
    expect(query.metricFamily).toBe('sle');
  });

  it('shares one request between concurrently mounted consumers', async () => {
    renderHook(() => useSelectedTimeRange());
    renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(getCoverage).toHaveBeenCalled());
    // The filter bar and the page header both need coverage; they must not each
    // issue their own request.
    expect(getCoverage).toHaveBeenCalledTimes(1);
  });

  it('annotates the day the store actually holds, and the ones it does not', async () => {
    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.dayStatuses.size).toBeGreaterThan(0));

    expect(result.current.dayStatuses.get(dateOf(1))!.availability).toBe('complete');
    // Day 4 is absent from the coverage response entirely.
    expect(result.current.dayStatuses.get(dateOf(4))!.availability).toBe('empty');
    expect(result.current.dayStatuses.get(dateOf(4))!.selectable).toBe(false);
  });

  it('surfaces a completeness note for the selected day', async () => {
    getCoverage.mockResolvedValue({
      ...coverage(),
      days: [
        {
          localDate: dateOf(1),
          sampleCount: 100,
          hoursPresent: 9,
          firstObservedAt: localDayAtOffset(1, NOW).toISOString(),
          lastObservedAt: NOW.toISOString(),
        },
      ],
    });
    setGlobalFilters({ timeRange: 'day-1' });
    vi.advanceTimersByTime(400);

    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.selectedCoverage).not.toBeNull());
    expect(result.current.selectedCoverage!.message).toMatch(/9 of 24 hours/);
  });

  it('says nothing about completeness for a rolling window', async () => {
    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.coverageLoading).toBe(false));
    expect(result.current.selectedCoverage).toBeNull();
  });

  it('bounds the day list by the retention the server reports', async () => {
    getCoverage.mockResolvedValue(coverage({ retentionDays: 3 }));
    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.retentionDays).toBe(3));

    const days = result.current.optionGroups.find((group) => group.id === 'day')!;
    expect(days.options).toHaveLength(4); // today .. 3 days ago
  });

  it('clamps a stored day token that retention no longer covers', async () => {
    setGlobalFilters({ timeRange: 'day-6' });
    vi.advanceTimersByTime(400);
    getCoverage.mockResolvedValue(coverage({ retentionDays: 3 }));

    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.retentionDays).toBe(3));
    expect(result.current.token).toBe('day-3');
  });

  it('leaves the selector usable when coverage cannot be read', async () => {
    getCoverage.mockRejectedValue(new Error('database unavailable'));
    const { result } = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(result.current.coverageError).not.toBeNull());

    // No coverage means no annotations — never a locked selector.
    for (const status of result.current.dayStatuses.values()) {
      expect(status.selectable).toBe(true);
      expect(status.availability).toBe('unknown');
    }
  });

  it('does not cache a failed coverage request', async () => {
    getCoverage.mockRejectedValueOnce(new Error('blip'));
    const first = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(first.result.current.coverageError).not.toBeNull());

    getCoverage.mockResolvedValue(coverage());
    const second = renderHook(() => useSelectedTimeRange());
    await waitFor(() => expect(second.result.current.dayStatuses.size).toBeGreaterThan(0));
    expect(second.result.current.dayStatuses.get(dateOf(1))!.availability).toBe('complete');
  });

  it('skips the coverage request entirely when not wanted', async () => {
    const { result } = renderHook(() => useSelectedTimeRange({ withCoverage: false }));
    await waitFor(() => expect(result.current.coverageLoading).toBe(false));
    expect(getCoverage).not.toHaveBeenCalled();
  });
});
