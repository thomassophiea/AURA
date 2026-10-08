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

const { toastWarning } = vi.hoisted(() => ({ toastWarning: vi.fn() }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    warning: toastWarning,
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

import { apiService, parseRetryAfterMs, controllerScopedKey, READ_TIMEOUT_MS } from './api';
import { cacheService } from './cache';

function authenticate(token = 'old-token', refresh: string | null = 'refresh-1') {
  // @ts-expect-error - private fields, set directly to avoid a network login
  apiService.accessToken = token;
  // @ts-expect-error - private field
  apiService.refreshToken = refresh;
  // @ts-expect-error - private field
  apiService.rateLimitedUntil = 0;
  localStorageMock.setItem('access_token', token);
  if (refresh) localStorageMock.setItem('refresh_token', refresh);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/**
 * A Gateway whose tokens rotate: 'old-token' is expired, the refresh endpoint
 * issues 'new-token', and only 'new-token' is accepted on data endpoints.
 */
function rotatingGateway(opts: { refreshDelayMs?: number } = {}) {
  const calls = { refresh: 0, data: [] as string[] };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = urlOf(input);
    if (url.includes('/v1/oauth2/refreshToken')) {
      calls.refresh++;
      if (opts.refreshDelayMs) await new Promise((r) => setTimeout(r, opts.refreshDelayMs));
      return json({ access_token: 'new-token', refresh_token: 'refresh-2' });
    }
    calls.data.push(url);
    if (authHeader(init) !== 'Bearer new-token') return json({ error: 'expired' }, 401);
    return json([{ id: url }]);
  });
  return { spy, calls };
}

beforeEach(() => {
  localStorageMock.clear();
  authenticate();
  apiService.clearClientCaches();
  toastWarning.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  apiService.clearClientCaches();
  apiService.setBaseUrl(null);
});

describe('401 handling — refresh and retry', () => {
  it('refreshes and retries a 401 on /v1/stations instead of going silently stale', async () => {
    const { calls } = rotatingGateway();
    const response = await apiService.makeAuthenticatedRequest('/v1/stations');
    expect(response.status).toBe(200);
    expect(calls.refresh).toBe(1);
    expect(calls.data).toHaveLength(2); // original + one retry
  });

  it.each(['/v1/services', '/v1/notifications', '/v1/alerts', '/v1/events', '/v1/report/sites'])(
    'refreshes and retries a 401 on %s',
    async (endpoint) => {
      const { calls } = rotatingGateway();
      const response = await apiService.makeAuthenticatedRequest(endpoint);
      expect(response.status).toBe(200);
      expect(calls.refresh).toBe(1);
    }
  );

  it('shares one refresh between concurrent 401s (single-flight)', async () => {
    const { calls } = rotatingGateway({ refreshDelayMs: 20 });
    const responses = await Promise.all([
      apiService.makeAuthenticatedRequest('/v1/stations'),
      apiService.makeAuthenticatedRequest('/v1/aps/query'),
      apiService.makeAuthenticatedRequest('/v1/services'),
      apiService.makeAuthenticatedRequest('/v3/sites'),
    ]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(calls.refresh).toBe(1);
  });

  it('retries without refreshing again when the token was already rotated by another request', async () => {
    const { calls } = rotatingGateway();
    const first = apiService.makeAuthenticatedRequest('/v1/aps/query');
    await first;
    // A request that was sent with the old token and only now gets its 401.
    // @ts-expect-error - private method, exercised directly to simulate the race
    const lateResponse = await apiService._executeAuthenticatedRequest('/v1/stations', {}, 1000);
    expect(lateResponse.status).toBe(200);
    expect(calls.refresh).toBe(1);
  });

  it('retries only once and keeps the suppression marker for the final failure', async () => {
    let refreshes = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (urlOf(input).includes('/v1/oauth2/refreshToken')) {
        refreshes++;
        return json({ access_token: `t${refreshes}`, refresh_token: `r${refreshes}` });
      }
      return json({ error: 'nope' }, 401);
    });
    await expect(apiService.makeAuthenticatedRequest('/v1/stations')).rejects.toThrow(
      /SUPPRESSED_ANALYTICS_ERROR/
    );
    expect(refreshes).toBe(1);
  });

  it('does not log out when a refresh fails on an optional endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (urlOf(input).includes('/v1/oauth2/refreshToken')) return json({}, 400);
      return json({ error: 'expired' }, 401);
    });
    const logout = vi.spyOn(apiService, 'logout');
    await expect(apiService.makeAuthenticatedRequest('/v1/notifications')).rejects.toThrow(
      /SUPPRESSED_/
    );
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out when a refresh fails on a critical endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (urlOf(input).includes('/v1/oauth2/refreshToken')) return json({}, 400);
      return json({ error: 'expired' }, 401);
    });
    const logout = vi.spyOn(apiService, 'logout').mockResolvedValue(undefined);
    await expect(apiService.makeAuthenticatedRequest('/v3/profiles')).rejects.toThrow(
      'Session expired'
    );
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('429 handling', () => {
  it('parses Retry-After seconds and HTTP dates, capped at 60s, defaulting to 10s', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(parseRetryAfterMs(null)).toBe(10_000);
    expect(parseRetryAfterMs('garbage')).toBe(10_000);
    expect(parseRetryAfterMs('5')).toBe(5_000);
    expect(parseRetryAfterMs('600')).toBe(60_000);
    expect(parseRetryAfterMs('0')).toBe(1_000);
    expect(parseRetryAfterMs('Thu, 08 Oct 2026 12:00:20 GMT', now)).toBe(20_000);
  });

  it('backs off for Retry-After, surfaces RATE_LIMITED unmangled, and toasts once per lockout', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: 'slow down' }, 429, { 'Retry-After': '3' })
    );
    const before = Date.now();
    await expect(apiService.makeAuthenticatedRequest('/v1/aps/query')).rejects.toThrow(
      /^RATE_LIMITED/
    );
    // @ts-expect-error - private field
    const until = apiService.rateLimitedUntil as number;
    expect(until - before).toBeGreaterThanOrEqual(2_900);
    expect(until - before).toBeLessThan(10_000);

    // Further requests during the lockout are refused locally, and do not toast again.
    await expect(apiService.makeAuthenticatedRequest('/v1/stations')).rejects.toThrow(
      /RATE_LIMITED/
    );
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });
});

