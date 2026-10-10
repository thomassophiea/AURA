import { describe, it, expect, vi } from 'vitest';
import { createResultCache, cacheKey } from './resultCache.js';

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};

describe('cacheKey', () => {
  it('ignores argument order and the live flag', () => {
    expect(cacheKey(null, 't', { b: 1, a: 2, live: true })).toBe(
      cacheKey(null, 't', { a: 2, b: 1 })
    );
    expect(cacheKey('gw1', 't', {})).not.toBe(cacheKey('gw2', 't', {}));
  });
});

describe('createResultCache', () => {
  it('serves fresh hits from memory and says so', async () => {
    const c = clock();
    const cache = createResultCache({ now: c.now });
    const compute = vi.fn(async () => ({ basis: 'observed', n: 1 }));
    const first = await cache.get('k', compute);
    expect(first.freshness.servedFrom).toBe('live');
    c.advance(60_000);
    const second = await cache.get('k', compute);
    expect(second.freshness.servedFrom).toBe('cache');
    expect(second.freshness.ageSeconds).toBe(60);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('serves stale at once and refreshes behind it', async () => {
    const c = clock();
    const cache = createResultCache({ now: c.now, freshMs: 1000, maxAgeMs: 10_000 });
    let n = 0;
    const compute = vi.fn(async () => ({ n: ++n }));
    await cache.get('k', compute);
    c.advance(5000);
    const stale = await cache.get('k', compute);
    expect(stale.value.n).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(compute).toHaveBeenCalledTimes(2);
    const fresh = await cache.get('k', compute);
    expect(fresh.value.n).toBe(2);
  });

  it('live: true always recomputes', async () => {
    const cache = createResultCache();
    const compute = vi.fn(async () => ({ ok: 1 }));
    await cache.get('k', compute);
    const r = await cache.get('k', compute, { live: true });
    expect(r.freshness.servedFrom).toBe('live');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('never caches a failed read', async () => {
    const cache = createResultCache();
    const compute = vi.fn(async () => ({ unavailable: true }));
    await cache.get('k', compute);
    await cache.get('k', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('shares one computation between concurrent misses', async () => {
    const cache = createResultCache();
    let release;
    const compute = vi.fn(() => new Promise((r) => (release = () => r({ v: 1 }))));
    const a = cache.get('k', compute);
    const b = cache.get('k', compute);
    release();
    await Promise.all([a, b]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('warm() refreshes recently used keys and drops idle ones', async () => {
    const c = clock();
    const cache = createResultCache({ now: c.now, idleMs: 10_000 });
    const used = vi.fn(async () => ({ v: 1 }));
    const idle = vi.fn(async () => ({ v: 2 }));
    await cache.get('idle', idle);
    c.advance(20_000);
    await cache.get('used', used);
    const r = await cache.warm();
    expect(r).toEqual({ refreshed: 1, size: 1 });
    expect(used).toHaveBeenCalledTimes(2);
    expect(idle).toHaveBeenCalledTimes(1);
  });
});
