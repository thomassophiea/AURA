import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiService: {
    getRFManagementProfiles: vi.fn(),
    createRFManagementProfile: vi.fn(),
    updateRFManagementProfile: vi.fn(),
    deleteRFManagementProfile: vi.fn(),
  },
}));

import { apiService } from './api';

describe('RFManagement API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getRFManagementProfiles returns array', async () => {
    vi.mocked(apiService.getRFManagementProfiles).mockResolvedValue([
      { id: 'r1', name: 'Default RRM', type: 'SMARTRF' },
    ]);
    const result = await apiService.getRFManagementProfiles();
    expect(result).toHaveLength(1);
  });

  it('createRFManagementProfile sends payload', async () => {
    const payload = { name: 'Test', type: 'SMARTRF', smartRf: { enabled: true } };
    vi.mocked(apiService.createRFManagementProfile).mockResolvedValue({ id: 'r2', ...payload });
    await apiService.createRFManagementProfile(payload);
    expect(apiService.createRFManagementProfile).toHaveBeenCalledWith(payload);
  });
});
