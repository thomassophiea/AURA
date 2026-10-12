/**
 * Live station state from the gateway.
 *
 * "Connected now" cannot be answered from PostgresCWP: a portal row says a
 * device was authorized, not that it is still associated. The gateway knows,
 * and it answers per site (or, as a fallback, for the whole controller in one
 * call) — so this module never issues a request per guest, however many there
 * are.
 *
 * Endpoints used (measured against XCC 192.168.100.12 on 2026-08-07 / 10-11):
 *   GET  /v3/sites, /v1/aps/query     site list + AP hostSite completeness check
 *   GET  /v3/sites/{id}/stations      stations per site — the cheap read
 *   GET  /v1/stations                 every associated station — fallback only
 *   POST /v1/stations/assignrole      { mac, role }   — move a station's role
 *   POST /v1/stations/disassociate    { macList: [] } — force deauthentication
 */

import { requestXcc } from '../validationEngine/xccClient.js';
import { sanitizeMessage } from '../monitoring/errorSanitizer.js';

const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * How long one station snapshot is reused.
 *
 * Short enough that a revoke visibly takes effect on the next refresh, long
 * enough that a table of a hundred guests, a summary call and a follow-up
 * detail view share a single controller round-trip.
 */
const SNAPSHOT_TTL_MS = 5_000;

export class GatewayUnavailableError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'GatewayUnavailableError';
    this.status = status;
  }
}

const snapshotCache = new Map();

export function clearStationCache() {
  snapshotCache.clear();
  inFlight.clear();
}

