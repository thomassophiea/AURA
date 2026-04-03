/**
 * Default Report Configuration
 *
 * Translates the original hardcoded 8-page ReportCenter layout into a
 * ReportConfig data structure. This serves as the factory default and
 * migration path — users who haven't customized get this automatically.
 *
 * Widget keys prefixed with _metric_ are computed from local AP/station
 * data (not fetched via fetchWidgetData). All other keys map to
 * WIDGET_CATEGORIES names in widgetService.ts.
 */

import type { ReportConfig, ReportPageConfig, ReportWidgetConfig } from '../types/reportConfig';

function w(
  id: string,
  widgetKey: string,
  displayType: ReportWidgetConfig['displayType'],
  gridSpan: 1 | 2 | 3 | 4 = 1,
  title?: string,
  config?: Record<string, any>,
): ReportWidgetConfig {
  return {
    id,
    widgetKey,
    source: widgetKey.startsWith('_metric_') ? 'metric_computed' : 'platform_report',
    displayType,
    gridSpan,
    ...(title && { title }),
    ...(config && { config }),
  };
}

// ── Page Definitions ──

const executiveSummary: ReportPageConfig = {
  id: 'executive',
  title: 'Executive Summary',
  description: 'High-level KPI overview',
  icon: 'FileText',
  category: 'overview',
  widgets: [
    w('exec-sc1', '_metric_aps', 'scorecard', 1, 'Access Points'),
    w('exec-sc2', '_metric_clients', 'scorecard', 1, 'Connected Clients'),
    w('exec-sc3', '_metric_throughput', 'scorecard', 1, 'Total Throughput'),
    w('exec-sc4', '_metric_health', 'scorecard', 1, 'Health Score'),
    w('exec-sc5', '_metric_sites', 'scorecard', 1, 'Sites'),
    w('exec-sc6', '_metric_networks', 'scorecard', 1, 'Networks'),
    w('exec-sc7', '_metric_avg_rssi', 'scorecard', 1, 'Avg RSSI'),
    w('exec-sc8', '_metric_ap_models', 'scorecard', 1, 'AP Models'),
    w('exec-band', '_metric_band_distribution', 'pie_chart', 2, 'Client Band Distribution'),
    w('exec-ssid', '_metric_ssid_distribution', 'bar_chart', 2, 'Clients by Network'),
    w('exec-rssi', '_metric_rssi_distribution', 'bar_chart', 2, 'Signal Quality Distribution'),
    w('exec-bp', '_metric_best_practices', 'distribution', 2, 'Best Practices'),
    w('exec-ts', 'ulDlThroughputTimeseries', 'timeseries', 4, 'Throughput Trend'),
  ],
};

const networkHealth: ReportPageConfig = {
  id: 'network-health',
  title: 'Network Health',
  description: 'System health and best practices',
  icon: 'Activity',
  category: 'network',
  widgets: [
    w('nh-sc1', '_metric_health', 'scorecard', 1, 'Health Score'),
    w('nh-sc2', '_metric_aps', 'scorecard', 1, 'Online APs'),
    w('nh-sc3', '_metric_bp_summary', 'scorecard', 1, 'Best Practices'),
    w('nh-sc4', '_metric_networks', 'scorecard', 1, 'Active Networks'),
    w('nh-bp', '_metric_best_practices_full', 'ranking', 4, 'Configuration Best Practices'),
    w('nh-snr', 'worstApsBySnr', 'ranking', 2, 'Worst APs by SNR'),
    w('nh-chan', 'worstApsByChannelUtil', 'ranking', 2, 'Worst APs by Channel Utilization'),
  ],
};

const accessPoints: ReportPageConfig = {
  id: 'access-points',
  title: 'Access Points',
  description: 'AP inventory, performance, and RF health',
  icon: 'Wifi',
  category: 'network',
  widgets: [
    w('ap-sc1', '_metric_total_aps', 'scorecard', 1, 'Total APs'),
    w('ap-sc2', '_metric_online_aps', 'scorecard', 1, 'Online'),
    w('ap-sc3', '_metric_offline_aps', 'scorecard', 1, 'Offline'),
    w('ap-sc4', '_metric_ap_models', 'scorecard', 1, 'Models'),
    w('ap-model', '_metric_ap_model_distribution', 'pie_chart', 2, 'AP Model Distribution'),
    w('ap-inv', '_metric_ap_inventory', 'ranking', 2, 'Inventory by Model'),
    w('ap-top-tp', 'topAccessPointsByThroughput', 'ranking', 2, 'Top APs by Throughput'),
    w('ap-top-cl', 'topAccessPointsByUserCount', 'ranking', 2, 'Top APs by Client Count'),
  ],
};

