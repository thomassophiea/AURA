import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountUp } from './useCountUp';

// Drive requestAnimationFrame off the same fake clock so we can step
// through animation frames deterministically.
function installRafShim() {
  let now = 0;
  const callbacks: Array<{ id: number; cb: FrameRequestCallback; at: number }> = [];
  let nextId = 1;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.push({ id, cb, at: now + 16 });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const idx = callbacks.findIndex((c) => c.id === id);
    if (idx >= 0) callbacks.splice(idx, 1);
  });
  vi.stubGlobal('performance', { now: () => now });

  return {
    advance(ms: number) {
      now += ms;
      // Fire any callbacks whose target time has passed.
      const due = callbacks.splice(0, callbacks.length);
      for (const c of due) {
        if (c.at <= now) c.cb(now);
        else callbacks.push(c);
      }
    },
  };
}

describe('useCountUp', () => {
  let raf: ReturnType<typeof installRafShim>;

  beforeEach(() => {
    raf = installRafShim();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('snaps directly to a non-finite target without animating', () => {
    const { result } = renderHook(() => useCountUp(NaN));
    expect(result.current).toBeNaN();
  });

  it('snaps to target when below the minThreshold (0 by default)', () => {
    const { result } = renderHook(() => useCountUp(0));
    expect(result.current).toBe(0);
  });

  it('starts at 0 for a positive target on first mount', () => {
    const { result } = renderHook(() => useCountUp(100, { durationMs: 100 }));
    expect(result.current).toBe(0);
  });

  it('lands on the exact target after the full duration elapses', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, { durationMs: 100 }),
      {
        initialProps: { target: 100 },
      }
    );
    raf.advance(50);
    rerender({ target: 100 });
    raf.advance(50);
    rerender({ target: 100 });
    raf.advance(50);
    expect(result.current).toBe(100);
  });

  it('respects a custom easing function', () => {
    // Linear easing makes the math obvious.
    const linear = (t: number) => t;
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, { durationMs: 100, easing: linear }),
      { initialProps: { target: 100 } }
    );
    raf.advance(50);
    rerender({ target: 100 });
    // After half the duration with linear easing, we expect ~50.
    expect(result.current).toBeGreaterThanOrEqual(45);
    expect(result.current).toBeLessThanOrEqual(55);
  });

  it('cancels the in-flight animation when target changes mid-flight', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, { durationMs: 200 }),
      {
        initialProps: { target: 100 },
      }
    );
    raf.advance(50);
    rerender({ target: 50 }); // change target mid-animation
    raf.advance(250);
    rerender({ target: 50 });
    expect(result.current).toBe(50);
  });
});
