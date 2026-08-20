import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getSites = vi.fn();
vi.mock('@/services/api', () => ({
  apiService: {
    getSites: (...args: unknown[]) => getSites(...args),
  },
}));

import { useSiteNames } from './useSiteNames';

describe('useSiteNames', () => {
  beforeEach(() => getSites.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('builds an id -> name map from getSites', async () => {
    getSites.mockResolvedValue([
      { id: 'a1', name: 'PrimarySite' },
      { id: 'b2', name: 'AFC LAB' },
      { id: 'c3', siteName: 'CLONE' },
    ]);
    const { result } = renderHook(() => useSiteNames());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nameById.get('a1')).toBe('PrimarySite');
    expect(result.current.nameById.get('b2')).toBe('AFC LAB');
    expect(result.current.nameById.get('c3')).toBe('CLONE');
  });

  it('yields an empty map for an empty catalog', async () => {
    getSites.mockResolvedValue([]);
    const { result } = renderHook(() => useSiteNames());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nameById.size).toBe(0);
  });

  it('skips entries missing an id or a name', async () => {
    getSites.mockResolvedValue([
      { id: 'a1', name: 'PrimarySite' },
      { name: 'no id' },
      { id: 'no-name' },
    ]);
    const { result } = renderHook(() => useSiteNames());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nameById.size).toBe(1);
    expect(result.current.nameById.get('a1')).toBe('PrimarySite');
  });
});
