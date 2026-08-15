/**
 * Aggregated WLAN (service) summary for the Dashboard.
 *
 * The Dashboard needs, for each WLAN, its health report and its connected
 * station count. The browser used to assemble that itself: fetch `/v1/services`,
 * then issue `/v1/services/{id}/report` and `/v1/services/{id}/stations` for
 * every service. On a controller with eight WLANs that is sixteen gateway calls
 * from the page, and browsers cap concurrent connections to one origin at six,
 * so they queue three deep behind everything else the Dashboard is loading. It
 * measured as the single largest contributor to Dashboard time — individual
 * reports took 400-790 ms each.
 *
 * Moving the fan-out here changes the shape of the problem rather than hiding
 * it. The server reaches the controller over a pooled keep-alive connection with
 * no six-per-origin limit, so the same sixteen calls run genuinely concurrently
 * and cost roughly one round trip instead of three. The page makes one request.
 *
 * This is an aggregate over a resource collection, not a device-centric
 * shortcut: it is still `/v1/services` with its sub-resources rolled up, and it
 * stays correct as the WLAN count grows because the fan-out is bounded and
 * concurrent rather than serial.
 */

import crypto from 'node:crypto';
import express from 'express';

import { requestXcc } from '../validationEngine/xccClient.js';
import { sanitizeMessage } from '../monitoring/errorSanitizer.js';

/**
 * How long an assembled summary may be replayed.
 *
 * Short, because these are operational health figures. Long enough that the
 * Dashboard's own widgets and a quick navigation away and back reuse one
 * assembly instead of re-running the fan-out.
 */
const SUMMARY_TTL_MS = 10_000;

/** Ceiling on services expanded, matching what the Dashboard renders. */
const MAX_SERVICES = 10;

/** Concurrent sub-resource requests against the controller. */
const FANOUT_CONCURRENCY = 8;

/** Per-call timeout. A slow WLAN report must not hold the whole summary. */
const CALL_TIMEOUT_MS = 8000;

/**
 * Cache key.
 *
 * Includes a digest of the caller's token, never the token itself, so that two
 * principals with different controller scopes can never be served each other's
 * assembly. The controller URL is part of the key because AURA is
 * multi-controller.
 */
function cacheKey(controllerUrl, authToken) {
  const digest = crypto.createHash('sha256').update(authToken).digest('hex').slice(0, 32);
  return `${controllerUrl}::${digest}`;
}

/** Run `fn` over `items` with at most `limit` in flight. Order is preserved. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function stationCountOf(payload) {
  if (Array.isArray(payload)) return payload.length;
  const list = payload?.stations;
  return Array.isArray(list) ? list.length : 0;
}

export function createServicesSummaryRouter({ resolveControllerUrl, agent = null } = {}) {
  const router = express.Router();

  // The cache belongs to the router instance rather than the module, so a
  // second mount (and every test) starts clean instead of inheriting whatever
  // the previous one assembled.
  const cache = new Map();

  const readCache = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > SUMMARY_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  };

  const writeCache = (key, value) => {
    cache.set(key, { value, at: Date.now() });
    // Bounded: one entry per controller per principal, expiring in seconds.
    if (cache.size > 50) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  };

  router.get('/v1/services/summary', async (req, res) => {
    const authToken = req.headers.authorization || '';
    if (!authToken.startsWith('Bearer ') || authToken.length < 10) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const controllerUrl = resolveControllerUrl(req);
    const key = cacheKey(controllerUrl, authToken);

    const cached = readCache(key);
    if (cached) {
      res.setHeader('X-AURA-Cache', 'hit');
      return res.json(cached);
    }

    try {
      const servicesResult = await requestXcc('/v1/services', {
        authToken,
        controllerUrl,
        timeoutMs: CALL_TIMEOUT_MS,
        agent,
      });

      if (!servicesResult.ok) {
        return res.status(servicesResult.status || 502).json({
          error: 'Failed to load services from the controller',
          detail: sanitizeMessage(servicesResult.errorText),
        });
      }

      const raw = servicesResult.data;
      const services = Array.isArray(raw) ? raw : (raw?.services ?? []);
      const expanded = services.slice(0, MAX_SERVICES);

      // One WLAN's report failing must not fail the summary — the Dashboard
      // renders what it has and leaves the rest blank, which is far better than
      // an empty page because one sub-resource 404'd.
      const details = await mapWithConcurrency(expanded, FANOUT_CONCURRENCY, async (service) => {
        const [report, stations] = await Promise.all([
          requestXcc(`/v1/services/${service.id}/report`, {
            authToken,
            controllerUrl,
            timeoutMs: CALL_TIMEOUT_MS,
            agent,
          }).catch(() => ({ ok: false, status: 0, data: null, errorText: 'request failed' })),
          requestXcc(`/v1/services/${service.id}/stations`, {
            authToken,
            controllerUrl,
            timeoutMs: CALL_TIMEOUT_MS,
            agent,
          }).catch(() => ({ ok: false, status: 0, data: null, errorText: 'request failed' })),
        ]);

        return {
          id: service.id,
          report: report.ok ? report.data : null,
          reportError: report.ok ? null : sanitizeMessage(report.errorText),
          stationCount: stations.ok ? stationCountOf(stations.data) : null,
        };
      });

      const reports = {};
      const stationCounts = {};
      const failures = [];
      for (const detail of details) {
        if (detail.report) reports[detail.id] = detail.report;
        if (detail.stationCount !== null) stationCounts[detail.id] = detail.stationCount;
        if (detail.reportError) failures.push({ id: detail.id, error: detail.reportError });
      }

      const payload = {
        services,
        reports,
        stationCounts,
        meta: {
          serviceCount: services.length,
          expandedCount: expanded.length,
          truncated: services.length > expanded.length,
          failures,
          assembledAt: new Date().toISOString(),
        },
      };

      writeCache(key, payload);
      res.setHeader('X-AURA-Cache', 'miss');
      return res.json(payload);
    } catch (error) {
      return res.status(502).json({
        error: 'Failed to assemble the services summary',
        detail: sanitizeMessage(error?.message ?? String(error)),
      });
    }
  });

  return router;
}
