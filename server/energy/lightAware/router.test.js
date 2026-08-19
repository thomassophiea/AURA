// server/energy/lightAware/router.test.js
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLightAwareRouter } from './router.js';

function appWith(overrides = {}) {
  const app = express();
  const scopeMiddleware = (req, _res, next) => {
    req.monitoringScope = { sources: [{ id: '00000000-0000-0000-0000-000000000001' }] };
    next();
  };
  app.use('/api', createLightAwareRouter({
    scopeMiddleware,
    deps: {
      listApLightStates: async () => [
        { serial: 'A', apName: 'AP-A', model: 'AP5020', siteId: 's1', watts: 20, openTransition: { to_state: 'dark', entered_at: '2026-08-19T00:00:00Z' } },
        { serial: 'B', apName: 'AP-B', model: 'AP3000', siteId: 's1', watts: 18, openTransition: null },
      ],
      getPolicy: async () => ({ enabled: true, policy: { dark: { actions: [{ kind: 'disableRadio', band: '6' }] } } }),
      upsertPolicy: async (p) => ({ ...p }),
      getObservedDistribution: async () => ({ brightSeconds: 60, dimSeconds: 0, darkSeconds: 40, unknownSeconds: 0, days: 1 }),
      getRatePreferences: async () => ({ currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 }),
      ...overrides,
    },
    nowFn: () => new Date('2026-08-19T02:00:00Z'),
  }));
  return app;
}

describe('GET /energy/light-aware/summary', () => {
  it('counts sensor-capable APs distinctly from reporting APs', async () => {
    const res = await request(appWith()).get('/api/energy/light-aware/summary');
    expect(res.status).toBe(200);
    expect(res.body.sensorCapableCount).toBe(1); // only AP5020
    expect(res.body.reportingCount).toBe(2);
    expect(res.body.stateBreakdown).toEqual(expect.objectContaining({ dark: 1, unknown: 1 }));
  });
});

describe('GET /energy/light-aware/aps', () => {
  it('returns modeled current/optimized watts per AP', async () => {
    const res = await request(appWith()).get('/api/energy/light-aware/aps');
    const a = res.body.aps.find((x) => x.serial === 'A');
    expect(a.sensorCapable).toBe(true);
    expect(a.optimizedWatts).toBeLessThan(a.currentWatts); // dark -> 6GHz disabled
  });
});

describe('PUT /energy/light-aware/policy', () => {
  it('rejects a policy that is not an object', async () => {
    const res = await request(appWith()).put('/api/energy/light-aware/policy').send({ enabled: true, policy: 5 });
    expect(res.status).toBe(400);
  });
});
