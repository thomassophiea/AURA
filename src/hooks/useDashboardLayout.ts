import { useState, useEffect, useCallback } from 'react';

export interface DashboardWidget {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'NetworkHealth', name: 'Network Health', visible: true, locked: true },
  { id: 'ClientStats', name: 'Client Statistics', visible: true },
  { id: 'APStats', name: 'AP Statistics', visible: true },
  { id: 'ApplicationStats', name: 'Application Statistics', visible: true },
  { id: 'SLEOverview', name: 'SLE Overview', visible: true },
  { id: 'TopAPs', name: 'Top Access Points', visible: true },
  { id: 'TopClients', name: 'Top Clients', visible: true },
  { id: 'RecentEvents', name: 'Recent Events', visible: true },
  { id: 'BandDistribution', name: 'Band Distribution', visible: true },
];

const STORAGE_KEY = 'dashboard_layout';

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DashboardWidget[];
        const storedIds = new Set(parsed.map(w => w.id));
        const defaultIds = new Set(DEFAULT_WIDGETS.map(w => w.id));
        
        const merged = parsed.filter(w => defaultIds.has(w.id));
        DEFAULT_WIDGETS.forEach(dw => {
          if (!storedIds.has(dw.id)) {
            merged.push(dw);
          }
        });
        
        return merged.map(w => {
          const defaultWidget = DEFAULT_WIDGETS.find(dw => dw.id === w.id);
          return {
            ...w,
            locked: defaultWidget?.locked ?? false,
            name: defaultWidget?.name ?? w.name,
          };
        });
      }
    } catch (e) {
      console.error('Failed to load dashboard layout:', e);
    }
    return DEFAULT_WIDGETS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch (e) {
      console.error('Failed to save dashboard layout:', e);
    }
  }, [widgets]);

  const moveWidget = useCallback((fromIndex: number, toIndex: number) => {
    setWidgets(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const toggleWidget = useCallback((widgetId: string) => {
    setWidgets(prev =>
      prev.map(w =>
        w.id === widgetId && !w.locked
          ? { ...w, visible: !w.visible }
          : w
      )
    );
  }, []);

  const resetToDefault = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS);
  }, []);

  const visibleWidgets = widgets.filter(w => w.visible);

  return {
    widgets,
    visibleWidgets,
    setWidgets,
    moveWidget,
    toggleWidget,
    resetToDefault,
  };
}
