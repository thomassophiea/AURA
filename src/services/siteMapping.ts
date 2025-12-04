import { apiService, Site } from './api';

class SiteMappingService {
  private sitesCache: Map<string, Site> = new Map();
  private isLoading = false;
  private lastLoadTime = 0;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  private loadAttempts = 0;
  private maxLoadAttempts = 3;

  // Load all sites and cache them
  async loadSites(): Promise<void> {
    const now = Date.now();
    
    // Skip if we're already loading or cache is still fresh
    if (this.isLoading || (now - this.lastLoadTime < this.cacheTimeout && this.sitesCache.size > 0)) {
      return;
    }

    // Don't retry too many times
    if (this.loadAttempts >= this.maxLoadAttempts) {
      console.warn(`Reached maximum load attempts (${this.maxLoadAttempts}) for sites - skipping`);
      return;
    }

    this.isLoading = true;
    this.loadAttempts++;
    
    try {
      console.log(`Loading sites from /v3/sites for mapping (attempt ${this.loadAttempts}/${this.maxLoadAttempts})...`);
      const sites = await apiService.getSites();
      
      // Clear existing cache and populate with new data
      this.sitesCache.clear();
      
      if (sites && sites.length > 0) {
        sites.forEach(site => {
          this.sitesCache.set(site.id, site);
          // Debug logging for the specific site ID
          if (site.id === 'c7395471-aa5c-46dc-9211-3ed24c5789bd') {
            console.log('Found target site in mapping:', {
              id: site.id,
              name: site.name,
              siteName: site.siteName,
              allFields: site
            });
          }
        });
        this.lastLoadTime = now;
        this.loadAttempts = 0; // Reset attempts on success
        console.log(`Successfully loaded ${sites.length} sites for mapping`);
      } else {
        console.warn('No sites returned from /v3/sites endpoint');
        // Don't reset attempts if we got an empty response
      }
    } catch (error) {
      console.warn(`Failed to load sites for mapping from /v3/sites (attempt ${this.loadAttempts}/${this.maxLoadAttempts}):`, error);
      
      // If /v3/sites fails, we could potentially try other endpoints as fallback
      // For now, just log the detailed error
      if (error instanceof Error) {
        console.warn('Site mapping error details:', {
          message: error.message,
          stack: error.stack,
          endpoint: '/v3/sites',
          attempt: this.loadAttempts
        });
      }
    } finally {
      this.isLoading = false;
    }
  }

  // Get site name by site ID with multiple fallback strategies
  async getSiteName(siteId: string): Promise<string | null> {
    if (!siteId) return null;

    console.log(`Getting site name for ID: ${siteId}`);

    // Try to get from cache first
    const cachedSite = this.sitesCache.get(siteId);
    if (cachedSite) {
      const siteName = cachedSite.siteName || cachedSite.name || null;
      console.log(`Found site in cache: ${siteId} -> ${siteName}`);
      return siteName;
    }

    console.log(`Site ${siteId} not in cache, loading sites...`);
    console.log(`Current cache status:`, {
      size: this.sitesCache.size,
      keys: Array.from(this.sitesCache.keys()).slice(0, 5), // Show first 5 keys
      isLoading: this.isLoading,
      lastLoadTime: this.lastLoadTime
    });

    // If not in cache, try to load sites and check again
    await this.loadSites();
    
    const site = this.sitesCache.get(siteId);
    if (site) {
      const siteName = site.siteName || site.name || null;
      console.log(`Site found after loading: ${siteId} -> ${siteName}`);
      return siteName;
    } else {
      console.warn(`Site ${siteId} not found even after loading ${this.sitesCache.size} sites from sites API`);
      console.warn('Available site IDs:', Array.from(this.sitesCache.keys()).slice(0, 10));
      
      // Try individual site lookup as fallback
      console.log(`Attempting individual site lookup for ${siteId}...`);
      try {
        const individualSite = await apiService.getSiteById(siteId);
        if (individualSite) {
          const siteName = individualSite.siteName || individualSite.name || null;
          console.log(`Found site via individual lookup: ${siteId} -> ${siteName}`);
          
          // Cache the individually found site
          this.sitesCache.set(siteId, individualSite);
          return siteName;
        }
      } catch (error) {
        console.warn(`Individual site lookup failed for ${siteId}:`, error);
      }
      
      // Try to extract site info from connected clients as last resort
      console.log(`Attempting to extract site info from clients for ${siteId}...`);
      try {
        const extractedSiteName = await this.extractSiteNameFromClients(siteId);
        if (extractedSiteName) {
          console.log(`Extracted site name from clients: ${siteId} -> ${extractedSiteName}`);
          return extractedSiteName;
        }
      } catch (error) {
        console.warn(`Site name extraction from clients failed for ${siteId}:`, error);
      }
      
      // Return a user-friendly fallback instead of null
      // Create a shortened version of the UUID for better UX
      const shortId = siteId.split('-')[0].toUpperCase();
      return `Site ${shortId}`;
    }
  }

