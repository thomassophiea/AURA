/**
 * Normalized SLE Page Model
 *
 * The single shape the Service Levels UI consumes, regardless of data source.
 * Both the controller (gateway) provider and the XIQ provider return this, which
 * keeps the page visually consistent when the context changes.
 *
 * The per-SLE detail (name, category/scope, health/status, score, trend, impacted
 * counts, classifiers/honeycomb cells, drill-down) lives in `SLEMetric`. This
 * wrapper adds source-system and site-context metadata plus availability info.
 */

import type { SLEMetric, SLEThresholds } from './sle';
import type { SLESiteContext, SLESourceSystem } from './sleContext';
import type { SiteGroup } from './domain';

export interface SLEPageModel {
  /** Which system produced this data. */
  source: SLESourceSystem;
  /** The resolved site context this model was built for. */
  context: SLESiteContext;
  /** Wireless SLE metrics, in the canonical order the honeycomb expects. */
  sles: SLEMetric[];
  /** Raw client/station rows (controller shape) for honeycomb drill-down. */
  stations: unknown[];
  /** Raw AP rows (controller shape) for AP-health drill-down. */
  aps: unknown[];
  /** Epoch ms when this model was produced. */
  generatedAt: number;
  /** SLE ids that cannot be computed for this source (rendered as unavailable). */
  unavailableMetrics: string[];
  /** Non-fatal notes to surface to the user (e.g. "Connect XIQ to load data"). */
  warnings: string[];
}

export interface SLELoadOptions {
  /** Page time range token: '1h' | '24h' | '7d'. */
  timeRange: string;
  /** Active per-site thresholds to compute against. */
  thresholds: SLEThresholds;
  /** Site groups available for org-scope aggregation (controller path). */
  siteGroups: SiteGroup[];
}

/**
 * Common provider contract. A provider turns an `SLESiteContext` into the
 * normalized `SLEPageModel`. Add more providers (e.g. a future cloud source)
 * by implementing this and registering them in `sleProviderFactory`.
 */
export interface SLEProvider {
  readonly source: SLESourceSystem;
  load(context: SLESiteContext, options: SLELoadOptions): Promise<SLEPageModel>;
}

/** Build an empty model (used for unavailable / not-connected states). */
export function emptySLEPageModel(
  source: SLESourceSystem,
  context: SLESiteContext,
  warnings: string[] = []
): SLEPageModel {
  return {
    source,
    context,
    sles: [],
    stations: [],
    aps: [],
    generatedAt: Date.now(),
    unavailableMetrics: [],
    warnings,
  };
}
