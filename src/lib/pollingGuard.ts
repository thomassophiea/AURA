/**
 * Guard a background refresh so it only runs when the page is actually visible.
 *
 * AURA runs ~20 independent pollers against the gateway and its own backend.
 * Most were plain `setInterval`s with no visibility check, so a demo laptop with
 * AURA parked behind a slide deck kept driving controller traffic, and every one
 * of those responses landed on a page nobody was watching — competing with
 * whatever the operator did next when they switched back.
 *
 * Browsers throttle timers in a hidden tab, but they do not stop them, and
 * throttling is not the same as not asking. This wraps the interval callback
 * rather than replacing the effect, so each caller keeps its existing initial
 * load, dependencies and teardown exactly as they were.
 *
 * Note this deliberately guards the *poll*, not the initial load: mounting a
 * page is always a deliberate act, and its first fetch must never be skipped.
 */
export function whenVisible<T extends (...args: never[]) => unknown>(
  callback: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>) => {
    if (typeof document !== 'undefined' && document.hidden) return undefined;
    return callback(...args) as ReturnType<T>;
  };
}
