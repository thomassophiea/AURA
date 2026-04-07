/**
 * Workspace Widget Eligibility Registry
 *
 * Defines which widgets are eligible for saving to Workspace.
 * Enforces data integrity rules - only widgets that produce real data
 * can be tagged and added to Workspace.
 *
 * Eligibility rules:
 * 1. Widget must bind to a data source (API endpoint)
 * 2. Widget must be able to hydrate in Workspace context
 * 3. Widget cannot be static/placeholder content
 */

/**
 * Widget eligibility status
 */
export interface WidgetEligibility {
  isEligible: boolean;
  reason?: string;
  endpointRef?: string;
  catalogId?: string;
  hydrationPath?: string;
  requiredContext?: ('siteId' | 'timeRange' | 'clientId' | 'apId' | 'appId')[];
}

/**
 * Eligible endpoint prefixes for Workspace widgets
 * All data-producing endpoints that can hydrate in Workspace
 */
export const ELIGIBLE_ENDPOINT_PREFIXES = [
  // Access Points
  'access_points',
  'aps',

  // Clients/Stations
  'clients',
  'stations',

  // Client Experience
  'client_experience',
  'rfqi',

  // Applications
  'app_insights',
  'applications',

  // Contextual Insights
  'contextual_insights',
  'insights',

  // Events & Alerts
  'events',
  'alerts',
  'alarms',

  // Network & Sites
  'network',
  'sites',
  'venue',

  // Traffic & Performance
  'traffic',
  'throughput',
  'performance',

  // RF Quality
  'rf_quality',
  'channel_utilization',
  'noise',

  // Reports
  'reports',
  'metrics',
] as const;

/**
 * Widget types that are eligible for Workspace
 */
export const ELIGIBLE_WIDGET_TYPES = [
  'kpi_tile',
  'kpi_tile_group',
  'topn_table',
  'data_table',
  'timeseries',
  'timeseries_with_brush',
  'timeseries_multi_metric',
  'timeline_feed',
  'event_feed',
  'insight_panel',
  'chart',
  'pie_chart',
  'bar_chart',
  'area_chart',
  'gauge',
  'scorecard',
  'metric_card',
  'summary_card',
  'distribution_chart',
] as const;

/**
 * Widget IDs that are explicitly NOT eligible (static content, config UIs, etc.)
 */
export const INELIGIBLE_WIDGET_IDS = new Set([
  // Configuration UIs
  'settings-panel',
  'config-editor',
  'create-dialog',
  'edit-dialog',

  // Static content
  'best-practices',
  'onboarding',
  'help-panel',
  'welcome-message',

  // Navigation/UI
  'sidebar',
  'header',
  'footer',
  'menu',

  // Tools
  'packet-capture',
  'diagnostic-tool',
  'api-tester',
]);

/**
 * Registry of widget eligibility configurations
 * Maps widget IDs to their eligibility status and hydration requirements
 */
