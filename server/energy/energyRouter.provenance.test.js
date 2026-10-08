// Provenance, naming and rule-availability on the Energy read API.
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createEnergyRouter } from './energyRouter.js';
import { createApNameResolver } from './apNameResolver.js';
import { describePowerSource } from './energyRepository.js';

function fakeScope(req, _res, next) {
  req.monitoringScope = { sources: [{ id: 'src-1' }], allowedSiteIds: null };
  next();
}

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    '/api',
    createEnergyRouter({
      config: { retentionDays: 7, authGraceSeconds: 900, maxGapSeconds: 7200 },
      scopeMiddleware: fakeScope,
      getEarliestPowerSampleAtFn: async () => null,
      getRatePreferencesFn: async () => ({ currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 }),
      fetchPowerSamplesFn: async () => [],
      fetchLightAwareEvidenceFn: async () => [],
      resolveApNamesFn: async ({ serials }) => new Map(serials.map((s) => [s, s])),
      nowFn: () => new Date('2026-08-17T00:00:00Z'),
      ...overrides,
    })
  );
  return app;
}

const Q = '?start=2026-08-16T00:00:00Z&end=2026-08-17T00:00:00Z';

describe('describePowerSource', () => {
  it('prefers measured, falls back to ap_report, and is null with nothing', () => {
    expect(describePowerSource({ measuredSampleCount: 3, apReportSampleCount: 2 })).toMatchObject({
      source: 'measured_ap_state',
      mixed: true,
    });
    expect(describePowerSource({ measuredSampleCount: 0, apReportSampleCount: 2 })).toMatchObject({
      source: 'ap_report',
      mixed: false,
    });
    expect(describePowerSource({}).source).toBeNull();
  });
});

