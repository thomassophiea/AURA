/**
 * The only writable surface Cortex has.
 *
 * Every entry is the single source of truth for one change: where the field
 * lives, how to validate a requested value, and — the part that matters — how
 * to prove the Gateway actually honoured it. This platform accepts writes and
 * discards them silently, so `verify` is not a formality; it is the difference
 * between reporting a fix and reporting a fiction.
 *
 * Entries are added deliberately, never derived from the API. A field nobody
 * has reviewed is a field nobody has checked for silent-drop behaviour, and
 * offering it would mean Cortex proposing changes whose failure mode is unknown.
 *
 * WHY A CATALOGUE AT ALL. A change request arrived asking to enable 802.11r
 * Fast Transition on the Skynet WLAN — well argued, with roam telemetry behind
 * it, and impossible: there is no 11r field on any of the 50 service keys this
 * Gateway serves. Nothing caught it because nothing modelled what is writable.
 * The catalogue exists so that question always has an answer.
 */

const bool = (after, desired) => after === desired;
const int = (after, desired) => Number(after) === Number(desired);

export const CHANGE_CATALOG = [
  {
    id: 'wlan.11k',
    label: '802.11k neighbour reports',
    resource: 'service',
    path: 'enabled11kSupport',
    type: 'boolean',
    risk: 'low',
    rationale:
      'Lets clients discover neighbouring APs, so a roam decision is made from ' +
      'a list rather than a full scan.',
    verify: bool,
  },
  {
    id: 'wlan.11k.beaconReport',
    label: '802.11k beacon report',
    resource: 'service',
    path: 'rm11kBeaconReport',
    type: 'boolean',
    risk: 'low',
    rationale:
      'Clients report what they actually hear, which is how a roaming problem ' +
      'becomes visible instead of inferred.',
    verify: bool,
  },
  {
    id: 'wlan.11k.quietIe',
    label: '802.11k quiet IE',
    resource: 'service',
    path: 'rm11kQuietIe',
    type: 'boolean',
    risk: 'low',
    rationale: 'Schedules quiet periods so clients can measure other channels.',
    verify: bool,
  },
  {
    id: 'wlan.mbo',
    label: 'MBO (agile multiband)',
    resource: 'service',
    path: 'mbo',
    type: 'boolean',
    risk: 'low',
    rationale:
      'Lets the AP steer a client toward a better band rather than waiting for ' +
      'it to decide to leave.',
    verify: bool,
  },
  {
    id: 'wlan.clientToClient',
    label: 'Client-to-client communication',
    resource: 'service',
    path: 'clientToClientCommunication',
    type: 'boolean',
    risk: 'low',
    rationale: 'Whether associated clients can address each other directly.',
    verify: bool,
  },
  {
    id: 'wlan.uapsd',
    label: 'U-APSD power save',
    resource: 'service',
    path: 'uapsdEnabled',
    type: 'boolean',
    risk: 'low',
    rationale: 'Unscheduled power save delivery — battery life for handheld clients.',
    verify: bool,
  },
  {
    id: 'wlan.suppressSsid',
    label: 'Hide SSID in beacons',
    resource: 'service',
    path: 'suppressSsid',
    type: 'boolean',
    // Medium, not low: it strands no existing client, but a new one cannot find
    // the network at all. Reversible, which is why it is here rather than out.
    risk: 'medium',
    rationale:
      'Stops the SSID being advertised. Existing clients stay associated; new ' +
      'ones must already know the name.',
    verify: bool,
  },
  {
    id: 'wlan.idleTimeout.preAuth',
    label: 'Pre-authentication idle timeout',
    resource: 'service',
    path: 'preAuthenticatedIdleTimeout',
    type: 'integer',
    min: 5,
    max: 999999,
    risk: 'low',
    rationale: 'How long an unauthenticated client may sit idle before it is dropped.',
    verify: int,
  },
  {
    id: 'wlan.idleTimeout.postAuth',
    label: 'Post-authentication idle timeout',
    resource: 'service',
    path: 'postAuthenticatedIdleTimeout',
    type: 'integer',
    min: 5,
    max: 999999,
    risk: 'low',
    rationale: 'How long an authenticated client may sit idle before it is dropped.',
    verify: int,
  },
];

const BY_ID = new Map(CHANGE_CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id) {
  return BY_ID.get(id) ?? null;
}
