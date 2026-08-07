/**
 * /api/v1/guests — guest management for the AURA-CWP captive portal.
 *
 * AURA is the management plane. It owns no guest data: the portal's database is
 * authoritative for who may connect, the gateway is authoritative for who *is*
 * connected, and this router is what joins them and applies operator intent to
 * both.
 *
 * Authorization: the caller's token is validated against the gateway they name,
 * exactly as the monitoring API does. A bearer header alone is not enough — the
 * endpoints here can grant and withdraw network access.
 */

import { Router, json as expressJson } from 'express';

import { validateTokenAgainstController, extractBearerToken } from '../monitoring/requireControllerScope.js';
import { normalizeBaseUrl } from '../monitoring/sourceRepository.js';
import { sanitizeError } from '../monitoring/errorSanitizer.js';
import {
  loadCwpConfig,
  listGuests as cwpListGuests,
  getGuest as cwpGetGuest,
  createGuest as cwpCreateGuest,
  revokeGuest as cwpRevokeGuest,
  deleteGuest as cwpDeleteGuest,
  CwpRequestError,
  CwpUnavailableError,
} from './cwpClient.js';
import {
  fetchStations,
  fetchServices,
  assignRole,
  disassociate,
  canonicalMac,
} from './gatewayStations.js';
import {
  mergeGuest,
  filterByStatus,
  filterBySearch,
  summarize,
  GUEST_STATUS,
} from './guestView.js';

const VALID_STATUSES = new Set(Object.values(GUEST_STATUS));
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

/**
 * Statuses that live only in the merged view.
 *
 * The portal cannot filter on these — it has no idea which stations are
 * associated — so a request for them is fetched unfiltered and narrowed here.
 * Passing them through as a ledger filter would silently return nothing.
 */
const LIVE_ONLY_STATUSES = new Set([
  GUEST_STATUS.CONNECTED,
  GUEST_STATUS.DISCONNECTED,
  GUEST_STATUS.MANUALLY_ADDED,
  GUEST_STATUS.FAILED,
]);

/** UI status → the ledger statuses that could produce it. */
const LEDGER_STATUS_FOR = {
  [GUEST_STATUS.REVOKED]: ['REVOKED'],
  [GUEST_STATUS.EXPIRED]: ['EXPIRED'],
  [GUEST_STATUS.AUTHORIZED]: ['ACTIVE'],
};

function parseStatuses(raw) {
  if (!raw) return { ok: true, statuses: [] };
  const statuses = String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const invalid = statuses.filter((s) => !VALID_STATUSES.has(s));
  if (invalid.length > 0) {
    return { ok: false, detail: `Unknown status: ${invalid.join(', ')}` };
  }
  return { ok: true, statuses };
}

function parseTimestamp(raw, field) {
  if (!raw) return { ok: true, value: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, detail: `\`${field}\` is not a valid ISO-8601 timestamp.` };
  }
  return { ok: true, value: date };
}

/**
 * Authorization middleware.
 *
 * Deliberately a copy of the monitoring policy minus the source registration:
 * a controller that AURA can reach and the caller can authenticate against is
 * the trust boundary. Guest records are not per-source rows, so there is
 * nothing narrower to scope to.
 */
