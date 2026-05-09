import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
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
  // Default: non-mobile UA + non-standalone display mode → effect short-circuits.
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { usePWAInstall } from './usePWAInstall';

describe('usePWAInstall', () => {
  it('returns the documented shape with installable=false on a desktop UA', () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.isInstalled).toBe(false);
    expect(result.current.showPrompt).toBe(false);
    expect(typeof result.current.promptToInstall).toBe('function');
    expect(typeof result.current.dismissPrompt).toBe('function');
  });

  it('marks installed=true when running in standalone display mode', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('standalone'),
    }));
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
  });

  it('marks installed=true when navigator.standalone === true (iOS)', () => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true,
    });
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
    // Reset
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).standalone;
  });

  it('promptToInstall() returns false when no deferredPrompt is queued', async () => {
    const { result } = renderHook(() => usePWAInstall());
    let returned: boolean = true;
    await act(async () => {
      returned = await result.current.promptToInstall();
    });
    expect(returned).toBe(false);
  });

  it('dismissPrompt() writes a timestamp to localStorage', () => {
    const { result } = renderHook(() => usePWAInstall());
    act(() => result.current.dismissPrompt());
    const stored = localStorage.getItem('pwa-install-dismissed');
    expect(stored).toBeTruthy();
    expect(Number(stored)).toBeGreaterThan(0);
  });

  it('dismissPrompt() flips showPrompt back to false (idempotent on already-false state)', () => {
    const { result } = renderHook(() => usePWAInstall());
    act(() => result.current.dismissPrompt());
    expect(result.current.showPrompt).toBe(false);
  });

  it('on a mobile UA, attaches beforeinstallprompt + appinstalled listeners', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => usePWAInstall());
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('beforeinstallprompt');
    expect(events).toContain('appinstalled');
  });

  it('cleans up event listeners on unmount', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePWAInstall());
    unmount();
    const events = removeSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('beforeinstallprompt');
    expect(events).toContain('appinstalled');
  });
});
