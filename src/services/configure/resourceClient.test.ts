import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiService: { makeAuthenticatedRequest: vi.fn() },
  getDynamicControllerUrl: () => null,
}));

import { apiService } from '../api';
import {
  ConfigureApiError,
  configureRequest,
  createResourceClient,
  createSingletonClient,
  unwrapList,
} from './resourceClient';

const mockRequest = apiService.makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('configureRequest', () => {
  it('parses JSON payloads on success', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ id: 'x' }));
    await expect(configureRequest('/v1/services/x')).resolves.toEqual({ id: 'x' });
  });

  it('serializes bodies and sets Content-Type on mutations', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await configureRequest('/v1/services', { method: 'POST', body: { name: 'a' } });
    const [endpoint, init] = mockRequest.mock.calls[0];
    expect(endpoint).toBe('/v1/services');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ name: 'a' }));
  });

  it('throws ConfigureApiError carrying status + body on non-2xx', async () => {
    mockRequest.mockResolvedValueOnce(new Response('vlan in use', { status: 409 }));
    const error = await configureRequest('/v1/topologies/t1', { method: 'DELETE' }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(ConfigureApiError);
    expect((error as ConfigureApiError).status).toBe(409);
    expect((error as ConfigureApiError).body).toBe('vlan in use');
  });

  it('tolerates empty response bodies', async () => {
    mockRequest.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(configureRequest('/v1/roles/r1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('unwrapList', () => {
  it('passes bare arrays through', () => {
    expect(unwrapList([1, 2])).toEqual([1, 2]);
  });

  it('unwraps data/items/results/content envelopes', () => {
    expect(unwrapList({ data: [1] })).toEqual([1]);
    expect(unwrapList({ items: [2] })).toEqual([2]);
    expect(unwrapList({ results: [3] })).toEqual([3]);
    expect(unwrapList({ content: [4] })).toEqual([4]);
  });

  it('returns [] for unrecognized payloads', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ nope: true })).toEqual([]);
  });
});

describe('createResourceClient', () => {
  interface Thing {
    id: string;
    name: string;
  }

  it('falls back to the next base path on 404 and remembers the winner', async () => {
    const client = createResourceClient<Thing>({
      resource: 'adsp',
      basePaths: ['/v3/adsp', '/v4/adsp'],
    });
    mockRequest.mockResolvedValueOnce(new Response('nf', { status: 404 }));
    mockRequest.mockResolvedValueOnce(jsonResponse([{ id: '1', name: 'a' }]));
    await expect(client.list()).resolves.toEqual([{ id: '1', name: 'a' }]);

    // Second call goes straight to the remembered /v4 base.
    mockRequest.mockResolvedValueOnce(jsonResponse([]));
    await client.list();
    expect(mockRequest.mock.calls[2][0]).toBe('/v4/adsp');
  });

  it('optionalFeature list() degrades to [] when every path 404s', async () => {
    const client = createResourceClient<Thing>({
      resource: 'vlangroups',
      basePaths: ['/v1/vlangroups', '/v3/vlangroups'],
      optionalFeature: true,
    });
    mockRequest.mockResolvedValue(new Response('nf', { status: 404 }));
    await expect(client.list()).resolves.toEqual([]);
    await expect(client.isSupported()).resolves.toBe(false);
  });

  it('CRUD verbs hit the expected endpoints', async () => {
    const client = createResourceClient<Thing>({
      resource: 'roles',
      basePaths: ['/v3/roles'],
      supportsNameToIdMap: true,
    });
    mockRequest.mockImplementation(() =>
      Promise.resolve(jsonResponse({ id: 'r1', name: 'x' }))
    );

    await client.get('r1');
    await client.create({ name: 'x' });
    await client.update('r1', { name: 'y' });
    await client.remove('r1');
    await client.getDefault();
    await client.getNameToIdMap();

    const calls = mockRequest.mock.calls.map((c) => [c[0], c[1]?.method ?? 'GET']);
    expect(calls).toEqual([
      ['/v3/roles/r1', 'GET'],
      ['/v3/roles', 'POST'],
      ['/v3/roles/r1', 'PUT'],
      ['/v3/roles/r1', 'DELETE'],
      ['/v3/roles/default', 'GET'],
      ['/v3/roles/nametoidmap', 'GET'],
    ]);
  });

  it('getDefault rejects for resources without a /default template', async () => {
    const client = createResourceClient<Thing>({
      resource: 'profiles',
      basePaths: ['/v3/profiles'],
      supportsDefault: false,
    });
    await expect(client.getDefault()).rejects.toThrow(/no \/default template/);
  });
});

describe('createSingletonClient', () => {
  it('GETs and PUTs the fixed path', async () => {
    const client = createSingletonClient<{ trapSeverity: string }>({
      resource: 'snmp',
      path: '/v1/snmp',
    });
    mockRequest.mockImplementation(() =>
      Promise.resolve(jsonResponse({ trapSeverity: 'Major' }))
    );
    await expect(client.get()).resolves.toEqual({ trapSeverity: 'Major' });
    await client.update({ trapSeverity: 'Critical' });
    expect(mockRequest.mock.calls[1][0]).toBe('/v1/snmp');
    expect(mockRequest.mock.calls[1][1].method).toBe('PUT');
  });
});
