/**
 * Site Group Settings Service
 *
 * Reads/writes settings via the controllers table's settings JSON column.
 */

import { supabase } from './supabaseClient';
import type { SiteGroupSettings } from '../types/siteGroupSettings';
import { DEFAULT_SITE_GROUP_SETTINGS } from '../types/siteGroupSettings';

const STORAGE_PREFIX = 'sg_settings:';

class SiteGroupSettingsService {
  async getSettings(siteGroupId: string): Promise<SiteGroupSettings> {
    try {
      const { data, error } = await supabase
        .from('controllers')
        .select('settings')
        .eq('id', siteGroupId)
        .single();

      if (error) throw error;

      const raw = (data?.settings as Record<string, unknown>) ?? {};
      const sgSettings = (raw.site_group_settings ?? {}) as Partial<SiteGroupSettings>;

      const merged = this._mergeWithDefaults(sgSettings);
      this._cache(siteGroupId, merged);
      return merged;
    } catch (err) {
      console.warn('[SGSettings] Supabase fetch failed, trying cache:', err);
      return this._getCached(siteGroupId);
    }
  }

  async updateSettings(
    siteGroupId: string,
    updates: Partial<SiteGroupSettings>
  ): Promise<SiteGroupSettings> {
    // Read current full settings from the controller row
    const { data: currentData } = await supabase
      .from('controllers')
      .select('settings')
      .eq('id', siteGroupId)
      .single();

    const currentRaw = (currentData?.settings as Record<string, unknown>) ?? {};
    const currentSgSettings = (currentRaw.site_group_settings ?? {}) as Partial<SiteGroupSettings>;

    // Deep merge updates
    const merged: SiteGroupSettings = {
      connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, ...currentSgSettings.connection, ...updates.connection },
      deployment: { ...DEFAULT_SITE_GROUP_SETTINGS.deployment, ...currentSgSettings.deployment, ...updates.deployment },
      custom: { ...currentSgSettings.custom, ...updates.custom },
    };

    // Write back
    const newRaw = { ...currentRaw, site_group_settings: merged };
    const { error } = await supabase
      .from('controllers')
      .update({ settings: newRaw })
      .eq('id', siteGroupId);

    if (error) throw new Error(error.message);

    this._cache(siteGroupId, merged);
    return merged;
  }

  private _mergeWithDefaults(partial: Partial<SiteGroupSettings>): SiteGroupSettings {
    return {
      connection: { ...DEFAULT_SITE_GROUP_SETTINGS.connection, ...partial.connection },
      deployment: { ...DEFAULT_SITE_GROUP_SETTINGS.deployment, ...partial.deployment },
      custom: { ...DEFAULT_SITE_GROUP_SETTINGS.custom, ...partial.custom },
    };
  }

  private _cache(siteGroupId: string, settings: SiteGroupSettings) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${siteGroupId}`, JSON.stringify(settings));
    } catch { /* ignore */ }
  }

  private _getCached(siteGroupId: string): SiteGroupSettings {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${siteGroupId}`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { ...DEFAULT_SITE_GROUP_SETTINGS };
  }
}

export const siteGroupSettingsService = new SiteGroupSettingsService();
