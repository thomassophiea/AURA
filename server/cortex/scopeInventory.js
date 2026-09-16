/**
 * The site and SSID catalogue the scope resolver matches a question against.
 *
 * This read sits on the critical path of EVERY investigation: nothing can be
 * scoped until we know what the estate contains. It is therefore also the one
 * place where a slow Gateway can hold up an entire answer, and it did.
 *
 * ── What was actually wrong ──────────────────────────────────────────────────
 *
 * Scope resolution used the `listSites` TOOL, which is a diagnostic: it joins
 * the configured site list to client telemetry and AP reports so it can say
 * whether a site is silent. That join is the right shape for an answer about
 * health, and the wrong shape for deciding which building a question is about —
 * because the resolver reads exactly one field off these rows, `name`, and the
 * join makes that name cost whatever the SLOWEST of three reads costs.
 *
 * Measured against the lab Gateway on 2026-09-16:
 *
 *     /v3/sites          (configured catalogue)   0.27 s   ← the names live here
 *     /v1/services       (WLANs)                  0.25 s
 *     /v1/aps/query      (APs)                    0.28 s
 *     client telemetry   (flex/report)           >30 s, then 500
 *
 * So the names were available in a quarter of a second, and we waited half a
 * minute for them behind a subsystem that was down. When it stalled, the
 * catalogue came back EMPTY and "how is PrimarySite overall?" — a site that is
 * right there in /v3/sites — could not be resolved to anything.
 *
 * Reading the authoritative list directly is what makes a site question work
 * while telemetry is degraded, which is the whole point: a site question should
 * not depend on the health of the thing it is asking about.
 *
 * The bound stays, because a fast route is not a guaranteed-fast route. But it
 * is now a genuine backstop rather than the thing standing between the operator
 * and an answer. Note that the block this replaces already claimed it "degrades
 * to an empty catalogue rather than failing" and could not: it caught only a
 * REJECTION, and a Gateway that accepts the connection and then says nothing
 * never rejects.
 */

/** Long enough for a healthy Gateway, short enough to stay inside a turn.
 *
 * The lab Gateway's flex/report subsystem fails as a unit at ~31 s. Anything at
 * or above that would only ever fire AFTER the read had already failed on its
 * own, which makes the bound decorative. 8 s is ~30x the measured cost of the
 * routes this reads and well below the point where a person concludes the
 * product is broken.
 */
export const INVENTORY_TIMEOUT_MS = 8000;

/** The SSID read is a nicety — it lets "the guest network is slow" find a WLAN.
 *  It gets a shorter bound of its own so that a stalled WLAN route cannot hold
 *  the whole answer for the full site budget. Measured cost: 0.25 s. */
export const SSID_TIMEOUT_MS = 3000;

/** `{__untrusted__, value}` is how the tool layer tags anything a network
 *  device chose the text of. The resolver matches on plain strings. */
const unwrap = (v) => (v && typeof v === 'object' && '__untrusted__' in v ? v.value : v);

const EMPTY = { sites: [], ssids: [], apNames: [] };

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Site names, from the configured catalogue.
 *
 * `evidence.sites()` is `/v3/sites` — per its own docstring the ONLY
 * authoritative answer to "what sites exist". Every telemetry-derived list
 * makes a site with no clients invisible, which is backwards: an idle or
 * completely broken site is the one worth being able to name.
 *
 * Telemetry fields come back null rather than 0 or false. The resolver ignores
 * them entirely — it only reads `name` — but a 0 here would be a measurement
 * claim, and this function has measured nothing.
 */
async function readSiteNames({ evidence, tools }, timeoutMs, onDegraded) {
  // ONE deadline for both attempts. Giving the fallback a fresh budget would
  // make the worst case twice the bound, which is how a timeout stops being a
  // bound at all.
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());

  if (evidence?.sites) {
    try {
      const res = await withTimeout(evidence.sites(), remaining(), 'site catalogue');
      if (res?.ok) {
        const sites = (res.rows ?? [])
          .map((r) => unwrap(r?.siteName ?? r?.name))
          .filter(Boolean)
          .map((name) => ({ name, hasTelemetry: null, apCount: null, clientCount: null }));
        if (sites.length) return sites;
      }
      onDegraded?.(`the configured site list was unavailable (${res?.error ?? 'no rows'})`);
    } catch (err) {
      onDegraded?.(err.message);
    }
  }

  // Fall back to the diagnostic tool. Slower and telemetry-derived, but on a
  // Gateway where /v3/sites is not served it is the only list there is.
  if (!tools?.listSites?.handler) return [];
  try {
    const res = await withTimeout(tools.listSites.handler({}), remaining(), 'site inventory');
    return (res?.sites ?? []).map((s) => ({
      name: unwrap(s.name),
      hasTelemetry: s.hasTelemetry,
      apCount: s.apCount,
      clientCount: s.clientCount,
    }));
  } catch (err) {
    onDegraded?.(err.message);
    return [];
  }
}

/** SSIDs, so "the guest network is slow" can be matched to a WLAN. Optional:
 *  losing them costs precision on some questions, never the site scope. */
async function readSsids(tools, timeoutMs = SSID_TIMEOUT_MS) {
  if (!tools?.getWlanConfig?.handler) return [];
  try {
    const res = await withTimeout(tools.getWlanConfig.handler({}), timeoutMs, 'WLAN catalogue');
    return (res?.wlans ?? res?.services ?? []).map((w) => unwrap(w?.ssid)).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Read the inventory the scope resolver needs, or give up in bounded time.
 *
 * Never throws. A failure here must cost the operator a less precise scope,
 * never their question.
 *
 * @param {object} deps
 * @param {object} [deps.evidence] a GatewayEvidence — the authoritative source
 * @param {object} [deps.tools]    a createDiagnosticTools() instance
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {(msg: string) => void} [options.onDegraded] told why, for the log
 * @returns {Promise<{sites: Array, ssids: Array, apNames: Array}>}
 */
export async function readScopeInventory(deps = {}, options = {}) {
  const { timeoutMs = INVENTORY_TIMEOUT_MS, ssidTimeoutMs = SSID_TIMEOUT_MS, onDegraded } = options;

  // Concurrent, and on separate budgets: the SSID read is optional, so it gets
  // the shorter one and cannot extend the wait for the site names that scope
  // resolution is actually built on.
  const [sites, ssids] = await Promise.all([
    readSiteNames(deps, timeoutMs, onDegraded).catch(() => []),
    readSsids(deps.tools, ssidTimeoutMs).catch(() => []),
  ]);

  if (!sites.length) return { ...EMPTY, ssids };
  return { sites, ssids, apNames: [] };
}