export function createRequireGatewayAuth({
  validateFn = validateTokenAgainstController,
  defaultControllerUrl = process.env.CAMPUS_CONTROLLER_URL,
  fetchFn = null,
} = {}) {
  return async function requireGatewayAuth(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const baseUrl = normalizeBaseUrl(req.headers['x-controller-url'] || defaultControllerUrl);
    if (!baseUrl) return res.status(400).json({ error: 'No controller specified' });

    const validation = await validateFn(token, baseUrl, { fetchFn });
    if (!validation.valid) {
      if (validation.unreachable) {
        return res.status(503).json({
          error: 'Gateway unreachable',
          detail:
            'The gateway could not be contacted to validate this session, and it has not been validated recently enough to manage guest access.',
        });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.gatewayAuth = {
      baseUrl,
      authToken: `Bearer ${token}`,
      degraded: Boolean(validation.degraded),
    };
    return next();
  };
}

/**
 * Live station and service snapshots.
 *
 * A gateway failure is reported, never thrown: historical guest data must stay
 * readable when the controller is down, which is one of the reasons the ledger
 * exists at all.
 */
async function loadLiveState({ authToken, baseUrl, fetchFn }) {
  try {
    const [stations, services] = await Promise.all([
      fetchStations({ authToken, controllerUrl: baseUrl, fetchFn }),
      fetchServices({ authToken, controllerUrl: baseUrl, fetchFn }).catch(() => new Map()),
    ]);
    return { stations, services, gatewayReachable: true, gatewayError: null };
  } catch (error) {
    const { errorClass, summary } = sanitizeError(error);
    return {
      stations: null,
      services: new Map(),
      gatewayReachable: false,
      gatewayError: { errorClass, summary },
    };
  }
}

/** Map a portal-client failure onto an HTTP response. */
function respondToCwpError(res, error, { notFoundMessage = 'Guest not found' } = {}) {
  if (error instanceof CwpUnavailableError) {
    return res.status(503).json({
      error: 'Guest portal service unavailable',
      detail:
        'AURA could not reach the captive portal service that owns guest records. Live gateway data is unaffected.',
    });
  }
  if (error instanceof CwpRequestError) {
    if (error.status === 404) return res.status(404).json({ error: notFoundMessage });
    return res.status(error.status).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.body?.guest ? { guest: error.body.guest } : {}),
    });
  }
  const { errorClass } = sanitizeError(error);
  return res.status(500).json({ error: 'Guest request failed', errorClass });
}

/** Operator identity for the portal's audit trail, when the token carries one. */
function actorFrom(req) {
  const header = req.headers['x-aura-user'];
  return typeof header === 'string' && header.trim() ? header.trim().slice(0, 128) : null;
}

