/**
 * Hook for per-site-group settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { siteGroupSettingsService } from '../services/siteGroupSettingsService';
import type { SiteGroupSettings } from '../types/siteGroupSettings';
import { DEFAULT_SITE_GROUP_SETTINGS } from '../types/siteGroupSettings';

export function useSiteGroupSettings(siteGroupId: string | undefined) {
  const [settings, setSettings] = useState<SiteGroupSettings>(DEFAULT_SITE_GROUP_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!siteGroupId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await siteGroupSettingsService.getSettings(siteGroupId);
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [siteGroupId]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateSettings = useCallback(
    async (updates: Partial<SiteGroupSettings>) => {
      if (!siteGroupId) return;
      const updated = await siteGroupSettingsService.updateSettings(siteGroupId, updates);
      setSettings(updated);
      return updated;
    },
    [siteGroupId]
  );

  return { settings, loading, error, updateSettings, refresh };
}
