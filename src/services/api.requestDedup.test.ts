import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// localStorage must be available before the apiService singleton is constructed.
const { localStorageMock } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const mock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  });
  return { localStorageMock: mock };
});

import { apiService } from './api';

/** Give the singleton a token so requests are not short-circuited. */
function authenticate() {
  // @ts-expect-error - private field, set directly to avoid a network login
  apiService.accessToken = 'test-token';
  // @ts-expect-error - private field
  apiService.rateLimitedUntil = 0;
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('makeAuthenticatedRequest — concurrent GET deduplication', () => {
  beforeEach(() => {
    localStorageMock.clear();
    authenticate();
    apiService.clearBurstCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    apiService.clearBurstCache();
  });

  it('issues one network call for concurrent identical GETs, and every caller can read the body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true, n: 1 })));

    // Three components mounting on the same tick, all asking for the fleet.
    const [a, b, c] = await Promise.all([
      apiService.makeAuthenticatedRequest('/v1/aps/query'),
      apiService.makeAuthenticatedRequest('/v1/aps/query'),
      apiService.makeAuthenticatedRequest('/v1/aps/query'),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // A Response body is a one-shot stream. Handing the same instance to every
    // caller made the second and third throw "Body has already been read",
    // which surfaced as tables that loaded or came up empty depending on mount
    // order. Each caller must get its own readable copy.
    await expect(a.json()).resolves.toEqual({ ok: true, n: 1 });
    await expect(b.json()).resolves.toEqual({ ok: true, n: 1 });
    await expect(c.json()).resolves.toEqual({ ok: true, n: 1 });
  });

  it('replays a just-completed GET instead of re-hitting the network', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse({ serial: 'AP-1' })));

    const first = await apiService.makeAuthenticatedRequest('/v1/stations');
    await expect(first.json()).resolves.toEqual({ serial: 'AP-1' });

    // A navigation lands and another component asks again a moment later.
    const second = await apiService.makeAuthenticatedRequest('/v1/stations');
    await expect(second.json()).resolves.toEqual({ serial: 'AP-1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not replay across different endpoints', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse({})));

    await apiService.makeAuthenticatedRequest('/v1/aps/query');
    await apiService.makeAuthenticatedRequest('/v1/stations');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('never replays a non-GET, and a write invalidates the cache', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(jsonResponse({ v: 1 })));

    await apiService.makeAuthenticatedRequest('/v1/services');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // A user changes something.
    await apiService.makeAuthenticatedRequest('/v1/services', { method: 'POST', body: '{}' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // The read after the write must reach the controller, not replay the
    // pre-write body — otherwise the UI shows the old value until a timer expires.
    await apiService.makeAuthenticatedRequest('/v1/services');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not cache error responses, so a transient failure can recover', async () => {
    let call = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      return Promise.resolve(
        call === 1 ? new Response('nope', { status: 503 }) : jsonResponse({ recovered: true })
      );
    });

    const failed = await apiService.makeAuthenticatedRequest('/v1/topologies');
    expect(failed.status).toBe(503);

    const retried = await apiService.makeAuthenticatedRequest('/v1/topologies');
    await expect(retried.json()).resolves.toEqual({ recovered: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('clears replayable responses on logout so they cannot leak into the next session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResponse({ tenant: 'a' }))
    );

    await apiService.makeAuthenticatedRequest('/v1/globalsettings');
    await apiService.logout();

    // @ts-expect-error - private field
    expect(apiService.burstCache.size).toBe(0);
  });
});
