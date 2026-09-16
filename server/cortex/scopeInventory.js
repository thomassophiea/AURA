/**
 * The site and SSID catalogue the scope resolver matches a question against.
 *
 * This read sits on the critical path of EVERY investigation: nothing can be
 * scoped until we know what the estate contains. It is therefore also the one
 * place where a slow Gateway can hold up an entire answer, and it did.
 *
 * The block this replaces already said it "degrades to an empty catalogue
 * rather than failing" — and it could not, because it only caught a REJECTION.
 * A Gateway that accepts the connection and then says nothing never rejects; it
 * simply never settles, and `await` waits for as long as it is asked to. The
 * documented fallback was unreachable by the failure mode most likely to need
 * it.
 *
 * So the bound is the point of this module. An unbounded await is not a slower
 * version of a bounded one — it is a different outcome. Past the timeout the
 * resolver falls back to the estate, which is a real answer about a real scope,
 * instead of the operator watching a spinner until something else gives up.
 */

/** Long enough for a healthy Gateway, short enough to stay inside a turn.
 *
 * The lab Gateway's flex/report subsystem fails as a unit at ~31 s. Anything at
 * or above that would only ever fire AFTER the read had already failed on its
 * own, which makes the bound decorative. 8 s is comfortably above a healthy
 * inventory read (sub-second, and cached after the first) and well below the
 * point where a person concludes the product is broken.
 */
export const INVENTORY_TIMEOUT_MS = 8000;

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
 * Read the inventory the scope resolver needs, or give up in bounded time.
 *
 * Never throws. A failure here must cost the operator a less precise scope,
 * never their question.
 *
 * @param {object} tools               a createDiagnosticTools() instance
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {(msg: string) => void} [options.onDegraded] told why, for the log
 * @returns {Promise<{sites: Array, ssids: Array, apNames: Array}>}
 */
export async function readScopeInventory(tools, options = {}) {
  const { timeoutMs = INVENTORY_TIMEOUT_MS, onDegraded } = options;

  if (!tools?.listSites?.handler) {
    onDegraded?.('no listSites tool is available');
    return { ...EMPTY };
  }

  try {
    // The WLAN read is optional and already swallows its own failure: an SSID
    // list is a nicety for matching "the guest network", while the site list is
    // what scope resolution is actually built on. One bound covers both, so a
    // stalled WLAN read cannot extend the wait past the site list.
    const [siteRes, wlanRes] = await withTimeout(
      Promise.all([
        tools.listSites.handler({}),
        tools.getWlanConfig
          ? tools.getWlanConfig.handler({}).catch(() => null)
          : Promise.resolve(null),
      ]),
      timeoutMs,
      'site inventory'
    );

    return {
      sites: (siteRes?.sites ?? []).map((s) => ({
        name: unwrap(s.name),
        hasTelemetry: s.hasTelemetry,
        apCount: s.apCount,
        clientCount: s.clientCount,
      })),
      ssids: (wlanRes?.wlans ?? wlanRes?.services ?? []).map((w) => unwrap(w?.ssid)).filter(Boolean),
      apNames: [],
    };
  } catch (err) {
    onDegraded?.(err.message);
    return { ...EMPTY };
  }
}
