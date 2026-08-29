import { describe, it, expect } from 'vitest';
import { pLimit, mapWithConcurrency } from './pLimit.js';

/** A promise plus its external resolve/reject, for forcing overlap in tests. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('pLimit', () => {
  it('never exceeds the concurrency cap', async () => {
    const limiter = pLimit(3);
    let concurrent = 0;
    let maxSeen = 0;
    const deferreds = Array.from({ length: 10 }, () => deferred());

    const runs = deferreds.map((d) =>
      limiter.run(async () => {
        concurrent += 1;
        maxSeen = Math.max(maxSeen, concurrent);
        const value = await d.promise;
        concurrent -= 1;
        return value;
      })
    );

    // Let the first wave of tasks start.
    await Promise.resolve();
    await Promise.resolve();

    // Resolve in a scrambled order to force overlap and keep the queue moving.
    const resolveOrder = [2, 0, 1, 5, 3, 4, 7, 6, 9, 8];
    for (const i of resolveOrder) {
      deferreds[i].resolve(`value-${i}`);
      // Give the scheduler a tick to hand out the freed slot.
      await Promise.resolve();
      await Promise.resolve();
    }

    const results = await Promise.all(runs);
    expect(maxSeen).toBeLessThanOrEqual(3);
    expect(maxSeen).toBeGreaterThan(1); // sanity: concurrency actually happened
    expect(results).toEqual(deferreds.map((_, i) => `value-${i}`));
  });

  it('runs a single task immediately and resolves its value', async () => {
    const limiter = pLimit(2);
    const result = await limiter.run(async () => 42);
    expect(result).toBe(42);
  });

  it('propagates rejections from run() to the caller', async () => {
    const limiter = pLimit(2);
    await expect(
      limiter.run(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});

describe('mapWithConcurrency', () => {
  it('never exceeds the concurrency cap', async () => {
    let concurrent = 0;
    let maxSeen = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    const settled = await mapWithConcurrency(items, 4, async (item) => {
      concurrent += 1;
      maxSeen = Math.max(maxSeen, concurrent);
      // Stagger delays so later-scheduled items can finish before earlier ones.
      await new Promise((r) => setTimeout(r, (item % 3) + 1));
      concurrent -= 1;
      return item * 10;
    });

    expect(maxSeen).toBeLessThanOrEqual(4);
    expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('preserves input order in the results array even when later items resolve first', async () => {
    const delays = [30, 5, 20, 1, 10];
    const settled = await mapWithConcurrency(delays, 5, async (delayMs, index) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return index;
    });

    expect(settled.map((r) => r.value)).toEqual([0, 1, 2, 3, 4]);
  });

  it('does not let one rejecting task prevent the others from completing', async () => {
    const items = [1, 2, 3, 4, 5];
    const settled = await mapWithConcurrency(items, 2, async (item) => {
      if (item === 3) {
        throw new Error(`item ${item} failed`);
      }
      return item * 2;
    });

    expect(settled).toHaveLength(5);
    expect(settled[2].status).toBe('rejected');
    expect(settled[2].reason).toBeInstanceOf(Error);
    expect(settled[2].reason.message).toBe('item 3 failed');

    const fulfilled = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    expect(fulfilled).toEqual([2, 4, 8, 10]);
  });

  it('resolves an empty array for empty input', async () => {
    const settled = await mapWithConcurrency([], 4, async () => {
      throw new Error('should never be called');
    });
    expect(settled).toEqual([]);
  });
});