describe('energy provenance on responses', () => {
  it('overview exposes source and warns when it rests on the report fallback', async () => {
    const app = buildApp({
      fetchOverviewAggregateFn: async () => ({
        apWithDataCount: 1,
        periodKwh: 1,
        avgWatts: 4,
        currentWatts: 4,
        peakWatts: 4,
        observedSeconds: 86400,
        source: 'ap_report',
        mixed: false,
        measuredApCount: 0,
        apReportOnlyApCount: 1,
      }),
    });
    const res = await request(app).get(`/api/energy/overview${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ap_report');
    expect(res.body.sourceDetail.apReportOnlyApCount).toBe(1);
    expect(res.body.meta.limitationsNotes.join(' ')).toMatch(/AP report series/);
  });

  it('overview is labelled measured with no fallback note when fully measured', async () => {
    const app = buildApp({
      fetchOverviewAggregateFn: async () => ({
        apWithDataCount: 2,
        periodKwh: 1,
        avgWatts: 10,
        currentWatts: 20,
        peakWatts: 20,
        observedSeconds: 172800,
        source: 'measured_ap_state',
        mixed: false,
        measuredApCount: 2,
        apReportOnlyApCount: 0,
      }),
    });
    const res = await request(app).get(`/api/energy/overview${Q}`);
    expect(res.body.source).toBe('measured_ap_state');
    expect(res.body.meta.limitationsNotes.join(' ')).not.toMatch(/AP report series/);
  });

  it('sites carry the measured site name and per-row source', async () => {
    const app = buildApp({
      fetchSiteAggregatesFn: async () => [
        { siteId: 's1', siteName: 'North Wing', apWithDataCount: 2, totalKwh: 1, avgWattsPerAp: 5, dailyKwhProjected: 1, source: 'measured_ap_state' },
        { siteId: 's2', siteName: null, apWithDataCount: 1, totalKwh: 1, avgWattsPerAp: 5, dailyKwhProjected: 1, source: 'ap_report' },
      ],
    });
    const res = await request(app).get(`/api/energy/sites${Q}`);
    expect(res.body.sites[0]).toMatchObject({ siteName: 'North Wing', source: 'measured_ap_state' });
    expect(res.body.sites[1]).toMatchObject({ siteName: 's2', source: 'ap_report' });
    expect(res.body.meta.source).toBe('measured_ap_state');
  });

  it('AP rows show a resolved AP name, not just the serial', async () => {
    const resolve = vi.fn(async () => new Map([['SN1', 'EAL-North-01']]));
    const app = buildApp({
      resolveApNamesFn: resolve,
      fetchApAggregatesFn: async () => [
        { serial: 'SN1', apName: 'SN1', siteId: 's1', siteName: 'North Wing', avgWatts: 10, peakWatts: 12, totalKwh: 0.24, sampleCount: 1440, observedSeconds: 86400, source: 'measured_ap_state' },
      ],
    });
    const res = await request(app).get(`/api/energy/aps${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.aps[0]).toMatchObject({ apName: 'EAL-North-01', siteName: 'North Wing', source: 'measured_ap_state' });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ serials: ['SN1'] }));
  });

  it('AP rows fall back to the serial when name resolution fails', async () => {
    const app = buildApp({
      resolveApNamesFn: async () => {
        throw new Error('gateway down');
      },
      fetchApAggregatesFn: async () => [
        { serial: 'SN9', apName: 'SN9', siteId: 's1', avgWatts: 1, peakWatts: 1, totalKwh: 0.1, sampleCount: 2, observedSeconds: 60, source: 'ap_report' },
      ],
    });
    const res = await request(app).get(`/api/energy/aps${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.aps[0].apName).toBe('SN9');
  });

  it('recommendations say which rules could not be evaluated instead of inventing data', async () => {
    const app = buildApp({
      fetchPowerSamplesFn: async () => [
        { deviceExternalId: 'SN1', watts: 10, observedAt: '2026-08-16T00:00:00Z', band: null, channelUtilization: null, source: 'measured_ap_state' },
        { deviceExternalId: 'SN1', watts: 10, observedAt: '2026-08-16T00:01:00Z', band: null, channelUtilization: null, source: 'measured_ap_state' },
      ],
      fetchLightAwareEvidenceFn: async () => [
        { apSerial: 'SN1', watts: 10, model: 'AP3000', darkSeconds: 0, dimSeconds: 0 },
      ],
    });
    const res = await request(app).get(`/api/energy/recommendations${Q}`);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toEqual([]);
    expect(res.body.meta.source).toBe('measured_ap_state');
    const types = res.body.meta.unevaluatedRules.map((r) => r.type);
    expect(types).toEqual(['low_utilization_6ghz', 'light_aware_opportunity']);
  });

  it('the light-aware rule fires on measured-series models', async () => {
    const app = buildApp({
      fetchLightAwareEvidenceFn: async () => [
        { apSerial: 'SN1', watts: 12, model: 'AP5020', darkSeconds: 6 * 3600, dimSeconds: 0 },
      ],
    });
    const res = await request(app).get(`/api/energy/recommendations${Q}`);
    expect(res.body.recommendations.map((r) => r.type)).toContain('light_aware_opportunity');
  });
});

describe('createApNameResolver', () => {
  const inventory = (aps) => ({ get: vi.fn(async () => ({ ok: true, data: aps })) });

  it('resolves names from the live inventory and caches them per source', async () => {
    const session = inventory([{ serialNumber: 'SN1', apName: 'EAL-North-01' }]);
    const sessionForFn = vi.fn(async () => session);
    const resolve = createApNameResolver({ sessionForFn, listEnrolledFn: async () => new Map() });
    const first = await resolve({ sources: [{ id: 's' }], serials: ['SN1', 'SN2'] });
    expect(first.get('SN1')).toBe('EAL-North-01');
    expect(first.get('SN2')).toBe('SN2');
    await resolve({ sources: [{ id: 's' }], serials: ['SN1'] });
    expect(session.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to enrollment names when the Gateway is unreachable', async () => {
    const resolve = createApNameResolver({
      sessionForFn: async () => ({ get: async () => ({ ok: false }) }),
      listEnrolledFn: async () => new Map([['SN1', 'Enrolled-01']]),
    });
    const names = await resolve({ sources: [{ id: 's' }], serials: ['SN1'] });
    expect(names.get('SN1')).toBe('Enrolled-01');
  });

  it('does not wait past its timeout on a slow Gateway', async () => {
    const resolve = createApNameResolver({
      sessionForFn: async () => ({ get: () => new Promise(() => {}) }),
      listEnrolledFn: async () => new Map(),
      timeoutMs: 20,
    });
    const names = await resolve({ sources: [{ id: 's' }], serials: ['SN1'] });
    expect(names.get('SN1')).toBe('SN1');
  });
});
