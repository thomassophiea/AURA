import { useState, useEffect } from 'react';
import type { SiteGroup } from '../types/domain';
import { tenantService } from '../services/tenantService';

/**
 * Loads the list of Site Groups for the current session.
 * Each Site Group maps to one controller domain.
 * Re-loads automatically when the active controller changes.
 */
export function useSiteGroups() {
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      tenantService.getSiteGroups()
        .then(groups => { if (!cancelled) { setSiteGroups(groups); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    };

    load();

    const handleControllerChanged = () => load();
    window.addEventListener('controllerChanged', handleControllerChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('controllerChanged', handleControllerChanged);
    };
  }, []);

  return { siteGroups, loading };
}
