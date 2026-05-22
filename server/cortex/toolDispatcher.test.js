import { describe, it, expect, vi } from 'vitest';
import { executeTool, registerResolver, deregisterResolver } from './toolDispatcher.js';

function mockFetchOk(payload, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    statusText: 'OK',
  }));
}

function mockFetchFail(status, body = 'denied') {
  return vi.fn(async () => ({
    ok: false,
    status,
    statusText: 'Forbidden',
    json: async () => ({ error: body }),
    text: async () => body,
  }));
}

describe('executeTool', () => {
  it('rejects unknown tools without making a request', async () => {
    const fetchFn = vi.fn();
    const res = await executeTool(
      'nonexistent',
      {},
      { authToken: 'a', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown tool/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects when no controllerUrl is configured', async () => {
    const res = await executeTool('listSites', {}, { authToken: 'a' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/controllerUrl/);
  });

  it('calls the right URL for listSites', async () => {
    const fetchFn = mockFetchOk([{ siteId: 's-1' }]);
    const res = await executeTool(
      'listSites',
      {},
      { authToken: 'Bearer X', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(res.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ctrl/management/v1/state/sites',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('forwards auth token in the Authorization header', async () => {
    const fetchFn = mockFetchOk({});
    await executeTool(
      'listSites',
      {},
      { authToken: 'Bearer xyz', controllerUrl: 'https://ctrl', fetchFn }
    );
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer xyz');
  });

  it('returns ok:false with status text on HTTP error', async () => {
    const fetchFn = mockFetchFail(403);
    const res = await executeTool(
      'listSites',
      {},
      { authToken: '', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('403');
    expect(res.callMeta.status).toBe(403);
  });

  it('truncates very large arrays so the LLM context survives', async () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ id: i }));
    const fetchFn = mockFetchOk(big);
    const res = await executeTool(
      'listSites',
      {},
      { authToken: '', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(res.ok).toBe(true);
    expect(res.data.__truncated__).toBe(true);
    expect(res.data.totalCount).toBe(200);
    expect(res.data.sample.length).toBe(20);
  });

  it('strips noisy fields and flattens nested objects from sampled rows', async () => {
    const fetchFn = mockFetchOk(
      Array.from({ length: 25 }, (_, i) => ({
        id: i,
        name: `ap-${i}`,
        rxBytes: 12345678,
        txBytes: 98765432,
        radio0: { channelUtilization: 50, noise: -90 },
      }))
    );
    const res = await executeTool(
      'listAps',
      {},
      { authToken: '', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(res.ok).toBe(true);
    const row = res.data.sample[0];
    expect(row.id).toBe(0);
    expect(row.name).toBe('ap-0');
    expect(row.rxBytes).toBeUndefined();
    expect(row.txBytes).toBeUndefined();
    expect(row.radio0).toBe('<object>');
  });

  it('builds parameterised paths from args', async () => {
    const fetchFn = mockFetchOk({});
    await executeTool(
      'getSiteHealth',
      { siteId: 'my-site' },
      { authToken: '', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ctrl/management/v1/state/sites/my-site',
      expect.any(Object)
    );
  });

  it('calls a registered resolver instead of making HTTP', async () => {
    registerResolver('_testResolver', async (args) => ({ echo: args }));
    try {
      const result = await executeTool('_testResolver', { x: 1 }, {});
      expect(result.ok).toBe(true);
      expect(result.data.echo).toEqual({ x: 1 });
    } finally {
      deregisterResolver('_testResolver');
    }
  });

  it('returns error when a RESOLVER tool has no registered resolver', async () => {
    // getDriftAlerts is in the catalog with method=RESOLVER but no resolver registered in tests
    const result = await executeTool('getDriftAlerts', {}, { controllerUrl: 'https://ctrl.local' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not registered');
  });
});
