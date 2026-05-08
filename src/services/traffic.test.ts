import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiMock = vi.hoisted((): { apiService: any } => ({
  apiService: {
    makeAuthenticatedRequest: vi.fn(),
    getStations: vi.fn(),
  },
}));

vi.mock('./api', () => apiMock);

beforeEach(() => {
  apiMock.apiService.makeAuthenticatedRequest.mockReset();
  apiMock.apiService.getStations.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { trafficService } from './traffic';

describe('trafficService.getStationTrafficStats', () => {
  it('returns the parsed JSON when the response is OK', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ macAddress: 'aa:bb:cc:dd:ee:ff', inBytes: 100 }),
    });
    const out = await trafficService.getStationTrafficStats('aa:bb:cc:dd:ee:ff');
    expect(out?.inBytes).toBe(100);
    expect(apiMock.apiService.makeAuthenticatedRequest).toHaveBeenCalledWith(
      '/v1/stations/aa%3Abb%3Acc%3Add%3Aee%3Aff'
    );
  });

  it('returns null and warns on a non-OK response', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    });
    const out = await trafficService.getStationTrafficStats('aa:bb:cc:dd:ee:ff');
    expect(out).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns null on a thrown fetch error', async () => {
    apiMock.apiService.makeAuthenticatedRequest.mockRejectedValueOnce(new Error('boom'));
    const out = await trafficService.getStationTrafficStats('aa:bb:cc:dd:ee:ff');
    expect(out).toBeNull();
  });
});

describe('trafficService.loadTrafficStatisticsForStations', () => {
  it('returns a MAC→stats map populated from the batch query', async () => {
    apiMock.apiService.getStations.mockResolvedValueOnce([
      { macAddress: '11:11:11:11:11:11', inBytes: 100, outBytes: 50 },
      { macAddress: '22:22:22:22:22:22', rxBytes: 250, txBytes: 75, signalStrength: -55 },
    ]);
    const out = await trafficService.loadTrafficStatisticsForStations([
      { macAddress: '11:11:11:11:11:11' },
      { macAddress: '22:22:22:22:22:22' },
    ]);
    expect(out.size).toBe(2);
    expect(out.get('11:11:11:11:11:11')?.inBytes).toBe(100);
    expect(out.get('22:22:22:22:22:22')?.rxBytes).toBe(250);
    expect(out.get('22:22:22:22:22:22')?.signalStrength).toBe(-55);
  });

  it('passes through field projection + pagination', async () => {
    apiMock.apiService.getStations.mockResolvedValueOnce([]);
    await trafficService.loadTrafficStatisticsForStations([], 50, 25);
    expect(apiMock.apiService.getStations).toHaveBeenCalledWith({
      fields: expect.arrayContaining(['macAddress', 'inBytes', 'outBytes']),
      limit: 50,
      offset: 25,
    });
  });

  it('handles in/out/rx/tx aliasing — falls back to alias when primary missing', async () => {
    apiMock.apiService.getStations.mockResolvedValueOnce([
      { macAddress: 'aa:aa:aa:aa:aa:aa', rxBytes: 999 }, // no inBytes
    ]);
    const out = await trafficService.loadTrafficStatisticsForStations([
      { macAddress: 'aa:aa:aa:aa:aa:aa' },
    ]);
    expect(out.get('aa:aa:aa:aa:aa:aa')?.inBytes).toBe(999);
  });

  it('skips stations without a macAddress field', async () => {
    apiMock.apiService.getStations.mockResolvedValueOnce([
      { macAddress: '11:11:11:11:11:11', inBytes: 1 },
      { macAddress: undefined, inBytes: 2 },
    ]);
    const out = await trafficService.loadTrafficStatisticsForStations([
      { macAddress: '11:11:11:11:11:11' },
    ]);
    expect(out.size).toBe(1);
  });

  it('falls back to N+1 individual queries when batch fails', async () => {
    apiMock.apiService.getStations.mockRejectedValueOnce(new Error('batch failed'));
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ macAddress: '11:11:11:11:11:11', inBytes: 5 }),
    });
    const out = await trafficService.loadTrafficStatisticsForStations([
      { macAddress: '11:11:11:11:11:11' },
      { macAddress: '22:22:22:22:22:22' },
    ]);
    expect(out.size).toBeGreaterThanOrEqual(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('fallback drops a station whose individual fetch returns null', async () => {
    apiMock.apiService.getStations.mockRejectedValueOnce(new Error('batch failed'));
    apiMock.apiService.makeAuthenticatedRequest.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    });
    const out = await trafficService.loadTrafficStatisticsForStations([
      { macAddress: '99:99:99:99:99:99' },
    ]);
    expect(out.size).toBe(0);
  });
});
