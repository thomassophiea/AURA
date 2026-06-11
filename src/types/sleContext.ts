/**
 * SLE Site-Context Types
 *
 * The Service Levels page renders a single unified experience whose data source
 * is driven entirely by the selected site / site group. `siteContextService`
 * resolves the active selection into an `SLESiteContext`, and `sleProviderFactory`
 * maps that context to the correct SLE data provider.
 *
 *   selectedSite -> siteType -> dataSource -> SLE model -> metrics -> honeycombs
 *
 * NOTE: a separate `SiteContext` type already exists in `./siteContext` for venue
 * threshold profiles — these `SLE`-prefixed types are intentionally distinct.
 */

/** Data source system that ultimately serves the SLE data. */
export type SLESourceSystem = 'controller' | 'xiq';

/**
 * User-facing classification of the selected context. Maps to a source system:
 *  - 'controller' | 'gateway' -> Campus Controller / Gateway (source: 'controller')
 *  - 'xiq'                     -> ExtremeCloud IQ            (source: 'xiq')
 *  - 'site-group'             -> org-wide / multi-controller aggregate (source: 'controller')
 */
export type SLESiteContextType = 'controller' | 'gateway' | 'xiq' | 'site-group';

export interface SLESiteContext {
  /** User-facing classification of the selection. */
  type: SLESiteContextType;
  /** Source system that drives the provider factory. */
  source: SLESourceSystem;
  /** Active site group id (controller), or null when none/org-scope. */
  siteGroupId: string | null;
  siteGroupName: string | null;
  /** Selected site id from the page selector, or 'all'. */
  siteId: string;
  siteName: string | null;
  /** XIQ region for this site group's account, when source === 'xiq'. */
  xiqRegion: string | null;
  /** Resolved controller base URL, when controller-backed. */
  controllerUrl: string | null;
  /** True when navigation is org-wide and should aggregate across controllers. */
  isOrgScope: boolean;
}

/** Human-readable label for a source system (used for the small context indicator). */
export const SLE_SOURCE_LABELS: Record<SLESourceSystem, string> = {
  controller: 'Controller',
  xiq: 'XIQ Cloud',
};
