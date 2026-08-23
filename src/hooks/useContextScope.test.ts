import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useContextScope } from './useContextScope';

// filters.site is driven by the global filter. It can be a plain Campus
// Controller site id, the sentinel 'all', an XIQ composite key
// (`xiq:<siteGroupId>:<locationId>`), or a system-site key. Only a plain
// controller id is a valid argument to GET /v3/sites/{id}; the others 422.

const filtersState = vi.hoisted(() => ({ current: { site: 'all', environment: 'all' } }));

vi.mock('./useGlobalFilters', () => ({
  useGlobalFilters: () => ({ filters: filtersState.current, updateFilter: vi.fn() }),
}));

const getSiteById = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({
  apiService: { getSiteById },
}));

describe('useContextScope — site label resolution', () => {
  beforeEach(() => {
    getSiteById.mockReset();
    getSiteById.mockResolvedValue({ name: 'Real Site' });
  });

  it('resolves a plain controller site id via getSiteById', async () => {
    filtersState.current = { site: 'site-123', environment: 'all' };
    renderHook(() => useContextScope());
    await waitFor(() => expect(getSiteById).toHaveBeenCalledWith('site-123'));
  });

  it('does NOT call the controller for an XIQ composite site key (would 422)', async () => {
    filtersState.current = {
      site: 'xiq:default-southeast:2159213203796321',
      environment: 'all',
    };
    const { result } = renderHook(() => useContextScope());
    // Give any effect a chance to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(getSiteById).not.toHaveBeenCalled();
    // Still scoped to the site (label logic unaffected).
    expect(result.current.siteId).toBe('xiq:default-southeast:2159213203796321');
  });
});
