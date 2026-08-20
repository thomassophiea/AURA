/**
 * /api/energy/* — read/analysis API over stored AP power telemetry.
 *
 * Auth reuses requireControllerScope: the authorized source set is
 * req.monitoringScope.sources, derived from the caller's validated token. Query
 * params filter within that scope, they are never the trust boundary. This
 * router mutates no controller config — scenarios are simulation only.
 */

import { Router, json as expressJson } from 'express';
import crypto from 'node:crypto';

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
  fetchTelemetryCoverage,
  fetchLightAwareEvidence,
  insertEnvironmentalReport,
  getLatestEnvironmentalReport,
  getEnvironmentalReportById,
} from './energyRepository.js';
import { replayScenario } from './scenarioEngine.js';
import { buildRecommendations } from './recommendationEngine.js';
import { buildEnvironmentalReport } from './environmentalReport.js';
import { supportsLightSensor } from './apCapabilities.js';
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
    fetchTelemetryCoverageFn = fetchTelemetryCoverage,
    fetchLightAwareEvidenceFn = fetchLightAwareEvidence,
    insertEnvironmentalReportFn = insertEnvironmentalReport,
    getLatestEnvironmentalReportFn = getLatestEnvironmentalReport,
    getEnvironmentalReportByIdFn = getEnvironmentalReportById,
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

  function authorizedSiteIdsOf(req) {
    return Array.isArray(req.monitoringScope?.allowedSiteIds)
      ? req.monitoringScope.allowedSiteIds
      : null;
  }

  function siteAllowed(req, siteId) {
    const allowed = authorizedSiteIdsOf(req);
    return allowed === null || siteId == null || allowed.includes(siteId);
  }

  function reportAllowed(req, report) {
    const allowed = authorizedSiteIdsOf(req);
    const reportSiteIds = report?.scope?.siteIds;
    if (allowed === null || !Array.isArray(reportSiteIds)) return true;
    return reportSiteIds.every((siteId) => allowed.includes(siteId));
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
    return prefs ? { ...prefs, isDefault: false } : {
      currencyCode: 'USD',
      currencySymbol: '$',
      ratePerKwh: 0.14,
      emissionsFactorKgPerKwh: null,
      emissionsFactorSource: null,
      emissionsFactorRegion: null,
      emissionsFactorYear: null,
      isDefault: true,
    };
  }

  function temporalCoveragePercent(observedSeconds, apCount, windowSeconds) {
    if (!Number.isFinite(observedSeconds) || !Number.isFinite(apCount) || apCount <= 0 || windowSeconds <= 0) {
      return null;
    }
    return Math.min(100, (observedSeconds / (apCount * windowSeconds)) * 100);
  }

  function generatedBy(req) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? 'validated-session';
    return `controller-session:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
  }

  function summarizeLightAwareEvidence(rows, days) {
    if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(days) || days <= 0) {
      return null;
    }
    const sensorRows = rows.filter((row) => supportsLightSensor(row.model));
    const darkRows = sensorRows.filter((row) => row.darkSeconds > 0);
    const dimRows = sensorRows.filter((row) => row.dimSeconds > 0);
    if (darkRows.length === 0) return null;
    const darkSeconds = darkRows.reduce((sum, row) => sum + row.darkSeconds, 0);
    const dimSeconds = dimRows.reduce((sum, row) => sum + row.dimSeconds, 0);
    const baselineKwhDark = darkRows.reduce(
      (sum, row) => sum + (row.watts * row.darkSeconds) / 3_600_000,
      0
    );
    return {
      sensorCapableCount: sensorRows.length,
      darkApCount: darkRows.length,
      darkAvgHours: darkSeconds / darkRows.length / days / 3600,
      darkAvgHoursPerSensorAp: darkSeconds / sensorRows.length / days / 3600,
      dimAvgHours: dimRows.length > 0 ? dimSeconds / dimRows.length / days / 3600 : 0,
      baselineKwhDark,
    };
  }

  // ---- Overview -----------------------------------------------------------
  router.get('/energy/overview', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const siteId = req.query.siteId ?? null;
      if (!siteAllowed(req, siteId)) return fail(res, new Error('forbidden site'), 403);
      const authorizedSiteIds = authorizedSiteIdsOf(req);

      const agg = await fetchOverviewAggregateFn({
        sourceIds,
        siteId,
        start: win.start,
        end: win.end,
        maxGapSeconds,
        authorizedSiteIds,
      });
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;
      const dailyKwh = Number.isFinite(agg.dailyKwhProjected)
        ? agg.dailyKwhProjected
        : projectDaily(agg.periodKwh, seconds);
      const days = windowDays(win.start, win.end);
      const temporalCoverage = temporalCoveragePercent(
        agg.observedSeconds,
        agg.apWithDataCount,
        seconds
      );
      const earliest = await getEarliestPowerSampleAtFn({ sourceIds, siteId, authorizedSiteIds });

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
          temporalCoveragePercent: temporalCoverage,
          rateIsDefault: prefs.isDefault,
          // Only a caveat about the selected window, not a "no data" warning
          // (the empty state covers that). Firing it with zero data made it
          // read as missing data on the default short-range view.
          limitationsNotes: [
            ...(agg.apWithDataCount > 0 && days !== null && days < 3
              ? [
                  `Annualized projections are extrapolated from ${
                    days < 1 ? 'under a day' : `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`
                  } of data — widen the time range for higher confidence.`,
                ]
              : []),
            ...(temporalCoverage !== null && temporalCoverage < 80
              ? [`Temporal power coverage is ${temporalCoverage.toFixed(0)}% — projections annualize only usable observed intervals.`]
              : []),
            ...(prefs.isDefault
              ? [`Annual cost uses the default ${prefs.currencySymbol}${prefs.ratePerKwh}/kWh rate — configure Electricity rate for accurate financial estimates.`]
              : []),
          ],
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
      const authorizedSiteIds = authorizedSiteIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const rows = await fetchSiteAggregatesFn({
        sourceIds,
        start: win.start,
        end: win.end,
        maxGapSeconds,
        authorizedSiteIds,
      });
      const sites = rows.map((r) => {
        const daily = Number.isFinite(r.dailyKwhProjected) ? r.dailyKwhProjected : null;
        return {
          siteId: r.siteId,
          siteName: r.siteId,
          apWithDataCount: r.apWithDataCount,
          totalKwh: r.totalKwh,
          avgWattsPerAp: r.avgWattsPerAp,
          estimatedAnnualCost: estimateCost(projectAnnual(daily), prefs.ratePerKwh),
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
      const siteId = req.query.siteId ?? null;
      if (!siteAllowed(req, siteId)) return fail(res, new Error('forbidden site'), 403);
      const authorizedSiteIds = authorizedSiteIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const rows = await fetchApAggregatesFn({
        sourceIds,
        siteId,
        start: win.start,
        end: win.end,
        maxGapSeconds,
        authorizedSiteIds,
      });
      const aps = rows.map((r) => {
        const daily = projectDaily(r.totalKwh, r.observedSeconds);
        const coverage = temporalCoveragePercent(r.observedSeconds, 1, seconds);
        return {
          ...r,
          estimatedAnnualCost: estimateCost(projectAnnual(daily), prefs.ratePerKwh),
          dataQuality: coverage !== null && coverage >= 80 ? 'ok' : 'sparse',
          temporalCoveragePercent: coverage,
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
      const siteId = req.query.siteId ?? null;
      if (!siteAllowed(req, siteId)) return fail(res, new Error('forbidden site'), 403);
      const authorizedSiteIds = authorizedSiteIdsOf(req);
      const days = windowDays(win.start, win.end);
      const [samples, lightRows] = await Promise.all([
        fetchPowerSamplesFn({ sourceIds, siteId, start: win.start, end: win.end, authorizedSiteIds }),
        fetchLightAwareEvidenceFn({ sourceIds, siteId, start: win.start, end: win.end, authorizedSiteIds }),
      ]);
      const recommendations = buildRecommendationsFn({
        samples,
        windowDays: days,
        ratePerKwh: prefs.ratePerKwh,
        maxGapSeconds,
        lightObserved: summarizeLightAwareEvidence(lightRows, days),
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
      if (!siteAllowed(req, siteId)) return fail(res, new Error('forbidden site'), 403);
      const authorizedSiteIds = authorizedSiteIdsOf(req);
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
        authorizedSiteIds,
      });
      // policy.lightAware (if present) rides through to replayScenario and is
      // modeled per-sample by the resolver — no signature change needed.
      const replay = replayScenario({ samples, policy, maxGapSeconds });
      const projectBlock = (kwh, daily) => {
        const annual = projectAnnual(daily);
        return {
          kwh,
          dailyProjected: daily,
          monthlyProjected: projectMonthly(daily),
          annualProjected: annual,
          estimatedAnnualCost: estimateCost(annual, prefs.ratePerKwh),
        };
      };
      const savingsDaily = replay.savingsDailyKwh;
      const savingsAnnual = projectAnnual(savingsDaily);

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
        currency: prefs.currencyCode,
        currencySymbol: prefs.currencySymbol,
        baseline: projectBlock(replay.baselineKwh, replay.baselineDailyKwh),
        simulated: projectBlock(replay.simulatedKwh, replay.simulatedDailyKwh),
        savings: {
          kwh: replay.savingsKwh,
          percent: replay.savingsPercent,
          dailyKwh: savingsDaily,
          monthlyKwh: projectMonthly(savingsDaily),
          annualKwh: savingsAnnual,
          annualCost: estimateCost(savingsAnnual, prefs.ratePerKwh),
        },
        apCount: replay.apWithDataCount,
        apWithDataCount: replay.apWithDataCount,
        computedAt: nowFn().toISOString(),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Environmental reports ----------------------------------------------
  router.post('/energy/environmental-reports', jsonBody, async (req, res) => {
    try {
      const {
        siteId = null,
        siteName = null,
        windowStart,
        windowEnd,
        includeFinancials = true,
        includeCarbon = false,
        recommendationTypes,
      } = req.body ?? {};
      const win = resolveWindow({ query: { start: windowStart, end: windowEnd } });
      if (!win) return fail(res, new Error('invalid range'), 400);
      const days = windowDays(win.start, win.end);
      if (days > 366) return fail(res, new Error('reporting range cannot exceed 366 days'), 400);
      if (siteId !== null && (typeof siteId !== 'string' || siteId.length > 256)) {
        return fail(res, new Error('invalid site'), 400);
      }
      if (
        recommendationTypes !== undefined &&
        (!Array.isArray(recommendationTypes) ||
          recommendationTypes.length > 20 ||
          recommendationTypes.some((type) => typeof type !== 'string' || type.length > 100))
      ) {
        return fail(res, new Error('invalid recommendation selection'), 400);
      }
      if (typeof includeFinancials !== 'boolean' || typeof includeCarbon !== 'boolean') {
        return fail(res, new Error('invalid report options'), 400);
      }
      const sourceIds = sourceIdsOf(req);
      if (!siteAllowed(req, siteId)) return fail(res, new Error('forbidden site'), 403);
      const authorizedSiteIds = authorizedSiteIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const samplesPromise = fetchPowerSamplesFn({
        sourceIds,
        siteId,
        start: win.start,
        end: win.end,
        authorizedSiteIds,
      });
      const [aggregate, coverage, samples, lightRows] = await Promise.all([
        fetchOverviewAggregateFn({
          sourceIds,
          siteId,
          start: win.start,
          end: win.end,
          maxGapSeconds,
          authorizedSiteIds,
        }),
        fetchTelemetryCoverageFn({
          sourceIds,
          siteId,
          start: win.start,
          end: win.end,
          authorizedSiteIds,
        }),
        samplesPromise,
        fetchLightAwareEvidenceFn({
          sourceIds,
          siteId,
          start: win.start,
          end: win.end,
          authorizedSiteIds,
        }),
      ]);
      if (aggregate.apWithDataCount === 0) {
        return fail(res, new Error('no AP power telemetry in the selected scope and period'), 422);
      }
      const recommendations = buildRecommendationsFn({
        samples,
        windowDays: days,
        ratePerKwh: prefs.ratePerKwh,
        maxGapSeconds,
        lightObserved: summarizeLightAwareEvidence(lightRows, days),
      });
      const actor = generatedBy(req);
      const report = buildEnvironmentalReport({
        aggregate,
        coverage,
        recommendations,
        preferences: prefs,
        windowStart: win.start,
        windowEnd: win.end,
        siteId,
        siteName: typeof siteName === 'string' ? siteName.slice(0, 256) : null,
        authorizedSiteIds,
        includeFinancials: includeFinancials !== false,
        includeCarbon: includeCarbon === true,
        recommendationTypes,
        generatedAt: nowFn().toISOString(),
        generatedBy: actor,
        auraVersion:
          (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.AURA_GIT_COMMIT_SHA)?.slice(0, 12) ??
          process.env.npm_package_version,
      });
      const saved = await insertEnvironmentalReportFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        generatedBy: actor,
        report,
      });
      res.status(201).json(saved?.snapshot ?? saved?.report ?? saved);
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/energy/environmental-reports/latest', async (req, res) => {
    try {
      const report = await getLatestEnvironmentalReportFn({
        sourceIds: sourceIdsOf(req),
        siteId: req.query.siteId ?? null,
      });
      if (!report) return res.status(404).json({ error: 'No environmental reports found' });
      const snapshot = report.snapshot ?? report;
      if (!reportAllowed(req, snapshot)) return fail(res, new Error('forbidden report'), 403);
      res.json(snapshot);
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/energy/environmental-reports/:reportId', async (req, res) => {
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.reportId)) {
        return fail(res, new Error('invalid report ID'), 400);
      }
      const report = await getEnvironmentalReportByIdFn({
        sourceIds: sourceIdsOf(req),
        reportId: req.params.reportId,
      });
      if (!report) return res.status(404).json({ error: 'Environmental report not found' });
      const snapshot = report.snapshot ?? report;
      if (!reportAllowed(req, snapshot)) return fail(res, new Error('forbidden report'), 403);
      res.json(snapshot);
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
      const {
        currencyCode,
        ratePerKwh,
        emissionsFactorKgPerKwh = null,
        emissionsFactorSource = null,
        emissionsFactorRegion = null,
        emissionsFactorYear = null,
      } = req.body ?? {};
      if (!CURRENCY_SYMBOLS[currencyCode]) {
        return fail(res, new Error('unsupported currency'), 400);
      }
      if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
        return fail(res, new Error('rate must be positive'), 400);
      }
      if (
        emissionsFactorKgPerKwh !== null &&
        (!Number.isFinite(emissionsFactorKgPerKwh) || emissionsFactorKgPerKwh <= 0)
      ) {
        return fail(res, new Error('emissions factor must be positive'), 400);
      }
      if (emissionsFactorKgPerKwh !== null && !String(emissionsFactorSource ?? '').trim()) {
        return fail(res, new Error('emissions factor source required'), 400);
      }
      if (
        emissionsFactorYear !== null &&
        (!Number.isInteger(emissionsFactorYear) ||
          emissionsFactorYear < 1900 ||
          emissionsFactorYear > 2200)
      ) {
        return fail(res, new Error('invalid emissions factor year'), 400);
      }
      const saved = await upsertRatePreferencesFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        currencyCode,
        currencySymbol: CURRENCY_SYMBOLS[currencyCode],
        ratePerKwh,
        emissionsFactorKgPerKwh,
        emissionsFactorSource: emissionsFactorSource ? String(emissionsFactorSource).trim().slice(0, 512) : null,
        emissionsFactorRegion: emissionsFactorRegion ? String(emissionsFactorRegion).trim().slice(0, 256) : null,
        emissionsFactorYear,
      });
      res.json(saved);
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
