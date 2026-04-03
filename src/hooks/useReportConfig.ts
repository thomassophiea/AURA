/**
 * Report Configuration State Hook
 *
 * Manages the active report configuration with localStorage persistence.
 * Provides CRUD operations for configs, pages, and widgets.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ReportConfig, ReportPageConfig, ReportWidgetConfig, ReportConfigStore } from '../types/reportConfig';
import { DEFAULT_REPORT_CONFIG } from '../config/defaultReportConfig';
import {
  loadReportConfigs,
  saveReportConfigs,
  exportConfigAsJSON,
  importConfigFromJSON,
  generateSharePayload,
  type ShareSnapshot,
} from '../services/reportConfigPersistence';

export function useReportConfig() {
  const [store, setStore] = useState<ReportConfigStore>(() => loadReportConfigs());
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const persist = useCallback((newStore: ReportConfigStore) => {
    setStore(newStore);
    saveReportConfigs(newStore);
  }, []);

  // ── Derived State ──

  const configs = store.configs;
  const activeConfig = useMemo(
    () => configs.find(c => c.id === store.activeConfigId) || configs[0],
    [configs, store.activeConfigId]
  );

  const activePage = useMemo(() => {
    if (activePageId) {
      const found = activeConfig.pages.find(p => p.id === activePageId);
      if (found) return found;
    }
    return activeConfig.pages[0] || null;
  }, [activeConfig, activePageId]);

  // ── Config CRUD ──

  const setActiveConfig = useCallback((id: string) => {
    persist({ ...store, activeConfigId: id });
    setActivePageId(null);
  }, [store, persist]);

  const createConfig = useCallback((name: string, description?: string): ReportConfig => {
    const config: ReportConfig = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duration: '24H',
      pages: [],
    };
    persist({ ...store, configs: [...store.configs, config], activeConfigId: config.id });
    return config;
  }, [store, persist]);

  const duplicateConfig = useCallback((id: string): ReportConfig | null => {
    const src = configs.find(c => c.id === id);
    if (!src) return null;
    const dup: ReportConfig = {
      ...JSON.parse(JSON.stringify(src)),
      id: crypto.randomUUID(),
      name: `${src.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: false,
    };
    persist({ ...store, configs: [...store.configs, dup], activeConfigId: dup.id });
    return dup;
  }, [store, configs, persist]);

  const deleteConfig = useCallback((id: string) => {
    if (id === 'default') return; // Can't delete default
    const remaining = configs.filter(c => c.id !== id);
    const newActive = store.activeConfigId === id ? remaining[0]?.id || 'default' : store.activeConfigId;
    persist({ ...store, configs: remaining, activeConfigId: newActive });
  }, [store, configs, persist]);

  const updateConfig = useCallback((id: string, updates: Partial<Pick<ReportConfig, 'name' | 'description' | 'duration'>>) => {
    const updated = configs.map(c =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    persist({ ...store, configs: updated });
  }, [store, configs, persist]);

  // ── Page CRUD ──

  const setActivePage = useCallback((pageId: string) => {
    setActivePageId(pageId);
  }, []);

  const addPage = useCallback((title: string, description?: string): ReportPageConfig => {
    const page: ReportPageConfig = {
      id: crypto.randomUUID(),
      title,
      description,
      widgets: [],
    };
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? { ...c, pages: [...c.pages, page], updatedAt: Date.now() }
        : c
    );
    persist({ ...store, configs: updated });
    setActivePageId(page.id);
    return page;
  }, [store, configs, activeConfig, persist]);

  const removePage = useCallback((pageId: string) => {
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? { ...c, pages: c.pages.filter(p => p.id !== pageId), updatedAt: Date.now() }
        : c
    );
    persist({ ...store, configs: updated });
    if (activePageId === pageId) setActivePageId(null);
  }, [store, configs, activeConfig, activePageId, persist]);

  const updatePage = useCallback((pageId: string, updates: Partial<Pick<ReportPageConfig, 'title' | 'description' | 'icon' | 'visible'>>) => {
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? {
          ...c,
          pages: c.pages.map(p => p.id === pageId ? { ...p, ...updates } : p),
          updatedAt: Date.now(),
        }
        : c
    );
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    const updated = configs.map(c => {
      if (c.id !== activeConfig.id) return c;
      const pages = [...c.pages];
      const [moved] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, moved);
      return { ...c, pages, updatedAt: Date.now() };
    });
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  // ── Widget CRUD ──

  const addWidget = useCallback((pageId: string, widget: ReportWidgetConfig) => {
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? {
          ...c,
          pages: c.pages.map(p =>
            p.id === pageId ? { ...p, widgets: [...p.widgets, widget] } : p
          ),
          updatedAt: Date.now(),
        }
        : c
    );
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  const removeWidget = useCallback((pageId: string, widgetId: string) => {
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? {
          ...c,
          pages: c.pages.map(p =>
            p.id === pageId ? { ...p, widgets: p.widgets.filter(w => w.id !== widgetId) } : p
          ),
          updatedAt: Date.now(),
        }
        : c
    );
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  const reorderWidgets = useCallback((pageId: string, fromIndex: number, toIndex: number) => {
    const updated = configs.map(c => {
      if (c.id !== activeConfig.id) return c;
      return {
        ...c,
        pages: c.pages.map(p => {
          if (p.id !== pageId) return p;
          const widgets = [...p.widgets];
          const [moved] = widgets.splice(fromIndex, 1);
          widgets.splice(toIndex, 0, moved);
          return { ...p, widgets };
        }),
        updatedAt: Date.now(),
      };
    });
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  const updateWidget = useCallback((pageId: string, widgetId: string, updates: Partial<ReportWidgetConfig>) => {
    const updated = configs.map(c =>
      c.id === activeConfig.id
        ? {
          ...c,
          pages: c.pages.map(p =>
            p.id === pageId
              ? { ...p, widgets: p.widgets.map(w => w.id === widgetId ? { ...w, ...updates } : w) }
              : p
          ),
          updatedAt: Date.now(),
        }
        : c
    );
    persist({ ...store, configs: updated });
  }, [store, configs, activeConfig, persist]);

  // ── Templates & Import/Export ──

  const resetToDefault = useCallback(() => {
    const def = { ...DEFAULT_REPORT_CONFIG, createdAt: Date.now(), updatedAt: Date.now() };
    const updated = configs.map(c => c.id === 'default' ? def : c);
    persist({ ...store, configs: updated, activeConfigId: 'default' });
    setActivePageId(null);
  }, [store, configs, persist]);

  const exportActiveConfig = useCallback((): string => {
    return exportConfigAsJSON(activeConfig);
  }, [activeConfig]);

  const importConfig = useCallback((json: string): ReportConfig | null => {
    const config = importConfigFromJSON(json);
    if (!config) return null;
    persist({ ...store, configs: [...store.configs, config], activeConfigId: config.id });
    return config;
  }, [store, persist]);

  const getShareURL = useCallback((snapshot?: ShareSnapshot): string => {
    const payload = generateSharePayload(activeConfig, snapshot);
    return `${window.location.origin}${window.location.pathname}#/report/${payload}`;
  }, [activeConfig]);

  return {
    // State
    configs,
    activeConfig,
    activePage,

    // Config CRUD
    setActiveConfig,
    createConfig,
    duplicateConfig,
    deleteConfig,
    updateConfig,

    // Page CRUD
    setActivePage,
    addPage,
    removePage,
    updatePage,
    reorderPages,

    // Widget CRUD
    addWidget,
    removeWidget,
    reorderWidgets,
    updateWidget,

    // Templates & Import/Export
    resetToDefault,
    exportActiveConfig,
    importConfig,
    getShareURL,
  };
}
