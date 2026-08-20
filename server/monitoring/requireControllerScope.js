/**
 * Authorization for the monitoring read API.
 *
 * `requireAuth` in server.js only checks that *a* Bearer header is present —
 * enough for the mock endpoints it guards, not enough for persisted history
 * that spans controllers. Here the caller's token is validated against the
 * controller it claims, and the authorized scope is derived from the result:
 *
 *   a caller may read history for the sources whose controller they can
 *   authenticate against — nothing else.
 *
 * `orgId` / `siteId` from the browser are filters applied *within* that scope,
 * never the trust boundary.
 */

import crypto from 'node:crypto';

import { requestXcc } from '../validationEngine/xccClient.js';
import { listSources, normalizeBaseUrl } from './sourceRepository.js';
import { sanitizeError } from './errorSanitizer.js';

/** Positive validations are cached briefly so every chart request is not a controller round-trip. */
const VALIDATION_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;

/**
 * How long a token that has already proven itself keeps working while the
 * controller is *unreachable*.
 *
 * Stored history exists precisely so a gateway outage does not blank the
 * dashboard, but validating every read against that same gateway made the
 * outage lock operators out of the data collected before it — the one moment the
 * history is most wanted. Within this window a token that previously validated
 * is accepted when the controller cannot be contacted at all.
 *
 * This does not widen the trust boundary. An unknown token never reaches the
 * grace cache, because only a successful validation writes to it. And a
 * controller that *answers* with 401/403 still rejects immediately — grace
 * covers transport failure, never a refusal.
 */
const DEFAULT_GRACE_MS = 15 * 60 * 1000;

const validationCache = new Map();
/** token+controller → epoch ms of the last successful validation. */
const provenCache = new Map();

function cacheKey(token, baseUrl) {
  // SHA-256 of the whole token, not a prefix. A prefix key would let two
  // different tokens that happen to share their leading characters collide, and
  // an invalid token would then inherit a valid one's cached "valid" verdict —
  // an authentication bypass. The digest is one-way, so a heap dump of the
  // cache still does not reveal any token.
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  return `${baseUrl}|${digest}`;
}

export function clearValidationCache() {
  validationCache.clear();
  provenCache.clear();
}

function rememberProven(key, now, value) {
  if (provenCache.size >= MAX_CACHE_ENTRIES) {
    provenCache.delete(provenCache.keys().next().value);
  }
  provenCache.set(key, { provenAt: now, value });
}

function wasProvenRecently(key, now, graceMs) {
  const proven = provenCache.get(key);
  if (!proven) return null;
  if (now - proven.provenAt > graceMs) {
    provenCache.delete(key);
    return null;
  }
  return proven.value;
}

function authorizedSiteIds(data) {
  const rows = Array.isArray(data)
    ? data
    : data?.sites ?? data?.items ?? data?.data ?? data?.results ?? [];
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.map((site) => site?.id ?? site?.siteId ?? site?.siteID).filter(Boolean).map(String))];
}

function readCache(key, now) {
  const entry = validationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    validationCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value, now) {
  if (validationCache.size >= MAX_CACHE_ENTRIES) {
    // Simple FIFO eviction; this cache is a latency optimization, not a store.
    const oldest = validationCache.keys().next().value;
    validationCache.delete(oldest);
  }
  validationCache.set(key, { value, expiresAt: now + VALIDATION_TTL_MS });
}

/** Extract the bearer token, or null. */
export function extractBearerToken(req) {
  const header = req.headers?.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length >= 8 ? token : null;
}

/**
 * Validate a token against a controller with a cheap authenticated call.
 * `/v3/sites` is used because every authenticated role can read it.
 */
export async function validateTokenAgainstController(
  token,
  baseUrl,
  { fetchFn = null, timeoutMs = 10_000, now = Date.now(), graceMs = DEFAULT_GRACE_MS } = {}
) {
  const key = cacheKey(token, baseUrl);
  const cached = readCache(key, now);
  if (cached) return cached;

  /**
   * The controller could not be asked. Fall back to a recent proof if there is
   * one, and label the result so callers can tell the UI the check was skipped.
   */
  const unreachable = (detail) => {
    const proven = wasProvenRecently(key, now, graceMs);
    if (proven) {
      return { ...proven, valid: true, degraded: true, reason: 'controller_unreachable', ...detail };
    }
    return { valid: false, unreachable: true, ...detail };
  };

  try {
    const result = await requestXcc('/v3/sites', {
      authToken: `Bearer ${token}`,
      controllerUrl: baseUrl,
      fetchFn,
      timeoutMs,
    });

    if (result.ok) {
      const value = { valid: true, allowedSiteIds: authorizedSiteIds(result.data) };
      writeCache(key, value, now);
      rememberProven(key, now, value);
      return value;
    }

    // A controller that *answers* 401/403 has refused this token. That is
    // definitive and no amount of prior success overrides it.
    if (result.status === 401 || result.status === 403) {
      provenCache.delete(key);
      return { valid: false, status: result.status };
    }

    // Any other status — 5xx, a proxy error, a gateway mid-restart — says
    // nothing about the token. Treated as unreachable, not as a rejection.
    // Failures are never written to the positive cache: a controller that is
    // briefly down must not lock a valid operator out for a minute.
    return unreachable({ status: result.status });
  } catch (error) {
    const { errorClass } = sanitizeError(error);
    return unreachable({ errorClass });
  }
}

/**
 * Express middleware. On success sets:
 *   req.monitoringScope = { sources, sourceIds, baseUrl }
 *
 * @param {{ listSourcesFn?: Function, validateFn?: Function,
 *           defaultControllerUrl?: string, fetchFn?: any }} [options]
 */
export function createRequireControllerScope(options = {}) {
  const {
    listSourcesFn = listSources,
    validateFn = validateTokenAgainstController,
    defaultControllerUrl = process.env.CAMPUS_CONTROLLER_URL,
    fetchFn = null,
    graceMs = DEFAULT_GRACE_MS,
  } = options;

  return async function requireControllerScope(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedUrl = req.headers['x-controller-url'] || defaultControllerUrl;
    const baseUrl = normalizeBaseUrl(requestedUrl);
    if (!baseUrl) {
      return res.status(400).json({ error: 'No controller specified' });
    }

    let sources;
    try {
      sources = await listSourcesFn();
    } catch (error) {
      const { errorClass } = sanitizeError(error);
      return res.status(503).json({ error: 'Monitoring store unavailable', errorClass });
    }

    // Only sources on the controller the caller is presenting a token for.
    const scoped = sources.filter((source) => normalizeBaseUrl(source.baseUrl) === baseUrl);
    if (scoped.length === 0) {
      // Do not disclose whether the controller exists but is unregistered.
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validation = await validateFn(token, baseUrl, { fetchFn, graceMs });
    if (!validation.valid) {
      // Distinguished so the client can say "controller unreachable" rather
      // than "your session expired" and prompt a pointless re-login.
      if (validation.unreachable) {
        return res.status(503).json({
          error: 'Controller unreachable',
          detail:
            'The controller could not be contacted to validate this session, and it has not been validated recently enough to read stored history.',
          errorClass: validation.errorClass ?? null,
        });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.monitoringScope = {
      baseUrl,
      sources: scoped,
      sourceIds: scoped.map((source) => source.id),
      // True when the controller could not be reached and a recent successful
      // validation was used instead. The data below is stored history either
      // way; this only records how the caller was authorized.
      degradedAuth: Boolean(validation.degraded),
      allowedSiteIds: validation.allowedSiteIds ?? null,
    };
    return next();
  };
}