/** `AA:BB:CC:DD:EE:FF` / `aabbccddeeff` → `aa:bb:cc:dd:ee:ff`. */
export function canonicalMac(value) {
  if (typeof value !== 'string') return null;
  const hex = value.replace(/[\s:.-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g).join(':');
}

/** More sites than this and the per-site fan-out stops being the cheap read. */
const STATION_SITE_MAX = 50;
const STATION_SITE_CONCURRENCY = 4;

/** In-flight snapshot reads, so the list and the summary share one round-trip. */
const inFlight = new Map();

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/**
 * Every station, read one site at a time.
 *
 * Measured on the lab Gateway (2026-10-08 and again 2026-10-11): `/v1/stations`
 * takes 2-30 s depending on load — long enough to blow this module's timeout
 * and report a reachable Gateway as unreachable — while `/v3/sites/{id}/stations`
 * across every site returns the same rows in well under a second.
 *
 * Returns null whenever the fan-out cannot be trusted to be complete — no
 * sites, too many sites, an AP without a `hostSite` (its clients would belong
 * to no site read), or any site read failing — so the caller falls back to the
 * global read instead of under-counting who is connected.
 */
async function stationsBySite({ authToken, controllerUrl, fetchFn, timeoutMs }) {
  const get = (path) => requestXcc(path, { authToken, controllerUrl, fetchFn, timeoutMs });
  const [sites, aps] = await Promise.all([get('/v3/sites'), get('/v1/aps/query')]);
  if (!sites.ok || !aps.ok) return null;

  const ids = asRows(sites.data)
    .map((site) => site?.id ?? site?.siteId)
    .filter(Boolean)
    .map(String);
  if (ids.length === 0 || ids.length > STATION_SITE_MAX) return null;
  const apRows = Array.isArray(aps.data) ? aps.data : (aps.data?.aps ?? []);
  if (apRows.some((ap) => !ap?.hostSite)) return null;

  const perSite = new Array(ids.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < ids.length) {
      const index = next++;
      const result = await get(`/v3/sites/${encodeURIComponent(ids[index])}/stations`);
      if (!result.ok) {
        failed = true;
        return;
      }
      perSite[index] = asRows(result.data).map((st) => ({
        ...st,
        siteId: st?.siteId ?? ids[index],
      }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(STATION_SITE_CONCURRENCY, ids.length) }, worker));
  return failed ? null : perSite.flat();
}

async function readStations({ authToken, controllerUrl, fetchFn, timeoutMs }) {
  const bySite = await stationsBySite({ authToken, controllerUrl, fetchFn, timeoutMs }).catch(
    () => null
  );
  if (bySite) return bySite;

  const result = await requestXcc('/v1/stations', {
    authToken,
    controllerUrl,
    fetchFn,
    timeoutMs,
  });
  if (!result.ok) {
    throw new GatewayUnavailableError(
      `Gateway returned ${result.status}: ${sanitizeMessage(result.errorText)}`,
      { status: result.status }
    );
  }
  return asRows(result.data);
}

/**
 * Every associated station, keyed by canonical MAC.
 *
 * Read per site first (`/v3/sites/{id}/stations`), falling back to the global
 * `/v1/stations` only when the per-site read cannot be proven complete.
 *
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchStations({
  authToken,
  controllerUrl,
  fetchFn = null,
  now = Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  // Keyed by controller only. The snapshot is the same data for every operator
  // authorized against that controller, and the caller has already been
  // authorized before reaching here.
  const cached = snapshotCache.get(controllerUrl);
  if (cached && cached.expiresAt > now) return cached.stations;

  const pending = inFlight.get(controllerUrl);
  if (pending) return pending;

  const read = (async () => {
    const rows = await readStations({ authToken, controllerUrl, fetchFn, timeoutMs });
    const stations = new Map();
    for (const station of rows) {
      const mac = canonicalMac(station?.macAddress);
      if (mac) stations.set(mac, station);
    }
    snapshotCache.set(controllerUrl, { stations, expiresAt: now + SNAPSHOT_TTL_MS });
    return stations;
  })();
  inFlight.set(controllerUrl, read);
  try {
    return await read;
  } finally {
    inFlight.delete(controllerUrl);
  }
}

/** WLAN service id → { ssid, name }, so a station's serviceId can be named. */
export async function fetchServices({
  authToken,
  controllerUrl,
  fetchFn = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const result = await requestXcc('/v1/services', {
    authToken,
    controllerUrl,
    fetchFn,
    timeoutMs,
  });
  const services = new Map();
  if (!result.ok) return services;
  for (const service of Array.isArray(result.data) ? result.data : []) {
    if (service?.id) {
      services.set(service.id, {
        ssid: service.ssid ?? null,
        name: service.serviceName ?? service.ssid ?? null,
        authenticatedRoleId: service.authenticatedUserDefaultRoleID ?? null,
        unauthenticatedRoleId: service.unAuthenticatedUserDefaultRoleID ?? null,
      });
    }
  }
  return services;
}

/**
 * POST an action to the gateway and treat an empty 200 as success.
 *
 * `requestXcc` parses every successful response as JSON. The station action
 * endpoints answer `200` with a zero-length body — measured against XCC
 * 192.168.100.12 on 2026-08-07, `POST /v1/stations/assignrole` returns
 * `[HTTP 200] [len 0]` — so parsing unconditionally turned a successful role
 * change into a reported failure. An action that worked must not be reported
 * as one that did not.
 */
async function postAction(
  path,
  body,
  { authToken, controllerUrl, fetchFn = null, timeoutMs = DEFAULT_TIMEOUT_MS, label }
) {
  const fetchImpl = fetchFn ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${controllerUrl}/management${path}`, {
      method: 'POST',
      headers: {
        ...(authToken ? { Authorization: authToken } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new GatewayUnavailableError(`${label} failed: ${sanitizeMessage(error.message)}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new GatewayUnavailableError(
      `${label} failed (${response.status}): ${sanitizeMessage(text)}`,
      { status: response.status }
    );
  }

  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A 200 with an unparseable body is still a 200. The gateway performed the
    // action; only its reply is uninteresting.
    return null;
  }
}

/**
 * Move an associated station into a different role.
 *
 * This is the same end state the captive portal's approval produces — the
 * station's role changes from the WLAN's pre-authentication role to its
 * authenticated role — reached through the gateway's own API rather than
 * through the ECP callback, which only the station's own browser can fetch.
 */
export async function assignRole({
  mac,
  roleId,
  authToken,
  controllerUrl,
  fetchFn = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  return postAction(
    '/v1/stations/assignrole',
    { mac, role: roleId },
    { authToken, controllerUrl, fetchFn, timeoutMs, label: 'Role assignment' }
  );
}

/** Force the station off the WLAN. It must re-authenticate to come back. */
export async function disassociate({
  macs,
  authToken,
  controllerUrl,
  fetchFn = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  return postAction(
    '/v1/stations/disassociate',
    { macList: macs },
    { authToken, controllerUrl, fetchFn, timeoutMs, label: 'Disassociation' }
  );
}
