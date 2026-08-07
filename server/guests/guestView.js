/**
 * Merge the portal's authorization ledger with the gateway's live station list.
 *
 * Two systems answer two different questions and neither can answer the other's:
 *
 *   PostgresCWP  — may this device use the guest network, and what happened
 *                  the last time it tried?
 *   the gateway  — is it associated right now, on what AP, with what IP?
 *
 * Everything here is pure, so the status rules can be tested without a portal
 * or a controller. Nothing invents a state: when the gateway could not be
 * reached, connection is reported as `unknown` rather than guessed from a
 * recent database row.
 */

/** Live association, from the gateway. */
export const CONNECTION = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  /** The gateway could not be asked. Not the same as "not connected". */
  UNKNOWN: 'unknown',
};

/** The single status shown in the table. */
export const GUEST_STATUS = {
  CONNECTED: 'connected',
  AUTHORIZED: 'authorized',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  MANUALLY_ADDED: 'manually_added',
  FAILED: 'failed',
};

/** Portal session statuses that mean the gateway refused the authorization. */
const FAILED_SESSION_STATUSES = new Set(['AUTH_FAILED', 'ERROR']);

/**
 * Collapse the two systems into one status.
 *
 * Order matters and encodes precedence: an operator decision (revoked) outranks
 * expiry, expiry outranks anything the network is currently doing, and a live
 * association outranks history. `failed` is only ever reported from a portal
 * session the gateway actually refused — never inferred from an absence.
 */
export function deriveStatus({ authorizationStatus, connection, source, lastSessionStatus, lastSeen }) {
  if (authorizationStatus === 'REVOKED') return GUEST_STATUS.REVOKED;
  if (authorizationStatus === 'EXPIRED') return GUEST_STATUS.EXPIRED;
  if (connection === CONNECTION.CONNECTED) return GUEST_STATUS.CONNECTED;

  if (FAILED_SESSION_STATUSES.has(lastSessionStatus)) return GUEST_STATUS.FAILED;

  // Entered by an operator and never seen on the network: the authorization is
  // real and waiting, which "disconnected" would misdescribe.
  if (source === 'MANUAL' && !lastSeen) return GUEST_STATUS.MANUALLY_ADDED;

  // The gateway could not be asked, so "disconnected" would be a guess.
  if (connection === CONNECTION.UNKNOWN) return GUEST_STATUS.AUTHORIZED;

  return lastSeen ? GUEST_STATUS.DISCONNECTED : GUEST_STATUS.AUTHORIZED;
}

/**
 * Attach live gateway state to one ledger entry.
 *
 * @param {object} guest      guest DTO from the portal's internal API
 * @param {Map<string,object>|null} stations  canonical MAC → station, or null
 *        when the gateway could not be reached
 * @param {Map<string,object>} services  service id → { ssid, name }
 */
export function mergeGuest(guest, stations, services = new Map()) {
  const station = stations ? (stations.get(guest.macAddress) ?? null) : null;
  const connection =
    stations === null
      ? CONNECTION.UNKNOWN
      : station && station.status !== 'INACTIVE'
        ? CONNECTION.CONNECTED
        : CONNECTION.DISCONNECTED;

  const service = station?.serviceId ? (services.get(station.serviceId) ?? null) : null;

  return {
    id: guest.id,
    macAddress: guest.macAddress,
    // Nothing in this portal collects a name, so the MAC is the identifier a
    // guest is known by until one does. The field exists so that stays true
    // only until then.
    displayName: guest.displayName || guest.macAddress,
    hasRealName: Boolean(guest.displayName),
    email: guest.email,
    phone: guest.phone,
    notes: guest.notes,
    source: guest.source,
    authorizationStatus: guest.authorizationStatus,
    connectionStatus: connection,
    status: deriveStatus({
      authorizationStatus: guest.authorizationStatus,
      connection,
      source: guest.source,
      lastSessionStatus: guest.lastSessionStatus,
      lastSeen: guest.lastSeen,
    }),

    // Live where the gateway can say, last-known where it cannot.
    ipAddress: station?.ipAddress ?? guest.lastKnownIp ?? null,
    ipAddressIsLive: Boolean(station?.ipAddress),
    ssid: service?.ssid ?? guest.ssid ?? null,
    wlan: guest.wlan,
    role: station?.role ?? null,
    apName: station?.accessPointName ?? guest.apName ?? null,
    apSerial: station?.accessPointSerialNumber ?? guest.apSerial ?? null,
    siteId: station?.siteId ?? guest.siteId ?? null,
    gateway: guest.gatewayHost,
    signal: typeof station?.rss === 'number' ? station.rss : null,

    connectedSince: connectedSince(station),
    firstSeen: guest.firstSeen,
    lastSeen: liveLastSeen(station) ?? guest.lastSeen,
    authorizedAt: guest.authorizedAt,
    expiresAt: guest.expiresAt,
    revokedAt: guest.revokedAt,
    revokedBy: guest.revokedBy,
    createdBy: guest.createdBy,
    createdAt: guest.createdAt,

    lastSessionId: guest.lastSessionId,
    lastSessionStatus: guest.lastSessionStatus,
    lastSessionAt: guest.lastSessionAt,
    lastSessionFailureReason: guest.lastSessionFailureReason,
  };
}

