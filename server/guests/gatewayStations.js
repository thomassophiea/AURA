/**
 * Live station state from the gateway.
 *
 * "Connected now" cannot be answered from PostgresCWP: a portal row says a
 * device was authorized, not that it is still associated. The gateway knows,
 * and `/v1/stations` answers for the whole controller in one call — so this
 * module never issues a request per guest, however many there are.
 *
 * Endpoints used (measured against XCC 192.168.100.12 on 2026-08-07):
 *   GET  /v1/stations                 every associated station
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
}

/** `AA:BB:CC:DD:EE:FF` / `aabbccddeeff` → `aa:bb:cc:dd:ee:ff`. */
export function canonicalMac(value) {
  if (typeof value !== 'string') return null;
  const hex = value.replace(/[\s:.-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return hex.match(/.{2}/g).join(':');
}

/**
 * Every associated station, keyed by canonical MAC.
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

  const stations = new Map();
  for (const station of Array.isArray(result.data) ? result.data : []) {
    const mac = canonicalMac(station?.macAddress);
    if (mac) stations.set(mac, station);
  }

  snapshotCache.set(controllerUrl, { stations, expiresAt: now + SNAPSHOT_TTL_MS });
  return stations;
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
