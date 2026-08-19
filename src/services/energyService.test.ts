import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEnergyOverview,
  putEnergyPreferences,
  getLightAwareSummary,
  putLightAwarePolicy,
} from './energyService';

vi.mock('./monitoringHistory', () => ({
  buildMonitoringHeaders: () => ({ Authorization: 'Bearer t', Accept: 'application/json' }),
}));

describe('energyService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('GET overview builds a start/end query from the time-range token and omits site=all', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ apWithDataCount: 3 }),
    });
    const res = await getEnergyOverview({ site: 'all', timeRange: '24h' });
    expect(res.apWithDataCount).toBe(3);
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/energy/overview?');
    expect(url).toContain('start=');
    expect(url).toContain('end=');
    expect(url).not.toContain('siteId=all');
  });

  it('includes siteId when a concrete site is selected', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await getEnergyOverview({ site: 'site-42', timeRange: '24h' });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('siteId=site-42');
  });

  it('throws on a non-ok response', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad range' }),
    });
    await expect(getEnergyOverview({ site: 'all', timeRange: '24h' })).rejects.toThrow('bad range');
  });

  it('PUT preferences posts a JSON body', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ currencyCode: 'EUR', currencySymbol: '€', ratePerKwh: 0.31 }),
    });
    const res = await putEnergyPreferences({ currencyCode: 'EUR', ratePerKwh: 0.31 });
    expect(res.currencySymbol).toBe('€');
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ currencyCode: 'EUR', ratePerKwh: 0.31 });
  });

  it('GET light-aware summary hits the summary endpoint with window params', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sensorCapableCount: 1 }),
    });
    const res = await getLightAwareSummary({ site: 'all', timeRange: '24h' });
    expect(res.sensorCapableCount).toBe(1);
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/energy/light-aware/summary');
    expect(url).toContain('start=');
    expect(url).toContain('end=');
  });

  it('PUT light-aware policy posts a JSON body', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, policy: {} }),
    });
    const res = await putLightAwarePolicy({ enabled: true, policy: {}, siteId: 'site-9' });
    expect(res.enabled).toBe(true);
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/api/energy/light-aware/policy');
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body)).toEqual({ enabled: true, policy: {}, siteId: 'site-9' });
  });
});