describe('controller-scoped caches', () => {
  it('keys caches by controller', () => {
    apiService.setBaseUrl('https://gw-a.example.com');
    const a = controllerScopedKey('roles');
    apiService.setBaseUrl('https://gw-b.example.com');
    const b = controllerScopedKey('roles');
    expect(a).not.toBe(b);
    expect(a).toContain('gw-a.example.com');
  });

  it('does not serve one controller’s roles for another', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      // Proxy mode routes by header; direct (test) mode by URL. Either identifies the Gateway.
      const controller =
        (init?.headers as Record<string, string>)['X-Controller-URL'] ?? urlOf(input);
      return json([{ id: `role-from-${controller}` }]);
    });
    apiService.setBaseUrl('https://gw-a.example.com');
    const fromA = await apiService.getRoles();
    apiService.setBaseUrl('https://gw-b.example.com');
    const fromB = await apiService.getRoles();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(fromA).not.toEqual(fromB);
  });

  it('clears the TTL cache and burst cache on a controller switch and on logout', async () => {
    cacheService.set(controllerScopedKey('topologies'), [{ id: 't' }], 60_000);
    apiService.setBaseUrl('https://gw-c.example.com');
    expect(cacheService.getStats().size).toBe(0);

    cacheService.set(controllerScopedKey('topologies'), [{ id: 't' }], 60_000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
    await apiService.logout();
    expect(cacheService.getStats().size).toBe(0);
  });
});

describe('controller reads', () => {
  it('sends GETs with cache: no-store and a 20s timeout for the AP query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]));
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await apiService.getAccessPoints();
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(timeoutSpy.mock.calls.some((c) => c[1] === READ_TIMEOUT_MS)).toBe(true);
    expect(READ_TIMEOUT_MS).toBe(20_000);
  });

  it('does not force no-store on writes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
    await apiService.makeAuthenticatedRequest('/v1/services', { method: 'POST', body: '{}' });
    expect((fetchSpy.mock.calls[0][1] as RequestInit).cache).toBeUndefined();
  });

  it('does not stack retries: a failing site-scoped AP fetch makes at most three AP calls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const apCalls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = urlOf(input);
        if (url.includes('/v1/aps/query')) {
          apCalls.push(url);
          return json({ error: 'boom' }, 500);
        }
        return json({ id: 'site-1', name: 'Site One' });
      });
      const pending = apiService.getAccessPointsBySite('site-1');
      const settled = pending.catch((e) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await settled;
      expect(result).toBeInstanceOf(Error);
      expect(apCalls.length).toBeLessThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('in-flight GET deadlines', () => {
  function slowGateway(delayMs: number) {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      calls++;
      return new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(json([{ mac: 'aa' }])), delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    return () => calls;
  }

  it('a caller joining a short-timeout request extends it to its own budget instead of inheriting the abort', async () => {
    vi.useFakeTimers();
    try {
      const callCount = slowGateway(7_400); // measured /v1/stations on the lab Gateway
      const short = apiService.makeAuthenticatedRequest('/v1/stations', { method: 'GET' }, 6_000);
      const long = apiService.makeAuthenticatedRequest('/v1/stations', {}, 30_000);
      await vi.advanceTimersByTimeAsync(8_000);
      const [a, b] = await Promise.all([short, long]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(callCount()).toBe(1); // one Gateway read, not an abort plus a retry
    } finally {
      vi.useRealTimers();
    }
  });

  it('a joining caller never shortens an in-flight deadline', async () => {
    vi.useFakeTimers();
    try {
      slowGateway(7_400);
      const long = apiService.makeAuthenticatedRequest('/v1/stations', {}, 30_000);
      const short = apiService.makeAuthenticatedRequest('/v1/stations', {}, 1_000);
      await vi.advanceTimersByTimeAsync(8_000);
      const [a, b] = await Promise.all([long, short]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
