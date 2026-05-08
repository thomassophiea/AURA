import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeRangeFilter } from './useTimeRangeFilter';

const KEY = 'time-range-test';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-07T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useTimeRangeFilter', () => {
  it('defaults to 24h preset on first mount', () => {
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    expect(result.current.timeRange.preset).toBe('24h');
    expect(result.current.hasActiveTimeFilter).toBe(false);
    expect(result.current.label).toBe('Last 24 hours');
  });

  it('setPreset updates timeRange and persists to sessionStorage', () => {
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    act(() => {
      result.current.setPreset('1h');
    });
    expect(result.current.timeRange.preset).toBe('1h');
    expect(result.current.hasActiveTimeFilter).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(KEY)!).preset).toBe('1h');
  });

  it('setCustomRange persists from/to as ISO and flips preset to "custom"', () => {
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    const from = new Date('2026-05-01T00:00:00Z');
    const to = new Date('2026-05-02T00:00:00Z');
    act(() => {
      result.current.setCustomRange(from, to);
    });
    expect(result.current.timeRange.preset).toBe('custom');
    expect(result.current.timeRange.from?.toISOString()).toBe(from.toISOString());
    expect(result.current.timeRange.to?.toISOString()).toBe(to.toISOString());
    const persisted = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(persisted.preset).toBe('custom');
    expect(persisted.from).toBe(from.toISOString());
  });

  it('clearTimeRange resets preset to 24h', () => {
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    act(() => {
      result.current.setPreset('7d');
    });
    expect(result.current.timeRange.preset).toBe('7d');
    act(() => {
      result.current.clearTimeRange();
    });
    expect(result.current.timeRange.preset).toBe('24h');
  });

  it('hydrates initial state from sessionStorage', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ preset: '15m', from: undefined, to: undefined }));
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    expect(result.current.timeRange.preset).toBe('15m');
  });

  it('hydrates custom range from sessionStorage as Date instances', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        preset: 'custom',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z',
      })
    );
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    expect(result.current.timeRange.preset).toBe('custom');
    expect(result.current.timeRange.from).toBeInstanceOf(Date);
    expect(result.current.timeRange.to).toBeInstanceOf(Date);
  });

  it('falls back to 24h on corrupt JSON', () => {
    sessionStorage.setItem(KEY, 'not-json');
    const { result } = renderHook(() => useTimeRangeFilter(KEY));
    expect(result.current.timeRange.preset).toBe('24h');
  });

  it('label maps every preset', () => {
    const { result, rerender } = renderHook(() => useTimeRangeFilter(KEY));
    const presets = ['15m', '1h', '24h', '7d', '30d'] as const;
    const labels = ['Last 15 minutes', 'Last hour', 'Last 24 hours', 'Last 7 days', 'Last 30 days'];
    for (let i = 0; i < presets.length; i++) {
      act(() => {
        result.current.setPreset(presets[i]);
      });
      rerender();
      expect(result.current.label).toBe(labels[i]);
    }
  });

  describe('filterByTime', () => {
    type Row = { id: number; ts?: Date | string | number | null };
    const rows: Row[] = [
      { id: 1, ts: new Date('2026-05-07T14:55:00Z') }, // 5m ago
      { id: 2, ts: new Date('2026-05-07T14:00:00Z') }, // 1h ago
      { id: 3, ts: new Date('2026-05-06T15:00:00Z') }, // 24h ago
      { id: 4, ts: new Date('2026-04-30T15:00:00Z') }, // 7d ago
      { id: 5, ts: null },
      { id: 6, ts: undefined },
      { id: 7, ts: '2026-05-07T14:30:00Z' }, // 30m ago
      { id: 8, ts: new Date('2026-05-07T14:55:00Z').getTime() }, // ms number, 5m ago
    ];

    it('15m preset keeps recent + null/undefined timestamps', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('15m');
      });
      const out = result.current.filterByTime(rows, (r) => r.ts);
      const ids = out.map((r) => r.id).sort((a, b) => a - b);
      expect(ids).toEqual([1, 5, 6, 8]);
    });

    it('1h preset keeps last hour rows + null timestamps', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('1h');
      });
      const out = result.current.filterByTime(rows, (r) => r.ts);
      const ids = out.map((r) => r.id).sort((a, b) => a - b);
      expect(ids).toContain(1);
      expect(ids).toContain(7);
      expect(ids).not.toContain(3);
      expect(ids).not.toContain(4);
    });

    it('30d preset keeps everything that has a recent timestamp', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('30d');
      });
      const out = result.current.filterByTime(rows, (r) => r.ts);
      expect(out.length).toBe(rows.length); // all kept (ts<30d ago or null)
    });

    it('custom preset with both dates filters by [from, to]', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      const from = new Date('2026-05-07T13:00:00Z');
      const to = new Date('2026-05-07T15:00:00Z');
      act(() => {
        result.current.setCustomRange(from, to);
      });
      const out = result.current.filterByTime(rows, (r) => r.ts);
      const ids = out.map((r) => r.id).sort((a, b) => a - b);
      // 2026-05-07 13:00 → 15:00 covers rows 1 (14:55), 2 (14:00), 7 (14:30), 8 (14:55) + null/undefined
      expect(ids).toEqual([1, 2, 5, 6, 7, 8]);
    });

    it('custom preset without from/to returns rows unchanged', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('custom');
      });
      const out = result.current.filterByTime(rows, (r) => r.ts);
      expect(out.length).toBe(rows.length);
    });

    it('handles invalid timestamp string by keeping the row', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('15m');
      });
      const out = result.current.filterByTime(
        [{ id: 99, ts: 'not-a-date' }],
        (r) => r.ts as string
      );
      expect(out.length).toBe(1);
    });

    it('treats small numeric timestamps as seconds (Unix epoch)', () => {
      const { result } = renderHook(() => useTimeRangeFilter(KEY));
      act(() => {
        result.current.setPreset('15m');
      });
      // 5 min ago in seconds
      const fiveMinAgoSecs = Math.floor((Date.now() - 5 * 60_000) / 1000);
      const out = result.current.filterByTime(
        [{ id: 99, ts: fiveMinAgoSecs }],
        (r) => r.ts as number
      );
      expect(out.length).toBe(1);
    });
  });
});
