// server/energy/energyRouter.test.js
import { describe, it, expect } from 'vitest';
import express from 'express';
import { createEnergyRouter } from './energyRouter.js';

/** Minimal fake scope middleware: authorizes one source. */
function fakeScope(req, _res, next) {
  req.monitoringScope = { sources: [{ id: 'src-1', base_url: 'https://c.local' }] };
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
      insertScenarioFn: async () => ({ id: 'sc-1' }),
      insertScenarioResultFn: async () => {},
      buildRecommendationsFn: () => [],
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
  });
});

describe('PUT /api/energy/preferences', () => {
  it('validates currency and rate', async () => {
    const res = await call(buildApp(), 'put', '/api/energy/preferences', {
      currencyCode: 'ZZZ',
      ratePerKwh: 0.2,
    });
    expect(res.status).toBe(400);
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
  });
});
