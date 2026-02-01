/**
 * Workspace state management hook
 *
 * Manages workspace widgets with per-user persistence.
 * Wireless-only focus: AccessPoints, Clients, ClientExperience, AppInsights, ContextualInsights
 * Integrates with existing dashboard API endpoints for real data.
 *
 * Supports SaveWidgetToWorkspace feature: users can save any insight widget
 * from across the dashboard to their personal Workspace.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSavedWidgets,
  hydrateWidgetFromReference,
  removeWidgetFromWorkspace as removeSavedWidget,
  type PersistedWidgetReference,
} from '@/services/workspacePersistence';

// Wireless-only topics
export type WorkspaceTopic = 'AccessPoints' | 'Clients' | 'ClientExperience' | 'AppInsights' | 'ContextualInsights';

// Widget types supported by the catalog
export type WidgetType = 'kpi_tile_group' | 'timeseries_with_brush' | 'timeseries_multi_metric' | 'topn_table' | 'timeline_feed';

// Workspace scope options
export type WorkspaceScope = 'global' | 'site' | 'ap' | 'client';

// Cross-widget shared signals
export interface WorkspaceSignals {
  selectedTimeWindow?: { start: number; end: number };
  selectedSiteId?: string;
  selectedApId?: string;
  selectedClientId?: string;
  selectedAppId?: string;
  affectedEntities?: string[];
}

// Widget catalog definition
export interface WidgetCatalogItem {
  id: string;
  topic: WorkspaceTopic;
  type: WidgetType;
  title: string;
  description: string;
  dataBinding: {
    endpointRef: string;
    metrics?: string[];
    aggregation?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    limit?: number;
  };
  columns?: string[];
  interaction?: {
    brushEnabled?: boolean;
    linkTargets?: string;
  };
}

// Widget instance in the workspace
export interface WorkspaceWidget {
  id: string;
  catalogId: string;
  topic: WorkspaceTopic;
  type: WidgetType;
  title: string;
  description?: string;
  createdAt?: number;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  isLoading: boolean;
  error: string | null;
  data: any;
  localFilters?: {
    siteId?: string;
    timeRange?: string;
    apId?: string;
    clientId?: string;
  };
  // For cross-widget linking
  isLinked?: boolean;
  linkingEnabled?: boolean;
  // Data binding (from catalog or saved widget)
  dataBinding?: {
    endpointRef: string;
    metrics?: string[];
    aggregation?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    limit?: number;
  };
  columns?: string[];
  interaction?: {
    brushEnabled?: boolean;
    linkTargets?: string;
  };
  // Tracking for saved widgets
  isSavedWidget?: boolean;
  sourceWidgetId?: string;
  lastUpdated?: number;
}

// Workspace context (site, time range, scope)
export interface WorkspaceContext {
  siteId: string | null;
  timeRange: string;
  scope: WorkspaceScope;
}

// Full workspace state
export interface WorkspaceState {
  widgets: WorkspaceWidget[];
  selectedTopic: WorkspaceTopic | null;
  context: WorkspaceContext;
  signals: WorkspaceSignals;
}

const STORAGE_KEY = 'workspace_state_v2';

const defaultContext: WorkspaceContext = {
  siteId: null,
  timeRange: '24H',
  scope: 'global',
};

const defaultState: WorkspaceState = {
  widgets: [],
  selectedTopic: null,
  context: defaultContext,
  signals: {},
};

/**
 * Generate a unique widget ID
 */
function generateWidgetId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook for managing workspace state
 */
