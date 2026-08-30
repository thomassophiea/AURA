import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimelineNavigation } from './useTimelineNavigation';

// Polyfill rAF synchronously so the throttled setCurrentTime fires immediately.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTimelineNavigation', () => {
  it('initializes with null/empty state for the scope', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    expect(result.current.currentTime).toBeNull();
    expect(result.current.timeWindow).toEqual({ start: null, end: null });
    expect(result.current.isLocked).toBe(false);
  });

  it('setCurrentTime updates currentTime when unlocked', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.setCurrentTime(123));
    expect(result.current.currentTime).toBe(123);
  });

  it('setCurrentTime is no-op when locked', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.toggleLock()); // locked
    act(() => result.current.setCurrentTime(999));
    expect(result.current.currentTime).toBeNull();
  });

  it('toggleLock flips isLocked', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.toggleLock());
    expect(result.current.isLocked).toBe(true);
    act(() => result.current.toggleLock());
    expect(result.current.isLocked).toBe(false);
  });

  it('startTimeWindow → updateTimeWindow → endTimeWindow + clearTimeWindow', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.startTimeWindow(100));
    expect(result.current.timeWindow).toEqual({ start: 100, end: 100 });
    act(() => result.current.updateTimeWindow(200));
    expect(result.current.timeWindow).toEqual({ start: 100, end: 200 });
    act(() => result.current.endTimeWindow());
    // After endTimeWindow, updateTimeWindow becomes a no-op
    act(() => result.current.updateTimeWindow(500));
    expect(result.current.timeWindow.end).toBe(200);
    act(() => result.current.clearTimeWindow());
    expect(result.current.timeWindow).toEqual({ start: null, end: null });
  });

  it('updateTimeWindow without startTimeWindow does nothing', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.updateTimeWindow(500));
    expect(result.current.timeWindow).toEqual({ start: null, end: null });
  });

  it('softReset clears window but preserves lock + currentTime', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.resetTimeline());
    act(() => result.current.setCurrentTime(50));
    act(() => result.current.toggleLock());
    act(() => result.current.startTimeWindow(10));
    act(() => result.current.updateTimeWindow(20));
    act(() => result.current.softReset());
    expect(result.current.timeWindow).toEqual({ start: null, end: null });
    // currentTime preserved while locked → still 50
    expect(result.current.currentTime).toBe(50);
    expect(result.current.isLocked).toBe(true);
  });

  it('resetTimeline clears all state', () => {
    const { result } = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => result.current.setCurrentTime(50));
    act(() => result.current.toggleLock());
    act(() => result.current.resetTimeline());
    expect(result.current.currentTime).toBeNull();
    expect(result.current.isLocked).toBe(false);
    expect(result.current.timeWindow).toEqual({ start: null, end: null });
  });

  it('client-insights and ap-insights scopes are independent', () => {
    const a = renderHook(() => useTimelineNavigation('client-insights'));
    const b = renderHook(() => useTimelineNavigation('ap-insights'));
    act(() => a.result.current.resetTimeline());
    act(() => b.result.current.resetTimeline());
    act(() => a.result.current.setCurrentTime(11));
    expect(a.result.current.currentTime).toBe(11);
    expect(b.result.current.currentTime).toBeNull();
  });

  it('does not re-publish an unchanged timestamp (hover on the same bucket)', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useTimelineNavigation('client-insights');
    });
    act(() => result.current.resetTimeline());
    act(() => result.current.setCurrentTime(123));
    const rendersAfterFirst = renders;
    act(() => result.current.setCurrentTime(123));
    act(() => result.current.setCurrentTime(123));
    expect(renders).toBe(rendersAfterFirst);
    expect(result.current.currentTime).toBe(123);
  });

  it('ignoreUnlockedCursorMoves skips hover re-renders but delivers lock changes', () => {
    let chartRenders = 0;
    const charts = renderHook(() => {
      chartRenders += 1;
      return useTimelineNavigation('client-insights', { ignoreUnlockedCursorMoves: true });
    });
    const live = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => live.result.current.resetTimeline());

    const baseline = chartRenders;
    act(() => live.result.current.setCurrentTime(100));
    act(() => live.result.current.setCurrentTime(200));
    act(() => live.result.current.setCurrentTime(300));
    // The live subscriber tracked the cursor; the chart subscriber kept its
    // previous state. (React allows one extra render before bailing out on a
    // same-state set, so the count is bounded, not zero.)
    expect(live.result.current.currentTime).toBe(300);
    expect(chartRenders - baseline).toBeLessThanOrEqual(1);
    expect(charts.result.current.currentTime).not.toBe(300);

    // Locking must reach the chart subscriber, carrying the locked time.
    act(() => live.result.current.toggleLock());
    expect(charts.result.current.isLocked).toBe(true);
    expect(charts.result.current.currentTime).toBe(300);

    // Unlock propagates too.
    act(() => live.result.current.toggleLock());
    expect(charts.result.current.isLocked).toBe(false);
  });

  it('syncFromScope copies state from another scope', () => {
    const a = renderHook(() => useTimelineNavigation('client-insights'));
    const b = renderHook(() => useTimelineNavigation('ap-insights'));
    act(() => a.result.current.resetTimeline());
    act(() => b.result.current.resetTimeline());
    act(() => a.result.current.setCurrentTime(77));
    act(() => a.result.current.toggleLock());
    act(() => b.result.current.syncFromScope('client-insights'));
    expect(b.result.current.currentTime).toBe(77);
    expect(b.result.current.isLocked).toBe(true);
  });

  it('two hook instances of the same scope stay in sync', () => {
    const a = renderHook(() => useTimelineNavigation('client-insights'));
    const b = renderHook(() => useTimelineNavigation('client-insights'));
    act(() => a.result.current.resetTimeline());
    act(() => a.result.current.setCurrentTime(42));
    expect(b.result.current.currentTime).toBe(42);
  });
});
