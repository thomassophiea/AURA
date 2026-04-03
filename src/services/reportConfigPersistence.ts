/**
 * Report Configuration Persistence
 *
 * Stores report configurations in localStorage following the same pattern
 * as workspacePersistence.ts. Provides CRUD and import/export.
 */

import type { ReportConfig, ReportConfigStore } from '../types/reportConfig';
import { DEFAULT_REPORT_CONFIG } from '../config/defaultReportConfig';

const STORAGE_KEY = 'aura_report_configs';
const CURRENT_VERSION = 1;

function defaultStore(): ReportConfigStore {
  return {
    version: CURRENT_VERSION,
    configs: [{ ...DEFAULT_REPORT_CONFIG, createdAt: Date.now(), updatedAt: Date.now() }],
    activeConfigId: DEFAULT_REPORT_CONFIG.id,
    lastModified: Date.now(),
  };
}

export function loadReportConfigs(): ReportConfigStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();

    const store = JSON.parse(raw) as ReportConfigStore;
    if (!store.version || !Array.isArray(store.configs) || store.configs.length === 0) {
      return defaultStore();
    }

    // Ensure default config always exists
    if (!store.configs.find(c => c.id === 'default')) {
      store.configs.unshift({ ...DEFAULT_REPORT_CONFIG, createdAt: Date.now(), updatedAt: Date.now() });
    }

    // Ensure activeConfigId points to a valid config
    if (!store.configs.find(c => c.id === store.activeConfigId)) {
      store.activeConfigId = store.configs[0].id;
    }

    return store;
  } catch (error) {
    console.error('[ReportConfig] Failed to load configs:', error);
    return defaultStore();
  }
}

export function saveReportConfigs(store: ReportConfigStore): void {
  try {
    store.lastModified = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('[ReportConfig] Failed to save configs:', error);
  }
}

export function exportConfigAsJSON(config: ReportConfig): string {
  return JSON.stringify(config, null, 2);
}

export function importConfigFromJSON(json: string): ReportConfig | null {
  try {
    const config = JSON.parse(json) as ReportConfig;
    if (!config.id || !config.name || !Array.isArray(config.pages)) {
      return null;
    }
    // Assign new ID to avoid collision
    config.id = crypto.randomUUID();
    config.createdAt = Date.now();
    config.updatedAt = Date.now();
    config.isDefault = false;
    return config;
  } catch {
    return null;
  }
}

export interface ShareSnapshot {
  metrics: any;
  widgetData: Record<string, any>;
  generatedAt: string;
}

export interface SharePayloadV2 {
  v: 2;
  config: ReportConfig;
  snapshot: ShareSnapshot;
}

/** Generate a share payload with embedded data snapshot (no login needed to view) */
export function generateSharePayload(config: ReportConfig, snapshot?: ShareSnapshot): string {
  if (snapshot) {
    const payload: SharePayloadV2 = {
      v: 2,
      config: { ...config, id: 'shared-' + Date.now(), isDefault: false },
      snapshot,
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }
  // Legacy v1: config only (requires login for data)
  const minimal = { ...config, id: 'shared-' + Date.now(), isDefault: false };
  return btoa(JSON.stringify(minimal));
}

export interface ParsedSharePayload {
  config: ReportConfig;
  snapshot: ShareSnapshot | null;
}

export function parseSharePayload(payload: string): ParsedSharePayload | null {
  try {
    let decoded: string;
    try {
      decoded = decodeURIComponent(escape(atob(payload)));
    } catch {
      decoded = atob(payload);
    }
    const parsed = JSON.parse(decoded);

    // V2 format: { v: 2, config, snapshot }
    if (parsed.v === 2 && parsed.config && parsed.snapshot) {
      const config = parsed.config as ReportConfig;
      if (!config.name || !Array.isArray(config.pages)) return null;
      return { config, snapshot: parsed.snapshot };
    }

    // V1 format: just the config (legacy)
    const config = parsed as ReportConfig;
    if (!config.name || !Array.isArray(config.pages)) return null;
    return { config, snapshot: null };
  } catch {
    return null;
  }
}
