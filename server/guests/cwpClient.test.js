import { describe, it, expect, vi } from 'vitest';

import {
  loadCwpConfig,
  cwpRequest,
  CwpRequestError,
  CwpUnavailableError,
} from './cwpClient.js';

const config = { baseUrl: 'http://cwp.internal', token: 'tok', timeoutMs: 1000, configured: true };

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('loadCwpConfig', () => {
  it('is unconfigured without both halves', () => {
    expect(loadCwpConfig({ CWP_INTERNAL_API_URL: 'http://x' }).configured).toBe(false);
    expect(loadCwpConfig({ CWP_INTERNAL_API_TOKEN: 't' }).configured).toBe(false);
    expect(
      loadCwpConfig({ CWP_INTERNAL_API_URL: 'http://x', CWP_INTERNAL_API_TOKEN: 't' }).configured
    ).toBe(true);
  });

  it('strips a trailing slash so paths do not double up', () => {
    expect(loadCwpConfig({ CWP_INTERNAL_API_URL: 'http://x/', CWP_INTERNAL_API_TOKEN: 't' }).baseUrl).toBe(
      'http://x'
    );
  });
});

describe('cwpRequest', () => {
  it('sends the bearer token and the actor header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await cwpRequest('/api/internal/guests', { config, fetchFn, actor: 'kit' });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-Actor']).toBe('kit');
  });

  it('refuses to call out when unconfigured', async () => {
    await expect(
      cwpRequest('/x', { config: { ...config, configured: false } })
    ).rejects.toBeInstanceOf(CwpUnavailableError);
  });

  it('turns a transport failure into an unavailable error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(cwpRequest('/x', { config, fetchFn })).rejects.toBeInstanceOf(CwpUnavailableError);
  });

  it('treats 5xx as unavailable, not as a request problem', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    await expect(cwpRequest('/x', { config, fetchFn })).rejects.toBeInstanceOf(CwpUnavailableError);
  });

  it('treats a route-level 404 as the service being unavailable', async () => {
    // A missing route means an old portal build or a disabled internal API —
    // not "this guest does not exist".
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, null));
    await expect(cwpRequest('/x', { config, fetchFn })).rejects.toBeInstanceOf(CwpUnavailableError);
  });

  it('carries a 4xx error message and code through', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: 'already there', code: 'DUPLICATE_ACTIVE' }));
    await expect(cwpRequest('/x', { config, fetchFn })).rejects.toMatchObject({
      name: 'CwpRequestError',
      status: 409,
      code: 'DUPLICATE_ACTIVE',
      message: 'already there',
    });
  });

  it('survives a body that is not JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(cwpRequest('/x', { config, fetchFn })).resolves.toEqual({});
  });

  it('does not leak the token in an error message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('failed to connect to http://cwp.internal'));
    const error = await cwpRequest('/x', { config, fetchFn }).catch((e) => e);
    expect(error).toBeInstanceOf(CwpUnavailableError);
    expect(error.message).not.toContain('tok');
  });
});

describe('CwpRequestError', () => {
  it('keeps the response body for callers that need it', () => {
    const error = new CwpRequestError('m', { status: 409, body: { guest: { id: 'g1' } } });
    expect(error.body.guest.id).toBe('g1');
  });
});
