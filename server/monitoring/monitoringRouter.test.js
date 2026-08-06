import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createMonitoringRouter, resolveRange, summarizeSourceHealth } from './monitoringRouter.js';
import { loadMonitoringConfig } from './config.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CONFIG = loadMonitoringConfig({
  DATABASE_URL: 'postgres://localhost/aura',
  MONITORING_RETENTION_DAYS: '7',
  MONITORING_STALE_AFTER_SECONDS: '900',
  MONITORING_CREDENTIAL_KEY: Buffer.alloc(32, 7).toString('base64'),
});

const SOURCE_A = {
  id: 'src-a',
  displayName: 'Controller A',
  orgId: 'org-a',
  siteGroupId: 'sg-a',
  baseUrl: 'https://ctrl-a.example.com',
  enabled: true,
  consecutiveFailures: 0,
  lastAttemptAt: new Date(NOW.getTime() - 60_000),
  lastSuccessAt: new Date(NOW.getTime() - 60_000),
  lastFailureAt: null,
  lastErrorCode: null,
  capabilities: { durations: { '3H': true } },
};

const samplePoint = (overrides = {}) => ({
  monitoredSourceId: 'src-a',
  orgId: 'org-a',
  siteGroupId: 'sg-a',
  siteId: 'site-1',
  deviceExternalId: null,
  radioExternalId: null,
  wlanExternalId: null,
  metricFamily: 'sle',
  metricName: 'coverage',
  observedAt: new Date(NOW.getTime() - 5 * 60_000),
  numericValue: 95,
  numerator: 19,
  denominator: 20,
  sampleCount: 20,
  unit: '%',
  metricKind: 'percentage',
  dimensions: {},
  qualityState: 'observed',
  collectedAt: new Date(NOW.getTime() - 5 * 60_000),
  ...overrides,
});

/** Scope middleware stand-in: authorizes src-a only. */
const allowScope = (sources = [SOURCE_A]) => (req, _res, next) => {
  req.monitoringScope = { baseUrl: SOURCE_A.baseUrl, sources, sourceIds: sources.map((s) => s.id) };
  next();
};

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    '/api',
    createMonitoringRouter({
      config: CONFIG,
      scopeMiddleware: allowScope(),
      nowFn: () => NOW,
      queryHistoryFn: async () => ({ points: [samplePoint()], truncated: false }),
      queryLatestFn: async () => [samplePoint()],
      getEarliestObservedAtFn: async () => new Date(NOW.getTime() - 3 * MS_PER_DAY),
      listRecentRunsFn: async () => [],
      upsertSourceFn: async () => ({ id: 'src-a', baseUrl: SOURCE_A.baseUrl, displayName: 'A', enabled: true }),
      setSourceCredentialsFn: async () => undefined,
      setSourceEnabledFn: async (id, enabled) => ({ id, enabled }),
      hasSourceCredentialsFn: async () => ({ configured: true, username: 'svc' }),
      getSourceByIdFn: async () => SOURCE_A,
      ...overrides,
    })
  );
  return app;
}