export function createGuestsRouter({
  requireAuthFn = null,
  cwp = {
    list: cwpListGuests,
    get: cwpGetGuest,
    create: cwpCreateGuest,
    revoke: cwpRevokeGuest,
    remove: cwpDeleteGuest,
  },
  gateway = { assignRole, disassociate },
  loadLiveStateFn = loadLiveState,
  configFn = loadCwpConfig,
  fetchFn = null,
} = {}) {
  const router = Router();
  const jsonBody = expressJson({ limit: '16kb' });
  const requireGatewayAuth = requireAuthFn ?? createRequireGatewayAuth({ fetchFn });

  router.use('/v1/guests', requireGatewayAuth);

  /**
   * The feature is inert rather than broken when the portal link is not
   * configured: the UI shows an explanatory empty state instead of a 500 on
   * every poll.
   */
  function ensureConfigured(res) {
    const config = configFn();
    if (!config.configured) {
      res.status(501).json({
        error: 'Guest management is not configured',
        detail:
          'CWP_INTERNAL_API_URL and CWP_INTERNAL_API_TOKEN must point at the captive portal service.',
        code: 'NOT_CONFIGURED',
      });
      return null;
    }
    return config;
  }

  // ------------------------------------------------------------ collection
  router.get('/v1/guests', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    const statuses = parseStatuses(req.query.status);
    if (!statuses.ok) return res.status(400).json({ error: 'invalid_status', detail: statuses.detail });

    const start = parseTimestamp(req.query.start_time, 'start_time');
    if (!start.ok) return res.status(400).json({ error: 'invalid_range', detail: start.detail });
    const end = parseTimestamp(req.query.end_time, 'end_time');
    if (!end.ok) return res.status(400).json({ error: 'invalid_range', detail: end.detail });
    if (start.value && end.value && start.value > end.value) {
      return res.status(400).json({
        error: 'invalid_range',
        detail: '`start_time` must not be after `end_time`.',
      });
    }

    const rawLimit = Number(req.query.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    // Only push a status filter down to the ledger when every requested status
    // maps cleanly onto one; otherwise the narrowing happens after the merge.
    const pushDownStatuses =
      statuses.statuses.length > 0 && !statuses.statuses.some((s) => LIVE_ONLY_STATUSES.has(s))
        ? [...new Set(statuses.statuses.flatMap((s) => LEDGER_STATUS_FOR[s] ?? []))]
        : [];

    let payload;
    try {
      payload = await cwp.list(
        {
          ...(pushDownStatuses.length > 0 ? { status: pushDownStatuses.join(',') } : {}),
          ...(start.value ? { start_time: start.value.toISOString() } : {}),
          ...(end.value ? { end_time: end.value.toISOString() } : {}),
          ...(req.query.cursor ? { cursor: req.query.cursor } : {}),
          limit,
        },
        { config, fetchFn }
      );
    } catch (error) {
      return respondToCwpError(res, error);
    }

    const live = await loadLiveStateFn({
      authToken: req.gatewayAuth.authToken,
      baseUrl: req.gatewayAuth.baseUrl,
      fetchFn,
    });

    let guests = (payload.guests ?? []).map((guest) =>
      mergeGuest(guest, live.stations, live.services)
    );
    guests = filterByStatus(guests, statuses.statuses);
    guests = filterBySearch(guests, req.query.search);

    return res.json({
      guests,
      nextCursor: payload.nextCursor ?? null,
      // Total before the post-merge narrowing; the UI shows the filtered count
      // separately so the two are never conflated.
      ledgerTotal: payload.total ?? guests.length,
      gateway: {
        reachable: live.gatewayReachable,
        baseUrl: req.gatewayAuth.baseUrl,
        ...(live.gatewayError ? { errorClass: live.gatewayError.errorClass } : {}),
      },
    });
  });

  // --------------------------------------------------------------- summary
  router.get('/v1/guests/summary', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    let payload;
    try {
      payload = await cwp.list({ limit: MAX_LIMIT }, { config, fetchFn });
    } catch (error) {
      return respondToCwpError(res, error);
    }

    const live = await loadLiveStateFn({
      authToken: req.gatewayAuth.authToken,
      baseUrl: req.gatewayAuth.baseUrl,
      fetchFn,
    });

    const guests = (payload.guests ?? []).map((guest) =>
      mergeGuest(guest, live.stations, live.services)
    );

    return res.json({
      summary: summarize(guests, { gatewayReachable: live.gatewayReachable }),
      gateway: { reachable: live.gatewayReachable },
      // True when the ledger is larger than one page, so the UI can say the
      // counts are for the most recent MAX_LIMIT guests rather than all of them.
      truncated: (payload.total ?? 0) > guests.length,
    });
  });

  // ------------------------------------------------------------- one guest
  router.get('/v1/guests/:id', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    let payload;
    try {
      payload = await cwp.get(req.params.id, { config, fetchFn });
    } catch (error) {
      return respondToCwpError(res, error);
    }

    const live = await loadLiveStateFn({
      authToken: req.gatewayAuth.authToken,
      baseUrl: req.gatewayAuth.baseUrl,
      fetchFn,
    });

    return res.json({
      guest: mergeGuest(payload.guest, live.stations, live.services),
      gateway: { reachable: live.gatewayReachable },
    });
  });

  // ---------------------------------------------------------------- create
  /**
   * Grant access to a MAC.
   *
   * Two things must happen, and the response reports both honestly:
   *   1. the portal records a standing authorization, so the device is approved
   *      the moment it associates and reaches the portal;
   *   2. if the device is *already* associated, its role is moved to the WLAN's
   *      authenticated role immediately, because it will not be redirected to
   *      the portal again on its own.
   *
   * Step 2 failing does not undo step 1 — the authorization is real either way
   * — but it is surfaced rather than swallowed.
   */
  router.post('/v1/guests', jsonBody, async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    let payload;
    try {
      payload = await cwp.create(req.body ?? {}, { config, fetchFn, actor: actorFrom(req) });
    } catch (error) {
      return respondToCwpError(res, error);
    }

    const guest = payload.guest;
    const mac = canonicalMac(guest?.macAddress);
    let activation = { attempted: false, applied: false, reason: 'not_associated' };

    if (mac) {
      const live = await loadLiveStateFn({
        authToken: req.gatewayAuth.authToken,
        baseUrl: req.gatewayAuth.baseUrl,
        fetchFn,
      });
      const station = live.stations?.get(mac) ?? null;

      if (!live.gatewayReachable) {
        activation = {
          attempted: false,
          applied: false,
          reason: 'gateway_unreachable',
        };
      } else if (station) {
        const service = station.serviceId ? live.services.get(station.serviceId) : null;
        const roleId = service?.authenticatedRoleId ?? null;
        if (!roleId) {
          activation = { attempted: false, applied: false, reason: 'no_authenticated_role' };
        } else {
          activation = { attempted: true, applied: false, reason: null };
          try {
            await gateway.assignRole({
              mac: station.macAddress,
              roleId,
              authToken: req.gatewayAuth.authToken,
              controllerUrl: req.gatewayAuth.baseUrl,
              fetchFn,
            });
            activation = { attempted: true, applied: true, reason: null, role: service.name };
          } catch (error) {
            const { errorClass } = sanitizeError(error);
            activation = { attempted: true, applied: false, reason: 'gateway_error', errorClass };
          }
        }
      }
    }

    return res.status(201).json({
      guest: mergeGuest(guest, null, new Map()),
      activation,
    });
  });

  // ---------------------------------------------------------------- revoke
  /**
   * Withdraw access.
   *
   * The portal record is updated first, because that is what stops the *next*
   * connection; the gateway is then told to stop the current one. Doing it in
   * that order means a failure halfway leaves the guest blocked rather than
   * still authorized.
   */
  router.post('/v1/guests/:id/revoke', jsonBody, async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    let payload;
    try {
      payload = await cwp.revoke(req.params.id, { config, fetchFn, actor: actorFrom(req) });
    } catch (error) {
      return respondToCwpError(res, error);
    }

    const enforcement = await enforceRevocationOnGateway({
      guest: payload.guest,
      req,
      gateway,
      loadLiveStateFn,
      fetchFn,
    });

    return res.json({ guest: mergeGuest(payload.guest, null, new Map()), enforcement });
  });

  // ---------------------------------------------------------------- delete
  /**
   * Delete a guest that never connected, revoke one that did.
   *
   * The portal decides which, since it holds the history; the response says
   * which happened so the UI never claims a record was removed when it was
   * preserved for audit.
   */
  router.delete('/v1/guests/:id', async (req, res) => {
    const config = ensureConfigured(res);
    if (!config) return undefined;

    let payload;
    try {
      payload = await cwp.remove(req.params.id, { config, fetchFn, actor: actorFrom(req) });
    } catch (error) {
      return respondToCwpError(res, error);
    }

    if (payload.outcome === 'DELETED') {
      return res.json({ outcome: 'DELETED', guest: null, enforcement: null });
    }

    const enforcement = await enforceRevocationOnGateway({
      guest: payload.guest,
      req,
      gateway,
      loadLiveStateFn,
      fetchFn,
    });

    return res.json({
      outcome: 'REVOKED',
      guest: mergeGuest(payload.guest, null, new Map()),
      enforcement,
    });
  });

  return router;
}

