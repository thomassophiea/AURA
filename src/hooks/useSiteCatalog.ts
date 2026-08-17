/**
 * useSiteCatalog — the site hierarchy every picker and site-scoped list reads.
 *
 * Wraps `useSourceSites` (which does the loading) with `services/siteCatalog`
 * (which owns the rules), so a component gets the OS1 Gateway boundaries, the
 * OS1 Staging site and the XIQ Default Site already assembled and already
 * ordered. Components must not re-derive any of that: the ordering and the
 * Gateway-"Unassigned"-means-Staging translation exist in exactly one place.
 *
 * A component that has *already* loaded sites should call
 * `useSiteCatalogFrom(...)` instead, so it builds the hierarchy from what it
 * holds rather than triggering a second fetch of the same data.
 */

import { useMemo } from 'react';

import { useAppContext } from '@/contexts/AppContext';
import { useSourceSites } from './useSourceSites';
import { buildSiteCatalog, type SiteCatalogResult } from '../services/siteCatalog';
import { xiqService } from '../services/xiqService';
import type { SiteGroup } from '../types/domain';
import type { Site } from '../services/api';
import type { XiqSite } from '../services/sle/xiqSites';

export interface UseSiteCatalogOptions {
  /**
   * What a normal OS1 site's selector value should be — the site name (for
   * pages that filter rows by name) or its id (for pages that fetch per-site).
   * Mirrors SourceSiteSelector's existing `osSiteValue` prop.
   */
  osSiteValue?: 'name' | 'id';
  /**
   * Devices the caller already knows are unassigned, used for the Staging
   * count. Omit when the caller has no device list — Staging is shown either
   * way, since its existence does not depend on anything being in it.
   */
  unassignedDeviceCount?: number | null;
}

export type SiteCatalog = SiteCatalogResult;

/**
 * The Site Group whose XIQ session backs the Default Site, independent of
 * whether XIQ returned any locations. A Site Group with a live token is
 * XIQ-connected even when its location list is empty, which is exactly the
 * state Default Site has to survive.
 */
function findXiqOwner(siteGroup: SiteGroup | null, siteGroups: SiteGroup[]): string | null {
  const candidates = siteGroup ? [siteGroup, ...siteGroups] : siteGroups;
  for (const sg of candidates) {
    try {
      if (xiqService.getToken(sg.id)) return sg.id;
    } catch {
      /* an unreadable token store just means "not connected" */
    }
  }
  return null;
}

/** Build the catalog from sites a component already holds. No extra fetching. */
export function useSiteCatalogFrom(
  sites: Site[],
  xiqSites: XiqSite[],
  options: UseSiteCatalogOptions = {}
): SiteCatalog {
  const { osSiteValue = 'name', unassignedDeviceCount = null } = options;
  const { siteGroups, siteGroup } = useAppContext();

  const xiqSiteGroupId = useMemo(
    () => findXiqOwner(siteGroup, siteGroups),
    // Recomputed whenever the XIQ site list changes, which is when a connect
    // has just landed and a token may have appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteGroup, siteGroups, xiqSites]
  );

  return useMemo(
    () =>
      buildSiteCatalog({
        siteGroups,
        sites,
        xiqSites,
        xiqSiteGroupId,
        unassignedDeviceCount,
        osSiteValue,
      }),
    [siteGroups, sites, xiqSites, xiqSiteGroupId, unassignedDeviceCount, osSiteValue]
  );
}

/** Load sites and build the catalog. For components with no site list of their own. */
export function useSiteCatalog(options: UseSiteCatalogOptions = {}): SiteCatalog {
  const { sites, xiqSites } = useSourceSites();
  return useSiteCatalogFrom(sites, xiqSites, options);
}
