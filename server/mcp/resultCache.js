/**
 * Warm results for the slow MCP tools.
 *
 * WHY. Four tools read the Gateway in ways that cannot be made fast at the
 * source: per-AP state reads (get_device_health, ~25 s for 18 APs), the site
 * and WLAN report endpoints (get_site_rf_health / get_wlan_health, ~22 s), and
 * any read that touches the flex report service, which when broken costs 31 s
 * before failing. An agent asking "how are my APs?" should not wait half a
 * minute for an answer the server could have had ready.
 *
 * HOW. Stale-while-revalidate, per (Gateway, tool, arguments):
 *   - fresh  (age < freshMs)   served from memory, no Gateway read
 *   - stale  (age < maxAgeMs)  served from memory at once, refreshed behind it
 *   - older, or `live: true`   computed now, then cached
 * Concurrent misses for one key share one computation.
 *
 * A warmer re-runs every key used in the last `idleMs` on an interval shorter
 * than the flex breaker's 5-minute window, so the warmer — not a person —
 * pays the 31 s probe when the breaker half-opens, and keys nobody asks for
 * stop costing Gateway reads within the hour.
 *
 * HONESTY. Every cached answer says so: `freshness.servedFrom`, the instant it
 * was computed and its age. A result marked unavailable is never cached — a
 * failed read must be retried, not replayed for five minutes.
 */

export const DEFAULT_FRESH_MS = 4 * 60 * 1000;
export const DEFAULT_MAX_AGE_MS = 15 * 60 * 1000;
export const DEFAULT_IDLE_MS = 60 * 60 * 1000;
export const DEFAULT_WARM_INTERVAL_MS = 4 * 60 * 1000;

/** Stable key: argument order must not split one question into two entries. */
export function cacheKey(gateway, tool, args = {}) {
  const sorted = Object.keys(args)
    .filter((k) => k !== 'live' && args[k] !== undefined && args[k] !== null && args[k] !== '')
    .sort()
    .map((k) => [k, args[k]]);
  return `${gateway ?? 'default'}|${tool}|${JSON.stringify(sorted)}`;
}

export function createResultCache({
  freshMs = DEFAULT_FRESH_MS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  idleMs = DEFAULT_IDLE_MS,
  maxEntries = 500,
  now = () => Date.now(),
  onError = () => {},
} = {}) {
  /** key -> { value, at, lastUsed, compute, inflight } */
  const entries = new Map();

  const freshness = (servedFrom, at) => ({
    servedFrom,
    computedAt: new Date(at).toISOString(),
    ageSeconds: Math.max(0, Math.round((now() - at) / 1000)),
    ...(servedFrom === 'cache'
      ? { note: "Served from AURA's warm cache; pass live: true to force a fresh Gateway read." }
      : {}),
  });

  function evict() {
    if (entries.size <= maxEntries) return;
    const oldest = [...entries.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [k] of oldest.slice(0, entries.size - maxEntries)) entries.delete(k);
  }

  async function run(key, compute) {
    const entry = entries.get(key) ?? { value: undefined, at: 0, lastUsed: now(), compute };
    entry.compute = compute;
    entries.set(key, entry);
    if (entry.inflight) return entry.inflight;
    entry.inflight = (async () => {
      try {
        const value = await compute();
        // Never cache a failed read: it would replay the failure for minutes.
        if (value && value.unavailable !== true) {
          entry.value = value;
          entry.at = now();
        }
        return { value, at: now() };
      } finally {
        entry.inflight = null;
      }
    })();
    evict();
    return entry.inflight;
  }

  return {
    /**
     * @returns {Promise<{value: any, freshness: object}>}
     */
    async get(key, compute, { live = false } = {}) {
      const entry = entries.get(key);
      if (entry) entry.lastUsed = now();
      const age = entry && entry.value !== undefined ? now() - entry.at : Infinity;

      if (!live && age < freshMs) {
        return { value: entry.value, freshness: freshness('cache', entry.at) };
      }
      if (!live && age < maxAgeMs) {
        run(key, compute).catch(onError);
        return { value: entry.value, freshness: freshness('cache', entry.at) };
      }
      const { value, at } = await run(key, compute);
      const e = entries.get(key);
      if (e) e.lastUsed = now();
      return { value, freshness: freshness('live', at) };
    },

    /** Refresh every key used within `idleMs`; drop the rest. Serial on purpose. */
    async warm() {
      const t = now();
      let refreshed = 0;
      for (const [key, entry] of [...entries.entries()]) {
        if (t - entry.lastUsed > idleMs) {
          entries.delete(key);
          continue;
        }
        try {
          await run(key, entry.compute);
          refreshed += 1;
        } catch (err) {
          onError(err);
        }
      }
      return { refreshed, size: entries.size };
    },

    /** Start the background warmer. Returns a stop function. */
    startWarmer({ intervalMs = DEFAULT_WARM_INTERVAL_MS } = {}) {
      let running = false;
      const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
          await this.warm();
        } finally {
          running = false;
        }
      }, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    },

    stats() {
      return { size: entries.size };
    },

    clear() {
      entries.clear();
    },
  };
}
