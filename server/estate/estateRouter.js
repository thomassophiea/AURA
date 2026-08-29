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

function toArray(data) {
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
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

    const controllers = await Promise.all(sources.map((s) => summarizeSource(s, config)));
    // Worst first: unreachable, then most out-of-service APs.
    controllers.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? 1 : -1;
      const aDown = (a.aps?.total ?? 0) - (a.aps?.inService ?? 0);
      const bDown = (b.aps?.total ?? 0) - (b.aps?.inService ?? 0);
      return bDown - aDown;
    });
    res.json({ controllers, collectedAt: new Date().toISOString() });
  });

  return router;
}
