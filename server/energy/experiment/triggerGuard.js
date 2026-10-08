/**
 * One process-wide single-flight guard for everything that can drive the
 * experiment state machine into a controller write.
 *
 * Before this existed, three callers ran `evaluateTrigger` independently: the
 * 30s sweep in server.js, the light-sensor report handler (through the same
 * sweep), and the demo override's 15s timer in experimentRouter.js — and only
 * the first two shared a flag. Two evaluations overlapping on the same
 * experiment could both see `baseline_established`, both activate, and both
 * write the same APs.
 *
 * Two modes:
 *   - `runTriggerEvaluation(fn)` — for periodic/opportunistic evaluation. If an
 *     evaluation (or an exclusive operator action) is already running, it is
 *     SKIPPED and resolves `{ skipped: true }`: the next tick re-evaluates from
 *     Postgres anyway, so dropping one loses nothing.
 *   - `runExclusive(fn)` — for operator actions (activate, restore). These must
 *     not be dropped, so they WAIT for whatever is running and then run alone.
 */

let tail = Promise.resolve();
let busy = false;

function enqueue(fn) {
  const run = tail.then(async () => {
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  });
  // The chain must survive a rejection, or one failure would wedge every
  // later caller behind a rejected promise.
  tail = run.catch(() => undefined);
  return run;
}

/** True while any guarded work is in flight. */
export function isTriggerBusy() {
  return busy;
}

/**
 * Run a trigger evaluation unless one is already in flight.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T | { skipped: true }>}
 */
export function runTriggerEvaluation(fn) {
  if (busy) return Promise.resolve({ skipped: true });
  busy = true; // claim synchronously so a same-tick second caller skips
  return enqueue(fn);
}

/**
 * Run an operator action after any in-flight evaluation, never concurrently.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runExclusive(fn) {
  return enqueue(fn);
}

/** Test hook. */
export function __resetTriggerGuard() {
  tail = Promise.resolve();
  busy = false;
}
