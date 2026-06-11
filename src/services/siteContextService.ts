/**
 * Site Context Service
 *
 * Resolves the currently-selected site / site group into an `SLESiteContext`,
 * determining which source system (Campus Controller vs ExtremeCloud IQ) should
 * back the Service Levels page. This is the single place that decides "what kind
 * of site is selected" — the rest of the SLE pipeline keys off the result.
 */

import type { SiteGroup } from '../types/domain';
import type {
  SLESiteContext,
  SLESiteContextType,
  SLESourceSystem,
} from '../types/sleContext';

export interface ResolveSiteContextInput {
  /** Currently active site group (controller), from AppContext. */
  siteGroup: SiteGroup | null;
  /** Navigation scope from AppContext ('global' = org-wide). */
  navigationScope: string;
  /** All site groups available in the org (for org-scope aggregation). */
  siteGroups: SiteGroup[];
  /** Selected site id from the page selector, or 'all'. */
  selectedSiteId: string;
  /** Resolved display name for the selected site, if known. */
  siteName?: string | null;
}

/**
 * Decide the source system for a site group.
 *
 * Rules (in priority order):
 *  1. Explicit `source` metadata wins ('xiq' -> XIQ; 'controller'/'gateway' -> controller).
 *  2. A site group that is XIQ-authenticated AND has no controller URL is XIQ-backed.
 *  3. Everything else defaults to the controller path — this preserves the
 *     existing Gateway/Controller SLE behavior for every current site group.
 */
export function deriveSiteSource(siteGroup: SiteGroup | null): SLESourceSystem {
  if (!siteGroup) return 'controller';
  if (siteGroup.source === 'xiq') return 'xiq';
  if (siteGroup.source === 'controller' || siteGroup.source === 'gateway') return 'controller';
  if (siteGroup.xiq_authenticated && !siteGroup.controller_url) return 'xiq';
  return 'controller';
}

/** Classify the selection for display + provider routing. */
function deriveType(
  siteGroup: SiteGroup | null,
  source: SLESourceSystem,
  isOrgScope: boolean
): SLESiteContextType {
  if (source === 'xiq') return 'xiq';
  if (!siteGroup && isOrgScope) return 'site-group';
  if (siteGroup?.source === 'gateway') return 'gateway';
  return 'controller';
}

export function resolveSiteContext(input: ResolveSiteContextInput): SLESiteContext {
  const { siteGroup, navigationScope, siteGroups, selectedSiteId, siteName } = input;

  const source = deriveSiteSource(siteGroup);
  const isOrgScope = navigationScope === 'global' && (siteGroups?.length ?? 0) > 0;
  const type = deriveType(siteGroup, source, isOrgScope);

  return {
    type,
    source,
    siteGroupId: siteGroup?.id ?? null,
    siteGroupName: siteGroup?.name ?? null,
    siteId: selectedSiteId || 'all',
    siteName: siteName ?? null,
    xiqRegion: siteGroup?.xiq_region ?? null,
    controllerUrl: siteGroup?.controller_url ?? null,
    isOrgScope,
  };
}
