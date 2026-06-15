/**
 * useSourceSites — loads the OS-ONE (controller) site list and the XIQ site list
 * for the source-aware site selector. Mirrors the proven Service Levels loader:
 * caches last-known-good per scope, aggregates across controllers in org scope,
 * and never blanks the list on a transient empty fetch.
 */

import { useEffect, useState } from 'react';
import { apiService, type Site } from '../services/api';
import { useAppContext } from '@/contexts/AppContext';
import { loadXiqSites, type XiqSite } from '../services/sle/xiqSites';
import { readCachedSites, writeCachedSites } from '../services/sle/sleSitesCache';

export interface SourceSites {
  /** OS-ONE / controller sites. */
  sites: Site[];
  /** XIQ sites (with owning site-group id). */
  xiqSites: XiqSite[];
}

export function useSourceSites(): SourceSites {
  const { navigationScope, siteGroups, siteGroup } = useAppContext();
  const sitesCacheKey = navigationScope === 'global' ? 'org' : (siteGroup?.id ?? 'default');
  const [sites, setSites] = useState<Site[]>(() => readCachedSites(sitesCacheKey));
  const [xiqSites, setXiqSites] = useState<XiqSite[]>([]);
  // Bumped when XIQ is connected via the UI so the XIQ site list reloads.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const onConnected = () => setRefreshTick((t) => t + 1);
    window.addEventListener('xiq-connected', onConnected);
    return () => window.removeEventListener('xiq-connected', onConnected);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cached = readCachedSites(sitesCacheKey);
      if (cached.length > 0) setSites(cached);

      const isOrgScope = navigationScope === 'global' && siteGroups.length > 0;
      try {
        const byId = new Map<string, Site>();
        try {
          const active = await apiService.getSites();
          for (const s of active) if (s?.id) byId.set(s.id, s);
        } catch (err) {
          console.warn('[useSourceSites] active getSites failed:', err);
        }
        if (isOrgScope) {
          const original = apiService.getBaseUrl();
          for (const sg of siteGroups) {
            if (!sg.controller_url) continue;
            try {
              apiService.setBaseUrl(`${sg.controller_url}/management`);
              const sgSites = await apiService.getSites();
              for (const s of sgSites) if (s?.id && !byId.has(s.id)) byId.set(s.id, s);
            } catch (err) {
              console.warn(`[useSourceSites] sites from ${sg.name} failed:`, err);
            }
          }
          apiService.setBaseUrl(original === '/api/management' ? null : original);
        }
        if (!cancelled) {
          const list = Array.from(byId.values());
          if (list.length > 0) {
            setSites(list);
            writeCachedSites(sitesCacheKey, list);
          }
        }
      } catch {
        /* keep last-known-good */
      }

      try {
        const groups =
          navigationScope === 'global' && siteGroups.length > 0
            ? siteGroups
            : siteGroup
              ? [siteGroup]
              : siteGroups;
        const lists = await Promise.all(
          groups.map((sg) => loadXiqSites(sg.id).catch(() => [] as XiqSite[]))
        );
        if (!cancelled) setXiqSites(lists.flat());
      } catch {
        /* no XIQ sites */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteGroup?.id, navigationScope, siteGroups, sitesCacheKey, refreshTick]);

  return { sites, xiqSites };
}
