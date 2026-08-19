import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useEnergyOverview,
  useEnergyAps,
  useEnergySites,
  useLightAwareSummary,
  useLightAwareAps,
  useLightAwarePolicy,
} from './useEnergyData';

vi.mock('./useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filters: { site: 'all', timeRange: '24h', environment: 'all' },
    updateFilter: () => {},
    updateFilters: () => {},
    resetFilters: () => {},
    resetFilter: () => {},
    hasActiveFilters: false,
  }),
}));

const getEnergyOverview = vi.fn();
const getEnergyAps = vi.fn();
const getEnergySites = vi.fn();
const getLightAwareSummary = vi.fn();
const getLightAwareAps = vi.fn();
const getLightAwareObserved = vi.fn();
const getLightAwarePolicy = vi.fn();
const putLightAwarePolicy = vi.fn();
vi.mock('../services/energyService', () => ({
  getEnergyOverview: (...args: unknown[]) => getEnergyOverview(...args),
  getEnergyAps: (...args: unknown[]) => getEnergyAps(...args),
  getEnergySites: (...args: unknown[]) => getEnergySites(...args),
  getEnergyRecommendations: vi.fn(),
  getLightAwareSummary: (...args: unknown[]) => getLightAwareSummary(...args),
  getLightAwareAps: (...args: unknown[]) => getLightAwareAps(...args),
  getLightAwareObserved: (...args: unknown[]) => getLightAwareObserved(...args),
  getLightAwarePolicy: (...args: unknown[]) => getLightAwarePolicy(...args),
  putLightAwarePolicy: (...args: unknown[]) => putLightAwarePolicy(...args),
}));

describe('useEnergyOverview', () => {
  beforeEach(() => {
    getEnergyOverview.mockReset();
    getEnergyAps.mockReset();
    getEnergySites.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('loads and exposes data', async () => {
    getEnergyOverview.mockResolvedValue({ apWithDataCount: 5 });
    const { result } = renderHook(() => useEnergyOverview());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ apWithDataCount: 5 });
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message on rejection', async () => {
    getEnergyOverview.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEnergyOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });
});

describe('useEnergySites', () => {
  it('unwraps the sites envelope', async () => {
    getEnergySites.mockResolvedValue({ sites: [{ siteId: 's1' }] });
    const { result } = renderHook(() => useEnergySites());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ siteId: 's1' }]);
    expect(result.current.error).toBeNull();
  });
});

describe('useEnergyAps', () => {
  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useEnergyAps(false));
    expect(result.current.loading).toBe(false);
    expect(getEnergyAps).not.toHaveBeenCalled();
  });
});

describe('useLightAwareSummary', () => {
  beforeEach(() => getLightAwareSummary.mockReset());
  it('loads the summary', async () => {
    getLightAwareSummary.mockResolvedValue({
      sensorCapableCount: 4,
      reportingCount: 6,
      stateBreakdown: { bright: 2, dim: 1, dark: 1, unknown: 2 },
      policyEnabled: true,
      projectedAnnual: { kwh: 100, cost: 14 },
      currency: 'USD',
      currencySymbol: '$',
    });
    const { result } = renderHook(() => useLightAwareSummary());
    await waitFor(() => expect(result.current.data?.sensorCapableCount).toBe(4));
  });
});

describe('useLightAwareAps', () => {
  beforeEach(() => getLightAwareAps.mockReset());
  it('does not fetch when disabled', () => {
    const { result } = renderHook(() => useLightAwareAps(false));
    expect(result.current.loading).toBe(false);
    expect(getLightAwareAps).not.toHaveBeenCalled();
  });

  it('unwraps the aps envelope when enabled', async () => {
    getLightAwareAps.mockResolvedValue({ aps: [{ serial: 'A' }] });
    const { result } = renderHook(() => useLightAwareAps(true));
    await waitFor(() => expect(result.current.data).toEqual([{ serial: 'A' }]));
  });
});

describe('useLightAwarePolicy', () => {
  beforeEach(() => {
    getLightAwarePolicy.mockReset();
    putLightAwarePolicy.mockReset();
  });
  it('loads the policy and saves through the service', async () => {
    // Initial load returns disabled; the post-save reconcile GET returns the saved state.
    getLightAwarePolicy
      .mockResolvedValueOnce({ enabled: false, policy: {} })
      .mockResolvedValue({ enabled: true, policy: { dark: { actions: [] } } });
    putLightAwarePolicy.mockResolvedValue({ enabled: true, policy: { dark: { actions: [] } } });
    const { result } = renderHook(() => useLightAwarePolicy());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.enabled).toBe(false);
    await result.current.save({ enabled: true, policy: { dark: { actions: [] } } });
    await waitFor(() => expect(result.current.data?.enabled).toBe(true));
    expect(putLightAwarePolicy).toHaveBeenCalled();
  });
});
