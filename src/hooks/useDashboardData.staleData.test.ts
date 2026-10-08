import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getAccessPointsBySite: vi.fn(),
  makeAuthenticatedRequest: vi.fn(),
  getHistory: vi.fn(),
  advanceLiveTimeWindows: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../services/api', () => ({
  READ_TIMEOUT_MS: 20_000,
  apiService: {
    clearBurstCache: vi.fn(),
    getAccessPointsBySite: mocks.getAccessPointsBySite,
    makeAuthenticatedRequest: mocks.makeAuthenticatedRequest,
    // The estate read goes through the same stubbed transport as /v1/stations,
    // so a scenario that fails stations fails this too.
    fetchEstateStations: async () => {
      const response = await mocks.makeAuthenticatedRequest('/v1/stations', {}, 30000);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      return response.json();
    },
    getServicesBySite: vi.fn().mockResolvedValue([]),
    getSiteById: vi.fn().mockResolvedValue(null),
    getSites: vi.fn().mockResolvedValue([]),
    fetchRFQualityData: vi.fn().mockResolvedValue([]),
    getAPInterfaceStatsWithRF: vi.fn().mockResolvedValue([]),
    getAccessToken: vi.fn().mockReturnValue('t'),
  },
}));

vi.mock('../services/monitoringHistory', () => ({
  monitoringHistory: { getHistory: mocks.getHistory },
  buildMonitoringHeaders: () => ({ Accept: 'application/json', 'X-Controller-URL': 'https://gw' }),
}));

vi.mock('../services/throughput', () => ({
  throughputService: {
    getSnapshotsForRange: vi.fn().mockResolvedValue([]),
    storeSnapshot: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/aiBaselineService', () => ({ recordNetworkMetrics: vi.fn() }));
vi.mock('../services/oui-lookup', () => ({
  getVendor: vi.fn().mockResolvedValue(null),
  getVendorIcon: vi.fn().mockReturnValue(''),
}));

vi.mock('./useSelectedTimeRange', () => ({
  advanceLiveTimeWindows: mocks.advanceLiveTimeWindows,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

import { useDashboardData } from './useDashboardData';
import { resolveTimeRange } from '../lib/timeRange';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const AP = { serialNumber: 'AP-1', status: 'inservice', model: 'AP5020' };
const STATION = { macAddress: 'aa:bb:cc:dd:ee:ff', serviceId: 's1', rssi: -55 };

let summaryFetch: ReturnType<typeof vi.fn>;

function gatewayHealthy() {
  mocks.getAccessPointsBySite.mockResolvedValue([AP]);
  mocks.makeAuthenticatedRequest.mockImplementation(async (endpoint: string) => {
    if (endpoint === '/v1/stations') return json([STATION]);
    return json([]);
  });
}

function gatewayDown() {
  mocks.getAccessPointsBySite.mockRejectedValue(new Error('Unable to connect to the server'));
  mocks.makeAuthenticatedRequest.mockRejectedValue(new Error('Unable to connect to the server'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getHistory.mockResolvedValue({ series: [] });
  summaryFetch = vi.fn().mockResolvedValue(json({}, 404));
  vi.stubGlobal('fetch', summaryFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDashboardData — stale data', () => {
  it('stamps lastUpdate after the primary fetches succeed', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lastUpdate).toBeInstanceOf(Date);
    expect(result.current.loadError).toBeNull();
    expect(result.current.accessPoints).toHaveLength(1);
    expect(result.current.stations).toHaveLength(1);
  });

  it('does not stamp lastUpdate when every fetch failed, and shows no zeros as fresh', async () => {
    gatewayDown();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.lastUpdate).toBeNull();
    expect(result.current.loadError).toMatch(/Could not reach the Gateway/);
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('keeps the previous data and timestamp on screen when a refresh fails', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.lastUpdate).not.toBeNull());
    const stampedAt = result.current.lastUpdate;
    const apStatsBefore = result.current.apStats;

    gatewayDown();
    await act(async () => {
      await result.current.reload(true);
    });

    expect(result.current.lastUpdate).toBe(stampedAt);
    expect(result.current.accessPoints).toHaveLength(1);
    expect(result.current.stations).toHaveLength(1);
    expect(result.current.apStats).toEqual(apStatsBefore);
    expect(result.current.loadError).toBeTruthy();
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('Dashboard refreshed');
  });

  it('flags a partial failure without advancing the timestamp', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.lastUpdate).not.toBeNull());
    const stampedAt = result.current.lastUpdate;

    mocks.makeAuthenticatedRequest.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/v1/stations') throw new Error('SUPPRESSED_ANALYTICS_ERROR: timeout');
      return json([]);
    });
    await act(async () => {
      await result.current.reload(true);
    });

    expect(result.current.lastUpdate).toBe(stampedAt);
    expect(result.current.loadError).toMatch(/clients/);
    expect(result.current.stations).toHaveLength(1);
  });

  it('a deliberate refresh advances a live window and refetches the window aggregates', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.reload(true);
    });

    expect(mocks.advanceLiveTimeWindows).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledTimes(2));
  });

  it('does not move a finished calendar day, but still re-reads its aggregates', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('day-1');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.reload(true);
    });

    expect(mocks.advanceLiveTimeWindows).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.getHistory).toHaveBeenCalledTimes(2));
  });

  it('sends the controller header on the services summary request', async () => {
    gatewayHealthy();
    const range = resolveTimeRange('24h');
    const { result } = renderHook(() => useDashboardData({ range }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const call = summaryFetch.mock.calls.find((c) => String(c[0]).includes('/services/summary'));
    expect(call).toBeTruthy();
    expect((call![1] as RequestInit).headers).toMatchObject({ 'X-Controller-URL': 'https://gw' });
  });
});