const clients: ReportPageConfig = {
  id: 'clients',
  title: 'Clients',
  description: 'Client distribution, manufacturers, and experience',
  icon: 'Users',
  category: 'clients',
  widgets: [
    w('cl-sc1', '_metric_total_clients', 'scorecard', 1, 'Total Clients'),
    w('cl-sc2', '_metric_authenticated', 'scorecard', 1, 'Authenticated'),
    w('cl-sc3', '_metric_avg_signal', 'scorecard', 1, 'Avg Signal'),
    w('cl-sc4', '_metric_client_networks', 'scorecard', 1, 'Networks'),
    w('cl-usage', 'topClientsByUsage', 'ranking', 2, 'Top Clients by Usage'),
    w('cl-mfr', 'topManufacturersByClientCount', 'ranking', 2, 'Top Manufacturers'),
    w('cl-ts', 'countOfUniqueUsersReport', 'timeseries', 4, 'Unique Clients Over Time'),
  ],
};

const throughput: ReportPageConfig = {
  id: 'throughput',
  title: 'Throughput & Usage',
  description: 'Traffic volume and bandwidth utilization',
  icon: 'BarChart3',
  category: 'network',
  widgets: [
    w('tp-sc1', '_metric_total_throughput', 'scorecard', 1, 'Total Throughput'),
    w('tp-sc2', '_metric_upload', 'scorecard', 1, 'Upload'),
    w('tp-sc3', '_metric_download', 'scorecard', 1, 'Download'),
    w('tp-sc4', '_metric_active_clients', 'scorecard', 1, 'Active Clients'),
    w('tp-ts1', 'ulDlThroughputTimeseries', 'timeseries', 4, 'Throughput Over Time'),
    w('tp-ts2', 'ulDlUsageTimeseries', 'timeseries', 4, 'Usage Over Time'),
    w('tp-ts3', 'throughputReport', 'timeseries', 4, 'Throughput Report'),
  ],
};

const rfAnalytics: ReportPageConfig = {
  id: 'rf-analytics',
  title: 'RF Analytics',
  description: 'Channel distribution, SNR, and interference',
  icon: 'Radio',
  category: 'rf',
  widgets: [
    w('rf-sc1', '_metric_band_24', 'scorecard', 1, '2.4 GHz Clients'),
    w('rf-sc2', '_metric_band_5', 'scorecard', 1, '5 GHz Clients'),
    w('rf-sc3', '_metric_band_6', 'scorecard', 1, '6 GHz Clients'),
    w('rf-rq', 'rfQuality', 'ranking', 2, 'RF Quality'),
    w('rf-ch1', 'channelDistributionRadio1', 'ranking', 2, 'Channel Distribution (Radio 1)'),
    w('rf-ch2', 'channelDistributionRadio2', 'ranking', 2, 'Channel Distribution (Radio 2)'),
    w('rf-snr', 'worstApsBySnr', 'ranking', 2, 'Worst APs by SNR'),
  ],
};

const applications: ReportPageConfig = {
  id: 'applications',
  title: 'Applications',
  description: 'Application visibility and traffic analytics',
  icon: 'AppWindow',
  category: 'apps',
  widgets: [
    w('app-usage', 'topAppGroupsByUsage', 'ranking', 2, 'Top Applications by Usage'),
    w('app-clients', 'topAppGroupsByClientCountReport', 'ranking', 2, 'Top Applications by Client Count'),
  ],
};

const sitesPage: ReportPageConfig = {
  id: 'sites',
  title: 'Sites',
  description: 'Site-level performance rankings',
  icon: 'MapPin',
  category: 'overview',
  widgets: [
    w('site-sc1', '_metric_total_sites', 'scorecard', 1, 'Total Sites'),
    w('site-sc2', '_metric_total_aps', 'scorecard', 1, 'Total APs'),
    w('site-sc3', '_metric_total_clients', 'scorecard', 1, 'Total Clients'),
    w('site-tp', 'topSitesByThroughput', 'ranking', 2, 'Top Sites by Throughput'),
    w('site-cl', 'topSitesByClientCount', 'ranking', 2, 'Top Sites by Client Count'),
  ],
};

// ── Default Config ──

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  id: 'default',
  name: 'Network Report',
  description: 'Comprehensive network overview — Extreme Report Studio',
  createdAt: 0,
  updatedAt: 0,
  duration: '24H',
  isDefault: true,
  pages: [
    executiveSummary,
    networkHealth,
    accessPoints,
    clients,
    throughput,
    rfAnalytics,
    applications,
    sitesPage,
  ],
};

/** Get all platform_report widget keys needed for a config */
export function getWidgetKeysForConfig(config: ReportConfig): string[] {
  const keys = new Set<string>();
  config.pages.forEach(page => {
    page.widgets.forEach(w => {
      if (w.source === 'platform_report') {
        keys.add(w.widgetKey);
      }
    });
  });
  return Array.from(keys);
}
