/**
 * availabilityService tests — wire paths and the cached isPaired() gate the
 * VLAN editor's Peer Address block depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiService: { makeAuthenticatedRequest: vi.fn() },
  getDynamicControllerUrl: () => null,
}));

import { apiService } from '../api';
import { invalidatePairedCache, isPaired } from './availabilityService';

const mockRequest = apiService.makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PAIRED = {
  availabilityEnabled: true,
  availabilityRole: 'PRIMARY',
  availabilityPairAddr: '192.168.100.13',
  balanceAps: true,
  secureConnection: false,
  staticMtu: 1500,
};

beforeEach(() => {
  mockRequest.mockReset();
  invalidatePairedCache();
});

describe('isPaired', () => {
  it('GETs /platformmanager/v1/availability and derives availabilityEnabled === true', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(PAIRED));
    await expect(isPaired()).resolves.toBe(true);
    expect(mockRequest.mock.calls[0][0]).toBe('/platformmanager/v1/availability');
  });

  it('caches the probe: two callers, one request', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(PAIRED));
    const [a, b] = await Promise.all([isPaired(), isPaired()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('returns false for an unpaired appliance', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ ...PAIRED, availabilityEnabled: false }));
    await expect(isPaired()).resolves.toBe(false);
  });

  it('resolves false on failure without poisoning the cache', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'));
    await expect(isPaired()).resolves.toBe(false);
    mockRequest.mockResolvedValueOnce(jsonResponse(PAIRED));
    await expect(isPaired()).resolves.toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('invalidatePairedCache forces a fresh probe (post-save)', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(PAIRED));
    await expect(isPaired()).resolves.toBe(true);
    invalidatePairedCache();
    mockRequest.mockResolvedValueOnce(jsonResponse({ ...PAIRED, availabilityEnabled: false }));
    await expect(isPaired()).resolves.toBe(false);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});
