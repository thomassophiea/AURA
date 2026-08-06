import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  computeBackoffSeconds,
  shouldSkipForBackoff,
  runWithConcurrency,
  collectSource,
  runCollectionTick,
} from './collectorRunner.js';
import { loadMonitoringConfig } from './config.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

const CONFIG = loadMonitoringConfig({
  DATABASE_URL: 'postgres://localhost/aura',
  MONITORING_RETENTION_DAYS: '7',
  MONITORING_MAX_CONCURRENCY: '2',
});

const SOURCE = {
  id: 'src-1',
  orgId: 'org-1',
  siteGroupId: 'sg-1',
  baseUrl: 'https://ctrl.example.com',
  enabled: true,
  capabilities: { durations: { '3H': true }, durationsProbedAt: NOW.toISOString() },
  consecutiveFailures: 0,
  lastFailureAt: null,
};

/** Fake controller session driven by a path -> response map. */
function fakeSession(routes) {
  return {
    get: vi.fn(async (path) => {
      // Longest matching prefix wins, so '/v3/sites' does not swallow
      // '/v3/sites/site-1/stations' just because it was declared first.
      const key = Object.keys(routes)
        .filter((prefix) => path.startsWith(prefix))
        .sort((a, b) => b.length - a.length)[0];
      const handler = key ? routes[key] : null;
      if (!handler) {
        return { ok: false, status: 404, data: null, errorClass: 'upstream_client_error', errorSummary: 'not found' };
      }
      return typeof handler === 'function' ? handler(path) : handler;
    }),
  };
}

const okResponse = (data) => ({ ok: true, status: 200, data, errorClass: null, errorSummary: null });
const failResponse = (status, errorClass) => ({
  ok: false,
  status,
  data: null,
  errorClass,
  errorSummary: `${errorClass} failure`,
});

const SITES = [{ id: 'site-1', siteName: 'HQ' }];
const STATIONS = [
  { macAddress: 'AA:BB:CC:00:00:01', isWired: false, rssi: -55, txRate: 1e8, rxRate: 1e8, authenticated: true },
];
const APS = [{ serialNumber: 'AP-1', status: 'connected' }];

/** Recording stubs for every dependency collectSource touches. */
function makeDeps(overrides = {}) {
  const calls = {
    inserted: [],
    currentState: [],
    cursors: [],
    runs: [],
    finishes: [],
    successes: [],
    failures: [],
    attempts: [],
  };

  const deps = {
    getSessionFn: () => fakeSession(overrides.routes ?? {}),
    getCredentialsFn: async () => ({ username: 'svc', password: 'pw' }),
    insertSamplesFn: async (samples) => {
      calls.inserted.push(samples);
      return { inserted: samples.length, updated: 0, received: samples.length };
    },
    upsertCurrentStateFn: async (samples) => {
      calls.currentState.push(samples);
      return { upserted: samples.length };
    },
    getCursorFn: async () => null,
    advanceCursorFn: async (...args) => calls.cursors.push(args),
    startRunFn: async ({ collectorName }) => {
      const run = { id: `run-${calls.runs.length}`, collectorName };
      calls.runs.push(run);
      return run;
    },
    finishRunFn: async (id, payload) => calls.finishes.push({ id, ...payload }),
    recordAttemptFn: async (...args) => calls.attempts.push(args),
    recordSuccessFn: async (...args) => calls.successes.push(args),
    recordFailureFn: async (id, payload) => calls.failures.push({ id, ...payload }),
    refreshCapabilitiesFn: async (_session, source) => source.capabilities,
    ...overrides.deps,
  };

  return { deps, calls };
}

const healthyRoutes = {
  '/v3/sites/site-1/stations': okResponse(STATIONS),
  '/v3/sites/site-1/aps': okResponse(APS),
  '/v3/sites/site-1/report/venue': okResponse({
    ulDlThroughputTimeseries: [
      {
        reportName: 'Throughput',
        reportType: 'Timeseries',
        band: 'all',
        statistics: [
          { statName: 'Download', unit: 'bps', values: [{ timestamp: 1785961920000, value: '1000' }] },
        ],
      },
    ],
  }),
  '/v3/sites': okResponse(SITES),
};

