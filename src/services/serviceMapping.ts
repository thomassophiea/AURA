interface ServiceDetails {
  id: string;
  name: string;
  ssid?: string;
  vlan?: number;
  description?: string;
  enabled: boolean;
  [key: string]: any;
}

interface RoleDetails {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  [key: string]: any;
}

class ServiceMappingService {
  private servicesCache: Map<string, ServiceDetails> = new Map();
  private rolesCache: Map<string, RoleDetails> = new Map();
  private servicesLoaded = false;
  private rolesLoaded = false;

  // Direct fetch without using apiService to avoid any recursion
  private async directFetch(endpoint: string): Promise<any[]> {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      throw new Error('SUPPRESSED_ANALYTICS_ERROR: No access token available');
    }

    try {
      const response = await fetch(`https://tsophiea.ddns.net:443/management${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000) // 8 second timeout
      });

      if (!response.ok) {
        // Silently suppress for roles endpoint as it may not be available
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      // Silently suppress network errors for analytics endpoints
      if (endpoint.includes('/roles')) {
        // Roles endpoint may not be available, suppress without logging
        throw new Error(`SUPPRESSED_ANALYTICS_ERROR: Network error for ${endpoint}: ${error instanceof Error ? error.message : 'Failed to fetch'}`);
      }
      throw error;
    }
  }

  // Simple one-time load for services
  async loadServices(): Promise<void> {
    if (this.servicesLoaded) {
      return;
    }

    try {
      console.log('Loading services directly...');
      const services = await this.directFetch('/v1/services');
      
      this.servicesCache.clear();
      services.forEach(service => {
        if (service && service.id) {
          this.servicesCache.set(service.id, service);
        }
      });
      
      this.servicesLoaded = true;
      console.log(`Successfully loaded ${services.length} services directly`);
    } catch (error) {
      console.warn('Failed to load services directly:', error);
      this.servicesLoaded = true; // Mark as loaded to prevent retry
    }
  }

  // Simple one-time load for roles
  async loadRoles(): Promise<void> {
    if (this.rolesLoaded) {
      return;
    }

    try {
      const roles = await this.directFetch('/roles');
      
      this.rolesCache.clear();
      roles.forEach(role => {
        if (role && role.id) {
          this.rolesCache.set(role.id, role);
        }
      });
      
      this.rolesLoaded = true;
      if (roles.length > 0) {
        console.log(`Successfully loaded ${roles.length} roles`);
      }
    } catch (error) {
      // Silently suppress roles endpoint errors - this endpoint may not be available on all systems
      this.rolesLoaded = true; // Mark as loaded to prevent retry
    }
  }

  // Get service details by service ID - completely safe
  async getServiceDetails(serviceId: string): Promise<{ ssid: string; networkName: string; vlan: string } | null> {
    if (!serviceId) return null;

    // Check cache first
    const cachedService = this.servicesCache.get(serviceId);
    if (cachedService) {
      return {
        ssid: cachedService.ssid || 'N/A',
        networkName: cachedService.name || 'N/A',
        vlan: (cachedService.vlan || cachedService.dot1dPortNumber)?.toString() || 'N/A'
      };
    }

    // Only try to load if we haven't loaded yet
    if (!this.servicesLoaded) {
      await this.loadServices();
      
      // Check cache again after loading
      const service = this.servicesCache.get(serviceId);
      if (service) {
        return {
          ssid: service.ssid || 'N/A',
          networkName: service.name || 'N/A',
          vlan: (service.vlan || service.dot1dPortNumber)?.toString() || 'N/A'
        };
      }
    }

    // Return fallback with partial UUID
    const shortId = serviceId.split('-')[0].substring(0, 8);
    return {
      ssid: `Service ${shortId}`,
      networkName: `Service ${shortId}`,
      vlan: 'N/A'
    };
  }

  // Get role name by role ID - completely safe
  async getRoleName(roleId: string): Promise<string | null> {
    if (!roleId) return null;

    // Check cache first
    const cachedRole = this.rolesCache.get(roleId);
    if (cachedRole) {
      return cachedRole.name || null;
    }

    // Only try to load if we haven't loaded yet
    if (!this.rolesLoaded) {
      await this.loadRoles();
      
      // Check cache again after loading
      const role = this.rolesCache.get(roleId);
      if (role) {
        return role.name || null;
      }
    }

    // Return fallback with partial UUID
    const shortId = roleId.split('-')[0].substring(0, 8);
    return `Role ${shortId}`;
  }

  // Get service by ID
  async getService(serviceId: string): Promise<ServiceDetails | null> {
    if (!serviceId) return null;
    
    const cachedService = this.servicesCache.get(serviceId);
    if (cachedService) {
      return cachedService;
    }

    if (!this.servicesLoaded) {
      await this.loadServices();
      return this.servicesCache.get(serviceId) || null;
    }

    return null;
  }

  // Get role by ID
  async getRole(roleId: string): Promise<RoleDetails | null> {
    if (!roleId) return null;
    
    const cachedRole = this.rolesCache.get(roleId);
    if (cachedRole) {
      return cachedRole;
    }

    if (!this.rolesLoaded) {
      await this.loadRoles();
      return this.rolesCache.get(roleId) || null;
    }

    return null;
  }

  // Get all cached services
  getAllServices(): ServiceDetails[] {
    return Array.from(this.servicesCache.values());
  }

  // Get all cached roles
  getAllRoles(): RoleDetails[] {
    return Array.from(this.rolesCache.values());
  }

  // Force refresh the cache
  async refreshCache(): Promise<void> {
    this.servicesCache.clear();
    this.rolesCache.clear();
    this.servicesLoaded = false;
    this.rolesLoaded = false;
    
    await this.loadServices();
    await this.loadRoles();
  }

  // Clear the cache
  clearCache(): void {
    this.servicesCache.clear();
    this.rolesCache.clear();
    this.servicesLoaded = false;
    this.rolesLoaded = false;
  }

  // Get cache status
  getCacheStatus(): { 
    services: { size: number; loaded: boolean };
    roles: { size: number; loaded: boolean };
  } {
    return {
      services: {
        size: this.servicesCache.size,
        loaded: this.servicesLoaded
      },
      roles: {
        size: this.rolesCache.size,
        loaded: this.rolesLoaded
      }
    };
  }

  // Debug method - safe version
  async diagnoseServiceMapping(serviceId: string, roleId?: string): Promise<void> {
    console.log('=== Service Mapping Diagnostic ===');
    console.log(`Target Service ID: ${serviceId}`);
    console.log(`Target Role ID: ${roleId}`);
    
    const status = this.getCacheStatus();
    console.log('Cache Status:', status);
    
    console.log(`Services loaded: ${this.servicesLoaded}, cache size: ${this.servicesCache.size}`);
    console.log(`Roles loaded: ${this.rolesLoaded}, cache size: ${this.rolesCache.size}`);
    
    if (serviceId && this.servicesCache.has(serviceId)) {
      console.log('Target service found:', this.servicesCache.get(serviceId));
    }
    
    if (roleId && this.rolesCache.has(roleId)) {
      console.log('Target role found:', this.rolesCache.get(roleId));
    }
    
    console.log('=== End Diagnostic ===');
  }
}

export const serviceMappingService = new ServiceMappingService();