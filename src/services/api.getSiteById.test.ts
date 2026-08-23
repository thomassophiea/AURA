import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// localStorage must exist before the apiService singleton is constructed.
vi.hoisted(() => {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => Object.keys(store).forEach((k) => delete store[k]),
    },
    writable: true,
    configurable: true,
  });
});

import { apiService } from './api';

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiService.getSiteById — single-site lookup guard', () => {
  beforeEach(() => {
    // No sites in the controller list, forcing the /v3/sites/{id} fallback path.
    vi.spyOn(apiService, 'getSites').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT hit /v3/sites/{id} for an XIQ composite key (would 422)', async () => {
    const req = vi.spyOn(apiService, 'makeAuthenticatedRequest').mockResolvedValue(okJson({}));

    const result = await apiService.getSiteById('xiq:default-southeast:2159213203796321');

    expect(result).toBeNull();
    expect(req).not.toHaveBeenCalled();
  });

  it('does NOT hit /v3/sites/{id} for a system-site sentinel key', async () => {
    const req = vi.spyOn(apiService, 'makeAuthenticatedRequest').mockResolvedValue(okJson({}));

    // A `:__default__` suffix (XIQ_DEFAULT_LOCATION_ID) marks a Default-Site key.
    await apiService.getSiteById('default-southeast:__default__');

    expect(req).not.toHaveBeenCalled();
  });

  it('still performs the /v3/sites/{id} lookup for a real controller site id', async () => {
    const req = vi
      .spyOn(apiService, 'makeAuthenticatedRequest')
      .mockResolvedValue(okJson({ id: 'site-123', name: 'Real Site' }));

    const result = await apiService.getSiteById('site-123');

    expect(req).toHaveBeenCalledWith('/v3/sites/site-123', {}, 5000);
    expect(result).toMatchObject({ name: 'Real Site' });
  });
});
