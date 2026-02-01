/**
 * Workspace state management hook
 *
 * Manages workspace widgets with per-user persistence.
 * Wireless-only focus: AccessPoints, Clients, ClientExperience, AppInsights, ContextualInsights
 * Integrates with existing dashboard API endpoints for real data.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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
  createdAt: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isLoading: boolean;
  error: string | null;
  data: any;
  localFilters?: {
    siteId?: string;
    timeRange?: string;
    apId?: string;
    clientId?: string;
  };
  linkingEnabled: boolean;
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

  // Signal listeners for cross-widget communication
  const signalListeners = useRef<Set<(signals: WorkspaceSignals) => void>>(new Set());

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
   */
  const deleteWidget = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      widgets: prev.widgets.filter(widget => widget.id !== id),
    }));
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
   */
  const clearWorkspace = useCallback(() => {
    setState(prev => ({
      ...prev,
      widgets: [],
      signals: {},
    }));
  }, []);

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
  };
}

/**
 * Widget Catalog - All available wireless widgets
 */
export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  // Client Experience widgets
  {
    id: 'kpi_rfqi_overview',
    topic: 'ClientExperience',
    type: 'kpi_tile_group',
    title: 'Client Experience Overview',
    description: 'RFQI score and component breakdown for site or global scope',
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
    description: 'Client experience score over time with time brush selection',
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
    description: 'Top clients with lowest RFQI scores',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'rfqi_score',
      sortDirection: 'asc',
      limit: 50,
    },
    columns: ['hostname', 'mac', 'ap_name', 'ssid', 'band', 'rssi_dbm', 'snr_db', 'retries_percent', 'roam_count', 'rfqi_score'],
  },

  // Access Points widgets
  {
    id: 'table_aps_degrading_experience',
    topic: 'AccessPoints',
    type: 'topn_table',
    title: 'Access Points With Highest Client Pain',
    description: 'APs causing the most client experience degradation',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'rfqi_score',
      sortDirection: 'asc',
      limit: 50,
    },
    columns: ['ap_name', 'site_name', 'model', 'status', 'client_count', 'channel_utilization_percent', 'noise_floor_dbm', 'retries_percent', 'throughput_bps', 'rfqi_score'],
  },
  {
    id: 'timeseries_ap_radio_health',
    topic: 'AccessPoints',
    type: 'timeseries_multi_metric',
    title: 'AP Radio Health Over Time',
    description: 'Channel utilization, noise, retries, throughput over time',
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
    title: 'Access Points By Client Count',
    description: 'APs ranked by number of connected clients',
    dataBinding: {
      endpointRef: 'access_points.list',
      sortField: 'client_count',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['ap_name', 'site_name', 'model', 'status', 'client_count', 'throughput_bps'],
  },

  // Clients widgets
  {
    id: 'timeseries_client_link_quality',
    topic: 'Clients',
    type: 'timeseries_multi_metric',
    title: 'Client Link Quality Over Time',
    description: 'RSSI, SNR, retries, latency, packet loss over time',
    dataBinding: {
      endpointRef: 'clients.timeseries',
      metrics: ['rssi_dbm', 'snr_db', 'retries_percent', 'latency_ms', 'packet_loss_percent', 'throughput_bps'],
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
    description: 'Clients consuming the most bandwidth',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'throughput_bps',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['hostname', 'mac', 'device_type', 'ap_name', 'ssid', 'throughput_bps', 'rssi_dbm'],
  },
  {
    id: 'table_roaming_clients',
    topic: 'Clients',
    type: 'topn_table',
    title: 'Roaming Clients',
    description: 'Clients with frequent roaming events',
    dataBinding: {
      endpointRef: 'clients.list',
      sortField: 'roam_count',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['hostname', 'mac', 'ap_name', 'ssid', 'roam_count', 'rssi_dbm', 'throughput_bps'],
  },

  // App Insights widgets
  {
    id: 'app_insights_top_apps_impact',
    topic: 'AppInsights',
    type: 'topn_table',
    title: 'Top Applications By Impact',
    description: 'Applications impacting the most clients',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'clients_impacted',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'clients_impacted', 'latency_ms', 'packet_loss_percent', 'jitter_ms', 'bytes'],
  },
  {
    id: 'timeseries_app_performance',
    topic: 'AppInsights',
    type: 'timeseries_multi_metric',
    title: 'Application Performance Over Time',
    description: 'Application latency, packet loss, jitter over time',
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
    title: 'Top Applications By Throughput',
    description: 'Applications by bandwidth consumption',
    dataBinding: {
      endpointRef: 'app_insights.top_apps',
      sortField: 'bytes',
      sortDirection: 'desc',
      limit: 25,
    },
    columns: ['app_name', 'category', 'bytes', 'clients_impacted', 'latency_ms'],
  },

  // Contextual Insights widgets
  {
    id: 'insights_contextual_timeline',
    topic: 'ContextualInsights',
    type: 'timeline_feed',
    title: 'Contextual Insights Timeline',
    description: 'Insights and anomalies tied to time and scope',
    dataBinding: {
      endpointRef: 'contextual_insights.insights_feed',
    },
    interaction: {
      brushEnabled: false,
      linkTargets: 'all_widgets',
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
 * Prompt suggestions organized by topic
 */
export const PROMPT_SUGGESTIONS: Record<WorkspaceTopic, string[]> = {
  AccessPoints: [
    'Show access points with the lowest client experience score',
    'Show access points with rising channel utilization and rising retries',
    'Show noise floor spikes by access point over the last 24 hours',
    'Show access points with the most roaming clients',
  ],
  Clients: [
    'Show clients with the worst experience in the last 1 hour',
    'Show clients that are roaming frequently and losing throughput',
    'Show clients with low RSSI and high retries',
  ],
  ClientExperience: [
    'Show RFQI over time and correlate with contextual insights',
    'Show the worst client experience and the access points involved',
    'Show the top drivers of poor RFQI in this site',
  ],
  AppInsights: [
    'Show which applications correlate with high latency and poor experience',
    'Show top apps impacting clients on this access point',
  ],
  ContextualInsights: [
    'Show anomalies impacting client experience in this site',
    'Show wireless insights that overlap RFQI drops',
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