/**
 * Make a revocation take effect on a station that is connected right now.
 *
 * Without this the guest keeps their session until it happens to end: the
 * portal record only governs the *next* authorization. The station is moved
 * back to the WLAN's pre-authentication role and then disassociated, so it has
 * to re-authenticate — and will now be refused.
 *
 * Reported rather than thrown: the revocation itself already succeeded.
 */
async function enforceRevocationOnGateway({ guest, req, gateway, loadLiveStateFn, fetchFn }) {
  const mac = canonicalMac(guest?.macAddress);
  if (!mac) return { attempted: false, applied: false, reason: 'no_mac' };

  const live = await loadLiveStateFn({
    authToken: req.gatewayAuth.authToken,
    baseUrl: req.gatewayAuth.baseUrl,
    fetchFn,
  });

  if (!live.gatewayReachable) {
    return { attempted: false, applied: false, reason: 'gateway_unreachable' };
  }

  const station = live.stations?.get(mac) ?? null;
  if (!station) return { attempted: false, applied: false, reason: 'not_connected' };

  const service = station.serviceId ? live.services.get(station.serviceId) : null;
  const result = { attempted: true, applied: false, roleReverted: false, disassociated: false };

  if (service?.unauthenticatedRoleId) {
    try {
      await gateway.assignRole({
        mac: station.macAddress,
        roleId: service.unauthenticatedRoleId,
        authToken: req.gatewayAuth.authToken,
        controllerUrl: req.gatewayAuth.baseUrl,
        fetchFn,
      });
      result.roleReverted = true;
    } catch (error) {
      result.roleError = sanitizeError(error).errorClass;
    }
  }

  try {
    await gateway.disassociate({
      macs: [station.macAddress],
      authToken: req.gatewayAuth.authToken,
      controllerUrl: req.gatewayAuth.baseUrl,
      fetchFn,
    });
    result.disassociated = true;
  } catch (error) {
    result.disassociateError = sanitizeError(error).errorClass;
  }

  result.applied = result.roleReverted || result.disassociated;
  if (!result.applied) result.reason = 'gateway_error';
  return result;
}
