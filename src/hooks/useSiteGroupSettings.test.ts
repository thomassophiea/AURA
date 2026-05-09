import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sgsMock = vi.hoisted((): { siteGroupSettingsService: any } => ({
  siteGroupSettingsService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../services/siteGroupSettingsService', () => sgsMock);

beforeEach(() => {
  sgsMock.siteGroupSettingsService.getSettings.mockReset();
  sgsMock.siteGroupSettingsService.updateSettings.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { useSiteGroupSettings } from './useSiteGroupSettings';
import { DEFAULT_SITE_GROUP_SETTINGS } from '../types/siteGroupSettings';

describe('useSiteGroupSettings', () => {
  it('initial state: defaults, not loading, no error (when no siteGroupId)', () => {
    const { result } = renderHook(() => useSiteGroupSettings(undefined));
    expect(result.current.settings).toEqual(DEFAULT_SITE_GROUP_SETTINGS);
    expect(result.current.error).toBeNull();
    expect(sgsMock.siteGroupSettingsService.getSettings).not.toHaveBeenCalled();
  });

  it('loads settings when a siteGroupId is provided', async () => {
    const fetched = {
      ...DEFAULT_SITE_GROUP_SETTINGS,
      connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, timeout_ms: 99000 },
    };
    sgsMock.siteGroupSettingsService.getSettings.mockResolvedValue(fetched);

    const { result } = renderHook(() => useSiteGroupSettings('sg-1'));
    await waitFor(() => {
      expect(result.current.settings.connection.timeout_ms).toBe(99000);
    });
    expect(sgsMock.siteGroupSettingsService.getSettings).toHaveBeenCalledWith('sg-1');
    expect(result.current.error).toBeNull();
  });

  it('captures error from getSettings (Error instance)', async () => {
    sgsMock.siteGroupSettingsService.getSettings.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useSiteGroupSettings('sg-1'));
    await waitFor(() => {
      expect(result.current.error).toBe('network down');
    });
  });

  it('uses fallback message for non-Error throws', async () => {
    sgsMock.siteGroupSettingsService.getSettings.mockRejectedValue('string err');

    const { result } = renderHook(() => useSiteGroupSettings('sg-1'));
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load settings');
    });
  });

  it('updateSettings() persists + updates local state', async () => {
    sgsMock.siteGroupSettingsService.getSettings.mockResolvedValue(DEFAULT_SITE_GROUP_SETTINGS);
    const next = {
      ...DEFAULT_SITE_GROUP_SETTINGS,
      deployment: { ...DEFAULT_SITE_GROUP_SETTINGS.deployment, auto_deploy: true },
    };
    sgsMock.siteGroupSettingsService.updateSettings.mockResolvedValue(next);

    const { result } = renderHook(() => useSiteGroupSettings('sg-1'));
    await waitFor(() => {
      expect(result.current.settings).toEqual(DEFAULT_SITE_GROUP_SETTINGS);
    });

    let returned;
    await act(async () => {
      returned = await result.current.updateSettings({
        deployment: {
          ...DEFAULT_SITE_GROUP_SETTINGS.deployment,
          auto_deploy: true,
        },
      });
    });
    expect(returned).toEqual(next);
    expect(result.current.settings).toEqual(next);
  });

  it('updateSettings() is a no-op when siteGroupId is undefined', async () => {
    const { result } = renderHook(() => useSiteGroupSettings(undefined));
    await act(async () => {
      const out = await result.current.updateSettings({
        deployment: {
          ...DEFAULT_SITE_GROUP_SETTINGS.deployment,
          auto_deploy: true,
        },
      });
      expect(out).toBeUndefined();
    });
    expect(sgsMock.siteGroupSettingsService.updateSettings).not.toHaveBeenCalled();
  });

  it('refresh() re-fetches the settings', async () => {
    sgsMock.siteGroupSettingsService.getSettings
      .mockResolvedValueOnce({
        ...DEFAULT_SITE_GROUP_SETTINGS,
        connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, timeout_ms: 1 },
      })
      .mockResolvedValueOnce({
        ...DEFAULT_SITE_GROUP_SETTINGS,
        connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, timeout_ms: 2 },
      });

    const { result } = renderHook(() => useSiteGroupSettings('sg-1'));
    await waitFor(() => {
      expect(result.current.settings.connection.timeout_ms).toBe(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.settings.connection.timeout_ms).toBe(2);
  });
});
