// server/energy/energyRouter.test.js
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createEnergyRouter } from './energyRouter.js';

/** Minimal fake scope middleware: authorizes one source. */
function fakeScope(req, _res, next) {
  req.monitoringScope = {
    sources: [{ id: 'src-1', base_url: 'https://c.local' }],
    allowedSiteIds: ['site-A', 'site-B'],
  };
  next();
}

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    '/api',
    createEnergyRouter({
      config: { retentionDays: 7, authGraceSeconds: 900, maxGapSeconds: 7200 },
      scopeMiddleware: fakeScope,
      fetchOverviewAggregateFn: async () => ({
        apWithDataCount: 2,
        periodKwh: 10,
        avgWatts: 40,
        currentWatts: 80,
        peakWatts: 100,
      }),
      getEarliestPowerSampleAtFn: async () => '2026-08-10T00:00:00Z',
      getRatePreferencesFn: async () => ({ currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 }),
      upsertRatePreferencesFn: async (p) => ({
        currencyCode: p.currencyCode,
        currencySymbol: p.currencySymbol,
        ratePerKwh: p.ratePerKwh,
      }),
      fetchPowerSamplesFn: async () => [],
      fetchTelemetryCoverageFn: async () => ({
        totalApCount: 4,
        reportingApCount: 2,
        samplingIntervalSeconds: 300,
      }),
      fetchLightAwareEvidenceFn: async () => [],
      insertScenarioFn: async () => ({ id: 'sc-1' }),
      insertScenarioResultFn: async () => {},
      buildRecommendationsFn: () => [],
      insertEnvironmentalReportFn: async (report) => report,
      getLatestEnvironmentalReportFn: async () => null,
      getEnvironmentalReportByIdFn: async () => null,
      nowFn: () => new Date('2026-08-17T00:00:00Z'),
      ...overrides,
    })
  );
  return app;
}

async function call(app, method, path, body) {
  const { default: request } = await import('supertest');
  const req = request(app)[method](path);
  return body ? req.send(body) : req;
}

