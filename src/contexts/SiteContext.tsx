import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';

interface Site {
  id: string;
  name?: string; // May not always be present, fallback to siteName or displayName
  siteName?: string;
  displayName?: string;
}

interface SiteContextType {
  currentSite: Site | null;
  loading: boolean;
  error: string | null;
  refreshSite: () => Promise<void>;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const HARDCODED_SITE_ID = 'c7395471-aa5c-46dc-9211-3ed24c5789bd';

  const loadSite = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to get site by ID first
      const site = await apiService.getSiteById(HARDCODED_SITE_ID);

      if (site) {
        console.log('[SiteContext] Loaded site:', site);
        setCurrentSite(site);
      } else {
        // If specific site not found, get first available site
        const sites = await apiService.getSites();
        if (sites && sites.length > 0) {
          const firstSite = sites[0];
          console.log('[SiteContext] Fallback to first site:', firstSite);
          setCurrentSite(firstSite);
        } else {
          console.warn('[SiteContext] No sites available');
          setError('No sites available');
        }
      }
    } catch (err) {
      console.error('[SiteContext] Failed to load site:', err);
      setError('Failed to load site information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSite();
  }, []);

  const refreshSite = async () => {
    await loadSite();
  };

  return (
    <SiteContext.Provider value={{ currentSite, loading, error, refreshSite }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error('useSite must be used within a SiteProvider');
  }
  return context;
}

// Helper to get site display name
export function getSiteDisplayName(site: Site | null): string {
  if (!site) return '';
  return site.displayName || site.name || site.siteName || 'Unknown Site';
}