describe('resolveRange', () => {
  it('defaults to the full retention window', () => {
    const range = resolveRange({ now: NOW, retentionDays: 7 });
    expect(range.end.toISOString()).toBe(NOW.toISOString());
    expect((range.end - range.start) / MS_PER_DAY).toBe(7);
  });

  it('accepts an explicit range inside retention', () => {
    const range = resolveRange({
      start: '2026-08-04T00:00:00Z',
      end: '2026-08-05T00:00:00Z',
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBeUndefined();
  });

  it('accepts a request for exactly the retention window computed on a client clock', () => {
    // The client computes start from its own clock; the server validates a
    // moment later. Without a tolerance this — the default view — always 400s.
    const clientNow = new Date(NOW.getTime() - 850); // client is slightly behind
    const range = resolveRange({
      start: new Date(clientNow.getTime() - 7 * MS_PER_DAY).toISOString(),
      end: clientNow.toISOString(),
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBeUndefined();
  });

  it('accepts an exact-retention range even with a minute of clock skew', () => {
    const skewed = new Date(NOW.getTime() - 60_000);
    const range = resolveRange({
      start: new Date(skewed.getTime() - 7 * MS_PER_DAY).toISOString(),
      end: skewed.toISOString(),
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBeUndefined();
  });

  it('still rejects a range meaningfully beyond retention', () => {
    const range = resolveRange({
      start: new Date(NOW.getTime() - 9 * MS_PER_DAY).toISOString(),
      end: NOW.toISOString(),
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBe('range_too_large');
  });

  it('rejects a range wider than retention instead of clamping it', () => {
    const range = resolveRange({
      start: '2026-07-01T00:00:00Z',
      end: '2026-08-05T00:00:00Z',
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBe('range_too_large');
  });

  it('rejects a start older than retention rather than returning a misleading empty result', () => {
    const range = resolveRange({
      start: '2026-07-20T00:00:00Z',
      end: '2026-07-24T00:00:00Z',
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBe('range_outside_retention');
  });

  it('rejects an inverted range', () => {
    const range = resolveRange({
      start: '2026-08-05T00:00:00Z',
      end: '2026-08-04T00:00:00Z',
      now: NOW,
      retentionDays: 7,
    });
    expect(range.error).toBe('invalid_range');
  });

  it('rejects an unparseable timestamp', () => {
    expect(resolveRange({ start: 'yesterday', now: NOW, retentionDays: 7 }).error).toBe(
      'invalid_range'
    );
  });

  it('reports the requested window untouched when it is fully retained', () => {
    const range = resolveRange({
      start: '2026-08-04T00:00:00Z',
      end: '2026-08-05T00:00:00Z',
      now: NOW,
      retentionDays: 7,
    });
    expect(range.clampedToRetention).toBe(false);
    expect(range.requestedStart.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    expect(range.start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('serves the retained part of the oldest calendar day instead of refusing it', () => {
    // "7 days ago" as a local date starts at that day's midnight, which is older
    // than now-7d. Refusing it would make the oldest selectable day unusable.
    const dayStart = new Date('2026-07-29T00:00:00Z');
    const dayEnd = new Date('2026-07-29T23:59:59.999Z');
    const range = resolveRange({
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
      now: NOW,
      retentionDays: 7,
    });

    expect(range.error).toBeUndefined();
    expect(range.clampedToRetention).toBe(true);
    // Queried from the retention boundary...
    expect(range.start.toISOString()).toBe('2026-07-29T12:00:00.000Z');
    // ...while still reporting what was asked for, so the day reads as partial.
    expect(range.requestedStart.toISOString()).toBe(dayStart.toISOString());
    expect(range.end.toISOString()).toBe(dayEnd.toISOString());
    expect(range.retentionStart.toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });

  it('clamps a modest overshoot but still refuses a grossly oversized window', () => {
    const modest = resolveRange({
      start: new Date(NOW.getTime() - 7.5 * MS_PER_DAY).toISOString(),
      end: NOW.toISOString(),
      now: NOW,
      retentionDays: 7,
    });
    expect(modest.error).toBeUndefined();
    expect(modest.clampedToRetention).toBe(true);

    const gross = resolveRange({
      start: new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
      end: NOW.toISOString(),
      now: NOW,
      retentionDays: 7,
    });
    expect(gross.error).toBe('range_too_large');
  });
});

describe('summarizeSourceHealth', () => {
  const opts = { now: NOW, staleAfterSeconds: 900 };

  it('reports a healthy source as fresh', () => {
    expect(summarizeSourceHealth([SOURCE_A], opts)[0].state).toBe('fresh');
  });

  it('distinguishes never-collected from offline', () => {
    const never = { ...SOURCE_A, lastSuccessAt: null, consecutiveFailures: 0 };
    const down = { ...SOURCE_A, lastSuccessAt: null, consecutiveFailures: 4 };
    expect(summarizeSourceHealth([never], opts)[0].state).toBe('never_collected');
    expect(summarizeSourceHealth([down], opts)[0].state).toBe('offline');
  });

  it('reports a failing source with old contact as offline', () => {
    const source = {
      ...SOURCE_A,
      consecutiveFailures: 3,
      lastSuccessAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000),
    };
    expect(summarizeSourceHealth([source], opts)[0].state).toBe('offline');
  });

  it('always says history is served from the database, never "live"', () => {
    expect(summarizeSourceHealth([SOURCE_A], opts)[0].servingFrom).toBe('database');
  });

  it('never exposes credentials or raw errors', () => {
    const source = { ...SOURCE_A, lastErrorSummary: 'Bearer secret-token-value' };
    const serialized = JSON.stringify(summarizeSourceHealth([source], opts));
    expect(serialized).not.toContain('secret-token-value');
  });

  it('maps an error class to a human label', () => {
    const source = { ...SOURCE_A, lastErrorCode: 'network', consecutiveFailures: 2 };
    expect(summarizeSourceHealth([source], opts)[0].errorLabel).toMatch(/could not be reached/i);
  });
});

describe('GET /api/monitoring/history', () => {
  it('defaults to the last seven days', async () => {
    const queryHistoryFn = vi.fn(async () => ({ points: [], truncated: false }));
    await request(buildApp({ queryHistoryFn })).get('/api/monitoring/history').expect(200);

    const { start, end } = queryHistoryFn.mock.calls[0][0];
    expect((end - start) / MS_PER_DAY).toBe(7);
  });

  it('honours an explicit range', async () => {
    const queryHistoryFn = vi.fn(async () => ({ points: [], truncated: false }));
    await request(buildApp({ queryHistoryFn }))
      .get('/api/monitoring/history?start=2026-08-04T00:00:00Z&end=2026-08-05T00:00:00Z')
      .expect(200);

    expect(queryHistoryFn.mock.calls[0][0].start.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('rejects a range beyond retention with an explanation', async () => {
    const res = await request(buildApp())
      .get('/api/monitoring/history?start=2026-06-01T00:00:00Z&end=2026-08-05T00:00:00Z')
      .expect(400);
    expect(res.body.error).toBe('range_too_large');
    expect(res.body.retentionDays).toBe(7);
  });

  it('returns UTC ISO-8601 timestamps', async () => {
    const res = await request(buildApp()).get('/api/monitoring/history').expect(200);
    expect(res.body.series[0].points[0].observedAt).toMatch(/Z$/);
    expect(res.body.meta.start).toMatch(/Z$/);
  });

  it('scopes the query to the authorized sources only', async () => {
    const queryHistoryFn = vi.fn(async () => ({ points: [], truncated: false }));
    await request(buildApp({ queryHistoryFn }))
      .get('/api/monitoring/history?siteId=site-1')
      .expect(200);
    expect(queryHistoryFn.mock.calls[0][0].sourceIds).toEqual(['src-a']);
  });

  it('cannot be widened by a caller-supplied source id', async () => {
    const queryHistoryFn = vi.fn(async () => ({ points: [], truncated: false }));
    await request(buildApp({ queryHistoryFn }))
      .get('/api/monitoring/history?sourceId=src-b&monitoredSourceId=src-b')
      .expect(200);
    expect(queryHistoryFn.mock.calls[0][0].sourceIds).toEqual(['src-a']);
  });

  it('reports truncation rather than silently capping', async () => {
    const res = await request(
      buildApp({ queryHistoryFn: async () => ({ points: [samplePoint()], truncated: true }) })
    )
      .get('/api/monitoring/history')
      .expect(200);
    expect(res.body.meta.truncated).toBe(true);
  });

  it('states the effective start when the window was trimmed', async () => {
    const trimmedStart = new Date(NOW.getTime() - 2 * MS_PER_DAY);
    const res = await request(
      buildApp({
        queryHistoryFn: async () => ({
          points: [samplePoint()],
          truncated: true,
          effectiveStart: trimmedStart,
        }),
      })
    )
      .get('/api/monitoring/history')
      .expect(200);
    expect(res.body.meta.effectiveStart).toBe(trimmedStart.toISOString());
    // The requested start is still reported, so the trim is visible as a delta.
    expect(res.body.meta.start).not.toBe(res.body.meta.effectiveStart);
  });

  it('distinguishes an empty window from never having collected', async () => {
    const emptyWindow = await request(
      buildApp({ queryHistoryFn: async () => ({ points: [], truncated: false }) })
    )
      .get('/api/monitoring/history')
      .expect(200);
    expect(emptyWindow.body.meta.neverCollected).toBe(false);
    expect(emptyWindow.body.meta.earliestAvailable).toBeTruthy();

    const neverCollected = await request(
      buildApp({
        queryHistoryFn: async () => ({ points: [], truncated: false }),
        getEarliestObservedAtFn: async () => null,
      })
    )
      .get('/api/monitoring/history')
      .expect(200);
    expect(neverCollected.body.meta.neverCollected).toBe(true);
  });

  it('returns gap metadata for a series with missing observations', async () => {
    const points = [
      samplePoint({ observedAt: new Date(NOW.getTime() - 300 * 60_000) }),
      samplePoint({ observedAt: new Date(NOW.getTime() - 295 * 60_000) }),
      samplePoint({ observedAt: new Date(NOW.getTime() - 5 * 60_000) }),
    ];
    const res = await request(buildApp({ queryHistoryFn: async () => ({ points, truncated: false }) }))
      .get('/api/monitoring/history')
      .expect(200);
    expect(res.body.series[0].gaps.length).toBeGreaterThan(0);
  });

  it('states that history is served from the database', async () => {
    const res = await request(buildApp()).get('/api/monitoring/history').expect(200);
    expect(res.body.meta.servingFrom).toBe('database');
  });

  it('returns a categorized error without a stack trace when the store is down', async () => {
    const res = await request(
      buildApp({
        queryHistoryFn: async () => {
          throw new Error('connection terminated unexpectedly');
        },
      })
    )
      .get('/api/monitoring/history')
      .expect(503);
    expect(res.body).toHaveProperty('errorClass');
    expect(JSON.stringify(res.body)).not.toContain('at ');
    expect(JSON.stringify(res.body)).not.toContain('connection terminated');
  });
});

describe('GET /api/monitoring/latest', () => {
  it('returns freshness metadata alongside the value', async () => {
    const res = await request(buildApp()).get('/api/monitoring/latest').expect(200);
    const metric = res.body.metrics[0];
    expect(metric).toMatchObject({ state: 'fresh', value: 95 });
    expect(metric.observedAt).toMatch(/Z$/);
    expect(metric.collectedAt).toMatch(/Z$/);
    expect(metric.lastSuccessfulContactAt).toMatch(/Z$/);
    expect(metric.dataAgeSeconds).toBe(300);
  });

  it('marks data stale rather than dropping it when the source stops reporting', async () => {
    const staleSource = {
      ...SOURCE_A,
      consecutiveFailures: 3,
      lastSuccessAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
    };
    const app = express();
    app.use(
      '/api',
      createMonitoringRouter({
        config: CONFIG,
        scopeMiddleware: allowScope([staleSource]),
        nowFn: () => NOW,
        queryLatestFn: async () => [
          samplePoint({ observedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000) }),
        ],
      })
    );

    const res = await request(app).get('/api/monitoring/latest').expect(200);
    expect(res.body.metrics[0].state).toBe('offline');
    expect(res.body.metrics[0].value).toBe(95); // value retained, not zeroed
  });

  it('reports never-collected when nothing is stored', async () => {
    const res = await request(buildApp({ queryLatestFn: async () => [] }))
      .get('/api/monitoring/latest')
      .expect(200);
    expect(res.body.meta.neverCollected).toBe(true);
    expect(res.body.metrics).toEqual([]);
  });
});

describe('GET /api/monitoring/sources/health', () => {
  it('reports polling health and recent runs', async () => {
    const res = await request(
      buildApp({
        listRecentRunsFn: async () => [
          {
            collectorName: 'sle',
            startedAt: NOW,
            completedAt: NOW,
            status: 'succeeded',
            recordsInserted: 7,
            recordsUpdated: 0,
            durationMs: 120,
            errorClass: null,
          },
        ],
      })
    )
      .get('/api/monitoring/sources/health')
      .expect(200);

    expect(res.body.sources[0]).toMatchObject({ sourceId: 'src-a', state: 'fresh' });
    expect(res.body.sources[0].recentRuns[0].status).toBe('succeeded');
    expect(res.body.meta.retentionDays).toBe(7);
  });

  it('never exposes credentials', async () => {
    const res = await request(buildApp()).get('/api/monitoring/sources/health').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password');
    expect(body).not.toContain('secret');
  });
});

describe('GET /api/monitoring/aggregate', () => {
  it('computes a weighted percentage from numerator and denominator', async () => {
    const points = [
      samplePoint({ numerator: 1, denominator: 1 }),
      samplePoint({ numerator: 0, denominator: 99, observedAt: new Date(NOW.getTime() - 60_000) }),
    ];
    const res = await request(buildApp({ queryHistoryFn: async () => ({ points, truncated: false }) }))
      .get('/api/monitoring/aggregate?metricName=coverage')
      .expect(200);
    expect(res.body.aggregate.value).toBe(1);
  });

  it('explains itself instead of guessing when the parts are missing', async () => {
    const res = await request(
      buildApp({
        queryHistoryFn: async () => ({
          points: [samplePoint({ numerator: null, denominator: null })],
          truncated: false,
        }),
      })
    )
      .get('/api/monitoring/aggregate?metricName=coverage')
      .expect(200);
    expect(res.body.aggregate).toBeNull();
    expect(res.body.meta.unavailableReason).toMatch(/cannot be computed/i);
  });

  it('requires a metric name', async () => {
    await request(buildApp()).get('/api/monitoring/aggregate').expect(400);
  });
});

describe('source administration', () => {
  it('registers a source and confirms credentials without echoing them', async () => {
    const res = await request(buildApp())
      .post('/api/monitoring/sources')
      .send({ baseUrl: 'https://ctrl-a.example.com', username: 'svc', password: 'hunter2' })
      .expect(201);

    expect(res.body.credentials).toEqual({ configured: true, username: 'svc' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('requires a base URL', async () => {
    await request(buildApp()).post('/api/monitoring/sources').send({}).expect(400);
  });

  it('refuses to store a password without an encryption key', async () => {
    const app = express();
    app.use(
      '/api',
      createMonitoringRouter({
        config: loadMonitoringConfig({ DATABASE_URL: 'postgres://localhost/aura' }),
        scopeMiddleware: allowScope(),
        nowFn: () => NOW,
      })
    );
    const res = await request(app)
      .post('/api/monitoring/sources')
      .send({ baseUrl: 'https://c.example.com', password: 'hunter2' })
      .expect(400);
    expect(res.body.error).toBe('not_configured');
  });

  it('pauses collection without deleting history', async () => {
    const res = await request(buildApp())
      .put('/api/monitoring/sources/src-a/enabled')
      .send({ enabled: false })
      .expect(200);
    expect(res.body.note).toMatch(/retained/i);
  });

  it('refuses to touch a source outside the caller\'s scope', async () => {
    await request(buildApp())
      .put('/api/monitoring/sources/src-b/enabled')
      .send({ enabled: false })
      .expect(403);
    await request(buildApp())
      .put('/api/monitoring/sources/src-b/credentials')
      .send({ username: 'x', password: 'y' })
      .expect(403);
  });

  it('validates the enabled flag', async () => {
    await request(buildApp())
      .put('/api/monitoring/sources/src-a/enabled')
      .send({ enabled: 'yes' })
      .expect(400);
  });
});

describe('GET /api/monitoring/coverage', () => {
  const coverageDay = (localDate, overrides = {}) => ({
    localDate,
    sampleCount: 288,
    hoursPresent: 24,
    firstObservedAt: new Date(`${localDate}T00:02:00Z`),
    lastObservedAt: new Date(`${localDate}T23:57:00Z`),
    ...overrides,
  });

  it('returns per-local-day coverage grouped in the requested zone', async () => {
    const queryDailyCoverageFn = vi.fn(async () => [
      coverageDay('2026-08-04'),
      coverageDay('2026-08-05', { hoursPresent: 12, sampleCount: 144 }),
    ]);
    const res = await request(buildApp({ queryDailyCoverageFn }))
      .get('/api/monitoring/coverage?timeZone=America/New_York')
      .expect(200);

    expect(queryDailyCoverageFn.mock.calls[0][0].timeZone).toBe('America/New_York');
    expect(res.body.meta.timeZone).toBe('America/New_York');
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[1]).toMatchObject({ localDate: '2026-08-05', hoursPresent: 12 });
  });

  it('reports the retention floor so the client can disable older days', async () => {
    const res = await request(buildApp({ queryDailyCoverageFn: async () => [] }))
      .get('/api/monitoring/coverage')
      .expect(200);
    expect(res.body.meta.retentionStart).toBe(
      new Date(NOW.getTime() - 7 * MS_PER_DAY).toISOString()
    );
    expect(res.body.meta.retentionDays).toBe(7);
  });

  it('distinguishes "no days in this window" from "never collected"', async () => {
    const emptyButCollected = await request(
      buildApp({ queryDailyCoverageFn: async () => [] })
    )
      .get('/api/monitoring/coverage')
      .expect(200);
    expect(emptyButCollected.body.days).toEqual([]);
    expect(emptyButCollected.body.meta.neverCollected).toBe(false);

    const neverCollected = await request(
      buildApp({
        queryDailyCoverageFn: async () => [],
        getEarliestObservedAtFn: async () => null,
      })
    )
      .get('/api/monitoring/coverage')
      .expect(200);
    expect(neverCollected.body.meta.neverCollected).toBe(true);
  });

  it('defaults to UTC when no zone is given but rejects a bogus one', async () => {
    const utc = await request(buildApp({ queryDailyCoverageFn: async () => [] }))
      .get('/api/monitoring/coverage')
      .expect(200);
    expect(utc.body.meta.timeZone).toBe('UTC');

    const bogus = await request(buildApp({ queryDailyCoverageFn: async () => [] }))
      .get('/api/monitoring/coverage?timeZone=Mars/Olympus_Mons')
      .expect(400);
    expect(bogus.body.error).toBe('invalid_request');
  });

  it('is scoped to the authorized sources and cannot be widened by query params', async () => {
    const queryDailyCoverageFn = vi.fn(async () => []);
    await request(buildApp({ queryDailyCoverageFn }))
      .get('/api/monitoring/coverage?sourceId=src-b&siteId=site-1&metricFamily=sle')
      .expect(200);

    const call = queryDailyCoverageFn.mock.calls[0][0];
    expect(call.sourceIds).toEqual(['src-a']);
    expect(call.siteId).toBe('site-1');
    expect(call.metricFamily).toBe('sle');
  });

  it('reports a clamped window rather than implying the full range was covered', async () => {
    const res = await request(buildApp({ queryDailyCoverageFn: async () => [] }))
      .get('/api/monitoring/coverage?start=2026-07-29T00:00:00Z&end=2026-07-29T23:59:59Z')
      .expect(200);
    expect(res.body.meta.clampedToRetention).toBe(true);
    expect(res.body.meta.requestedStart).toBe('2026-07-29T00:00:00.000Z');
    expect(res.body.meta.start).toBe('2026-07-29T12:00:00.000Z');
  });

  it('never presents coverage as live data', async () => {
    const res = await request(buildApp({ queryDailyCoverageFn: async () => [] }))
      .get('/api/monitoring/coverage')
      .expect(200);
    expect(res.body.meta.servingFrom).toBe('database');
  });
});
