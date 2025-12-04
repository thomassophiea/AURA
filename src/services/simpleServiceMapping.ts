// Simple service mapping without any complex error handling or recursion
interface ServiceInfo {
  ssid: string;
  networkName: string;
  vlan: string;
}

interface RoleInfo {
  name: string;
}

class SimpleServiceMappingService {
  private services = new Map<string, ServiceInfo>();
  private roles = new Map<string, string>();
  private loaded = false;

  // Get service details with immediate fallback
  async getServiceDetails(serviceId: string): Promise<ServiceInfo> {
    if (!serviceId) {
      return { ssid: 'N/A', networkName: 'N/A', vlan: 'N/A' };
    }

    // Check cache first
    if (this.services.has(serviceId)) {
      return this.services.get(serviceId)!;
    }

    // Try to load data once if not loaded
    if (!this.loaded) {
      await this.loadData();
      if (this.services.has(serviceId)) {
        return this.services.get(serviceId)!;
      }
    }

    // Return fallback with partial UUID
    const shortId = serviceId.substring(0, 8);
    return {
      ssid: `Service ${shortId}`,
      networkName: `Service ${shortId}`,
      vlan: 'N/A'
    };
  }

  // Get role name with immediate fallback
  async getRoleName(roleId: string): Promise<string> {
    if (!roleId) {
      return 'N/A';
    }

    // Check cache first
    if (this.roles.has(roleId)) {
      return this.roles.get(roleId)!;
    }

    // Try to load data once if not loaded
    if (!this.loaded) {
      await this.loadData();
      if (this.roles.has(roleId)) {
        return this.roles.get(roleId)!;
      }
    }

    // Return fallback with partial UUID
    const shortId = roleId.substring(0, 8);
    return `Role ${shortId}`;
  }

  // Simple data loading - only called once
  private async loadData(): Promise<void> {
    if (this.loaded) return;
    
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) {
      this.loaded = true;
      return;
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    };

    try {
      // Load services
      const servicesResponse = await fetch('https://tsophiea.ddns.net:443/management/v1/services', {
        headers,
        signal: AbortSignal.timeout(5000)
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        if (Array.isArray(servicesData)) {
          servicesData.forEach((service: any) => {
            if (service && service.id) {
              this.services.set(service.id, {
                ssid: service.ssid || 'N/A',
                networkName: service.name || 'N/A',
                vlan: (service.vlan || service.dot1dPortNumber || 'N/A').toString()
              });
            }
          });
          console.log(`Loaded ${servicesData.length} services for mapping`);
        }
      }
    } catch (error) {
      console.log('Services not available for mapping');
    }

    try {
      // Load roles
      const rolesResponse = await fetch('https://tsophiea.ddns.net:443/management/roles', {
        headers,
        signal: AbortSignal.timeout(5000)
      });

      if (rolesResponse.ok) {
        const rolesData = await rolesResponse.json();
        if (Array.isArray(rolesData)) {
          rolesData.forEach((role: any) => {
            if (role && role.id && role.name) {
              this.roles.set(role.id, role.name);
            }
          });
          console.log(`Loaded ${rolesData.length} roles for mapping`);
        }
      }
    } catch (error) {
      // Silently suppress - roles endpoint may not be available on all systems
    }

    this.loaded = true;
  }

  // Get cache status for debugging
  getStatus() {
    return {
      loaded: this.loaded,
      servicesCount: this.services.size,
      rolesCount: this.roles.size
    };
  }
}

export const simpleServiceMapping = new SimpleServiceMappingService();