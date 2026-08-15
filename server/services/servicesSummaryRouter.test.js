import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

import { createServicesSummaryRouter } from './servicesSummaryRouter.js';

const CONTROLLER = 'https://controller.test';
const TOKEN = 'Bearer test-token-abcdefghijklmnop';

/** Drive the router without binding a port. */
function callRoute(app, { authorization = TOKEN } = {}) {
  return new Promise((resolve) => {
    const req = {
      method: 'GET',
      url: '/api/v1/services/summary',
      headers: authorization ? { authorization } : {},
    };
    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      json(body) {
        resolve({ status: this.statusCode, body, headers: this.headers });
        return this;
      },
    };
    app(req, res, () => resolve({ status: 404, body: null, headers: {} }));
  });
}

function buildApp(fetchImpl) {
  vi.stubGlobal('fetch', fetchImpl);
  const app = express();
  app.use(
    '/api',
    createServicesSummaryRouter({ resolveControllerUrl: () => CONTROLLER })
  );
  return app;
}

function jsonOk(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function jsonFail(status, text = 'boom') {
  return Promise.resolve({
    ok: false,
    status,
    statusText: text,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(text),
  });
}

const SERVICES = [
  { id: 'wlan-1', serviceName: 'Corp' },
  { id: 'wlan-2', serviceName: 'Guest' },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/v1/services/summary', () => {
  it('rejects an unauthenticated caller without touching the controller', async () => {
    const fetchSpy = vi.fn();
    const app = buildApp(fetchSpy);

    const { status } = await callRoute(app, { authorization: null });

    expect(status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rolls per-service report and station calls into one response', async () => {
    const fetchSpy = vi.fn((url) => {
      if (url.endsWith('/v1/services')) return jsonOk(SERVICES);
      if (url.includes('/report')) return jsonOk({ metrics: { reliability: 99, uptime: 99 } });
      if (url.includes('/stations')) return jsonOk([{ mac: 'a' }, { mac: 'b' }]);
      return jsonFail(404);
    });
    const app = buildApp(fetchSpy);

    const { status, body } = await callRoute(app);

    expect(status).toBe(200);
    expect(body.services).toHaveLength(2);
    expect(body.reports['wlan-1'].metrics.reliability).toBe(99);
    expect(body.stationCounts).toEqual({ 'wlan-1': 2, 'wlan-2': 2 });
    // 1 collection + 2 services x 2 sub-resources.
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('returns a partial summary when one WLAN sub-resource fails', async () => {
    const fetchSpy = vi.fn((url) => {
      if (url.endsWith('/v1/services')) return jsonOk(SERVICES);
      if (url.includes('wlan-2') && url.includes('/report')) return jsonFail(500, 'upstream blew up');
      if (url.includes('/report')) return jsonOk({ metrics: { reliability: 80, uptime: 99 } });
      if (url.includes('/stations')) return jsonOk([]);
      return jsonFail(404);
    });
    const app = buildApp(fetchSpy);

    const { status, body } = await callRoute(app);

    // One bad sub-resource must not blank the Dashboard.
    expect(status).toBe(200);
    expect(body.reports['wlan-1']).toBeTruthy();
    expect(body.reports['wlan-2']).toBeUndefined();
    expect(body.meta.failures).toHaveLength(1);
    expect(body.meta.failures[0].id).toBe('wlan-2');
  });

  it('flags a poor-health WLAN through its report figures', async () => {
    const app = buildApp((url) => {
      if (url.endsWith('/v1/services')) return jsonOk([SERVICES[0]]);
      if (url.includes('/report')) return jsonOk({ metrics: { reliability: 42, uptime: 99 } });
      return jsonOk([]);
    });

    const { body } = await callRoute(app);
    expect(body.reports['wlan-1'].metrics.reliability).toBe(42);
  });

  it('replays a fresh assembly instead of re-running the fan-out', async () => {
    const fetchSpy = vi.fn((url) => {
      if (url.endsWith('/v1/services')) return jsonOk(SERVICES);
      if (url.includes('/report')) return jsonOk({ metrics: {} });
      return jsonOk([]);
    });
    const app = buildApp(fetchSpy);

    const first = await callRoute(app);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const second = await callRoute(app);

    expect(first.headers['x-aura-cache']).toBe('miss');
    expect(second.headers['x-aura-cache']).toBe('hit');
    expect(fetchSpy).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it('does not serve one principal the assembly built for another', async () => {
    const fetchSpy = vi.fn((url) => {
      if (url.endsWith('/v1/services')) return jsonOk(SERVICES);
      if (url.includes('/report')) return jsonOk({ metrics: {} });
      return jsonOk([]);
    });
    const app = buildApp(fetchSpy);

    await callRoute(app, { authorization: 'Bearer principal-one-token' });
    const afterFirst = fetchSpy.mock.calls.length;
    const other = await callRoute(app, { authorization: 'Bearer principal-two-token' });

    // A different token must miss the cache and re-authorize upstream.
    expect(other.headers['x-aura-cache']).toBe('miss');
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it('surfaces an upstream failure on the collection itself', async () => {
    const app = buildApp(() => jsonFail(503, 'controller unavailable'));

    const { status, body } = await callRoute(app);

    expect(status).toBe(503);
    expect(body.error).toMatch(/Failed to load services/i);
  });
});
