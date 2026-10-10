import { describe, it, expect } from 'vitest';
import { OPERATIONS, matchOperation, searchOperations, callGatewayApi } from './gatewayApi.js';

const session = (data, seen = []) => ({
  get: async (path) => {
    seen.push(path);
    return { ok: true, status: 200, data, errorSummary: null };
  },
});

describe('Gateway API catalogue', () => {
  it('holds only safe GET operations', () => {
    expect(OPERATIONS.length).toBeGreaterThan(150);
    const paths = OPERATIONS.map((o) => o.path);
    expect(paths.some((p) => p.startsWith('/v1/administrators'))).toBe(false);
    expect(paths.some((p) => p.startsWith('/v1/appkeys'))).toBe(false);
    expect(paths.some((p) => p.includes('downloadtrace'))).toBe(false);
  });

  it('matches concrete paths to templates, literal segments first', () => {
    expect(matchOperation('/v3/sites/abc/stations').path).toBe('/v3/sites/{siteid}/stations');
    expect(matchOperation('/v1/services/default').path).toBe('/v1/services/default');
    expect(matchOperation('/v9/nothing')).toBeNull();
  });

  it('ranks by operator vocabulary', () => {
    expect(searchOperations('wlan list')[0].path).toMatch(/^\/v1\/services/);
    expect(searchOperations('vlan').some((o) => o.path.startsWith('/v1/topologies'))).toBe(true);
  });
});

describe('callGatewayApi', () => {
  it('rejects traversal and encoded separators before any request', async () => {
    const seen = [];
    for (const path of ['/v1/../appkeys', '/v1/aps/%2e%2e/x', 'v1/aps', '/v1/aps\\x']) {
      const out = await callGatewayApi(session([], seen), { path });
      expect(out.unavailable).toBe(true);
    }
    expect(seen).toEqual([]);
  });

  it('rejects undeclared query parameters', async () => {
    const out = await callGatewayApi(session([]), { path: '/v1/aps/query', query: { evil: 1 } });
    expect(out.unavailable).toBe(true);
    expect(out.allowedQueryParameters).toContain('query');
  });

  it('pages, filters and projects list responses', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      apName: `AP-${i}`,
      serialNumber: `S${i}`,
      radios: [],
    }));
    const out = await callGatewayApi(session(rows), {
      path: '/v1/aps/query',
      match: 'AP-1',
      fields: ['apName'],
      limit: 5,
    });
    expect(out.total).toBe(120);
    expect(out.matched).toBe(31); // AP-1, AP-10..19, AP-100..119
    expect(out.returned).toBe(5);
    expect(out.hasMore).toBe(true);
    expect(out.data.__untrusted__).toBe(true);
    expect(out.data.value[0]).toEqual({ apName: 'AP-1' });
  });

  it('reports a Gateway failure as unavailable, not empty', async () => {
    const failing = {
      get: async () => ({ ok: false, status: 500, data: null, errorSummary: 'boom' }),
    };
    const out = await callGatewayApi(failing, { path: '/v1/services' });
    expect(out.unavailable).toBe(true);
    expect(out.status).toBe(500);
  });
});