export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultState, ...parsed, context: { ...defaultContext, ...parsed.context } };
      }
    } catch (error) {
      console.warn('[Workspace] Failed to load from localStorage:', error);
    }
    return defaultState;
  });

  // Track if saved widgets have been loaded
  const savedWidgetsLoaded = useRef(false);

  // Signal listeners for cross-widget communication
  const signalListeners = useRef<Set<(signals: WorkspaceSignals) => void>>(new Set());

  // Load saved widgets on mount (from SaveWidgetToWorkspace feature)
  useEffect(() => {
    if (savedWidgetsLoaded.current) return;
    savedWidgetsLoaded.current = true;

    try {
      const savedRefs = getSavedWidgets();
      if (savedRefs.length > 0) {
        const hydratedWidgets: WorkspaceWidget[] = [];

        for (const ref of savedRefs) {
          const widget = hydrateWidgetFromReference(ref);
          if (widget) {
            widget.isSavedWidget = true;
            widget.sourceWidgetId = ref.source_widget_id;
            hydratedWidgets.push(widget);
          }
        }

        if (hydratedWidgets.length > 0) {
          setState(prev => {
            // Avoid duplicates - only add widgets not already present
            const existingIds = new Set(prev.widgets.map(w => w.id));
            const newWidgets = hydratedWidgets.filter(w => !existingIds.has(w.id));

            if (newWidgets.length === 0) return prev;

            return {
              ...prev,
              widgets: [...prev.widgets, ...newWidgets],
            };
          });
        }
      }
    } catch (error) {
      console.warn('[Workspace] Failed to load saved widgets:', error);
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Workspace] Failed to save to localStorage:', error);
    }
  }, [state]);

  /**
   * Select a topic
   */
  const selectTopic = useCallback((topic: WorkspaceTopic | null) => {
    setState(prev => ({ ...prev, selectedTopic: topic }));
  }, []);

  /**
   * Update workspace context
   */
  const updateContext = useCallback((updates: Partial<WorkspaceContext>) => {
    setState(prev => ({
      ...prev,
      context: { ...prev.context, ...updates },
    }));
  }, []);

  /**
   * Emit cross-widget signals
   */
  const emitSignals = useCallback((newSignals: Partial<WorkspaceSignals>) => {
    setState(prev => {
      const updatedSignals = { ...prev.signals, ...newSignals };
      // Notify listeners
      signalListeners.current.forEach(listener => listener(updatedSignals));
      return { ...prev, signals: updatedSignals };
    });
  }, []);

  /**
   * Subscribe to signal changes
   */
  const subscribeToSignals = useCallback((listener: (signals: WorkspaceSignals) => void) => {
    signalListeners.current.add(listener);
    return () => {
      signalListeners.current.delete(listener);
    };
  }, []);

  /**
   * Create a new widget from catalog
   */
  const createWidgetFromCatalog = useCallback((catalogItem: WidgetCatalogItem): WorkspaceWidget => {
    const newWidget: WorkspaceWidget = {
      id: generateWidgetId(),
      catalogId: catalogItem.id,
      topic: catalogItem.topic,
      type: catalogItem.type,
      title: catalogItem.title,
      createdAt: Date.now(),
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      isLoading: true,
      error: null,
      data: null,
      linkingEnabled: true,
    };

    setState(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));

    return newWidget;
  }, []);

  /**
   * Update a widget's state
   */
  const updateWidget = useCallback((id: string, updates: Partial<WorkspaceWidget>) => {
    setState(prev => ({
      ...prev,
      widgets: prev.widgets.map(widget =>
        widget.id === id ? { ...widget, ...updates } : widget
      ),
    }));
  }, []);

  /**
   * Delete a widget
   * Also removes from persisted saved widgets if applicable
   */
  const deleteWidget = useCallback((id: string) => {
    setState(prev => {
      const widget = prev.widgets.find(w => w.id === id);

      // If this is a saved widget, also remove from persistence
      if (widget?.isSavedWidget) {
        removeSavedWidget(id);
      }

      return {
        ...prev,
        widgets: prev.widgets.filter(w => w.id !== id),
      };
    });
  }, []);

  /**
   * Duplicate a widget
   */
  const duplicateWidget = useCallback((id: string) => {
    setState(prev => {
      const original = prev.widgets.find(w => w.id === id);
      if (!original) return prev;

      const duplicate: WorkspaceWidget = {
        ...original,
        id: generateWidgetId(),
        createdAt: Date.now(),
        position: { x: original.position.x + 20, y: original.position.y + 20 },
      };

      return {
        ...prev,
        widgets: [...prev.widgets, duplicate],
      };
    });
  }, []);

  /**
   * Move a widget to a new position
   */
  const moveWidget = useCallback((id: string, position: { x: number; y: number }) => {
    updateWidget(id, { position });
  }, [updateWidget]);

  /**
   * Resize a widget
   */
  const resizeWidget = useCallback((id: string, size: { width: number; height: number }) => {
    updateWidget(id, { size });
  }, [updateWidget]);

  /**
   * Refresh a widget
   */
  const refreshWidget = useCallback((id: string) => {
    updateWidget(id, { isLoading: true, error: null });
  }, [updateWidget]);

  /**
   * Toggle widget linking
   */
  const toggleWidgetLinking = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      widgets: prev.widgets.map(widget =>
        widget.id === id ? { ...widget, linkingEnabled: !widget.linkingEnabled } : widget
      ),
    }));
  }, []);

  /**
   * Clear all widgets
   * Optionally clear saved widgets from persistence too
   */
  const clearWorkspace = useCallback((clearSaved = false) => {
    if (clearSaved) {
      // Remove all saved widgets from persistence
      state.widgets.forEach(w => {
        if (w.isSavedWidget) {
          removeSavedWidget(w.id);
        }
      });
    }

    setState(prev => ({
      ...prev,
      widgets: [],
      signals: {},
    }));
  }, [state.widgets]);

  /**
   * Add a widget from a saved reference (from SaveWidgetToWorkspace feature)
   */
  const addSavedWidget = useCallback((ref: PersistedWidgetReference): WorkspaceWidget | null => {
    const widget = hydrateWidgetFromReference(ref);
    if (!widget) return null;

    widget.isSavedWidget = true;
    widget.sourceWidgetId = ref.source_widget_id;

    setState(prev => ({
      ...prev,
      widgets: [...prev.widgets, widget],
    }));

    return widget;
  }, []);

  /**
   * Get count of saved widgets
   */
  const savedWidgetCount = state.widgets.filter(w => w.isSavedWidget).length;

  const hasWidgets = state.widgets.length > 0;

  return {
    // State
    widgets: state.widgets,
    selectedTopic: state.selectedTopic,
    context: state.context,
    signals: state.signals,
    hasWidgets,

    // Topic actions
    selectTopic,

    // Context actions
    updateContext,

    // Signal actions
    emitSignals,
    subscribeToSignals,

    // Widget actions
    createWidgetFromCatalog,
    updateWidget,
    deleteWidget,
    duplicateWidget,
    moveWidget,
    resizeWidget,
    refreshWidget,
    toggleWidgetLinking,
    clearWorkspace,

    // Saved widget actions (SaveWidgetToWorkspace feature)
    addSavedWidget,
    savedWidgetCount,
  };
}