describe('computeBackoffSeconds', () => {
  it('is zero with no failures', () => {
    expect(computeBackoffSeconds(0, { baseSeconds: 60, maxSeconds: 1800 })).toBe(0);
  });

  it('grows exponentially', () => {
    const fixed = () => 1; // no jitter reduction
    expect(computeBackoffSeconds(1, { baseSeconds: 60, maxSeconds: 1800, random: fixed })).toBe(60);
    expect(computeBackoffSeconds(2, { baseSeconds: 60, maxSeconds: 1800, random: fixed })).toBe(120);
    expect(computeBackoffSeconds(3, { baseSeconds: 60, maxSeconds: 1800, random: fixed })).toBe(240);
  });

  it('is bounded by the ceiling', () => {
    const value = computeBackoffSeconds(30, { baseSeconds: 60, maxSeconds: 1800, random: () => 1 });
    expect(value).toBe(1800);
  });

  it('applies jitter so simultaneous failures do not retry in lockstep', () => {
    const low = computeBackoffSeconds(3, { baseSeconds: 60, maxSeconds: 1800, random: () => 0 });
    const high = computeBackoffSeconds(3, { baseSeconds: 60, maxSeconds: 1800, random: () => 1 });
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThan(0);
  });

  it('does not overflow for an absurd failure count', () => {
    const value = computeBackoffSeconds(10_000, {
      baseSeconds: 60,
      maxSeconds: 1800,
      random: () => 1,
    });
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(1800);
  });
});

describe('shouldSkipForBackoff', () => {
  const opts = { baseSeconds: 60, maxSeconds: 1800, random: () => 1 };

  it('does not skip a healthy source', () => {
    expect(shouldSkipForBackoff(SOURCE, { now: NOW, ...opts })).toBe(false);
  });

  it('skips a source still inside its backoff window', () => {
    const source = {
      ...SOURCE,
      consecutiveFailures: 3,
      lastFailureAt: new Date(NOW.getTime() - 60_000),
    };
    expect(shouldSkipForBackoff(source, { now: NOW, ...opts })).toBe(true);
  });

  it('retries once the window has passed — recovery is automatic', () => {
    const source = {
      ...SOURCE,
      consecutiveFailures: 3,
      lastFailureAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    };
    expect(shouldSkipForBackoff(source, { now: NOW, ...opts })).toBe(false);
  });
});

