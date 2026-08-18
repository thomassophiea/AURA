import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnergyOverview, useEnergyAps } from './useEnergyData';

vi.mock('./useGlobalFilters', () => ({
  useGlobalFilters: () => ({ site: 'all', timeRange: '24h', environment: 'all' }),
}));

const getEnergyOverview = vi.fn();
const getEnergyAps = vi.fn();
vi.mock('../services/energyService', () => ({
  getEnergyOverview: (...args: unknown[]) => getEnergyOverview(...args),
  getEnergyAps: (...args: unknown[]) => getEnergyAps(...args),
  getEnergySites: vi.fn(),
  getEnergyRecommendations: vi.fn(),
}));

describe('useEnergyOverview', () => {
  beforeEach(() => {
    getEnergyOverview.mockReset();
    getEnergyAps.mockReset();
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

describe('useEnergyAps', () => {
  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useEnergyAps(false));
    expect(result.current.loading).toBe(false);
    expect(getEnergyAps).not.toHaveBeenCalled();
  });
});
