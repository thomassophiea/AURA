/**
 * /api/energy/* — read/analysis API over stored AP power telemetry.
 *
 * Auth reuses requireControllerScope: the authorized source set is
 * req.monitoringScope.sources, derived from the caller's validated token. Query
 * params filter within that scope, they are never the trust boundary. This
 * router mutates no controller config — scenarios are simulation only.
 */

import { Router, json as expressJson } from 'express';

import { createRequireControllerScope } from '../monitoring/requireControllerScope.js';
import { sanitizeError, ERROR_CLASS_LABELS } from '../monitoring/errorSanitizer.js';
import {
  fetchOverviewAggregate,
  fetchSiteAggregates,
  fetchApAggregates,
  fetchPowerSamples,
  getEarliestPowerSampleAt,
  getRatePreferences,
  upsertRatePreferences,
  insertScenario,
  insertScenarioResult,
} from './energyRepository.js';
import { replayScenario } from './scenarioEngine.js';
import { buildRecommendations } from './recommendationEngine.js';
import {
  projectDaily,
  projectMonthly,
  projectAnnual,
  estimateCost,
  windowDays,
} from './energyCalculator.js';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
const DEFAULT_MAX_GAP_SECONDS = 2 * 60 * 60;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createEnergyRouter(options = {}) {
  const {
    config = { retentionDays: 7, authGraceSeconds: 900, maxGapSeconds: DEFAULT_MAX_GAP_SECONDS },
    scopeMiddleware = createRequireControllerScope({
      graceMs: (config.authGraceSeconds ?? 900) * 1000,
    }),
    fetchOverviewAggregateFn = fetchOverviewAggregate,
    fetchSiteAggregatesFn = fetchSiteAggregates,
    fetchApAggregatesFn = fetchApAggregates,
    fetchPowerSamplesFn = fetchPowerSamples,
    getEarliestPowerSampleAtFn = getEarliestPowerSampleAt,
    getRatePreferencesFn = getRatePreferences,
    upsertRatePreferencesFn = upsertRatePreferences,
    insertScenarioFn = insertScenario,
    insertScenarioResultFn = insertScenarioResult,
    buildRecommendationsFn = buildRecommendations,
    nowFn = () => new Date(),
  } = options;

  const maxGapSeconds = config.maxGapSeconds ?? DEFAULT_MAX_GAP_SECONDS;
  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });

  router.use('/energy', scopeMiddleware);

  function fail(res, error, status = 500) {
    // Client-input validation (4xx) carries a safe, developer-authored message —
    // surface it so callers see "unsupported currency", not the generic upstream
    // label. 5xx may wrap DB/controller internals, so those stay sanitized.
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: error.message, errorClass: 'validation' });
    }
    const { errorClass } = sanitizeError(error);
    return res.status(status).json({
      error: ERROR_CLASS_LABELS[errorClass] ?? 'Request failed',
      errorClass,
    });
  }

  function sourceIdsOf(req) {
    return (req.monitoringScope?.sources ?? []).map((s) => s.id);
  }

  /** Resolve the [start,end) window, defaulting to the retention window ending now.
   *  Returns null when a provided param is present but unparseable, or when start >= end. */
  function resolveWindow(req) {
    const now = nowFn();
    const rawEnd = req.query.end;
    const rawStart = req.query.start;
    // A provided but invalid date string is a client error.
    if (rawEnd && !parseDate(rawEnd)) return null;
    if (rawStart && !parseDate(rawStart)) return null;
    const end = parseDate(rawEnd) ?? now;
    const defaultStart = new Date(end.getTime() - config.retentionDays * 86_400_000);
    const start = parseDate(rawStart) ?? defaultStart;
    if (start >= end) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function resolvePrefs(sourceId) {
    const prefs = await getRatePreferencesFn(sourceId);
    return prefs ?? { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };
  }

  // ---- Overview -----------------------------------------------------------
  router.get('/energy/overview', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const siteId = req.query.siteId ?? null;

      const agg = await fetchOverviewAggregateFn({
        sourceIds,
        siteId,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;
      const dailyKwh = projectDaily(agg.periodKwh, seconds);
      const days = windowDays(win.start, win.end);
      const earliest = await getEarliestPowerSampleAtFn({ sourceIds, siteId });

      res.json({
        apWithDataCount: agg.apWithDataCount,
        currentWatts: agg.currentWatts,
        avgWatts: agg.avgWatts,
        peakWatts: agg.peakWatts,
        periodKwh: agg.periodKwh,
        dailyKwhProjected: dailyKwh,
        monthlyKwhProjected: projectMonthly(dailyKwh),
        annualKwhProjected: projectAnnual(dailyKwh),
        estimatedAnnualCost: estimateCost(projectAnnual(dailyKwh) ?? 0, prefs.ratePerKwh),
        currency: prefs.currencyCode,
        currencySymbol: prefs.currencySymbol,
        ratePerKwh: prefs.ratePerKwh,
        meta: {
          dataWindowDays: days,
          earliestSampleAt: earliest,
          // Only a caveat about the selected window, not a "no data" warning
          // (the empty state covers that). Firing it with zero data made it
          // read as missing data on the default short-range view.
          limitationsNotes:
            agg.apWithDataCount > 0 && days !== null && days < 3
              ? [
                  `Annualized projections are extrapolated from ${
                    days < 1 ? 'under a day' : `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`
                  } of data — widen the time range for higher confidence.`,
                ]
              : [],
        },
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Sites --------------------------------------------------------------
  router.get('/energy/sites', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const rows = await fetchSiteAggregatesFn({
        sourceIds,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const sites = rows.map((r) => {
        const daily = projectDaily(r.totalKwh, seconds);
        return {
          siteId: r.siteId,
          siteName: r.siteId,
          apWithDataCount: r.apWithDataCount,
          totalKwh: r.totalKwh,
          avgWattsPerAp: r.avgWattsPerAp,
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
        };
      });
      res.json({ sites, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- APs ----------------------------------------------------------------
  router.get('/energy/aps', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const rows = await fetchApAggregatesFn({
        sourceIds,
        siteId: req.query.siteId ?? null,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const aps = rows.map((r) => {
        const daily = projectDaily(r.totalKwh, seconds);
        return {
          ...r,
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
          dataQuality: r.sampleCount >= 5 ? 'ok' : 'sparse',
        };
      });
      res.json({ aps, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Recommendations ----------------------------------------------------
  router.get('/energy/recommendations', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const samples = await fetchPowerSamplesFn({
        sourceIds,
        siteId: req.query.siteId ?? null,
        start: win.start,
        end: win.end,
      });
      const recommendations = buildRecommendationsFn({
        samples,
        windowDays: windowDays(win.start, win.end),
        ratePerKwh: prefs.ratePerKwh,
        maxGapSeconds,
      });
      res.json({ recommendations, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Scenarios ----------------------------------------------------------
  router.post('/energy/scenarios', jsonBody, async (req, res) => {
    try {
      const { name, policy, siteId, windowStart, windowEnd } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return fail(res, new Error('name required'), 400);
      }
      if (policy === null || typeof policy !== 'object') {
        return fail(res, new Error('policy object required'), 400);
      }
      const sourceIds = sourceIdsOf(req);
      const win = resolveWindow({
        query: { start: windowStart, end: windowEnd },
      });
      if (!win) return fail(res, new Error('invalid range'), 400);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);

      const samples = await fetchPowerSamplesFn({
        sourceIds,
        siteId: siteId ?? null,
        start: win.start,
        end: win.end,
      });
      // policy.lightAware (if present) rides through to replayScenario and is
      // modeled per-sample by the resolver — no signature change needed.
      const replay = replayScenario({ samples, policy, maxGapSeconds });
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const projectBlock = (kwh) => {
        const daily = projectDaily(kwh, seconds);
        return {
          kwh,
          dailyProjected: daily,
          monthlyProjected: projectMonthly(daily),
          annualProjected: projectAnnual(daily),
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
        };
      };
      const savingsDaily = projectDaily(replay.savingsKwh, seconds);

      const { id: scenarioId } = await insertScenarioFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        name: name.trim(),
        policy,
      });
      await insertScenarioResultFn({
        scenarioId,
        siteId: siteId ?? null,
        windowStart: win.start,
        windowEnd: win.end,
        baselineKwh: replay.baselineKwh,
        simulatedKwh: replay.simulatedKwh,
        savingsKwh: replay.savingsKwh,
        savingsPercent: replay.savingsPercent ?? 0,
        apCount: replay.apWithDataCount,
        apWithDataCount: replay.apWithDataCount,
      });

      res.json({
        scenarioId,
        baseline: projectBlock(replay.baselineKwh),
        simulated: projectBlock(replay.simulatedKwh),
        savings: {
          kwh: replay.savingsKwh,
          percent: replay.savingsPercent,
          dailyKwh: savingsDaily,
          monthlyKwh: projectMonthly(savingsDaily),
          annualKwh: projectAnnual(savingsDaily),
          annualCost: estimateCost(projectAnnual(savingsDaily) ?? 0, prefs.ratePerKwh),
        },
        apCount: replay.apWithDataCount,
        apWithDataCount: replay.apWithDataCount,
        computedAt: nowFn().toISOString(),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Preferences --------------------------------------------------------
  router.get('/energy/preferences', async (req, res) => {
    try {
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      res.json(prefs);
    } catch (error) {
      fail(res, error);
    }
  });

  router.put('/energy/preferences', jsonBody, async (req, res) => {
    try {
      const { currencyCode, ratePerKwh } = req.body ?? {};
      if (!CURRENCY_SYMBOLS[currencyCode]) {
        return fail(res, new Error('unsupported currency'), 400);
      }
      if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
        return fail(res, new Error('rate must be positive'), 400);
      }
      const saved = await upsertRatePreferencesFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        currencyCode,
        currencySymbol: CURRENCY_SYMBOLS[currencyCode],
        ratePerKwh,
      });
      res.json(saved);
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
