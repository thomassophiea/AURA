import { describe, it, expect, vi } from 'vitest';
import { fetchXcc } from './xccClient.js';

describe('fetchXcc', () => {
  it('fetches and returns JSON on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', vlanid: 10 }],
    });
    const result = await fetchXcc('/v1/topologies', {
      authToken: 'Bearer tok',
      controllerUrl: 'https://ctrl.local',
      fetchFn: mockFetch,
    });
    expect(result).toEqual([{ id: '1', vlanid: 10 }]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ctrl.local/api/management/v1/topologies',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('throws with status code on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      statusText: 'Unauthorized',
    });
    await expect(
      fetchXcc('/v1/topologies', {
        authToken: 'Bearer bad',
        controllerUrl: 'https://ctrl.local',
        fetchFn: mockFetch,
      })
    ).rejects.toThrow('401');
  });
});