/**
 * Widget Catalog - Comprehensive wireless widgets with all available data fields
 * Organized by topic: ClientExperience, AccessPoints, Clients, AppInsights, ContextualInsights
 */
export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  // ========================================
  // CLIENT EXPERIENCE WIDGETS
  // ========================================
  {
    id: 'kpi_rfqi_overview',
    topic: 'ClientExperience',
    type: 'kpi_tile_group',
    title: 'Client Experience Overview',
    description: 'RFQI score with component breakdown (RSSI, SNR, retries, latency)',
    dataBinding: {
      endpointRef: 'client_experience.rfqi',
      metrics: ['score', 'score_components'],
      aggregation: 'site_or_global',
    },
  },
  {
    id: 'timeseries_rfqi_with_brush',
    topic: 'ClientExperience',
    type: 'timeseries_with_brush',
    title: 'RFQI Over Time',
    description: 'Client experience score trending with time brush selection',
    dataBinding: {
      endpointRef: 'client_experience.rfqi',
      metrics: ['score'],
      aggregation: 'site_or_global',
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_clients_worst_experience',
    topic: 'ClientExperience',
    type: 'topn_table',
    title: 'Clients With Worst Experience',
    description: 'Clients with lowest RFQI scores showing RF metrics',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'rfqi_score',
      sortDirection: 'asc',
      limit: 50,
    },
    columns: ['display_name', 'experience_state', 'rfqi_score', 'device_type', 'ap_name', 'ssid', 'rssi_dbm', 'snr_db', 'retries_percent'],
  },
  {
    id: 'kpi_experience_distribution',
    topic: 'ClientExperience',
    type: 'kpi_tile_group',
    title: 'Experience Distribution',
    description: 'Count of clients in Good/Fair/Poor experience states',
    dataBinding: {
      endpointRef: 'client_experience.distribution',
      metrics: ['good_count', 'fair_count', 'poor_count', 'total_clients'],
    },
  },
  {
    id: 'timeseries_rf_quality_components',
    topic: 'ClientExperience',
    type: 'timeseries_multi_metric',
    title: 'RF Quality Components Over Time',
    description: 'RSSI, SNR, channel utilization, noise floor trends',
    dataBinding: {
      endpointRef: 'client_experience.rf_components',
      metrics: ['avg_rssi', 'avg_snr', 'channel_utilization', 'noise_floor', 'retry_rate'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_experience_by_ssid',
    topic: 'ClientExperience',
    type: 'topn_table',
    title: 'Experience By SSID',
    description: 'Client experience scores grouped by wireless network',
    dataBinding: {
      endpointRef: 'client_experience.by_ssid',
      sortField: 'avg_rfqi',
      sortDirection: 'asc',
      limit: 20,
    },
    columns: ['ssid', 'client_count', 'avg_rfqi', 'avg_rssi', 'avg_snr', 'avg_retries'],
  },

  // ========================================
  // ACCESS POINTS WIDGETS
  // ========================================
  {
    id: 'table_aps_degrading_experience',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs With Highest Client Pain',
    description: 'Access points causing client experience degradation',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'rfqi_score',
      sortDirection: 'asc',
      limit: 50,
    },
    columns: ['ap_name', 'site_name', 'model', 'status', 'client_count', 'channel_utilization_percent', 'noise_floor_dbm', 'retries_percent', 'rfqi_score'],
  },
  {
    id: 'timeseries_ap_radio_health',
    topic: 'AccessPoints',
    type: 'timeseries_multi_metric',
    title: 'AP Radio Health Over Time',
    description: 'Channel utilization, noise, retries, throughput trends',
    dataBinding: {
      endpointRef: 'access_points.timeseries',
      metrics: ['channel_utilization_percent', 'noise_floor_dbm', 'retries_percent', 'throughput_bps', 'client_count'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_aps_by_client_count',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs By Client Count',
    description: 'Access points ranked by connected clients',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'client_count',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'model', 'status', 'client_count', 'channel_utilization_percent', 'throughput_bps'],
  },
  {
    id: 'table_aps_by_throughput',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs By Throughput',
    description: 'Access points ranked by data throughput',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'throughput_bps',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'model', 'client_count', 'throughput_bps', 'channel', 'tx_power_dbm'],
  },
  {
    id: 'table_aps_high_channel_util',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs With High Channel Utilization',
    description: 'Access points with congested channels',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'channel_utilization_percent',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'channel', 'band', 'channel_utilization_percent', 'noise_floor_dbm', 'client_count', 'retries_percent'],
  },
  {
    id: 'table_aps_high_noise',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs With High Noise Floor',
    description: 'Access points experiencing RF interference',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'noise_floor_dbm',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'channel', 'band', 'noise_floor_dbm', 'channel_utilization_percent', 'retries_percent'],
  },
  {
    id: 'table_aps_high_retries',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs With High Retry Rates',
    description: 'Access points with frequent retransmissions',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'retries_percent',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'retries_percent', 'channel_utilization_percent', 'noise_floor_dbm', 'client_count', 'rssi_avg'],
  },
  {
    id: 'kpi_ap_status_summary',
    topic: 'AccessPoints',
    type: 'kpi_tile_group',
    title: 'AP Status Summary',
    description: 'Count of online, offline, and degraded APs',
    dataBinding: {
      endpointRef: 'access_points.status_summary',
      metrics: ['online_count', 'offline_count', 'degraded_count', 'total_count'],
    },
  },
  {
    id: 'table_aps_offline',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'Offline Access Points',
    description: 'Access points currently not reachable',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'last_seen',
      sortDirection: 'desc',
      limit: 50,
    },
    columns: ['ap_name', 'site_name', 'model', 'serial', 'status', 'last_seen', 'uptime_seconds'],
  },
  {
    id: 'timeseries_channel_utilization',
    topic: 'AccessPoints',
    type: 'timeseries_with_brush',
    title: 'Channel Utilization Over Time',
    description: '2.4GHz and 5GHz channel utilization trends',
    dataBinding: {
      endpointRef: 'access_points.channel_util_timeseries',
      metrics: ['channel_util_2_4ghz', 'channel_util_5ghz'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_aps_by_model',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'APs By Model',
    description: 'Access point inventory grouped by model',
    dataBinding: {
      endpointRef: 'access_points.by_model',
      sortField: 'count',
      sortDirection: 'desc',
      limit: 20,
    },
    columns: ['model', 'count', 'online_count', 'avg_clients', 'avg_throughput'],
  },

  // ========================================
  // CLIENTS WIDGETS
  // ========================================
  {
    id: 'timeseries_client_link_quality',
    topic: 'Clients',
    type: 'timeseries_multi_metric',
    title: 'Client Link Quality Over Time',
    description: 'RSSI, SNR, retries, throughput trends for selected client',
    dataBinding: {
      endpointRef: 'clients.timeseries',
      metrics: ['rssi_dbm', 'snr_db', 'retries_percent', 'throughput_bps'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_clients_by_bandwidth',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Top Clients By Bandwidth',
    description: 'Clients consuming the most network bandwidth',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'throughput_bps',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['display_name', 'experience_state', 'device_type', 'ap_name', 'ssid', 'throughput_bps', 'rx_bytes', 'tx_bytes'],
  },
  {
    id: 'table_roaming_clients',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Frequent Roaming Clients',
    description: 'Clients with high roaming event counts',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'roam_count',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['display_name', 'experience_state', 'device_type', 'ap_name', 'roam_count', 'rssi_dbm', 'snr_db'],
  },
  {
    id: 'table_clients_low_rssi',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients With Low Signal',
    description: 'Clients with weak RSSI signal strength',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'rssi_dbm',
      sortDirection: 'asc',
      limit: 25,
    },
    columns: ['display_name', 'experience_state', 'rssi_dbm', 'snr_db', 'device_type', 'ap_name', 'band'],
  },
  {
    id: 'table_clients_low_snr',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients With Low SNR',
    description: 'Clients with poor signal-to-noise ratio',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'snr_db',
      sortDirection: 'asc',
      limit: 25,
    },
    columns: ['display_name', 'experience_state', 'snr_db', 'rssi_dbm', 'device_type', 'ap_name', 'band'],
  },
  {
    id: 'table_clients_high_retries',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients With High Retries',
    description: 'Clients experiencing frequent retransmissions',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'retries_percent',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['display_name', 'experience_state', 'retries_percent', 'rssi_dbm', 'snr_db', 'device_type', 'ap_name'],
  },
  {
    id: 'table_clients_by_device_type',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients By Device Type',
    description: 'Client inventory grouped by device type',
    dataBinding: {
      endpointRef: 'clients.by_device_type',
      sortField: 'count',
      sortDirection: 'desc',
      limit: 20,
    },
    columns: ['device_type', 'count', 'avg_rssi', 'avg_snr', 'avg_throughput'],
  },
  {
    id: 'table_clients_by_manufacturer',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients By Manufacturer',
    description: 'Client inventory grouped by device manufacturer (OUI)',
    dataBinding: {
      endpointRef: 'clients.by_manufacturer',
      sortField: 'count',
      sortDirection: 'desc',
      limit: 20,
    },
    columns: ['manufacturer', 'count', 'avg_rssi', 'avg_experience'],
  },
  {
    id: 'table_clients_by_band',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients By Band',
    description: 'Client distribution across 2.4GHz, 5GHz, 6GHz bands',
    dataBinding: {
      endpointRef: 'clients.by_band',
      sortField: 'count',
      sortDirection: 'desc',
    },
    columns: ['band', 'count', 'avg_rssi', 'avg_throughput', 'avg_experience'],
  },
  {
    id: 'table_clients_by_ssid',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Clients By SSID',
    description: 'Client count per wireless network',
    dataBinding: {
      endpointRef: 'clients.by_ssid',
      sortField: 'count',
      sortDirection: 'desc',
      limit: 20,
    },
    columns: ['ssid', 'count', 'avg_rssi', 'avg_throughput', 'avg_experience'],
  },
  {
    id: 'kpi_client_count_summary',
    topic: 'Clients',
    type: 'kpi_tile_group',
    title: 'Client Count Summary',
    description: 'Total, unique, and active client counts',
    dataBinding: {
      endpointRef: 'clients.count_summary',
      metrics: ['total_count', 'unique_count', 'active_count', 'idle_count'],
    },
  },
  {
    id: 'timeseries_client_count',
    topic: 'Clients',
    type: 'timeseries_with_brush',
    title: 'Client Count Over Time',
    description: 'Connected client count trending',
    dataBinding: {
      endpointRef: 'clients.count_timeseries',
      metrics: ['client_count'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'table_clients_all',
    topic: 'Clients',
    type: 'topn_table',
    title: 'All Connected Clients',
    description: 'Complete list of currently connected clients',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'display_name',
      sortDirection: 'asc',
      limit: 100,
    },
    columns: ['display_name', 'experience_state', 'device_type', 'manufacturer', 'ap_name', 'ssid', 'band', 'rssi_dbm', 'snr_db', 'throughput_bps', 'ip_address', 'mac_address'],
  },

  // ========================================
  // APP INSIGHTS WIDGETS
  // ========================================
  {
    id: 'app_insights_top_apps_impact',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'Top Apps By Client Impact',
    description: 'Applications impacting the most clients',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'clients_impacted',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'clients_impacted', 'bytes', 'latency_ms', 'packet_loss_percent'],
  },
  {
    id: 'timeseries_app_performance',
    topic: 'AppInsights',
    type: 'timeseries_multi_metric',
    title: 'App Performance Over Time',
    description: 'Application latency, packet loss, jitter trends',
    dataBinding: {
      endpointRef: 'app_insights.app_timeseries',
      metrics: ['latency_ms', 'packet_loss_percent', 'jitter_ms', 'bytes'],
    },
    interaction: {
      brushEnabled: true,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'app_insights_by_throughput',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'Top Apps By Throughput',
    description: 'Applications by bandwidth consumption',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'bytes',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'bytes', 'flows', 'clients_impacted'],
  },
  {
    id: 'app_insights_by_latency',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'Apps With Highest Latency',
    description: 'Applications experiencing highest latency',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'latency_ms',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'latency_ms', 'jitter_ms', 'packet_loss_percent', 'clients_impacted'],
  },
  {
    id: 'app_insights_by_packet_loss',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'Apps With Packet Loss',
    description: 'Applications experiencing packet loss',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'packet_loss_percent',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'packet_loss_percent', 'latency_ms', 'bytes', 'clients_impacted'],
  },
  {
    id: 'app_insights_by_category',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'App Usage By Category',
    description: 'Application traffic grouped by category',
    dataBinding: {
      endpointRef: 'app_insights.by_category',
      sortField: 'bytes',
      sortDirection: 'desc',
      limit: 15,
    },
    columns: ['category', 'app_count', 'bytes', 'clients_impacted', 'avg_latency_ms'],
  },
  {
    id: 'kpi_app_summary',
    topic: 'AppInsights',
    type: 'kpi_tile_group',
    title: 'Application Summary',
    description: 'Total apps, flows, and aggregate bandwidth',
    dataBinding: {
      endpointRef: 'app_insights.summary',
      metrics: ['app_count', 'total_flows', 'total_bytes', 'avg_latency_ms'],
    },
  },

  // ========================================
  // CONTEXTUAL INSIGHTS WIDGETS
  // ========================================
  {
    id: 'insights_contextual_timeline',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'Insights Timeline',
    description: 'Network insights and anomalies over time',
    dataBinding: {
      endpointRef: 'contextual_insights.insights_feed',
    },
    interaction: {
      brushEnabled: false,
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'insights_roaming_events',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'Roaming Events',
    description: 'Client roaming activity and AP transitions',
    dataBinding: {
      endpointRef: 'contextual_insights.roaming_events',
    },
    interaction: {
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'insights_association_events',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'Association Events',
    description: 'Client association and disassociation activity',
    dataBinding: {
      endpointRef: 'contextual_insights.association_events',
    },
  },
  {
    id: 'insights_rf_events',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'RF Change Events',
    description: 'Channel changes and power adjustments',
    dataBinding: {
      endpointRef: 'contextual_insights.rf_events',
    },
  },
  {
    id: 'insights_failed_associations',
    topic: 'ContextualInsights',
    type: 'topn_table',
    title: 'Failed Associations',
    description: 'Clients failing to connect to the network',
    dataBinding: {
      endpointRef: 'contextual_insights.failed_associations',
      sortField: 'failure_count',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['display_name', 'mac_address', 'failure_count', 'last_failure_reason', 'target_ap', 'target_ssid'],
  },
  {
    id: 'insights_anomalies',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'Network Anomalies',
    description: 'Detected anomalies in RF and performance metrics',
    dataBinding: {
      endpointRef: 'contextual_insights.anomalies',
    },
    interaction: {
      linkTargets: 'all_widgets',
    },
  },
  {
    id: 'kpi_insights_summary',
    topic: 'ContextualInsights',
    type: 'kpi_tile_group',
    title: 'Insights Summary',
    description: 'Count of critical, warning, and info insights',
    dataBinding: {
      endpointRef: 'contextual_insights.summary',
      metrics: ['critical_count', 'warning_count', 'info_count', 'total_count'],
    },
  },
];

/**
 * Get catalog items by topic
 */
export function getWidgetsByTopic(topic: WorkspaceTopic): WidgetCatalogItem[] {
  return WIDGET_CATALOG.filter(item => item.topic === topic);
}

/**
 * Prompt suggestions organized by topic - expanded for comprehensive widget catalog
 */
export const PROMPT_SUGGESTIONS: Record<WorkspaceTopic, string[]> = {
  AccessPoints: [
    'Which APs have the worst client experience?',
    'Show APs with high channel utilization',
    'Which APs have high noise floor or interference?',
    'Show offline or degraded access points',
    'APs with the most connected clients',
  ],
  Clients: [
    'Clients with the worst signal strength',
    'Which clients are roaming frequently?',
    'Show clients consuming the most bandwidth',
    'Clients grouped by device type or manufacturer',
    'Show client distribution by band (2.4/5/6 GHz)',
  ],
  ClientExperience: [
    'Show overall RFQI score and components',
    'Clients with the worst experience right now',
    'Experience breakdown by SSID',
    'RF quality trends over time',
    'Distribution of good/fair/poor experience',
  ],
  AppInsights: [
    'Top applications by bandwidth usage',
    'Which apps have the highest latency?',
    'Apps experiencing packet loss',
    'Application usage by category',
    'Apps impacting the most clients',
  ],
  ContextualInsights: [
    'Recent network anomalies',
    'Client roaming activity',
    'Failed association attempts',
    'Channel and power change events',
    'Critical insights and alerts',
  ],
};

/**
 * Topic metadata
 */
export const TOPIC_METADATA: Record<WorkspaceTopic, { label: string; description: string; color: { bg: string; text: string; border: string } }> = {
  AccessPoints: {
    label: 'Access Points',
    description: 'Wireless access point health and performance',
    color: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/20',
    },
  },
  Clients: {
    label: 'Clients',
    description: 'Connected wireless clients and their metrics',
    color: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/20',
    },
  },
  ClientExperience: {
    label: 'Client Experience',
    description: 'RFQI scoring and experience metrics',
    color: {
      bg: 'bg-green-500/10',
      text: 'text-green-400',
      border: 'border-green-500/20',
    },
  },
  AppInsights: {
    label: 'App Insights',
    description: 'Application performance and impact analysis',
    color: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
    },
  },
  ContextualInsights: {
    label: 'Contextual Insights',
    description: 'Anomalies and insights tied to time and scope',
    color: {
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-400',
      border: 'border-cyan-500/20',
    },
  },
};

/**
 * Time range options
 */
export const TIME_RANGE_OPTIONS = [
  { value: '1H', label: 'Last 1 hour' },
  { value: '3H', label: 'Last 3 hours' },
  { value: '24H', label: 'Last 24 hours' },
  { value: '7D', label: 'Last 7 days' },
  { value: '30D', label: 'Last 30 days' },
];
