import { describe, it, expect, vi } from 'vitest';
import { executeTool } from './toolDispatcher.js';

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
      'https://ctrl/api/management/v1/state/sites',
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
    expect(res.data.sample.length).toBe(50);
  });

  it('builds parameterised paths from args', async () => {
    const fetchFn = mockFetchOk({});
    await executeTool(
      'getSiteHealth',
      { siteId: 'my-site' },
      { authToken: '', controllerUrl: 'https://ctrl', fetchFn }
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ctrl/api/management/v1/state/sites/my-site',
      expect.any(Object)
    );
  });
});
