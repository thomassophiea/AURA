import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Node's experimental built-in `localStorage` global shadows jsdom's here and
// does not implement the whole Storage interface (see the same note in
// services/api.ts). Install a complete shim before the module under test reads
// it, so these assertions exercise the policy rather than the runtime.
const store: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
  },
  writable: true,
  configurable: true,
});

import {
  isAutoRefreshEnabled,
  onReturnAfterHidden,
  setAutoRefreshEnabled,
  whenAutoRefresh,
} from './autoRefresh';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

afterEach(() => vi.restoreAllMocks());

describe('auto-refresh policy', () => {
  it('is off unless explicitly enabled', () => {
    // The default is the product decision: a page the user is merely looking at
    // must not rewrite itself. Changing this default changes demo behaviour.
    expect(isAutoRefreshEnabled()).toBe(false);
  });

  it('can be turned on and back off per browser', () => {
    setAutoRefreshEnabled(true);
    expect(isAutoRefreshEnabled()).toBe(true);
    setAutoRefreshEnabled(false);
    expect(isAutoRefreshEnabled()).toBe(false);
  });

  it('falls back to the default when storage is unavailable', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('private browsing');
    });
    expect(isAutoRefreshEnabled()).toBe(false);
  });
});

describe('whenAutoRefresh', () => {
  it('suppresses the callback while auto-refresh is off', () => {
    const refresh = vi.fn();
    whenAutoRefresh(refresh)();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('runs the callback when auto-refresh is on and the page is visible', () => {
    setAutoRefreshEnabled(true);
    const refresh = vi.fn();
    whenAutoRefresh(refresh)();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('still suppresses a hidden page even when auto-refresh is on', () => {
    setAutoRefreshEnabled(true);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const refresh = vi.fn();
    whenAutoRefresh(refresh)();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reads the setting at fire time, not at wrap time', () => {
    // Guards are created once when an effect mounts and fire many times after.
    // Capturing the value at wrap time would leave a page polling for its whole
    // lifetime after the setting was turned off.
    const refresh = vi.fn();
    const guarded = whenAutoRefresh(refresh);
    guarded();
    expect(refresh).not.toHaveBeenCalled();

    setAutoRefreshEnabled(true);
    guarded();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('passes arguments and returns the callback result when it runs', () => {
    setAutoRefreshEnabled(true);
    const guarded = whenAutoRefresh((n: never) => (n as unknown as number) * 2);
    expect(guarded(21 as never)).toBe(42);
  });

  it('returns undefined when suppressed', () => {
    const guarded = whenAutoRefresh(() => 'refreshed');
    expect(guarded()).toBeUndefined();
  });
});

describe('onReturnAfterHidden', () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes when the tab returns after being hidden for at least a minute', () => {
    const refresh = vi.fn();
    const stop = onReturnAfterHidden(refresh);
    setHidden(true);
    vi.setSystemTime(new Date('2026-10-08T12:01:05Z'));
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does nothing for a brief switch away', () => {
    const refresh = vi.fn();
    const stop = onReturnAfterHidden(refresh);
    setHidden(true);
    vi.setSystemTime(new Date('2026-10-08T12:00:20Z'));
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it('is independent of the auto-refresh policy (which stays off) and never fires while idle', () => {
    expect(isAutoRefreshEnabled()).toBe(false);
    const refresh = vi.fn();
    const stop = onReturnAfterHidden(refresh);
    // A visible, idle page: time passes, nothing happens.
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    setHidden(true);
    vi.setSystemTime(new Date('2026-10-08T12:30:00Z'));
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops listening after unsubscribe', () => {
    const refresh = vi.fn();
    const stop = onReturnAfterHidden(refresh);
    stop();
    setHidden(true);
    vi.setSystemTime(new Date('2026-10-08T12:05:00Z'));
    setHidden(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('honours a custom threshold', () => {
    const refresh = vi.fn();
    const stop = onReturnAfterHidden(refresh, 5_000);
    setHidden(true);
    vi.setSystemTime(new Date('2026-10-08T12:00:06Z'));
    setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
  });
});
