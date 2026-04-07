import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    getProfiles: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  },
}));

import { apiService } from './api';

describe('profile API methods', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getProfiles returns array on success', async () => {
    vi.mocked(apiService.getProfiles).mockResolvedValue([
      { id: 'p1', name: 'Site Default', type: 'DEFAULT' },
    ]);
    const result = await apiService.getProfiles();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Site Default');
  });

  it('createProfile sends correct payload', async () => {
    vi.mocked(apiService.createProfile).mockResolvedValue({ id: 'p2', name: 'New' });
    await apiService.createProfile({ name: 'New', type: 'DEVICE' });
    expect(apiService.createProfile).toHaveBeenCalledWith({ name: 'New', type: 'DEVICE' });
  });
});
