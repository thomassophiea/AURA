import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  apiService: {
    createService: vi.fn(),
    getSites: vi.fn().mockResolvedValue([]),
    getRoles: vi.fn().mockResolvedValue([]),
  },
}));

// Import after mock
const { WLANAssignmentService } = await import('../../services/wlanAssignment');
const { apiService } = await import('../../services/api');

describe('WLANAssignmentService.createWLANUnassigned', () => {
  let service: InstanceType<typeof WLANAssignmentService>;

  beforeEach(() => {
    service = new WLANAssignmentService();
    vi.clearAllMocks();
  });

  it('calls createService once and returns without assignment', async () => {
    vi.mocked(apiService.createService).mockResolvedValue({ id: 'svc-123', ssid: 'TestNet' });

    const result = await service.createWLANUnassigned({
      ssid: 'TestNet',
      security: 'wpa2-psk',
      band: 'dual',
      enabled: true,
      sites: [],
    });

    expect(apiService.createService).toHaveBeenCalledOnce();
    expect(result.serviceId).toBe('svc-123');
    expect(result.sitesProcessed).toBe(0);
    expect(result.profilesAssigned).toBe(0);
    expect(result.assignments).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns success: false and captures error message on failure', async () => {
    vi.mocked(apiService.createService).mockRejectedValue(new Error('Network timeout'));

    const result = await service.createWLANUnassigned({
      ssid: 'TestNet',
      security: 'wpa2-psk',
      band: 'dual',
      enabled: true,
      sites: [],
    });

    expect(result.success).toBe(false);
    expect(result.serviceId).toBe('');
    expect(result.errors).toContain('Network timeout');
  });
});