describe('runWithConcurrency', () => {
  it('runs every task', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n);
    const results = await runWithConcurrency(tasks, 2);
    expect(results.map((r) => r.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    await runWithConcurrency(tasks, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('reports a rejection without aborting the others', async () => {
    const tasks = [
      async () => 'a',
      async () => {
        throw new Error('boom');
      },
      async () => 'c',
    ];
    const results = await runWithConcurrency(tasks, 2);
    expect(results[0].value).toBe('a');
    expect(results[1].status).toBe('rejected');
    expect(results[2].value).toBe('c');
  });
});

describe('collectSource', () => {
  let deps;
  let calls;

  beforeEach(() => {
    ({ deps, calls } = makeDeps({ routes: healthyRoutes }));
  });

  it('collects and persists on a healthy poll', async () => {
    const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(result.status).toBe('succeeded');
    expect(result.inserted).toBeGreaterThan(0);
    expect(calls.successes).toHaveLength(1);
    expect(calls.failures).toHaveLength(0);
  });

  it('records the attempt before doing any work', async () => {
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.attempts[0][0]).toBe('src-1');
  });

  it('writes SLE samples carrying numerator and denominator', async () => {
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    const sleSamples = calls.inserted.flat().filter((s) => s.metricFamily === 'sle');
    expect(sleSamples.length).toBeGreaterThan(0);
    expect(sleSamples[0].denominator).toBeGreaterThan(0);
  });

  it('advances the cursor after a successful report collection', async () => {
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.cursors.length).toBeGreaterThan(0);
  });

  describe('when the gateway is offline', () => {
    beforeEach(() => {
      ({ deps, calls } = makeDeps({ routes: { '/v3/sites': failResponse(null, 'network') } }));
    });

    it('reports failure', async () => {
      const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
      expect(result.status).toBe('failed');
    });

    it('writes no samples at all — an outage is a gap, not a zero', async () => {
      await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
      expect(calls.inserted).toEqual([]);
      expect(calls.currentState).toEqual([]);
    });

    it('does not advance any cursor, so the gap can still be backfilled', async () => {
      await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
      expect(calls.cursors).toEqual([]);
    });

    it('records the failure with a sanitized class', async () => {
      await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
      expect(calls.failures[0]).toMatchObject({ id: 'src-1', errorCode: 'network' });
    });
  });

  it('records a timeout distinctly from a generic failure', async () => {
    ({ deps, calls } = makeDeps({ routes: { '/v3/sites': failResponse(null, 'timeout') } }));
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.finishes.some((f) => f.status === 'timed_out')).toBe(true);
  });

  it('records an authentication failure as auth, not as unreachable', async () => {
    ({ deps, calls } = makeDeps({ routes: { '/v3/sites': failResponse(401, 'auth') } }));
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.failures[0].errorCode).toBe('auth');
  });

  it('survives a malformed payload without persisting nonsense', async () => {
    ({ deps, calls } = makeDeps({
      routes: {
        '/v3/sites': okResponse(SITES),
        '/v3/sites/site-1/stations': okResponse('this is not a list'),
        '/v3/sites/site-1/aps': okResponse({ unexpected: true }),
        '/v3/sites/site-1/report/venue': okResponse({ garbage: 'value' }),
      },
    }));
    const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(result.status).not.toBe('failed');
    expect(calls.inserted.flat()).toEqual([]);
  });

  it('keeps collecting other sites when one site fails', async () => {
    ({ deps, calls } = makeDeps({
      routes: {
        '/v3/sites/site-1/stations': failResponse(500, 'upstream_server_error'),
        '/v3/sites/site-1/aps': failResponse(500, 'upstream_server_error'),
        '/v3/sites/site-2/stations': okResponse(STATIONS),
        '/v3/sites/site-2/aps': okResponse(APS),
        '/v3/sites/site-1/report/venue': failResponse(500, 'upstream_server_error'),
        '/v3/sites/site-2/report/venue': okResponse({}),
        '/v3/sites': okResponse([{ id: 'site-1' }, { id: 'site-2' }]),
      },
    }));

    const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(result.partialFailures).toBeGreaterThan(0);
    const sites = calls.inserted.flat().map((s) => s.siteId);
    expect(sites).toContain('site-2');
    expect(sites).not.toContain('site-1');
  });

  it('refuses to run without credentials and says so explicitly', async () => {
    ({ deps, calls } = makeDeps({
      routes: healthyRoutes,
      deps: { getCredentialsFn: async () => null },
    }));
    const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(result.status).toBe('failed');
    expect(calls.failures[0].errorCode).toBe('not_configured');
    expect(calls.inserted).toEqual([]);
  });

  it('falls back to the env service account for the default controller', async () => {
    const config = loadMonitoringConfig({
      DATABASE_URL: 'postgres://localhost/aura',
      CAMPUS_CONTROLLER_URL: 'https://ctrl.example.com',
      CAMPUS_CONTROLLER_USER: 'admin',
      CAMPUS_CONTROLLER_PASSWORD: 'pw',
    });
    ({ deps, calls } = makeDeps({
      routes: healthyRoutes,
      deps: { getCredentialsFn: async () => null },
    }));
    const result = await collectSource({ source: SOURCE, config, now: NOW, deps });
    expect(result.status).toBe('succeeded');
  });

  it('treats an undecryptable credential as a failure, not as no credential', async () => {
    ({ deps, calls } = makeDeps({
      routes: healthyRoutes,
      deps: {
        getCredentialsFn: async () => {
          throw new Error('Unsupported state or unable to authenticate data');
        },
      },
    }));
    const result = await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(result.status).toBe('failed');
    expect(calls.inserted).toEqual([]);
  });

  it('recovers automatically once the gateway is reachable again', async () => {
    const offline = makeDeps({ routes: { '/v3/sites': failResponse(null, 'network') } });
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps: offline.deps });
    expect(offline.calls.failures).toHaveLength(1);

    const online = makeDeps({ routes: healthyRoutes });
    const result = await collectSource({
      source: { ...SOURCE, consecutiveFailures: 3, lastFailureAt: NOW },
      config: CONFIG,
      now: NOW,
      deps: online.deps,
    });
    expect(result.status).toBe('succeeded');
    expect(online.calls.successes).toHaveLength(1);
  });

  it('does not collect AP reports unless they are enabled', async () => {
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.runs.map((r) => r.collectorName)).not.toContain('ap_report');
  });

  it('collects AP reports when enabled', async () => {
    const config = loadMonitoringConfig({
      DATABASE_URL: 'postgres://localhost/aura',
      MONITORING_AP_REPORTS_ENABLED: 'true',
    });
    ({ deps, calls } = makeDeps({
      routes: { ...healthyRoutes, '/v1/aps/query': okResponse([]) },
    }));
    await collectSource({ source: SOURCE, config, now: NOW, deps });
    expect(calls.runs.map((r) => r.collectorName)).toContain('ap_report');
  });

  it('records a collection run for every collector, success or failure', async () => {
    await collectSource({ source: SOURCE, config: CONFIG, now: NOW, deps });
    expect(calls.runs.length).toBe(calls.finishes.length);
    expect(calls.runs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('runCollectionTick', () => {
  const baseDeps = (overrides = {}) => ({
    listSourcesFn: async () => [SOURCE],
    collectSourceFn: async () => ({ sourceId: SOURCE.id, status: 'succeeded', inserted: 1, updated: 0, partialFailures: 0 }),
    withLockFn: async (_key, fn) => ({ acquired: true, result: await fn() }),
    recordSkippedRunFn: async () => undefined,
    random: () => 1,
    ...overrides,
  });

  it('does nothing when there are no sources', async () => {
    const result = await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({ listSourcesFn: async () => [] }),
    });
    expect(result).toEqual({ sources: 0, collected: 0, skipped: 0, failed: 0 });
  });

  it('collects each enabled source', async () => {
    const result = await runCollectionTick({ config: CONFIG, now: NOW, deps: baseDeps() });
    expect(result).toMatchObject({ sources: 1, collected: 1, failed: 0 });
  });

  it('skips a source whose lock another instance holds, without ingesting twice', async () => {
    const collectSourceFn = vi.fn();
    const result = await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({
        collectSourceFn,
        withLockFn: async () => ({ acquired: false, result: undefined }),
      }),
    });
    expect(collectSourceFn).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('records the lock skip so operators can see it happened', async () => {
    const recordSkippedRunFn = vi.fn(async () => undefined);
    await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({
        recordSkippedRunFn,
        withLockFn: async () => ({ acquired: false, result: undefined }),
      }),
    });
    expect(recordSkippedRunFn).toHaveBeenCalledWith({
      sourceId: 'src-1',
      collectorName: 'runner',
    });
  });

  it('honours backoff for a repeatedly failing source', async () => {
    const collectSourceFn = vi.fn();
    const result = await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({
        collectSourceFn,
        listSourcesFn: async () => [
          { ...SOURCE, consecutiveFailures: 5, lastFailureAt: new Date(NOW.getTime() - 1000) },
        ],
      }),
    });
    expect(collectSourceFn).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('keeps collecting healthy sources when one fails', async () => {
    const sources = [
      { ...SOURCE, id: 'src-1' },
      { ...SOURCE, id: 'src-2' },
      { ...SOURCE, id: 'src-3' },
    ];
    const result = await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({
        listSourcesFn: async () => sources,
        collectSourceFn: async ({ source }) => ({
          sourceId: source.id,
          status: source.id === 'src-2' ? 'failed' : 'succeeded',
          inserted: 0,
          updated: 0,
          partialFailures: 0,
        }),
      }),
    });
    expect(result).toMatchObject({ sources: 3, collected: 2, failed: 1 });
  });

  it('survives a source task throwing outright', async () => {
    const result = await runCollectionTick({
      config: CONFIG,
      now: NOW,
      deps: baseDeps({
        listSourcesFn: async () => [
          { ...SOURCE, id: 'src-1' },
          { ...SOURCE, id: 'src-2' },
        ],
        collectSourceFn: async ({ source }) => {
          if (source.id === 'src-1') throw new Error('unexpected');
          return { sourceId: source.id, status: 'succeeded', inserted: 0, updated: 0, partialFailures: 0 };
        },
      }),
    });
    expect(result.collected).toBe(1);
    expect(result.failed).toBe(1);
  });
});
