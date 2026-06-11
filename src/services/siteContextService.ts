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
  /** Selected site id from the page selector, or 'all'. May be an XIQ value. */
  selectedSiteId: string;
  /** Resolved display name for the selected site, if known. */
  siteName?: string | null;
}

/** Prefix marking an encoded XIQ site selection: `xiq:<siteGroupId>:<locationId>`. */
const XIQ_SITE_PREFIX = 'xiq:';

/** Build the selector value for an XIQ site. */
export function buildXiqSiteValue(siteGroupId: string, locationId: string): string {
  return `${XIQ_SITE_PREFIX}${siteGroupId}:${locationId}`;
}

/** Parse an XIQ site selector value, or null if it isn't one. */
export function parseXiqSiteValue(
  value: string
): { siteGroupId: string; locationId: string } | null {
  if (!value.startsWith(XIQ_SITE_PREFIX)) return null;
  const rest = value.slice(XIQ_SITE_PREFIX.length);
  const idx = rest.indexOf(':');
  if (idx < 0) return null;
  return { siteGroupId: rest.slice(0, idx), locationId: rest.slice(idx + 1) };
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

  // An explicitly-selected XIQ site overrides site-group derivation: the
  // selected site itself determines the source (selectedSite -> siteType -> source).
  const xiqSel = parseXiqSiteValue(selectedSiteId || '');
  if (xiqSel) {
    const owner = siteGroups.find((sg) => sg.id === xiqSel.siteGroupId) ?? siteGroup;
    return {
      type: 'xiq',
      source: 'xiq',
      siteGroupId: xiqSel.siteGroupId,
      siteGroupName: owner?.name ?? null,
      siteId: selectedSiteId,
      siteName: siteName ?? null,
      xiqRegion: owner?.xiq_region ?? null,
      xiqLocationId: xiqSel.locationId,
      controllerUrl: null,
      isOrgScope: false,
    };
  }

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
    xiqLocationId: null,
    controllerUrl: siteGroup?.controller_url ?? null,
    isOrgScope,
  };
}
