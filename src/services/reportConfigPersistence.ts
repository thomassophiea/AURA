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

export function generateSharePayload(config: ReportConfig): string {
  const minimal = {
    ...config,
    id: 'shared-' + Date.now(),
    isDefault: false,
  };
  return btoa(JSON.stringify(minimal));
}

export function parseSharePayload(payload: string): ReportConfig | null {
  try {
    const config = JSON.parse(atob(payload)) as ReportConfig;
    if (!config.name || !Array.isArray(config.pages)) return null;
    return config;
  } catch {
    return null;
  }
}
