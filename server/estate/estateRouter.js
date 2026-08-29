/**
 * Estate rollup: one answer for "how is every controller doing?"
 *
 * Sources come from the monitoring store (the same registry the collector
 * polls); credentials come from each source's stored credentials or the
 * deployment's env service account. Every source is probed in parallel with a
 * short budget, and per-source failures are reported as rows, never as a
 * failed response — a dead gateway is exactly what this view must show.
 */

import { Router } from 'express';
import { listSources, getSourceCredentials } from '../monitoring/sourceRepository.js';
import { getSession } from '../monitoring/controllerClient.js';
import { requireRole } from '../identity/identityRouter.js';
import { mapWithConcurrency } from '../lib/pLimit.js';

// At most this many sources are probed at once. Hundreds of gateways probed
// unbounded is a thundering herd against the source registry and every
// controller; a modest cap keeps the batch fast without hammering anything.
const ESTATE_PROBE_CONCURRENCY = 8;

// A hung gateway must not stall the whole rollup. Any single source that
// doesn't finish within this budget is reported as a failed row instead.
const ESTATE_PROBE_TIMEOUT_MS = 10_000;

// Re-probing hundreds of gateways on every page load doesn't scale; a short
// TTL cache absorbs bursts of requests (dashboard refreshes, multiple tabs)
// between actual probe cycles.
const ESTATE_CACHE_TTL_MS = 30_000;

// keyed by the sorted, comma-joined set of source ids -> { expiresAt, summary }
const estateSummaryCache = new Map();

function toArray(data) {
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}

/** Stable cache key for a set of sources: sorted ids joined, so add/remove busts it. */
function sourceSetKey(sources) {
  return sources
    .map((s) => s.id)
    .sort()
    .join(',');
}

/**
 * Race `summarizeSource` against a timeout so one unresponsive gateway can't
 * hold up the batch. On timeout, resolves to a failure row shaped like every
 * other probe failure rather than rejecting.
 */
async function summarizeSourceWithTimeout(source, config) {
  const base = {
    sourceId: source.id,
    name: source.displayName ?? source.baseUrl,
    baseUrl: source.baseUrl,
  };

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({ ...base, reachable: false, error: 'probe timed out' });
    }, ESTATE_PROBE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([summarizeSource(source, config), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function summarizeSource(source, config) {
  let credentials = null;
  try {
    credentials = await getSourceCredentials(source.id, config.credentialKey);
  } catch {
    // Fall through to env defaults.
  }
  const username =
    credentials?.username ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerUsername : null);
  const password =
    credentials?.password ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerPassword : null);

  const base = {
    sourceId: source.id,
    name: source.displayName ?? source.baseUrl,
    baseUrl: source.baseUrl,
  };
  if (!username || !password) {
    return { ...base, reachable: false, error: 'no credentials configured' };
  }

  const session = getSession(source.id, {
    baseUrl: source.baseUrl,
    username,
    password,
    timeoutMs: 10_000,
  });

  const [apsState, stations, sites] = await Promise.all([
    session.get('/v1/state/aps'),
    session.get('/v1/stations'),
    session.get('/v3/sites'),
  ]);

  if (!apsState.ok && !stations.ok && !sites.ok) {
    return {
      ...base,
      reachable: false,
      error: apsState.errorSummary ?? 'controller unreachable',
    };
  }

  const apEntries = toArray(apsState.data);
  const apsInService = apEntries.filter(
    (e) => e.entityStatus?.operationalStatus === 'InService'
  ).length;

  return {
    ...base,
    reachable: true,
    aps: { total: apEntries.length, inService: apsInService },
    clients: stations.ok ? toArray(stations.data).length : null,
    sites: sites.ok ? toArray(sites.data).length : null,
  };
}

export function createEstateRouter({ config }) {
  const router = Router();

  // GET /estate/summary — per-controller health rollup, worst first
  router.get('/estate/summary', requireRole('viewer'), async (_req, res) => {
    let sources;
    try {
      sources = (await listSources()).filter((s) => s.enabled !== false);
    } catch (error) {
      return res.status(503).json({ error: `source registry unavailable: ${error.message}` });
    }

    const cacheKey = sourceSetKey(sources);
    const cached = estateSummaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ ...cached.summary, cached: true });
    }

    const settled = await mapWithConcurrency(sources, ESTATE_PROBE_CONCURRENCY, (s) =>
      summarizeSourceWithTimeout(s, config)
    );
    // summarizeSourceWithTimeout never rejects (summarizeSource's own
    // failures already resolve as rows, and the timeout race resolves too),
    // but fall back to a row if a mapper somehow rejects, per allSettled
    // semantics.
    const controllers = settled.map((result, i) =>
      result.status === 'fulfilled'
        ? result.value
        : {
            sourceId: sources[i].id,
            name: sources[i].displayName ?? sources[i].baseUrl,
            baseUrl: sources[i].baseUrl,
            reachable: false,
            error: result.reason?.message ?? 'probe failed',
          }
    );
    // Worst first: unreachable, then most out-of-service APs.
    controllers.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? 1 : -1;
      const aDown = (a.aps?.total ?? 0) - (a.aps?.inService ?? 0);
      const bDown = (b.aps?.total ?? 0) - (b.aps?.inService ?? 0);
      return bDown - aDown;
    });

    const summary = { controllers, collectedAt: new Date().toISOString() };
    estateSummaryCache.set(cacheKey, {
      summary,
      expiresAt: Date.now() + ESTATE_CACHE_TTL_MS,
    });
    res.json({ ...summary, cached: false });
  });

  return router;
}