describe('GET /api/energy/overview', () => {
  it('returns computed projections and cost', async () => {
    const res = await call(buildApp(), 'get', '/api/energy/overview?start=2026-08-10T00:00:00Z&end=2026-08-17T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.apWithDataCount).toBe(2);
    expect(res.body.periodKwh).toBe(10);
    // 10 kWh over 7 days -> ~1.4286 kWh/day
    expect(res.body.dailyKwhProjected).toBeCloseTo(10 / 7, 4);
    expect(res.body.estimatedAnnualCost).toBeCloseTo((10 / 7) * 365 * 0.14, 4);
    expect(res.body.currency).toBe('USD');
  });

  it('rejects an invalid range with 400', async () => {
    const res = await call(buildApp(), 'get', '/api/energy/overview?start=bad&end=also-bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid range');
  });

  it('uses interval-derived daily energy and exposes temporal coverage', async () => {
    const res = await call(
      buildApp({
        fetchOverviewAggregateFn: async () => ({
          apWithDataCount: 2,
          periodKwh: 10,
          avgWatts: 40,
          currentWatts: 80,
          peakWatts: 100,
          dailyKwhProjected: 2,
          observedSeconds: 2 * 3.5 * 86_400,
        }),
      }),
      'get',
      '/api/energy/overview?start=2026-08-10T00:00:00Z&end=2026-08-17T00:00:00Z'
    );

    expect(res.status).toBe(200);
    expect(res.body.dailyKwhProjected).toBe(2);
    expect(res.body.annualKwhProjected).toBe(730);
    expect(res.body.meta.temporalCoveragePercent).toBe(50);
    expect(res.body.meta.limitationsNotes.join(' ')).toMatch(/Temporal power coverage is 50%/i);
  });
});

describe('PUT /api/energy/preferences', () => {
  it('validates currency and rate', async () => {
    const res = await call(buildApp(), 'put', '/api/energy/preferences', {
      currencyCode: 'ZZZ',
      ratePerKwh: 0.2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported currency');
  });

  it('upserts valid preferences', async () => {
    const res = await call(buildApp(), 'put', '/api/energy/preferences', {
      currencyCode: 'EUR',
      ratePerKwh: 0.31,
    });
    expect(res.status).toBe(200);
    expect(res.body.currencyCode).toBe('EUR');
    expect(res.body.currencySymbol).toBe('€');
  });
});

describe('POST /api/energy/scenarios', () => {
  it('replays a policy and returns savings', async () => {
    const app = buildApp({
      fetchPowerSamplesFn: async () => [
        { deviceExternalId: 'AP-1', watts: 2, observedAt: '2026-08-10T02:00:00Z', band: null, channelUtilization: null },
        { deviceExternalId: 'AP-1', watts: 2, observedAt: '2026-08-10T03:00:00Z', band: null, channelUtilization: null },
      ],
    });
    const res = await call(app, 'post', '/api/energy/scenarios', {
      name: 'overnight 6ghz',
      policy: { disable6GhzHours: [0, 1, 2, 3, 4, 5] },
    });
    expect(res.status).toBe(200);
    expect(res.body.scenarioId).toBe('sc-1');
    expect(res.body.savings.percent).toBeCloseTo(25, 4);
    expect(res.body.baseline.dailyProjected).toBeCloseTo(0.048, 6);
    expect(res.body.savings.dailyKwh).toBeCloseTo(0.012, 6);
  });

  it('preserves unknown projections as null instead of reporting zero cost', async () => {
    const res = await call(buildApp(), 'post', '/api/energy/scenarios', {
      name: 'no samples',
      policy: { disable6GhzHours: [0, 1, 2] },
    });

    expect(res.status).toBe(200);
    expect(res.body.baseline.dailyProjected).toBe(0);
    expect(res.body.baseline.estimatedAnnualCost).toBe(0);
    expect(res.body.savings.percent).toBeNull();
    expect(res.body.savings.annualCost).toBe(0);
  });
});

describe('environmental reports', () => {
  it('generates and persists a normalized immutable report snapshot', async () => {
    const insertEnvironmentalReportFn = vi.fn(async (report) => report);
    const app = buildApp({
      insertEnvironmentalReportFn,
      buildRecommendationsFn: () => [
        {
          id: 'rec-1',
          type: 'low_utilization_6ghz',
          scope: 'fleet',
          title: 'Disable idle 6 GHz radios',
          explanation: 'Measured utilization supports a modeled optimization.',
          affectedApCount: 2,
          baselineKwh: 2,
          projectedKwh: 1.5,
          savingsKwh: 0.5,
          annualSavingsKwh: 26,
          savingsPercent: 25,
          estimatedAnnualSaving: 3.64,
          riskLevel: 'low',
          confidenceLevel: 'high',
          supportingData: { observationDays: 7, lowUtilApCount: 2 },
        },
      ],
    });

    const res = await call(app, 'post', '/api/energy/environmental-reports', {
      siteId: 'site-A',
      windowStart: '2026-08-10T00:00:00Z',
      windowEnd: '2026-08-17T00:00:00Z',
      includeFinancials: true,
      recommendationTypes: ['low_utilization_6ghz'],
    });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Extreme Platform ONE Environmental Performance Report');
    expect(res.body.evidenceStatus).toBe('partially-measured');
    expect(res.body.baseline.measuredKwh).toBe(10);
    expect(res.body.baseline.coveragePercent).toBe(50);
    expect(res.body.improvement.annualSavingsKwh).toBe(26);
    expect(res.body.improvement.annualCostSavings).toBeCloseTo(3.64, 4);
    expect(res.body.carbon).toBeNull();
    expect(res.body.disclaimer).toMatch(/does not constitute ISO 14001 certification/i);
    expect(insertEnvironmentalReportFn).toHaveBeenCalledOnce();
  });

  it('calculates carbon only from a configured, documented factor', async () => {
    const app = buildApp({
      getRatePreferencesFn: async () => ({
        currencyCode: 'USD',
        currencySymbol: '$',
        ratePerKwh: 0.14,
        emissionsFactorKgPerKwh: 0.4,
        emissionsFactorSource: 'EPA eGRID',
        emissionsFactorRegion: 'US average',
        emissionsFactorYear: 2025,
      }),
      buildRecommendationsFn: () => [
        {
          type: 'low_utilization_6ghz',
          title: 'Disable idle 6 GHz radios',
          explanation: 'Modeled.',
          scope: 'fleet',
          affectedApCount: 2,
          baselineKwh: 2,
          projectedKwh: 1.5,
          savingsKwh: 0.5,
          annualSavingsKwh: 26,
          savingsPercent: 25,
          estimatedAnnualSaving: 3.64,
          confidenceLevel: 'high',
          supportingData: {},
        },
      ],
    });

    const res = await call(app, 'post', '/api/energy/environmental-reports', {
      windowStart: '2026-08-10T00:00:00Z',
      windowEnd: '2026-08-17T00:00:00Z',
      includeCarbon: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.carbon.avoidedKgCo2e).toBeCloseTo(10.4, 4);
    expect(res.body.carbon.source).toBe('EPA eGRID');
    expect(res.body.carbon.factorUnit).toBe('kg CO2e/kWh');
  });

  it('uses the same interval-derived annual baseline as the Energy overview', async () => {
    const res = await call(
      buildApp({
        fetchOverviewAggregateFn: async () => ({
          apWithDataCount: 2,
          periodKwh: 10,
          avgWatts: 40,
          currentWatts: 80,
          peakWatts: 100,
          dailyKwhProjected: 2,
          observedSeconds: 2 * 3.5 * 86_400,
        }),
      }),
      'post',
      '/api/energy/environmental-reports',
      {
        windowStart: '2026-08-10T00:00:00Z',
        windowEnd: '2026-08-17T00:00:00Z',
        includeFinancials: true,
        includeCarbon: false,
        recommendationTypes: [],
      }
    );

    expect(res.status).toBe(201);
    expect(res.body.baseline.annualKwhProjected).toBe(730);
    expect(res.body.baseline.temporalCoveragePercent).toBe(50);
    expect(res.body.provenance.temporalCoveragePercent).toBe(50);
  });

  it('scopes latest report retrieval to the authenticated source', async () => {
    const getLatestEnvironmentalReportFn = vi.fn(async () => ({
      id: 'report-1',
      generatedAt: '2026-08-17T00:00:00Z',
      snapshot: { reportId: 'report-1' },
    }));
    const res = await call(
      buildApp({ getLatestEnvironmentalReportFn }),
      'get',
      '/api/energy/environmental-reports/latest?siteId=site-A'
    );

    expect(res.status).toBe(200);
    expect(res.body.reportId).toBe('report-1');
    expect(getLatestEnvironmentalReportFn).toHaveBeenCalledWith({
      sourceIds: ['src-1'],
      siteId: 'site-A',
    });
  });

  it('rejects malformed report IDs before querying persistence', async () => {
    const getEnvironmentalReportByIdFn = vi.fn();
    const res = await call(
      buildApp({ getEnvironmentalReportByIdFn }),
      'get',
      '/api/energy/environmental-reports/not-a-uuid'
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid report ID');
    expect(getEnvironmentalReportByIdFn).not.toHaveBeenCalled();
  });

  it('passes measured Light-Aware dwell evidence into report recommendations', async () => {
    const buildRecommendationsFn = vi.fn(() => []);
    const res = await call(
      buildApp({
        buildRecommendationsFn,
        fetchLightAwareEvidenceFn: async () => [
          {
            apSerial: 'AP-1',
            model: 'AP5020',
            watts: 20,
            darkSeconds: 7 * 6 * 3600,
            dimSeconds: 7 * 2 * 3600,
          },
        ],
      }),
      'post',
      '/api/energy/environmental-reports',
      {
        windowStart: '2026-08-10T00:00:00Z',
        windowEnd: '2026-08-17T00:00:00Z',
        includeFinancials: true,
        includeCarbon: false,
        recommendationTypes: [],
      }
    );

    expect(res.status).toBe(201);
    expect(buildRecommendationsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        lightObserved: expect.objectContaining({
          sensorCapableCount: 1,
          darkApCount: 1,
          darkAvgHours: 6,
          dimAvgHours: 2,
        }),
      })
    );
  });

  it('reports Light-Aware dark hours across all sensor-capable APs without upward bias', async () => {
    const buildRecommendationsFn = vi.fn(() => []);
    const res = await call(
      buildApp({
        buildRecommendationsFn,
        fetchLightAwareEvidenceFn: async () => [
          { apSerial: 'AP-1', model: 'AP5020', watts: 20, darkSeconds: 7 * 8 * 3600, dimSeconds: 0 },
          { apSerial: 'AP-2', model: 'AP5020', watts: 20, darkSeconds: 0, dimSeconds: 0 },
        ],
      }),
      'post',
      '/api/energy/environmental-reports',
      {
        windowStart: '2026-08-10T00:00:00Z',
        windowEnd: '2026-08-17T00:00:00Z',
        includeFinancials: true,
        includeCarbon: false,
        recommendationTypes: [],
      }
    );

    expect(res.status).toBe(201);
    expect(buildRecommendationsFn).toHaveBeenCalledWith(
      expect.objectContaining({
        lightObserved: expect.objectContaining({
          sensorCapableCount: 2,
          darkApCount: 1,
          darkAvgHours: 8,
          darkAvgHoursPerSensorAp: 4,
        }),
      })
    );
  });

  it('rejects report generation for a site outside the controller-authorized list', async () => {
    const insertEnvironmentalReportFn = vi.fn();
    const res = await call(
      buildApp({ insertEnvironmentalReportFn }),
      'post',
      '/api/energy/environmental-reports',
      {
        siteId: 'site-Z',
        windowStart: '2026-08-10T00:00:00Z',
        windowEnd: '2026-08-17T00:00:00Z',
        includeFinancials: true,
        includeCarbon: false,
        recommendationTypes: [],
      }
    );
    expect(res.status).toBe(403);
    expect(insertEnvironmentalReportFn).not.toHaveBeenCalled();
  });

  it('rejects a historical fleet report containing an unauthorized site', async () => {
    const res = await call(
      buildApp({
        getEnvironmentalReportByIdFn: async () => ({
          reportId: '11111111-1111-4111-8111-111111111111',
          scope: { siteIds: ['site-A', 'site-Z'] },
        }),
      }),
      'get',
      '/api/energy/environmental-reports/11111111-1111-4111-8111-111111111111'
    );
    expect(res.status).toBe(403);
  });

  it('keeps a historical snapshot unchanged after current preferences change', async () => {
    let currentRate = 0.14;
    let storedReport = null;
    const app = buildApp({
      getRatePreferencesFn: async () => ({
        currencyCode: 'USD',
        currencySymbol: '$',
        ratePerKwh: currentRate,
      }),
      upsertRatePreferencesFn: async ({ currencyCode, currencySymbol, ratePerKwh }) => {
        currentRate = ratePerKwh;
        return { currencyCode, currencySymbol, ratePerKwh };
      },
      insertEnvironmentalReportFn: async ({ report }) => {
        storedReport = structuredClone(report);
        return storedReport;
      },
      getEnvironmentalReportByIdFn: async () => storedReport,
    });

    const generated = await call(app, 'post', '/api/energy/environmental-reports', {
      windowStart: '2026-08-10T00:00:00Z',
      windowEnd: '2026-08-17T00:00:00Z',
      includeFinancials: true,
      includeCarbon: false,
      recommendationTypes: [],
    });
    expect(generated.status).toBe(201);
    const originalCost = generated.body.baseline.annualCostProjected;

    await call(app, 'put', '/api/energy/preferences', {
      currencyCode: 'USD',
      ratePerKwh: 0.42,
    });
    const historical = await call(
      app,
      'get',
      `/api/energy/environmental-reports/${generated.body.reportId}`
    );

    expect(historical.status).toBe(200);
    expect(historical.body.baseline.annualCostProjected).toBe(originalCost);
    expect(historical.body.financials.electricityRate).toBe(0.14);
  });

  it('caps modeled annual savings at the annualized baseline', async () => {
    const res = await call(
      buildApp({
        buildRecommendationsFn: () => [{
          id: 'oversized',
          type: 'low_utilization_6ghz',
          title: 'Oversized model input',
          explanation: 'Regression fixture',
          affectedApCount: 2,
          baselineKwh: 10,
          projectedKwh: 0,
          savingsKwh: 10,
          annualSavingsKwh: 10_000,
          savingsPercent: 100,
          confidenceLevel: 'low',
          supportingData: {},
        }],
      }),
      'post',
      '/api/energy/environmental-reports',
      {
        windowStart: '2026-08-10T00:00:00Z',
        windowEnd: '2026-08-17T00:00:00Z',
        includeFinancials: true,
        includeCarbon: false,
        recommendationTypes: [],
      }
    );

    expect(res.status).toBe(201);
    expect(res.body.improvement.annualSavingsKwh).toBe(res.body.improvement.baselineAnnualKwh);
    expect(res.body.improvement.optimizedAnnualKwh).toBe(0);
    expect(res.body.improvement.annualSavingsPercent).toBe(100);
  });
});
