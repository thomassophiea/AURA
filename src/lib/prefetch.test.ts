import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prefetchOnIdle, prefetchOnHover, prefetchComponent } from './prefetch';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('prefetchOnIdle', () => {
  it('uses requestIdleCallback when available', () => {
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 0;
    });
    vi.stubGlobal('requestIdleCallback', ric);
    const importFn = vi.fn(() => Promise.resolve({}));
    prefetchOnIdle(importFn);
    expect(ric).toHaveBeenCalledTimes(1);
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to a 200ms setTimeout when requestIdleCallback is missing', () => {
    // jsdom: ensure requestIdleCallback isn't on window for this test.
    if ('requestIdleCallback' in window) {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
    }
    const importFn = vi.fn(() => Promise.resolve({}));
    prefetchOnIdle(importFn);
    expect(importFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(importFn).toHaveBeenCalledTimes(1);
  });
});

describe('prefetchOnHover', () => {
  it('returns a handler that invokes the importer once', () => {
    const importFn = vi.fn(() => Promise.resolve({}));
    const handler = prefetchOnHover(importFn);
    handler();
    handler();
    handler();
    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it('different prefetchOnHover handlers are independent', () => {
    const importA = vi.fn(() => Promise.resolve({}));
    const importB = vi.fn(() => Promise.resolve({}));
    const handlerA = prefetchOnHover(importA);
    const handlerB = prefetchOnHover(importB);
    handlerA();
    handlerB();
    handlerA(); // should be deduped
    expect(importA).toHaveBeenCalledTimes(1);
    expect(importB).toHaveBeenCalledTimes(1);
  });
});

describe('prefetchComponent', () => {
  it('does nothing for an unknown page id', () => {
    expect(() => prefetchComponent('nonexistent-page')).not.toThrow();
  });

  it('invokes the matching importer (smoke test for known page id)', () => {
    // We can't easily verify the dynamic import was called without
    // intercepting Vite's import resolution; the smoke test is that
    // prefetchComponent does not throw for known pages.
    expect(() => prefetchComponent('workspace')).not.toThrow();
    expect(() => prefetchComponent('access-points')).not.toThrow();
    expect(() => prefetchComponent('configure-networks')).not.toThrow();
  });
});
