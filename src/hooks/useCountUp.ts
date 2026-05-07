import { useEffect, useRef, useState } from 'react';

interface CountUpOptions {
  /** Animation duration in ms. Default 600. */
  durationMs?: number;
  /** Easing function — input is 0..1, output is 0..1. Default cubic-out. */
  easing?: (t: number) => number;
  /** Skip the animation if the value is below this threshold (no value to animate). Default 0. */
  minThreshold?: number;
}

const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * useCountUp — animate a numeric value from 0 → target on first mount or
 * when target changes significantly. Uses requestAnimationFrame so it
 * doesn't tax React's render loop.
 *
 * @returns the in-flight display value (rounded to integer).
 */
export function useCountUp(target: number, options: CountUpOptions = {}): number {
  const { durationMs = 600, easing = cubicOut, minThreshold = 0 } = options;
  const [display, setDisplay] = useState<number>(() =>
    target <= minThreshold || !Number.isFinite(target) ? target : 0
  );
  const fromRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target) || target <= minThreshold) {
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easing(t);
      const value = from + (target - from) * eased;
      setDisplay(Math.round(value));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, easing, minThreshold]);

  return display;
}
