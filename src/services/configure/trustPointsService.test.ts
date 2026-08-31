/**
 * Trust point derivation (gateway rule: non-Interface `.crt` entries, named by
 * the file name minus its extension) and the 404-degrades-to-[] listing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiService: { makeAuthenticatedRequest: vi.fn() },
  getDynamicControllerUrl: () => null,
}));

import { apiService } from '../api';
import { extractTrustPoints, trustPointsService } from './trustPointsService';

const mockRequest = apiService.makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('extractTrustPoints', () => {
  it('keeps non-Interface .crt entries, stripping the extension', () => {
    expect(
      extractTrustPoints([
        { use: 'RadSec', cert: 'radsec-ca.crt' },
        { use: 'Trust', cert: 'wba.openroaming.crt' },
      ])
    ).toEqual(['radsec-ca', 'wba.openroaming']);
  });

  it('excludes Interface certs and non-.crt files', () => {
    expect(
      extractTrustPoints([
        { use: 'Interface', cert: 'topaz.crt' },
        { use: 'Trust', cert: 'bundle.pem' },
        { use: 'Trust', cert: 'ca.crt' },
      ])
    ).toEqual(['ca']);
  });

  it('deduplicates and tolerates null/missing fields', () => {
    expect(
      extractTrustPoints([
        { use: 'Trust', cert: 'ca.crt' },
        { use: 'Other', cert: 'ca.crt' },
        { use: 'Trust', cert: null },
        {},
      ])
    ).toEqual(['ca']);
    expect(extractTrustPoints(null)).toEqual([]);
    expect(extractTrustPoints(undefined)).toEqual([]);
  });
});

describe('trustPointsService.list', () => {
  it('GETs /platformmanager/v1/interface/certs and derives the names', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonResponse({ certdata: [{ use: 'Trust', cert: 'radsec-ca.crt' }] })
    );
    await expect(trustPointsService.list()).resolves.toEqual(['radsec-ca']);
    expect(mockRequest).toHaveBeenCalledWith(
      '/platformmanager/v1/interface/certs',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number)
    );
  });

  it('returns [] on an empty certdata envelope (lab-verified shape)', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ certdata: [] }));
    await expect(trustPointsService.list()).resolves.toEqual([]);
  });

  it('degrades a 404 (route absent on older firmware) to []', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    await expect(trustPointsService.list()).resolves.toEqual([]);
  });

  it('propagates non-404 failures', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500));
    await expect(trustPointsService.list()).rejects.toThrow();
  });
});
