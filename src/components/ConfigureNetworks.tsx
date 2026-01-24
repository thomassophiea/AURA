import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Checkbox } from './ui/checkbox';
import { AlertCircle, Wifi, Search, RefreshCw, Filter, Plus, Edit, Trash2, Eye, EyeOff, Shield, Radio, Settings, Network, Users, Globe, Lock, Unlock, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { NetworkEditDetail } from './NetworkEditDetail';
import { CreateWLANDialog } from './CreateWLANDialog';
import { apiService, Service, Role } from '../services/api';
import { toast } from 'sonner';

interface NetworkConfig {
  id: string;
  name: string;
  ssid: string;
  authType: string;
  vlanId?: number;
  band?: string;
  enabled: boolean;
  hidden?: boolean;
  maxClients?: number;
  currentClients: number;
  captivePortal?: boolean;
  enableCaptivePortal?: boolean;
  guestAccess?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

// Helper function to map auth type from the API privacy object
const mapAuthType = (service: Service): string => {
  // Get the service name for logging (handle both name and serviceName fields)
  const serviceName = service.name || service.serviceName || service.ssid || 'Unknown';

  // Debug: Log what we're checking with FULL privacy object structure
  console.log(`[ConfigureNetworks] Checking auth for "${serviceName}":`, {
    hasWpaSaeElement: !!service.WpaSaeElement,
    hasPrivacyWpaSaeElement: !!service.privacy?.WpaSaeElement,
    WpaSaeElement: service.WpaSaeElement,
    privacyWpaSaeElement: service.privacy?.WpaSaeElement,
    privacyObject: service.privacy,
    privacyKeys: service.privacy ? Object.keys(service.privacy) : [],
    privacyFullStructure: service.privacy ? JSON.stringify(service.privacy, null, 2) : 'No privacy object'
  });

  // Priority 1: Check for WPA3-SAE (Simultaneous Authentication of Equals) - WPA3-Personal
  // Check multiple possible locations and field name variations
  const saeElement = service.WpaSaeElement 
    || service.privacy?.WpaSaeElement 
    || service.privacy?.wpaSaeElement
    || service.privacy?.sae
    || service.privacy?.SAE
    || service.WpaSae
    || service.privacy?.WpaSae;

  if (saeElement) {
    console.log(`[ConfigureNetworks] Found WPA3-SAE for "${serviceName}":`, {
      saeElement,
      location: service.WpaSaeElement ? 'service.WpaSaeElement' : 
                service.privacy?.WpaSaeElement ? 'service.privacy.WpaSaeElement' :
                service.privacy?.wpaSaeElement ? 'service.privacy.wpaSaeElement' :
                service.privacy?.sae ? 'service.privacy.sae' :
                service.privacy?.SAE ? 'service.privacy.SAE' :
                service.WpaSae ? 'service.WpaSae' :
                'service.privacy.WpaSae'
    });
    
    // Determine if it's pure WPA3 or transition mode based on PMF and SAE method
    if (saeElement?.pmfMode === 'required' && saeElement?.saeMethod === 'SaeH2e') {
      console.log(`✅ Returning WPA3-Personal (SAE) for "${serviceName}"`);
      return 'WPA3-Personal (SAE)';
    } else if (saeElement?.pmfMode === 'capable') {
      console.log(`✅ Returning WPA2/WPA3-Personal (Transition) for "${serviceName}"`);
      return 'WPA2/WPA3-Personal (Transition)';
    }
    console.log(`✅ Returning WPA3-Personal for "${serviceName}"`);
    return 'WPA3-Personal';
  }
  
  // Also check for beaconProtection which might indicate WPA3
  if (service.beaconProtection === true || service.privacy?.beaconProtection === true) {
    console.log(`🛡️ Found beaconProtection for "${serviceName}" - might be WPA3`);
  }

  // Priority 2: Check WpaEnterpriseElement at the top level (for Enterprise networks)
  if (service.WpaEnterpriseElement?.mode) {
    const mode = service.WpaEnterpriseElement.mode.toLowerCase();
    switch (mode) {
      case 'aesonly':
        return 'WPA2-Enterprise (AES)';
      case 'tkiponly':
        return 'WPA-Enterprise (TKIP)';
      case 'mixed':
        return 'WPA/WPA2-Enterprise (Mixed)';
      case 'wpa3only':
        return 'WPA3-Enterprise';
      case 'wpa3mixed':
        return 'WPA2/WPA3-Enterprise';
      default:
        return `WPA-Enterprise (${service.WpaEnterpriseElement.mode})`;
    }
  }

  // Priority 3: Check privacy.WpaEnterpriseElement.mode (nested Enterprise networks)
  if (service.privacy?.WpaEnterpriseElement?.mode) {
    const mode = service.privacy.WpaEnterpriseElement.mode.toLowerCase();
    switch (mode) {
      case 'aesonly':
        return 'WPA2-Enterprise (AES)';
      case 'tkiponly':
        return 'WPA-Enterprise (TKIP)';
      case 'mixed':
        return 'WPA/WPA2-Enterprise (Mixed)';
      case 'wpa3only':
        return 'WPA3-Enterprise';
      case 'wpa3mixed':
        return 'WPA2/WPA3-Enterprise';
      default:
        return `WPA-Enterprise (${service.privacy.WpaEnterpriseElement.mode})`;
    }
  }

  // Priority 3b: Check for WpaEnterpriseElement existence without mode (802.1X)
  // Some enterprise configs may not have a mode property but still indicate 802.1X
  if (service.WpaEnterpriseElement || service.privacy?.WpaEnterpriseElement) {
    const enterpriseElement = service.WpaEnterpriseElement || service.privacy?.WpaEnterpriseElement;
    // Check PMF mode to determine WPA2 vs WPA3 Enterprise
    if (enterpriseElement?.pmfMode === 'required') {
      return 'WPA3-Enterprise';
    }
    return 'WPA2-Enterprise';
  }

  // Priority 3c: Check for other 802.1X / EAP authentication indicators
  // Various API formats may use different field names for enterprise auth
  const eapElement = service.WpaEapElement
    || service.privacy?.WpaEapElement
    || service.eapElement
    || service.privacy?.eapElement
    || service.dot1xElement
    || service.privacy?.dot1xElement
    || service['802.1x']
    || service.privacy?.['802.1x'];

  if (eapElement) {
    console.log(`✅ Found 802.1X/EAP element for "${serviceName}":`, eapElement);
    return 'WPA2-Enterprise (802.1X)';
  }

  // Priority 4: Check WpaPskElement at service level (for PSK networks)
  if (service.WpaPskElement?.mode) {
    const mode = service.WpaPskElement.mode.toLowerCase();
    switch (mode) {
      case 'aesonly':
        return 'WPA2-PSK (AES)';
      case 'tkiponly':
        return 'WPA-PSK (TKIP)';
      case 'mixed':
        return 'WPA/WPA2-PSK (Mixed)';
      case 'wpa3only':
        return 'WPA3-PSK';
      case 'wpa3mixed':
        return 'WPA2/WPA3-PSK';
      default:
        return `WPA-PSK (${service.WpaPskElement.mode})`;
    }
  }

  // Priority 5: Check privacy.WpaPskElement.mode (nested PSK networks)
  if (service.privacy?.WpaPskElement?.mode) {
    const mode = service.privacy.WpaPskElement.mode.toLowerCase();
    switch (mode) {
      case 'aesonly':
        return 'WPA2-PSK (AES)';
      case 'tkiponly':
        return 'WPA-PSK (TKIP)';
      case 'mixed':
        return 'WPA/WPA2-PSK (Mixed)';
      case 'wpa3only':
        return 'WPA3-PSK';
      case 'wpa3mixed':
        return 'WPA2/WPA3-PSK';
      default:
        return `WPA-PSK (${service.privacy.WpaPskElement.mode})`;
    }
  }

  // Priority 6: Check top-level mode field (may indicate security mode)
  if (service.mode) {
    const mode = service.mode.toLowerCase();
    switch (mode) {
      case 'aesonly':
        return 'WPA2-PSK (AES)';
      case 'tkiponly':
        return 'WPA-PSK (TKIP)';
      case 'mixed':
        return 'WPA/WPA2-PSK (Mixed)';
      case 'wpa3only':
        return 'WPA3-PSK';
      case 'wpa3mixed':
        return 'WPA2/WPA3-PSK';
      case 'open':
        return 'Open';
      default:
        return service.mode;
    }
  }

  // Priority 7: Check security object
  if (service.security?.type) {
    return service.security.type;
  }

  // Priority 8: Check explicit security type fields
  if (service.securityType) {
    return service.securityType;
  }

  if (service.authType) {
    return service.authType;
  }

  if (service.privacyType) {
    return service.privacyType;
  }

  // Priority 9: Check encryption field
  if (service.encryption) {
    const enc = service.encryption.toLowerCase();
    if (enc.includes('wpa3')) return 'WPA3-PSK';
    if (enc.includes('wpa2')) return 'WPA2-PSK (AES)';
    if (enc.includes('wpa')) return 'WPA-PSK';
    if (enc.includes('aes')) return 'WPA2-PSK (AES)';
    return service.encryption;
  }

  // Priority 10: Check if there's a passphrase/password field (indicates secured network)
  if (service.passphrase || service.password || service.psk || service.privacy?.WpaSaeElement?.presharedKey) {
    return 'WPA2-PSK (Secured)';
  }

  // Priority 11: Check security mode
  if (service.securityMode) {
    return service.securityMode;
  }

  // Priority 12: Check if explicitly marked as open
  if (service.open === true || service.isOpen === true) {
    console.log(`🔓 "${serviceName}" explicitly marked as Open`);
    return 'Open';
  }

  // Priority 13: If there's a privacy object with content, it's NOT open - it's secured but unknown type
  // Having a privacy object typically indicates some form of security is configured
  if (service.privacy && typeof service.privacy === 'object' && Object.keys(service.privacy).length > 0) {
    console.log(`🔐 "${serviceName}" has privacy config but unknown type. Privacy keys:`, Object.keys(service.privacy));
    // Check for any key that suggests enterprise/802.1X authentication
    const privacyKeys = Object.keys(service.privacy).map(k => k.toLowerCase());
    if (privacyKeys.some(k => k.includes('enterprise') || k.includes('eap') || k.includes('802') || k.includes('1x') || k.includes('radius'))) {
      return 'WPA2-Enterprise';
    }
    // Check for PSK-related keys
    if (privacyKeys.some(k => k.includes('psk') || k.includes('passphrase') || k.includes('key'))) {
      return 'WPA2-PSK';
    }
    // Unknown secured network
    return 'Secured (Unknown)';
  }

  // Default to Open only if no auth information is found AND no privacy object
  console.log(`⚠️ "${serviceName}" defaulting to Open - No security config found. Available fields:`, {
    topLevelKeys: Object.keys(service),
    privacyKeys: service.privacy ? Object.keys(service.privacy) : [],
    hasPrivacy: !!service.privacy,
    privacyType: typeof service.privacy
  });
  return 'Open';
};

// Helper function to transform service data to network config
const transformServiceToNetwork = (service: Service, clientCount = 0): NetworkConfig => {
  // Handle both 'name' and 'serviceName' fields (Campus Controller uses serviceName)
  const networkName = service.name || service.serviceName || service.ssid || 'Unnamed Network';
  const networkSSID = service.ssid || service.name || service.serviceName || 'Unnamed SSID';
  
  // Handle both 'enabled' boolean and 'status' string
  const isEnabled = service.enabled !== undefined 
    ? service.enabled 
    : (service.status === 'enabled' || service.status !== 'disabled');
  
  // Handle both 'hidden' and 'suppressSsid' fields
  const isHidden = service.hidden || service.suppressSsid || service.broadcastSSID === false;

  // Get auth type
  const authType = mapAuthType(service);
  
  // Debug: Always log service mapping for troubleshooting auth type issues
  console.log(`[ConfigureNetworks] Network: "${networkSSID}" -> Auth: "${authType}"`, {
    id: service.id,
    serviceName: service.serviceName,
    name: service.name,
    ssid: networkSSID,
    authType,
    hasWpaSae: !!(service.WpaSaeElement || service.privacy?.WpaSaeElement),
    WpaSaeElement: service.WpaSaeElement || service.privacy?.WpaSaeElement,
    hasWpaPsk: !!(service.WpaPskElement || service.privacy?.WpaPskElement),
    hasWpaEnterprise: !!(service.WpaEnterpriseElement || service.privacy?.WpaEnterpriseElement),
    privacyKeys: service.privacy ? Object.keys(service.privacy) : []
  });

  return {
    id: service.id,
    name: networkName,
    ssid: networkSSID,
    authType, // Use the pre-calculated auth type
    vlanId: service.dot1dPortNumber || service.vlan || service.vlanId,
    band: '2.4/5 GHz', // Simplified for now
    enabled: isEnabled,
    hidden: isHidden,
    maxClients: service.maxClients || service.maxUsers || 0,
    currentClients: clientCount,
    captivePortal: service.captivePortal || service.webPortal || false,
    enableCaptivePortal: service.enableCaptivePortal || false,
    guestAccess: service.guestAccess || service.guest || false,
    description: service.description,
    createdAt: service.createdAt || service.createTime,
    updatedAt: service.updatedAt || service.updateTime,
    ...service // Include all original service properties
  };
};

export function ConfigureNetworks() {
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
  const [filterBand, setFilterBand] = useState<string>('all');
  const [filterSecurity, setFilterSecurity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [expandedNetworkId, setExpandedNetworkId] = useState<string | null>(null);

  useEffect(() => {
    loadNetworks();
  }, []);

  const loadNetworks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Add timeout wrapper to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 15 seconds')), 15000)
      );
      
      // Load services with timeout (roles not needed for networks table)
      const [servicesResponse] = await Promise.race([
        Promise.allSettled([
          apiService.getServices()
        ]),
        timeoutPromise
      ]) as [PromiseSettledResult<any>];

      let loadedServices: Service[] = [];

      if (servicesResponse.status === 'fulfilled') {
        loadedServices = servicesResponse.value;
        setServices(loadedServices);
        console.log('🌐 LOADED SERVICES COUNT:', loadedServices.length);
      } else {
        console.warn('Failed to load services:', servicesResponse.reason);
      }

      // Set empty roles array since roles are not used in networks configuration
      setRoles([]);

      // Transform services to network configurations
      const networkConfigs: NetworkConfig[] = [];
      
      for (const service of loadedServices) {
        try {
          // Get service-specific clients using the service stations endpoint
          let clientCount = 0;
          try {
            const serviceStationsTimeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Service stations request timed out')), 8000)
            );
            
            const serviceStations = await Promise.race([
              apiService.getServiceStations(service.id),
              serviceStationsTimeoutPromise
            ]) as any[];
            
            clientCount = Array.isArray(serviceStations) ? serviceStations.length : 0;
          } catch (serviceStationsError) {
            console.warn(`Failed to get stations for service ${service.id}:`, serviceStationsError);
            // If it's a session expiration, let it bubble up to be handled by the app
            if (serviceStationsError instanceof Error && serviceStationsError.message.includes('Session expired')) {
              throw serviceStationsError;
            }
            // For other errors, use zero client count for this service
            clientCount = 0;
          }

          const networkConfig = transformServiceToNetwork(service, clientCount);
          networkConfigs.push(networkConfig);
          
          // Log each transformed network
          console.log(`🔄 Transformed: "${networkConfig.ssid}" → Auth: "${networkConfig.authType}"`);
        } catch (transformError) {
          console.warn(`Failed to transform service ${service.id}:`, transformError);
        }
      }

      setNetworks(networkConfigs);
      
      // Log summary of all networks
      console.log('📊 ALL NETWORKS LOADED:');
      networkConfigs.forEach(n => {
        console.log(`  - ${n.ssid}: ${n.authType} (Enabled: ${n.enabled})`);
      });

      if (networkConfigs.length === 0 && loadedServices.length === 0) {
        // If no data at all, show a helpful message
        if (servicesResponse.status === 'rejected') {
          throw new Error(servicesResponse.reason?.message || 'Failed to load network services');
        }
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load networks';
      setError(errorMessage);
      
      // Don't show toast for session expiration - let App.tsx handle it
      if (!errorMessage.includes('Session expired')) {
        toast.error('Failed to load networks', {
          description: errorMessage
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredNetworks = networks.filter(network => {
    const matchesSearch = 
      network.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      network.ssid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      network.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBand = filterBand === 'all' || 
                       network.band === filterBand || 
                       (filterBand === 'Both' && (network.band?.toLowerCase().includes('both') || network.band?.toLowerCase().includes('dual') || network.band?.toLowerCase().includes('+')));
    
    const matchesSecurity = filterSecurity === 'all' || 
                           network.authType?.toLowerCase().includes(filterSecurity.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'enabled' && network.enabled) ||
                         (filterStatus === 'disabled' && !network.enabled);
    
    return matchesSearch && matchesBand && matchesSecurity && matchesStatus;
  });

  const handleToggleNetwork = async (networkId: string, enabled: boolean) => {
    try {
      // Find the original service to update
      const service = services.find(s => s.id === networkId);
      if (!service) {
        throw new Error('Service not found');
      }

      // Create a minimal, validated update payload
      const updatePayload: any = {
        serviceName: service.name || service.ssid || 'Unnamed Network', // Ensure serviceName is never null/empty
        name: service.name || service.ssid || 'Unnamed Network',
        ssid: service.ssid || service.name || 'Unnamed SSID',
        enabled: Boolean(enabled)
      };

      // Handle preAuthenticatedIdleTimeout validation
      if (service.preAuthenticatedIdleTimeout !== undefined) {
        const currentTimeout = Number(service.preAuthenticatedIdleTimeout);
        if (isNaN(currentTimeout) || currentTimeout < 5 || currentTimeout > 999999) {
          // Set to valid default if current value is invalid
          updatePayload.preAuthenticatedIdleTimeout = 300; // 5 minutes
        } else {
          // Keep existing valid value
          updatePayload.preAuthenticatedIdleTimeout = currentTimeout;
        }
      }
      
      // Remove any fields that could cause validation issues
      delete updatePayload.preAuthenticatedIdleTimeout;

      console.log('Updating network with payload:', updatePayload);

      // Update the service via API
      await apiService.updateService(networkId, updatePayload);
      
      // Update local state
      setNetworks(prev => prev.map(network => 
        network.id === networkId ? { ...network, enabled } : network
      ));
      
      setServices(prev => prev.map(service => 
        service.id === networkId ? { ...service, enabled } : service
      ));
      
      toast.success(`Network ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update network status';
      toast.error('Failed to update network status', {
        description: errorMessage
      });
    }
  };

  const handleDeleteNetwork = async (networkId: string) => {
    const network = networks.find(n => n.id === networkId);
    if (!confirm(`Are you sure you want to delete the network "${network?.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete the service via API
      await apiService.deleteService(networkId);
      
      // Update local state
      setNetworks(prev => prev.filter(network => network.id !== networkId));
      setServices(prev => prev.filter(service => service.id !== networkId));
      setSelectedNetworks(prev => prev.filter(id => id !== networkId));
      
      // Close expanded view if this network was expanded
      if (expandedNetworkId === networkId) {
        setExpandedNetworkId(null);
      }
      
      toast.success('Network deleted successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete network';
      toast.error('Failed to delete network', {
        description: errorMessage
      });
    }
  };

  const handleSelectNetwork = (networkId: string, selected: boolean) => {
    if (selected) {
      setSelectedNetworks(prev => [...prev, networkId]);
    } else {
      setSelectedNetworks(prev => prev.filter(id => id !== networkId));
    }
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedNetworks(filteredNetworks.map(network => network.id));
    } else {
      setSelectedNetworks([]);
    }
  };

  const handleToggleExpanded = (networkId: string) => {
    setExpandedNetworkId(expandedNetworkId === networkId ? null : networkId);
  };

  const handleNetworkSaved = () => {
    // Refresh the networks list after a save
    loadNetworks();
    toast.success('Network configuration saved successfully');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-4">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="surface-2dp">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2 text-headline-6 text-high-emphasis">
                <Network className="h-5 w-5" />
                <span>Network Configurations</span>
              </CardTitle>
              <CardDescription>
                Manage and configure wireless networks, SSIDs, and security policies using Campus Controller Services API
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={loadNetworks}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create WLAN
              </Button>
            </div>

            {/* Create WLAN Dialog */}
            <CreateWLANDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={() => {
                setShowCreateDialog(false);
                loadNetworks();
              }}
            />
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Filters and Search */}
          <div className="flex flex-col space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search networks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterBand} onValueChange={setFilterBand}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="All Bands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bands</SelectItem>
                  <SelectItem value="2.4GHz">2.4GHz</SelectItem>
                  <SelectItem value="5GHz">5GHz</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterSecurity} onValueChange={setFilterSecurity}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Auth Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Auth Types</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="WPA2-PSK">WPA2-PSK (AES)</SelectItem>
                  <SelectItem value="WPA-PSK">WPA-PSK (TKIP)</SelectItem>
                  <SelectItem value="WPA/WPA2-PSK">WPA/WPA2-PSK (Mixed)</SelectItem>
                  <SelectItem value="WPA3-PSK">WPA3-PSK</SelectItem>
                  <SelectItem value="WPA3-Personal">WPA3-Personal (SAE)</SelectItem>
                  <SelectItem value="WPA2/WPA3-PSK">WPA2/WPA3-PSK</SelectItem>
                  <SelectItem value="WPA2/WPA3-Personal">WPA2/WPA3-Personal (Transition)</SelectItem>
                  <SelectItem value="WPA2-Enterprise">WPA2-Enterprise (AES)</SelectItem>
                  <SelectItem value="WPA-Enterprise">WPA-Enterprise (TKIP)</SelectItem>
                  <SelectItem value="WPA/WPA2-Enterprise">WPA/WPA2-Enterprise (Mixed)</SelectItem>
                  <SelectItem value="WPA3-Enterprise">WPA3-Enterprise</SelectItem>
                  <SelectItem value="WPA2/WPA3-Enterprise">WPA2/WPA3-Enterprise</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {selectedNetworks.length > 0 && (
              <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                <span className="text-sm">
                  {selectedNetworks.length} network{selectedNetworks.length === 1 ? '' : 's'} selected
                </span>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Bulk Actions
                </Button>
              </div>
            )}
          </div>

          {/* Networks Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedNetworks.length === filteredNetworks.length && filteredNetworks.length > 0}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all networks"
                    />
                  </TableHead>
                  <TableHead>SSID</TableHead>
                  <TableHead>Auth Type</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Captive Portal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNetworks.map((network) => (
                  <React.Fragment key={network.id}>
                    <TableRow>
                      <TableCell>
                        <Checkbox
                          checked={selectedNetworks.includes(network.id)}
                          onCheckedChange={(checked) => handleSelectNetwork(network.id, !!checked)}
                          aria-label={`Select ${network.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm">{network.ssid}</span>
                          {network.hidden && (
                            <EyeOff className="h-3 w-3 text-muted-foreground" title="Hidden SSID" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Shield className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs">{network.authType}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1 bg-secondary/10 border border-secondary/20 rounded-full px-3 py-1.5 min-w-[60px] justify-center">
                          <Users className="h-4 w-4 text-secondary" />
                          <span className="text-sm font-semibold text-secondary">
                            {network.currentClients || 0}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {(network.captivePortal || network.enableCaptivePortal) ? (
                            <>
                              <Globe className="h-3 w-3 text-blue-500" />
                              <span className="text-xs text-blue-500">Enabled</span>
                            </>
                          ) : (
                            <>
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Disabled</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={network.enabled ? 'default' : 'secondary'}>
                          {network.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleNetwork(network.id, !network.enabled)}
                            title={network.enabled ? 'Disable Network' : 'Enable Network'}
                          >
                            {network.enabled ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Configure Network"
                            onClick={() => handleToggleExpanded(network.id)}
                          >
                            {expandedNetworkId === network.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <Edit className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteNetwork(network.id)}
                            className="text-destructive hover:text-destructive"
                            title="Delete Network"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Configuration Panel */}
                    {expandedNetworkId === network.id && (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <div className="border-t bg-muted/30">
                            <NetworkEditDetail 
                              serviceId={network.id} 
                              onSave={handleNetworkSaved}
                              isInline={true}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
                
                {filteredNetworks.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex flex-col items-center space-y-2 text-muted-foreground">
                        <Network className="h-8 w-8" />
                        <span>No networks found</span>
                        {searchTerm && (
                          <span className="text-sm">
                            Try adjusting your search or filters
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="surface-1dp">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Networks</span>
                </div>
                <p className="text-2xl font-semibold mt-1">{networks.length}</p>
              </CardContent>
            </Card>
            
            <Card className="surface-1dp">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Connected Clients</span>
                </div>
                <p className="text-2xl font-semibold mt-1">
                  {networks.reduce((sum, network) => sum + (network.currentClients || 0), 0)}
                </p>
              </CardContent>
            </Card>
            
            <Card className="surface-1dp">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Secured Networks</span>
                </div>
                <p className="text-2xl font-semibold mt-1">
                  {networks.filter(network => network.authType !== 'Open').length}
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}