export const WIDGET_ELIGIBILITY_REGISTRY: Record<string, WidgetEligibility> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'dashboard-network-health': {
    isEligible: true,
    endpointRef: 'access_points.summary',
    catalogId: 'metric_network_health',
    hydrationPath: 'access_points.status_summary',
    requiredContext: [],
  },
  'dashboard-unique-clients-chart': {
    isEligible: true,
    endpointRef: 'clients.count_timeseries',
    catalogId: 'clients_count_timeseries',
    hydrationPath: 'clients.count_timeseries',
    requiredContext: ['timeRange'],
  },
  'dashboard-top-sites': {
    isEligible: true,
    endpointRef: 'sites.summary',
    catalogId: 'sites_by_clients',
    hydrationPath: 'sites.list',
    requiredContext: [],
  },
  'dashboard-performance-metrics': {
    isEligible: true,
    endpointRef: 'network.performance_summary',
    catalogId: 'network_performance_kpi',
    hydrationPath: 'access_points.status_summary',
    requiredContext: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS POINTS WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'access-points-table': {
    isEligible: true,
    endpointRef: 'access_points.list',
    catalogId: 'table_aps_all',
    hydrationPath: 'access_points.list',
    requiredContext: [],
  },
  'ap-status-summary': {
    isEligible: true,
    endpointRef: 'access_points.status_summary',
    catalogId: 'ap_status_summary',
    hydrationPath: 'access_points.status_summary',
    requiredContext: [],
  },
  'ap-channel-utilization': {
    isEligible: true,
    endpointRef: 'access_points.channel_util_timeseries',
    catalogId: 'ap_channel_utilization',
    hydrationPath: 'access_points.channel_util_timeseries',
    requiredContext: ['siteId', 'timeRange'],
  },
  'ap-by-model': {
    isEligible: true,
    endpointRef: 'access_points.by_model',
    catalogId: 'ap_by_model',
    hydrationPath: 'access_points.by_model',
    requiredContext: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'connected-clients-table': {
    isEligible: true,
    endpointRef: 'clients.list',
    catalogId: 'table_clients_all',
    hydrationPath: 'clients.list',
    requiredContext: [],
  },
  'clients-by-device-type': {
    isEligible: true,
    endpointRef: 'clients.by_device_type',
    catalogId: 'clients_by_device_type',
    hydrationPath: 'clients.by_device_type',
    requiredContext: [],
  },
  'clients-by-manufacturer': {
    isEligible: true,
    endpointRef: 'clients.by_manufacturer',
    catalogId: 'clients_by_manufacturer',
    hydrationPath: 'clients.by_manufacturer',
    requiredContext: [],
  },
  'clients-by-band': {
    isEligible: true,
    endpointRef: 'clients.by_band',
    catalogId: 'clients_by_band',
    hydrationPath: 'clients.by_band',
    requiredContext: [],
  },
  'clients-by-ssid': {
    isEligible: true,
    endpointRef: 'clients.by_ssid',
    catalogId: 'clients_by_ssid',
    hydrationPath: 'clients.by_ssid',
    requiredContext: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT EXPERIENCE WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'client-experience-hero': {
    isEligible: true,
    endpointRef: 'client_experience.rfqi',
    catalogId: 'client_experience_rfqi',
    hydrationPath: 'client_experience.rfqi',
    requiredContext: ['timeRange'],
  },
  'client-experience-distribution': {
    isEligible: true,
    endpointRef: 'client_experience.distribution',
    catalogId: 'client_experience_distribution',
    hydrationPath: 'client_experience.distribution',
    requiredContext: [],
  },
  'client-experience-by-ssid': {
    isEligible: true,
    endpointRef: 'client_experience.by_ssid',
    catalogId: 'client_experience_by_ssid',
    hydrationPath: 'client_experience.by_ssid',
    requiredContext: [],
  },
  'rf-quality-widget': {
    isEligible: true,
    endpointRef: 'client_experience.rf_components',
    catalogId: 'rf_quality_components',
    hydrationPath: 'client_experience.rf_components',
    requiredContext: ['siteId', 'timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // APP INSIGHTS WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'app-insights-top-apps': {
    isEligible: true,
    endpointRef: 'app_insights.top_apps',
    catalogId: 'app_insights_top_apps',
    hydrationPath: 'app_insights.top_apps',
    requiredContext: ['timeRange'],
  },
  'app-insights-by-category': {
    isEligible: true,
    endpointRef: 'app_insights.by_category',
    catalogId: 'app_insights_by_category',
    hydrationPath: 'app_insights.by_category',
    requiredContext: ['timeRange'],
  },
  'app-insights-summary': {
    isEligible: true,
    endpointRef: 'app_insights.summary',
    catalogId: 'app_insights_summary',
    hydrationPath: 'app_insights.summary',
    requiredContext: ['timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXTUAL INSIGHTS WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'contextual-insights-feed': {
    isEligible: true,
    endpointRef: 'contextual_insights.insights_feed',
    catalogId: 'insights_feed',
    hydrationPath: 'contextual_insights.insights_feed',
    requiredContext: ['timeRange'],
  },
  'roaming-events': {
    isEligible: true,
    endpointRef: 'contextual_insights.roaming_events',
    catalogId: 'roaming_events',
    hydrationPath: 'contextual_insights.roaming_events',
    requiredContext: ['siteId', 'timeRange'],
  },
  'association-events': {
    isEligible: true,
    endpointRef: 'contextual_insights.association_events',
    catalogId: 'association_events',
    hydrationPath: 'contextual_insights.association_events',
    requiredContext: ['siteId', 'timeRange'],
  },
  'rf-events': {
    isEligible: true,
    endpointRef: 'contextual_insights.rf_events',
    catalogId: 'rf_events',
    hydrationPath: 'contextual_insights.rf_events',
    requiredContext: ['siteId', 'timeRange'],
  },
  'failed-associations': {
    isEligible: true,
    endpointRef: 'contextual_insights.failed_associations',
    catalogId: 'failed_associations',
    hydrationPath: 'contextual_insights.failed_associations',
    requiredContext: ['siteId', 'timeRange'],
  },
  'anomalies-feed': {
    isEligible: true,
    endpointRef: 'contextual_insights.anomalies',
    catalogId: 'anomalies_feed',
    hydrationPath: 'contextual_insights.anomalies',
    requiredContext: ['timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS & ALERTS WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'alerts-table': {
    isEligible: true,
    endpointRef: 'alerts.list',
    catalogId: 'alerts_table',
    hydrationPath: 'alerts.list',
    requiredContext: ['timeRange'],
  },
  'events-table': {
    isEligible: true,
    endpointRef: 'events.list',
    catalogId: 'events_table',
    hydrationPath: 'events.list',
    requiredContext: ['timeRange'],
  },
  'alarms-table': {
    isEligible: true,
    endpointRef: 'alarms.list',
    catalogId: 'alarms_table',
    hydrationPath: 'alarms.list',
    requiredContext: ['timeRange'],
  },
  'ap-events-timeline': {
    isEligible: true,
    endpointRef: 'events.ap_timeline',
    catalogId: 'ap_events_timeline',
    hydrationPath: 'events.ap_list',
    requiredContext: ['apId', 'timeRange'],
  },
  'client-events-timeline': {
    isEligible: true,
    endpointRef: 'events.client_timeline',
    catalogId: 'client_events_timeline',
    hydrationPath: 'events.client_list',
    requiredContext: ['clientId', 'timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SITES & VENUE WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'sites-overview': {
    isEligible: true,
    endpointRef: 'sites.list',
    catalogId: 'sites_overview',
    hydrationPath: 'sites.list',
    requiredContext: [],
  },
  'venue-statistics': {
    isEligible: true,
    endpointRef: 'venue.statistics',
    catalogId: 'venue_statistics',
    hydrationPath: 'venue.statistics',
    requiredContext: ['siteId', 'timeRange'],
  },
  'venue-throughput-chart': {
    isEligible: true,
    endpointRef: 'venue.throughput_timeseries',
    catalogId: 'venue_throughput',
    hydrationPath: 'venue.throughput_timeseries',
    requiredContext: ['siteId', 'timeRange'],
  },
  'venue-traffic-chart': {
    isEligible: true,
    endpointRef: 'venue.traffic_timeseries',
    catalogId: 'venue_traffic',
    hydrationPath: 'venue.traffic_timeseries',
    requiredContext: ['siteId', 'timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT WIDGETS
  // ═══════════════════════════════════════════════════════════════════════════
  'report-network-utilization': {
    isEligible: true,
    endpointRef: 'reports.network_utilization',
    catalogId: 'report_network_utilization',
    hydrationPath: 'clients.count_summary',
    requiredContext: [],
  },
  'report-connected-clients': {
    isEligible: true,
    endpointRef: 'reports.connected_clients',
    catalogId: 'report_connected_clients',
    hydrationPath: 'clients.count_summary',
    requiredContext: [],
  },
  'report-ap-health': {
    isEligible: true,
    endpointRef: 'reports.ap_health',
    catalogId: 'report_ap_health',
    hydrationPath: 'access_points.status_summary',
    requiredContext: [],
  },
  'report-throughput': {
    isEligible: true,
    endpointRef: 'reports.network_throughput',
    catalogId: 'report_throughput',
    hydrationPath: 'traffic.summary',
    requiredContext: [],
  },
  'report-signal-quality': {
    isEligible: true,
    endpointRef: 'reports.signal_quality',
    catalogId: 'report_signal_quality',
    hydrationPath: 'client_experience.distribution',
    requiredContext: [],
  },
  'report-security-events': {
    isEligible: true,
    endpointRef: 'reports.security_events',
    catalogId: 'report_security_events',
    hydrationPath: 'alerts.list',
    requiredContext: ['timeRange'],
  },
  'report-active-alerts': {
    isEligible: true,
    endpointRef: 'reports.active_alerts',
    catalogId: 'report_active_alerts',
    hydrationPath: 'alerts.list',
    requiredContext: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AP INSIGHTS (INDIVIDUAL AP)
  // ═══════════════════════════════════════════════════════════════════════════
  'ap-insights-throughput': {
    isEligible: true,
    endpointRef: 'access_points.timeseries',
    catalogId: 'ap_throughput_chart',
    hydrationPath: 'access_points.timeseries',
    requiredContext: ['apId', 'timeRange'],
  },
  'ap-insights-clients': {
    isEligible: true,
    endpointRef: 'access_points.client_count_timeseries',
    catalogId: 'ap_client_count_chart',
    hydrationPath: 'access_points.timeseries',
    requiredContext: ['apId', 'timeRange'],
  },
  'ap-insights-power': {
    isEligible: true,
    endpointRef: 'access_points.power_timeseries',
    catalogId: 'ap_power_chart',
    hydrationPath: 'access_points.timeseries',
    requiredContext: ['apId', 'timeRange'],
  },
  'ap-insights-cpu-memory': {
    isEligible: true,
    endpointRef: 'access_points.resource_timeseries',
    catalogId: 'ap_resource_chart',
    hydrationPath: 'access_points.timeseries',
    requiredContext: ['apId', 'timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT INSIGHTS (INDIVIDUAL CLIENT)
  // ═══════════════════════════════════════════════════════════════════════════
  'client-insights-throughput': {
    isEligible: true,
    endpointRef: 'clients.timeseries',
    catalogId: 'client_throughput_chart',
    hydrationPath: 'clients.timeseries',
    requiredContext: ['clientId', 'timeRange'],
  },
  'client-insights-signal': {
    isEligible: true,
    endpointRef: 'clients.signal_timeseries',
    catalogId: 'client_signal_chart',
    hydrationPath: 'clients.timeseries',
    requiredContext: ['clientId', 'timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT & LOGS
  // ═══════════════════════════════════════════════════════════════════════════
  'audit-logs-table': {
    isEligible: true,
    endpointRef: 'audit.logs',
    catalogId: 'audit_logs_table',
    hydrationPath: 'audit.logs',
    requiredContext: ['timeRange'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RANDOMIZED MAC
  // ═══════════════════════════════════════════════════════════════════════════
  'randomized-mac-report': {
    isEligible: true,
    endpointRef: 'clients.randomized_mac_report',
    catalogId: 'randomized_mac_report',
    hydrationPath: 'clients.list',
    requiredContext: [],
  },
};

/**
 * Check if a widget is eligible for Workspace saving
 */
export function checkWidgetEligibility(
  widgetId: string,
  widgetType?: string,
  endpointRefs?: string[]
): WidgetEligibility {
  // Check explicit ineligibility
  if (INELIGIBLE_WIDGET_IDS.has(widgetId)) {
    logEligibilityBlock(widgetId, 'Widget is explicitly ineligible (static/config content)');
    return {
      isEligible: false,
      reason: 'Widget is static or configuration content, not data-producing',
    };
  }

  // Check registry first
  const registeredEligibility = WIDGET_ELIGIBILITY_REGISTRY[widgetId];
  if (registeredEligibility) {
    return registeredEligibility;
  }

  // Dynamic eligibility check based on widget type
  if (widgetType && ELIGIBLE_WIDGET_TYPES.includes(widgetType as any)) {
    // Check if endpoint refs are valid
    if (endpointRefs && endpointRefs.length > 0) {
      const hasValidEndpoint = endpointRefs.some(ref =>
        ELIGIBLE_ENDPOINT_PREFIXES.some(prefix => ref.startsWith(prefix))
      );

      if (hasValidEndpoint) {
        return {
          isEligible: true,
          endpointRef: endpointRefs[0],
        };
      }
    }

    // Type is eligible but no valid endpoint
    logEligibilityBlock(widgetId, 'Widget type is eligible but no valid data endpoint provided');
    return {
      isEligible: false,
      reason: 'Widget type is eligible but cannot hydrate without valid data endpoint',
    };
  }

  // Unknown widget - default to ineligible
  logEligibilityBlock(widgetId, 'Widget not found in registry and type not recognized');
  return {
    isEligible: false,
    reason: 'Widget is not recognized as a data-producing widget',
  };
}

/**
 * Validate that a widget can hydrate data in Workspace
 */
export function canHydrateInWorkspace(
  widgetId: string,
  context: { siteId?: string | null; timeRange?: string; clientId?: string; apId?: string }
): { canHydrate: boolean; missingContext?: string[] } {
  const eligibility = WIDGET_ELIGIBILITY_REGISTRY[widgetId];

  if (!eligibility || !eligibility.isEligible) {
    return { canHydrate: false, missingContext: ['Widget not eligible'] };
  }

  const requiredContext = eligibility.requiredContext || [];
  const missingContext: string[] = [];

  for (const required of requiredContext) {
    switch (required) {
      case 'siteId':
        if (!context.siteId) missingContext.push('siteId');
        break;
      case 'timeRange':
        if (!context.timeRange) missingContext.push('timeRange');
        break;
      case 'clientId':
        if (!context.clientId) missingContext.push('clientId');
        break;
      case 'apId':
        if (!context.apId) missingContext.push('apId');
        break;
    }
  }

  if (missingContext.length > 0) {
    logEligibilityBlock(widgetId, `Missing required context: ${missingContext.join(', ')}`);
    return { canHydrate: false, missingContext };
  }

  return { canHydrate: true };
}

/**
 * Log when tagging is blocked
 */
function logEligibilityBlock(widgetId: string, reason: string): void {
  console.warn(`[WorkspaceEligibility] Tagging blocked for widget "${widgetId}": ${reason}`);
}

/**
 * Get eligibility info for a widget (for debugging/UI)
 */
export function getWidgetEligibilityInfo(widgetId: string): WidgetEligibility | null {
  return WIDGET_ELIGIBILITY_REGISTRY[widgetId] || null;
}

/**
 * List all eligible widgets
 */
export function listEligibleWidgets(): string[] {
  return Object.entries(WIDGET_ELIGIBILITY_REGISTRY)
    .filter(([_, eligibility]) => eligibility.isEligible)
    .map(([widgetId]) => widgetId);
}

/**
 * List all widgets requiring specific context
 */
export function listWidgetsRequiringContext(
  contextType: 'siteId' | 'timeRange' | 'clientId' | 'apId'
): string[] {
  return Object.entries(WIDGET_ELIGIBILITY_REGISTRY)
    .filter(([_, eligibility]) =>
      eligibility.isEligible &&
      eligibility.requiredContext?.includes(contextType)
    )
    .map(([widgetId]) => widgetId);
}
