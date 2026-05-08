import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiMock = vi.hoisted((): { apiService: any; Site: any } => ({
  apiService: {
    getSites: vi.fn(),
    getSiteById: vi.fn(),
    getStations: vi.fn(),
  },
  Site: undefined,
}));

vi.mock('./api', () => ({
  apiService: apiMock.apiService,
}));

beforeEach(() => {
  apiMock.apiService.getSites.mockReset();
  apiMock.apiService.getSiteById.mockReset();
  apiMock.apiService.getStations.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { siteMappingService } from './siteMapping';

beforeEach(() => {
  // Reset singleton state between tests by clearing internal cache.
  siteMappingService.clearCache();
});

describe('siteMappingService.getSiteName', () => {
  it('returns null for a falsy siteId', async () => {
    expect(await siteMappingService.getSiteName('')).toBeNull();
  });

  it('returns the cached siteName when available', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([
      { id: 's-1', siteName: 'HQ' },
      { id: 's-2', name: 'EU' },
    ]);
    await siteMappingService.refreshCache();
    expect(await siteMappingService.getSiteName('s-1')).toBe('HQ');
    expect(await siteMappingService.getSiteName('s-2')).toBe('EU');
  });

  it('falls back to individual lookup when not in cache', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([]);
    apiMock.apiService.getSiteById.mockResolvedValueOnce({
      id: 'lone-1',
      siteName: 'Lone',
    });
    apiMock.apiService.getStations.mockResolvedValueOnce([]);

    expect(await siteMappingService.getSiteName('lone-1')).toBe('Lone');
  });

  it('falls back to extraction from station data when individual lookup returns null', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([]);
    apiMock.apiService.getSiteById.mockResolvedValueOnce(null);
    apiMock.apiService.getStations.mockResolvedValueOnce([
      { siteId: 'extract-1', siteName: 'Extracted Site' },
    ]);

    expect(await siteMappingService.getSiteName('extract-1')).toBe('Extracted Site');
  });

  it('returns the "Site <SHORT-ID>" fallback when all lookups fail', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([]);
    apiMock.apiService.getSiteById.mockResolvedValueOnce(null);
    apiMock.apiService.getStations.mockResolvedValueOnce([]);

    const out = await siteMappingService.getSiteName('abcdef12-rest-of-uuid');
    expect(out).toBe('Site ABCDEF12');
  });
});

describe('siteMappingService.getSite', () => {
  it('returns null for falsy siteId', async () => {
    expect(await siteMappingService.getSite('')).toBeNull();
  });

  it('returns null when nothing is in cache and the load returns nothing', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([]);
    expect(await siteMappingService.getSite('does-not-exist')).toBeNull();
  });

  it('returns the cached Site after a load', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([{ id: 's-1', name: 'HQ' }]);
    await siteMappingService.refreshCache();
    const out = await siteMappingService.getSite('s-1');
    expect(out?.name).toBe('HQ');
  });
});

describe('siteMappingService.getAllSites + cache helpers', () => {
  it('getAllSites returns the current cache snapshot', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([
      { id: 's-1', name: 'HQ' },
      { id: 's-2', name: 'EU' },
    ]);
    await siteMappingService.refreshCache();
    expect(siteMappingService.getAllSites().map((s) => s.id)).toEqual(['s-1', 's-2']);
  });

  it('clearCache empties the store and zeroes counters', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([{ id: 's-1', name: 'HQ' }]);
    await siteMappingService.refreshCache();
    siteMappingService.clearCache();
    expect(siteMappingService.getAllSites()).toEqual([]);
    const status = siteMappingService.getCacheStatus();
    expect(status.size).toBe(0);
    expect(status.lastLoadTime).toBe(0);
    expect(status.loadAttempts).toBe(0);
  });

  it('getCacheStatus reports isStale=true when no load has happened', () => {
    siteMappingService.clearCache();
    const status = siteMappingService.getCacheStatus();
    expect(status.isStale).toBe(true);
    expect(status.maxAttempts).toBeGreaterThan(0);
  });
});

describe('siteMappingService caches across calls', () => {
  it('does not refetch when cache is fresh and populated', async () => {
    apiMock.apiService.getSites.mockResolvedValueOnce([{ id: 's-1', name: 'HQ' }]);
    await siteMappingService.refreshCache();
    apiMock.apiService.getSites.mockClear();
    await siteMappingService.getSiteName('s-1');
    expect(apiMock.apiService.getSites).not.toHaveBeenCalled();
  });
});