  // Fallback method to extract site name from client data
  private async extractSiteNameFromClients(siteId: string): Promise<string | null> {
    try {
      // Get clients and look for any that have site name info
      const stations = await apiService.getStations();
      
      // Look for any station with matching siteId that might have site name
      const stationWithSiteName = stations.find(station => 
        station.siteId === siteId && (station.siteName || station.site)
      );
      
      if (stationWithSiteName) {
        const siteName = stationWithSiteName.siteName || stationWithSiteName.site;
        console.log(`Extracted site name from station data: ${siteName}`);
        
        // Create a fake site object and cache it
        const fakeSite: Site = {
          id: siteId,
          name: siteName || `Site ${siteId.split('-')[0].toUpperCase()}`,
          siteName: siteName
        };
        this.sitesCache.set(siteId, fakeSite);
        
        return siteName;
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to extract site name from client data:', error);
      return null;
    }
  }

  // Get site by ID
  async getSite(siteId: string): Promise<Site | null> {
    if (!siteId) return null;

    // Try to get from cache first
    const cachedSite = this.sitesCache.get(siteId);
    if (cachedSite) {
      return cachedSite;
    }

    // If not in cache, try to load sites and check again
    await this.loadSites();
    
    return this.sitesCache.get(siteId) || null;
  }

  // Get all cached sites
  getAllSites(): Site[] {
    return Array.from(this.sitesCache.values());
  }

  // Force refresh the cache
  async refreshCache(): Promise<void> {
    this.lastLoadTime = 0; // Reset cache time to force reload
    this.loadAttempts = 0; // Reset load attempts
    await this.loadSites();
  }

  // Clear the cache
  clearCache(): void {
    this.sitesCache.clear();
    this.lastLoadTime = 0;
    this.loadAttempts = 0;
  }

  // Get cache status
  getCacheStatus(): { isLoading: boolean; size: number; lastLoadTime: number; isStale: boolean; loadAttempts: number; maxAttempts: number } {
    const now = Date.now();
    const isStale = now - this.lastLoadTime > this.cacheTimeout;
    
    return {
      isLoading: this.isLoading,
      size: this.sitesCache.size,
      lastLoadTime: this.lastLoadTime,
      isStale,
      loadAttempts: this.loadAttempts,
      maxAttempts: this.maxLoadAttempts
    };
  }

  // Debug method to help diagnose site mapping issues
  async diagnoseSiteMapping(targetSiteId: string): Promise<void> {
    console.log('=== Site Mapping Diagnostic ===');
    console.log(`Target Site ID: ${targetSiteId}`);
    
    // Check cache status
    const status = this.getCacheStatus();
    console.log('Cache Status:', status);
    
    // List all cached sites
    console.log('Cached Sites:');
    Array.from(this.sitesCache.entries()).forEach(([id, site]) => {
      console.log(`  ${id}: ${site.name || site.siteName || 'No Name'}`);
    });
    
    // Try to load sites manually
    console.log('Attempting to load sites...');
    await this.loadSites();
    
    // Check if target site exists
    const targetSite = this.sitesCache.get(targetSiteId);
    if (targetSite) {
      console.log('Target site found:', targetSite);
    } else {
      console.log('Target site NOT found');
      
      // Try individual lookup
      console.log('Attempting individual site lookup...');
      try {
        const individualSite = await apiService.getSiteById(targetSiteId);
        if (individualSite) {
          console.log('Individual lookup successful:', individualSite);
        } else {
          console.log('Individual lookup also failed');
        }
      } catch (error) {
        console.log('Individual lookup error:', error);
      }
    }
    
    console.log('=== End Diagnostic ===');
  }
}

export const siteMappingService = new SiteMappingService();