import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, render, waitFor, act } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiMock = vi.hoisted((): { apiService: any } => ({
  apiService: {
    getSites: vi.fn(),
  },
}));

vi.mock('../services/api', () => apiMock);

beforeEach(() => {
  apiMock.apiService.getSites.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { SiteProvider, useSite, getSiteDisplayName } from './SiteContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SiteProvider>{children}</SiteProvider>
);

describe('useSite', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useSite())).toThrow(/must be used within a SiteProvider/i);
  });

  it('loads the first site on mount', async () => {
    apiMock.apiService.getSites.mockResolvedValue([
      { id: 's-1', siteName: 'HQ' },
      { id: 's-2', siteName: 'EU' },
    ]);
    const { result } = renderHook(() => useSite(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.currentSite?.id).toBe('s-1');
    expect(result.current.error).toBeNull();
  });

  it('sets currentSite=null when sites array is empty', async () => {
    apiMock.apiService.getSites.mockResolvedValue([]);
    const { result } = renderHook(() => useSite(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.currentSite).toBeNull();
  });

  it('exposes a friendly error when getSites rejects', async () => {
    apiMock.apiService.getSites.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSite(), { wrapper });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toMatch(/Failed to load site/i);
  });

  it('refreshSite re-fetches the sites list', async () => {
    apiMock.apiService.getSites
      .mockResolvedValueOnce([{ id: 's-1', siteName: 'HQ' }])
      .mockResolvedValueOnce([{ id: 's-2', siteName: 'EU' }]);
    const { result } = renderHook(() => useSite(), { wrapper });
    await waitFor(() => {
      expect(result.current.currentSite?.id).toBe('s-1');
    });
    await act(async () => {
      await result.current.refreshSite();
    });
    expect(result.current.currentSite?.id).toBe('s-2');
  });
});

describe('getSiteDisplayName', () => {
  it('returns "" for null', () => {
    expect(getSiteDisplayName(null)).toBe('');
  });

  it('prefers displayName over name and siteName', () => {
    expect(
      getSiteDisplayName({
        id: 's-1',
        displayName: 'D',
        name: 'N',
        siteName: 'SN',
      })
    ).toBe('D');
  });

  it('falls back to name when displayName missing', () => {
    expect(getSiteDisplayName({ id: 's-1', name: 'N', siteName: 'SN' })).toBe('N');
  });

  it('falls back to siteName when name + displayName missing', () => {
    expect(getSiteDisplayName({ id: 's-1', siteName: 'SN' })).toBe('SN');
  });

  it('falls back to "Unknown Site" when no name fields are present', () => {
    expect(getSiteDisplayName({ id: 's-1' })).toBe('Unknown Site');
  });
});

describe('SiteProvider', () => {
  it('renders children', () => {
    apiMock.apiService.getSites.mockResolvedValue([]);
    const { container } = render(
      <SiteProvider>
        <div data-testid="child">x</div>
      </SiteProvider>
    );
    expect(container.querySelector('[data-testid="child"]')!.textContent).toBe('x');
  });
});
