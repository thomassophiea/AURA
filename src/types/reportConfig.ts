/**
 * Report Configuration Types
 *
 * Defines the data model for customizable Hamina-style reports.
 * Reports are composed of pages, each containing widgets that map
 * to WIDGET_CATEGORIES (Platform ONE API) or WIDGET_CATALOG (workspace).
 */

export type WidgetSource = 'platform_report' | 'metric_computed';

export type WidgetDisplayType =
  | 'scorecard'
  | 'timeseries'
  | 'ranking'
  | 'distribution'
  | 'bar_chart'
  | 'pie_chart';

export interface ReportWidgetConfig {
  id: string;
  /** Maps to WIDGET_CATEGORIES widget name (e.g. 'throughputReport') or _metric_xxx for computed */
  widgetKey: string;
  source: WidgetSource;
  displayType: WidgetDisplayType;
  /** Override title (if null, uses default from widget key) */
  title?: string;
  /** Grid column span (1-4, default 1) */
  gridSpan?: 1 | 2 | 3 | 4;
  /** Widget-specific config (unit, maxItems, color, etc.) */
  config?: Record<string, any>;
}

export interface ReportPageConfig {
  id: string;
  title: string;
  description?: string;
  /** Lucide icon name (e.g. 'FileText', 'Wifi') */
  icon?: string;
  category?: string;
  widgets: ReportWidgetConfig[];
  visible?: boolean;
}

export interface ReportConfig {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  /** Default duration for widget API calls */
  duration: string;
  pages: ReportPageConfig[];
  /** True for the built-in default template */
  isDefault?: boolean;
}

export interface ReportConfigStore {
  version: number;
  configs: ReportConfig[];
  activeConfigId: string;
  lastModified: number;
}
