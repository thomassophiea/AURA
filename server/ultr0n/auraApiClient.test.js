import { describe, it, expect, vi } from 'vitest';
import { executeApiPlan } from './auraApiClient.js';

describe('executeApiPlan', () => {
  it('returns results keyed by label', async () => {
    const plan = [{ method: 'GET', path: '/v1/stations', label: '/v1/stations', disruptive: false }];
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const results = await executeApiPlan(plan, {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(results['/v1/stations']).toBeDefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('records failed calls in missingData', async () => {
    const plan = [{ method: 'GET', path: '/v1/stations/bad', label: '/v1/stations/{mac}', disruptive: false }];
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });
    const results = await executeApiPlan(plan, {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(results.__missingData__).toContain('/v1/stations/{mac}');
  });

  it('skips disruptive calls', async () => {
    const plan = [{ method: 'PUT', path: '/v1/aps/AP1/reboot', label: '/v1/aps/{sn}/reboot', disruptive: true }];
    const mockFetch = vi.fn();
    await executeApiPlan(plan, { authToken: 'Bearer tok', controllerUrl: 'https://ctrl.local', fetchFn: mockFetch });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
