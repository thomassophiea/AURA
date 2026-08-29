/**
 * Server-side device search: typeahead over APs and clients.
 *
 * Target customers run ~100,000 APs — a browser dropdown that loads "all
 * devices" is not viable at that scale. These endpoints do the filtering and
 * capping on the server, from a short-lived cached snapshot, so a picker can
 * become a typeahead without hammering the controller on every keystroke.
 */

import { Router } from 'express';
import { fetchXcc } from '../validationEngine/xccClient.js';
import { requireRole } from '../identity/identityRouter.js';

/**
 * How long one fetched device snapshot is reused across repeated typeahead
 * keystrokes. Short enough that a newly-adopted AP or a freshly-associated
 * client shows up quickly; long enough that a user typing a query character
 * by character does not generate a controller round-trip per keystroke.
 */
const DEVICE_CACHE_TTL_MS = 15_000;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Keep the AP payload small: only the columns this search actually reads.
const AP_REQUESTED_COLUMNS = [
  'serialNumber',
  'apName',
  'hostname',
  'ipAddress',
  'siteName',
  'hostSite',
  'status',
];

const AP_SEARCH_FIELDS = ['name', 'serialNumber', 'ipAddress', 'siteName'];
const CLIENT_SEARCH_FIELDS = ['name', 'macAddress', 'ssid', 'apName', 'ipAddress'];

/**
 * Snapshot cache, keyed by `${controllerUrl}::${type}::${mode}`.
 *
 * `mode` separates the empty-query "brief" fetch (used to seed a picker on
 * open) from the full fetch a real search needs, so one never serves the
 * other's payload — each mode's own 15s window still saves every repeated
 * keystroke from re-hitting the controller.
 */
const snapshotCache = new Map();

async function getCachedList(cacheKey, fetcher, now = Date.now()) {
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.items;
  const items = await fetcher();
  snapshotCache.set(cacheKey, { items, expiresAt: now + DEVICE_CACHE_TTL_MS });
  return items;
}

export function clearDeviceSearchCache() {
  snapshotCache.clear();
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeAp(ap) {
  const serialNumber = ap?.serialNumber ?? null;
  return {
    id: serialNumber,
    name: ap?.apName ?? ap?.hostname ?? serialNumber ?? null,
    serialNumber,
    ipAddress: ap?.ipAddress ?? null,
    siteName: ap?.siteName ?? ap?.hostSite ?? null,
    status: ap?.status ?? null,
  };
}

/**
 * Normalize a controller STATION object.
 *
 * Real XCC station fields (verified live) are `dhcpHostName` and
 * `accessPointName` — NOT `hostName`/`apName` — and SSID is not carried as a
 * plain string; a station only carries `serviceId`, which must be resolved
 * against `/v1/services` (see `fetchServiceNameMap`). Both the real fields
 * and the more commonly-guessed alternate spellings are accepted, the same
 * defensive-fallback style `evidenceNormalizer.js` uses for station data
 * (`station.apName ?? station.accessPointName`, `station.ssid ?? station.serviceName`).
 */
function normalizeClient(client, ssidById = new Map()) {
  const macAddress = client?.macAddress ?? null;
  const serviceId = client?.serviceId != null ? String(client.serviceId) : null;
  const ssid =
    client?.ssid ??
    client?.serviceName ??
    (serviceId ? ssidById.get(serviceId) : null) ??
    serviceId ??
    null;
  return {
    id: macAddress,
    name: client?.dhcpHostName ?? client?.hostName ?? macAddress ?? null,
    macAddress,
    ssid,
    apName: client?.accessPointName ?? client?.apName ?? null,
    ipAddress: client?.ipAddress ?? null,
  };
}

function parseLimit(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Pure filter/cap/sort helper. Lowercases `q` and matches it against any of
 * the named `fields`; matches are sorted by name (asc) for stable pagination
 * before being capped at `limit`.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {{ q?: string, limit?: number, fields: string[] }} options
 * @returns {{ items: Array<Record<string, unknown>>, total: number, capped: boolean }}
 */
export function filterDevices(items, { q = '', limit = DEFAULT_LIMIT, fields = [] } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  const matched = needle
    ? items.filter((item) =>
        fields.some((field) => String(item?.[field] ?? '').toLowerCase().includes(needle))
      )
    : items;
  const sorted = [...matched].sort((a, b) =>
    String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
  );
  const total = sorted.length;
  return {
    items: sorted.slice(0, limit),
    total,
    capped: total > limit,
  };
}

function resolveController(req) {
  const authToken = req.headers.authorization || req.headers['x-controller-auth'];
  const controllerUrl = req.headers['x-controller-url'] || process.env.CAMPUS_CONTROLLER_URL;
  return { authToken, controllerUrl };
}

/**
 * Cached serviceId → SSID name lookup, same pattern as
 * `clientDhcpFailureCheck.js`'s `ssidById` map, built from `/v1/services`.
 * Shares the 15s TTL cache so a station-search cache miss does not always
 * pay for a second controller round-trip.
 */
async function fetchServiceNameMap({ authToken, controllerUrl }) {
  const cacheKey = `${controllerUrl}::services`;
  return getCachedList(cacheKey, async () => {
    const data = await fetchXcc('/v1/services', { authToken, controllerUrl });
    const map = new Map();
    for (const svc of toArray(data)) {
      if (svc?.id != null) map.set(String(svc.id), svc.serviceName ?? svc.name ?? svc.ssid);
    }
    return map;
  });
}

export function createDeviceSearchRouter() {
  const router = Router();
  const viewer = requireRole('viewer');

  // GET /devices/aps/search?q=&limit= — typeahead over the AP inventory.
  router.get('/devices/aps/search', viewer, async (req, res) => {
    const { authToken, controllerUrl } = resolveController(req);
    if (!controllerUrl) return res.status(400).json({ error: 'controller URL required' });

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = parseLimit(req.query.limit);
    const mode = q ? 'full' : 'brief';
    const cacheKey = `${controllerUrl}::aps::${mode}`;

    try {
      const items = await getCachedList(cacheKey, async () => {
        const columns = encodeURIComponent(AP_REQUESTED_COLUMNS.join(','));
        const briefParam = mode === 'brief' ? '&brief=true' : '';
        const data = await fetchXcc(`/v1/aps/query?requestedColumns=${columns}${briefParam}`, {
          authToken,
          controllerUrl,
        });
        return toArray(data).map(normalizeAp);
      });
      res.json(filterDevices(items, { q, limit, fields: AP_SEARCH_FIELDS }));
    } catch {
      // Controller error text is never forwarded verbatim to the browser.
      res.status(502).json({ error: 'failed to reach controller' });
    }
  });

  // GET /devices/clients/search?q=&limit= — typeahead over associated clients.
  router.get('/devices/clients/search', viewer, async (req, res) => {
    const { authToken, controllerUrl } = resolveController(req);
    if (!controllerUrl) return res.status(400).json({ error: 'controller URL required' });

    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = parseLimit(req.query.limit);
    const cacheKey = `${controllerUrl}::clients`;

    try {
      const items = await getCachedList(cacheKey, async () => {
        const [data, ssidById] = await Promise.all([
          fetchXcc('/v1/stations', { authToken, controllerUrl }),
          fetchServiceNameMap({ authToken, controllerUrl }),
        ]);
        return toArray(data).map((client) => normalizeClient(client, ssidById));
      });
      res.json(filterDevices(items, { q, limit, fields: CLIENT_SEARCH_FIELDS }));
    } catch {
      res.status(502).json({ error: 'failed to reach controller' });
    }
  });

  return router;
}
