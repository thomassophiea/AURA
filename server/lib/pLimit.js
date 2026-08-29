/**
 * Tiny dependency-free concurrency limiter.
 *
 * Used to probe hundreds of monitoring sources without opening hundreds of
 * simultaneous connections (a thundering herd) or letting a single hung
 * source stall an entire batch behind it.
 */

/**
 * Create a scheduler that runs at most `concurrency` tasks at once.
 *
 * @param {number} concurrency - Max number of concurrently in-flight tasks.
 *   Must be a positive integer.
 * @returns {{ run: <T>(fn: () => Promise<T>) => Promise<T> }} An object whose
 *   `run(fn)` schedules `fn` (a zero-arg function returning a promise) to
 *   execute once a slot is free, and returns a promise that settles with
 *   `fn`'s outcome (resolution or rejection passes through unchanged).
 */
export function pLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('pLimit: concurrency must be a positive integer');
  }

  let active = 0;
  const queue = [];

  function next() {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    active += 1;
    job();
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(fn)
          .then(
            (value) => {
              active -= 1;
              resolve(value);
              next();
            },
            (error) => {
              active -= 1;
              reject(error);
              next();
            }
          );
      });
      next();
    });
  }

  return { run };
}

/**
 * Map `items` through `mapperAsync` with at most `limit` calls in flight at
 * once, resolving an array of results in the SAME ORDER as `items` regardless
 * of which calls settle first.
 *
 * A rejecting mapper call never rejects the batch or blocks the remaining
 * items — its slot in the result array holds `{ status: 'rejected', reason }`
 * (mirroring `Promise.allSettled`), while a fulfilled call's slot holds
 * `{ status: 'fulfilled', value }`. Callers whose mapper never rejects (e.g.
 * one that catches internally and always returns a value) can safely read
 * `results[i].value` unconditionally; callers who want raw values with
 * failures thrown should map the settled results themselves.
 *
 * @template T, R
 * @param {T[]} items - Input items to map over.
 * @param {number} limit - Max concurrent `mapperAsync` calls.
 * @param {(item: T, index: number) => Promise<R>} mapperAsync - Async mapper.
 * @returns {Promise<Array<{ status: 'fulfilled', value: R } | { status: 'rejected', reason: unknown }>>}
 */
export async function mapWithConcurrency(items, limit, mapperAsync) {
  const limiter = pLimit(limit);
  const settled = await Promise.all(
    items.map((item, index) =>
      limiter
        .run(() => mapperAsync(item, index))
        .then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason })
        )
    )
  );
  return settled;
}