/**
 * When the current association began.
 *
 * XCC reports an association *duration* in seconds rather than a timestamp on
 * some builds and neither on others, so this returns null instead of inventing
 * a start time from `lastSeen`.
 */
function connectedSince(station) {
  if (!station) return null;
  const seconds = Number(
    station.associationTime ?? station.sessionDuration ?? station.uptime ?? NaN
  );
  if (Number.isFinite(seconds) && seconds > 0 && seconds < 365 * 24 * 3600) {
    return new Date(Date.now() - seconds * 1000).toISOString();
  }
  return null;
}

function liveLastSeen(station) {
  const value = Number(station?.lastSeen ?? NaN);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

/** Filter a merged list by the UI's status vocabulary. */
export function filterByStatus(guests, statuses) {
  if (!statuses || statuses.length === 0) return guests;
  const wanted = new Set(statuses);
  return guests.filter((guest) => {
    if (wanted.has(guest.status)) return true;
    // "Expired / Revoked" is one control in the UI; both map through here.
    return false;
  });
}

/** Substring search over the fields an operator would actually type. */
export function filterBySearch(guests, term) {
  const needle = (term ?? '').trim().toLowerCase();
  if (!needle) return guests;
  // A MAC typed with different separators must still match.
  const macNeedle = needle.replace(/[\s:.-]/g, '');
  return guests.filter((guest) => {
    const macHex = guest.macAddress.replace(/:/g, '');
    return (
      (macNeedle.length >= 2 && macHex.includes(macNeedle)) ||
      guest.macAddress.toLowerCase().includes(needle) ||
      (guest.ipAddress ?? '').toLowerCase().includes(needle) ||
      (guest.email ?? '').toLowerCase().includes(needle) ||
      (guest.hasRealName && guest.displayName.toLowerCase().includes(needle)) ||
      (guest.apName ?? '').toLowerCase().includes(needle)
    );
  });
}

/**
 * Counts for the summary row.
 *
 * `connectedNow` is null when the gateway could not be reached — a zero would
 * read as "nobody is connected", which is a different and false claim.
 */
export function summarize(guests, { gatewayReachable, now = new Date() } = {}) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let connectedNow = 0;
  let authorized = 0;
  let seenToday = 0;
  let seenLast7Days = 0;

  for (const guest of guests) {
    if (guest.connectionStatus === CONNECTION.CONNECTED) connectedNow += 1;
    if (guest.authorizationStatus === 'ACTIVE') authorized += 1;
    const lastSeen = guest.lastSeen ? new Date(guest.lastSeen) : null;
    if (lastSeen && !Number.isNaN(lastSeen.getTime())) {
      if (lastSeen >= startOfToday) seenToday += 1;
      if (lastSeen >= sevenDaysAgo) seenLast7Days += 1;
    }
  }

  return {
    connectedNow: gatewayReachable ? connectedNow : null,
    authorized,
    seenToday,
    seenLast7Days,
    total: guests.length,
  };
}
