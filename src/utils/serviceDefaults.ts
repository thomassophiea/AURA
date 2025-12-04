import { Service } from '../services/api';

/**
 * Generate a complete default service object based on the Campus Controller API structure
 * This includes all required fields to ensure network creation succeeds
 */
export function generateDefaultService(overrides: Partial<Service> = {}): Partial<Service> {
  const serviceName = overrides.serviceName || overrides.ssid || 'New Network';
  const ssid = overrides.ssid || overrides.serviceName || 'New Network';
  
  return {
    // Basic Settings
    serviceName,
    ssid,
    status: 'enabled',
    suppressSsid: false,
    canEdit: true,
    canDelete: true,
    proxied: 'Local',
    shutdownOnMeshpointLoss: false,
    
    // Privacy/Security - default to Open network (can be overridden)
    privacy: null,
    
    // Port Number (VLAN related)
    dot1dPortNumber: 99,
    
    // 802.11k/r/v Support
    enabled11kSupport: false,
    rm11kBeaconReport: false,
    rm11kQuietIe: false,
    
    // Quality of Service
    uapsdEnabled: true,
    admissionControlVideo: false,
    admissionControlVoice: false,
    admissionControlBestEffort: false,
    admissionControlBackgroundTraffic: false,
    
    // Advanced Features
    flexibleClientAccess: false,
    mbaAuthorization: false,
    accountingEnabled: false,
    clientToClientCommunication: true,
    includeHostname: false,
    mbo: false,
    oweAutogen: false,
    oweCompanion: null,
    purgeOnDisconnect: false,
    enable11mcSupport: false,
    beaconProtection: false,
    
    // Policies and Roles
    aaaPolicyId: null,
    mbatimeoutRoleId: null,
    roamingAssistPolicy: null,
    
    // Vendor Specific Attributes
    vendorSpecificAttributes: [],
    
    // Captive Portal
    enableCaptivePortal: false,
    captivePortalType: null,
    eGuestPortalId: null,
    eGuestSettings: [],
    
    // Timeouts (in seconds)
    preAuthenticatedIdleTimeout: 300,
    postAuthenticatedIdleTimeout: 1800,
    sessionTimeout: 0,
    
    // Network Configuration
    defaultTopology: null,
    defaultCoS: '1eea4d66-2607-11e7-93ae-92361f002671', // No CoS
    unAuthenticatedUserDefaultRoleID: null,
    authenticatedUserDefaultRoleID: null,
    cpNonAuthenticatedPolicyName: null,
    
    // Hotspot
    hotspotType: 'Disabled',
    hotspot: null,
    
    // DSCP Code Points (default mapping)
    dscp: {
      codePoints: [
        2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0,
        1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 4, 0, 4, 0, 4, 0,
        4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0,
        6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0
      ]
    },
    
    // Features
    features: ['CENTRALIZED-SITE'],
    
    // Apply any overrides
    ...overrides
  };
}

/**
 * Generate privacy configuration based on security type
 */
export function generatePrivacyConfig(securityType: string, passphrase?: string): any {
  switch (securityType) {
    case 'open':
      return null;
      
    case 'wpa2-personal':
    case 'wpa-personal':
      return {
        WpaPskElement: {
          mode: 'aesOnly',
          pmfMode: 'disabled',
          presharedKey: passphrase || '',
          keyHexEncoded: false
        }
      };
      
    case 'wpa3-personal':
    case 'wpa3-sae':
      return {
        WpaSaeElement: {
          pmfMode: 'required',
          presharedKey: passphrase || '',
          keyHexEncoded: false,
          saeMethod: 'SaeH2e',
          encryption: 'AES_CCM_128',
          akmSuiteSelector: 'AKM8_24'
        }
      };
      
    case 'wpa2-enterprise':
    case 'wpa-enterprise':
      return {
        WpaEnterpriseElement: {
          mode: 'aesOnly',
          pmfMode: 'disabled'
        }
      };
      
    case 'wpa3-enterprise':
      return {
        WpaEnterpriseElement: {
          mode: 'aesOnly',
          pmfMode: 'required'
        }
      };
      
    default:
      console.warn(`Unknown security type: ${securityType}, defaulting to Open`);
      return null;
  }
}

/**
 * Map security type from privacy object (for display purposes)
 */
export function mapSecurityTypeFromPrivacy(privacy: any): string {
  if (!privacy) return 'Open';
  
  if (privacy.WpaSaeElement) {
    return 'WPA3-Personal (SAE)';
  }
  
  if (privacy.WpaPskElement) {
    const mode = privacy.WpaPskElement.mode || '';
    if (mode === 'aesOnly') return 'WPA2-Personal (AES)';
    if (mode === 'tkipOnly') return 'WPA-Personal (TKIP)';
    if (mode === 'mixed') return 'WPA/WPA2-Personal';
    return 'WPA-Personal';
  }
  
  if (privacy.WpaEnterpriseElement) {
    const pmfMode = privacy.WpaEnterpriseElement.pmfMode || '';
    if (pmfMode === 'required') return 'WPA3-Enterprise';
    return 'WPA2-Enterprise';
  }
  
  if (privacy.OweElement) {
    return 'OWE (Enhanced Open)';
  }
  
  return 'Unknown';
}

/**
 * Validate service data before submission
 */
export function validateServiceData(serviceData: Partial<Service>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!serviceData.serviceName || serviceData.serviceName.trim() === '') {
    errors.push('Service name is required');
  }
  
  if (!serviceData.ssid || serviceData.ssid.trim() === '') {
    errors.push('SSID is required');
  }
  
  // SSID length validation (max 32 characters)
  if (serviceData.ssid && serviceData.ssid.length > 32) {
    errors.push('SSID must be 32 characters or less');
  }
  
  // Passphrase validation for WPA/WPA2/WPA3
  if (serviceData.privacy) {
    if (serviceData.privacy.WpaPskElement || serviceData.privacy.WpaSaeElement) {
      const passphrase = serviceData.privacy.WpaPskElement?.presharedKey || 
                         serviceData.privacy.WpaSaeElement?.presharedKey || '';
      
      if (!passphrase || passphrase.length < 8 || passphrase.length > 63) {
        errors.push('Passphrase must be between 8 and 63 characters');
      }
    }
  }
  
  // Timeout validation
  if (serviceData.preAuthenticatedIdleTimeout !== undefined && serviceData.preAuthenticatedIdleTimeout < 0) {
    errors.push('Pre-authenticated idle timeout must be non-negative');
  }
  
  if (serviceData.postAuthenticatedIdleTimeout !== undefined && serviceData.postAuthenticatedIdleTimeout < 0) {
    errors.push('Post-authenticated idle timeout must be non-negative');
  }
  
  if (serviceData.sessionTimeout !== undefined && serviceData.sessionTimeout < 0) {
    errors.push('Session timeout must be non-negative');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
