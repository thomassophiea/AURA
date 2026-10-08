/**
 * Per-scope circuit breaker for collector requests.
 *
 * Why this exists: the Gateway's report endpoints are expensive (a per-AP or
 * per-site report costs it 15-30 s of work) and some scopes fail
 * deterministically — PrimarySite's venue report 500s at the Gateway's own 31 s
 * internal timeout, and the flex subsystem fails as a unit. Re-asking a scope
 * that failed one minute ago does not get an answer; it spends another 31 s of
 * Gateway time and slows every OTHER request on the box, including the ones the
 * dashboard is waiting on. Measured 2026-10-08: /v1/stations went from 3.7 s to
 * 12.7 s while the collectors were re-firing doomed report calls every tick.
 *
 * A failing scope is therefore skipped for an exponentially growing window
 * (base -> max, with jitter so scopes that failed together do not retry in
 * lockstep), then given exactly one probe. One success closes it.
 *
 * In-process only, deliberately: the cost being protected is the Gateway's, and
 * a restart that forgets the breaker costs at most one extra probe per scope.
 */

export class ScopeBreaker {
  #entries = new Map();
  #baseMs;
  #maxMs;
  #random;

  constructor({ baseSeconds = 300, maxSeconds = 3600, random = Math.random } = {}) {
    this.#baseMs = baseSeconds * 1000;
    this.#maxMs = maxSeconds * 1000;
    this.#random = random;
  }

  /** True while `key` is inside its cool-down window. */
  isOpen(key, now = Date.now()) {
    const entry = this.#entries.get(key);
    return Boolean(entry && now < entry.openUntil);
  }

  recordFailure(key, now = Date.now()) {
    const failures = (this.#entries.get(key)?.failures ?? 0) + 1;
    const exponential = this.#baseMs * 2 ** Math.min(failures - 1, 16);
    const capped = Math.min(exponential, this.#maxMs);
    const waitMs = Math.round(capped * (0.75 + this.#random() * 0.25));
    this.#entries.set(key, { failures, openUntil: now + waitMs });
    return waitMs;
  }

  recordSuccess(key) {
    this.#entries.delete(key);
  }

  /** Open scopes, for logs and the health surface. */
  snapshot(now = Date.now()) {
    const open = [];
    for (const [key, entry] of this.#entries) {
      if (now < entry.openUntil) {
        open.push({ key, failures: entry.failures, retryInSeconds: Math.ceil((entry.openUntil - now) / 1000) });
      }
    }
    return open;
  }
}

/** One breaker per process, shared by every collector loop. */
let shared = null;
export function getSharedBreaker() {
  if (!shared) shared = new ScopeBreaker();
  return shared;
}

export function resetSharedBreaker() {
  shared = null;
}
