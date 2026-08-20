// server/energy/lightAware/router.js
/**
 * /api/energy/light-aware/* — read/model API over persisted light state. Auth
 * reuses requireControllerScope. Mutates no controller config: policies are
 * stored intent; actions are modeled, never executed (spec §20).
 */
import { Router, json as expressJson } from 'express';
import { createRequireControllerScope } from '../../monitoring/requireControllerScope.js';
import { supportsLightSensor, capabilitiesForModel } from '../apCapabilities.js';
import { eligibleOptimizations } from './policyEngine.js';
import { ambientLightTrigger } from './triggers/ambientLightTrigger.js';
import { resolveApState } from '../powerModel.js';
import * as repo from './lightRepository.js';
import { getRatePreferences } from '../energyRepository.js';
import { listApLightStates as realListApLightStates } from './lightRepository.js';

const STATES = ['bright', 'dim', 'dark', 'unknown'];

export function createLightAwareRouter(options = {}) {
  const {
    scopeMiddleware = createRequireControllerScope({ graceMs: 900000 }),
    nowFn = () => new Date(),
    deps = {},
  } = options;
  const listApLightStates = deps.listApLightStates ?? realListApLightStates;
  const getPolicy = deps.getPolicy ?? repo.getPolicy;
  const upsertPolicy = deps.upsertPolicy ?? repo.upsertPolicy;
  const getObservedDistribution = deps.getObservedDistribution ?? repo.getObservedDistribution;
  const getPrefs = deps.getRatePreferences ?? getRatePreferences;

  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });
  router.use('/energy/light-aware', scopeMiddleware);

  function sourceId(req) {
    return req.monitoringScope?.sources?.[0]?.id;
  }

  async function prefs(req) {
    return (await getPrefs(sourceId(req))) ?? { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };
  }

  // Build per-AP modeled rows from stored state + policy.
  async function buildRows(req) {
    const siteId = req.query.siteId ?? null;
    const rows = await listApLightStates({ sourceId: sourceId(req), siteId });
    const policyRow = (await getPolicy({ sourceId: sourceId(req), siteId })) ?? { enabled: false, policy: {} };
    const now = nowFn();
    return rows.map((r) => {
      const sensorCapable = supportsLightSensor(r.model);
      const caps = capabilitiesForModel(r.model);
      const trigger = ambientLightTrigger(r.openTransition, now);
      const opts =
        policyRow.enabled && sensorCapable
          ? eligibleOptimizations({ state: trigger.state, capabilities: caps, policy: policyRow.policy })
          : [];
      const optimizedWatts = resolveApState(r.watts, opts);
      return {
        serial: r.serial,
        apName: r.apName,
        siteId: r.siteId,
        model: r.model,
        sensorCapable,
        lightState: trigger.state,
        dwellSeconds: trigger.dwellSeconds,
        policyEnabled: !!policyRow.enabled,
        currentWatts: r.watts,
        optimizedWatts,
        savingsWatts: Math.max(0, r.watts - optimizedWatts),
      };
    });
  }

  router.get('/energy/light-aware/summary', async (req, res) => {
    try {
      const rows = await buildRows(req);
      const p = await prefs(req);
      const stateBreakdown = { bright: 0, dim: 0, dark: 0, unknown: 0 };
      for (const r of rows) {
        stateBreakdown[r.lightState] = (stateBreakdown[r.lightState] ?? 0) + 1;
      }
      res.json({
        sensorCapableCount: rows.filter((r) => r.sensorCapable).length,
        reportingCount: rows.length,
        stateBreakdown,
        policyEnabled: rows.some((r) => r.policyEnabled),
        projectedAnnual: {
          kwh: null,
          cost: null,
        },
        currency: p.currencyCode,
        currencySymbol: p.currencySymbol,
      });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/aps', async (req, res) => {
    try {
      res.json({ aps: await buildRows(req) });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/policy', async (req, res) => {
    try {
      const row = await getPolicy({ sourceId: sourceId(req), siteId: req.query.siteId ?? null });
      res.json(row ?? { enabled: false, policy: {} });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.put('/energy/light-aware/policy', jsonBody, async (req, res) => {
    try {
      const { enabled, policy, siteId } = req.body ?? {};
      if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
        return res.status(400).json({ error: 'policy object required', errorClass: 'validation' });
      }
      const saved = await upsertPolicy({
        sourceId: sourceId(req),
        siteId: siteId ?? null,
        enabled: !!enabled,
        policy,
      });
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/observed', async (req, res) => {
    try {
      const dist = await getObservedDistribution({
        sourceId: sourceId(req),
        siteId: req.query.siteId ?? null,
        start: req.query.start,
        end: req.query.end,
      });
      const total = STATES.reduce((s, k) => s + (dist[`${k}Seconds`] ?? 0), 0);
      const pct = (secs) => (total > 0 ? (secs / total) * 100 : null);
      const avgDarkHoursPerDay =
        dist.days > 0 && dist.observedApCount > 0
          ? Math.min(24, dist.darkSeconds / 3600 / dist.days / dist.observedApCount)
          : null;
      const confidence = dist.days >= 7 ? 'high' : dist.days >= 3 ? 'medium' : 'low';
      res.json({
        brightPct: pct(dist.brightSeconds),
        dimPct: pct(dist.dimSeconds),
        darkPct: pct(dist.darkSeconds),
        unknownPct: pct(dist.unknownSeconds),
        avgDarkHoursPerDay,
        confidence,
        collecting: total === 0,
      });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  return router;
}
