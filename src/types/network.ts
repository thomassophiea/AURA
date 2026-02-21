// Network/WLAN type definitions for automatic profile assignment

// ============================================
// Security Type Definitions (must be defined first)
// ============================================

/**
 * All supported WLAN security types matching Extreme Platform ONE controller
 */
export type SecurityType =
  | 'open'                    // Open (no encryption)
  | 'owe'                     // OWE (Opportunistic Wireless Encryption)
  | 'wep'                     // WEP (legacy, not recommended)
  | 'wpa2-psk'                // WPA2-Personal (PSK)
  | 'wpa2-enterprise'         // WPA2-Enterprise (802.1X/EAP)
  | 'wpa3-personal'           // WPA3-Personal (SAE)
  | 'wpa3-compatibility'      // WPA3-Compatibility (WPA2+WPA3 mixed)
  | 'wpa3-enterprise-transition' // WPA3-Enterprise Transition
  | 'wpa3-enterprise-192';    // WPA3-Enterprise 192-bit

/**
 * Protected Management Frames (PMF/802.11w) modes
 */
export type PMFMode = 'disabled' | 'optional' | 'required';

/**
 * Encryption cipher modes for WPA2
 */
export type EncryptionMode = 
  | 'aesOnly'        // AES-CCMP only (recommended)
  | 'tkipOnly'       // TKIP only (legacy)
  | 'both';          // TKIP + AES (TKIP-CCMP)

/**
 * WPA3 encryption cipher modes
 */
export type WPA3EncryptionMode =
  | 'aes-ccm-128'           // AES-CCM-128 (default for WPA3)
  | 'aes-ccm-128-gcmp256'   // AES-CCM-128 & GCMP256 (Wi-Fi 7)
  | 'gcmp256';              // GCMP256 only (Wi-Fi 7)

/**
 * WPA3 SAE methods
 */
export type SAEMethod = 
  | 'sae'    // SAE only (2.4/5 GHz)
  | 'h2e'    // H2E only (required for 6 GHz)
  | 'both';  // SAE/H2E (default, backwards compatible)

/**
 * WEP key length
 */
export type WEPKeyLength = 64 | 128;

/**
 * WEP key input method
 */
export type WEPInputMethod = 'hex' | 'ascii';

/**
 * Enterprise authentication method
 */
export type EnterpriseAuthMethod = 
  | 'default'           // Default 802.1X
  | 'proxy-failover'    // Proxy RADIUS with failover
  | 'proxy-loadbalance' // Proxy RADIUS with load balance
  | 'local'             // Local authentication
  | 'ldap';             // LDAP authentication

/**
 * Authentication protocol for RADIUS
 */
export type AuthenticationProtocol = 'PAP' | 'CHAP' | 'MS-CHAP' | 'MS-CHAP2';

/**
 * Called Station ID format options
 */
export type CalledStationIdFormat = 
  | 'WIRED_MAC_COLON_SSID'
  | 'BSSID'
  | 'SITE_NAME'
  | 'SITE_NAME_COLON_DEVICE_GROUP_NAME'
  | 'SERIAL'
  | 'SITE_CAMPUS'
  | 'SITE_REGION'
  | 'SITE_CITY';

/**
 * Accounting type options
 */
export type AccountingType = 'START-INTERIM-STOP' | 'START-STOP' | 'INTERIM-UPDATE';

/**
 * Accounting start options
 */
export type AccountingStart = 'NO_DELAY' | 'AFTER_AUTHENTICATION' | 'AFTER_ASSOCIATION';

/**
 * RADIUS servers mode
 */
export type RADIUSServersMode = 'Failover' | 'Load-Balance' | 'Broadcast';

/**
 * Operator name options
 */
export type OperatorNameType = 'None' | 'Custom';

/**
 * RADIUS server type
 */
export type RADIUSServerType = 'Standard' | 'RFC5765';

/**
 * RADIUS server configuration (for auth or accounting)
 */
export interface RADIUSServerConfig {
  order?: number;
  host: string;
  port: number;
  secret?: string;
  retries?: number;
  timeout?: number;
  trustPoint?: string;
  serverType?: RADIUSServerType;
}

/**
 * AAA Policy configuration matching Extreme Platform ONE controller
 */
export interface AAAPolicy {
  id?: string;
  name: string;
  
  // NAI Routing
  naiRouting?: boolean;
  
  // Authentication
  authenticationProtocol?: AuthenticationProtocol;
  nasIpAddress?: string;
  nasId?: string;
  calledStationId?: CalledStationIdFormat;
  
  // Accounting
  accountingType?: AccountingType;
  accountingStart?: AccountingStart;
  accountingInterimInterval?: number;
  
  // Server modes
  radiusAuthServersMode?: RADIUSServersMode;
  radiusAcctServersMode?: RADIUSServersMode;
  
  // Additional options
  eventTimestamp?: boolean;
  includeFramedIp?: boolean;
  reportNasLocation?: boolean;
  overrideReauthTimeout?: number;
  blockRepeatedFailedAuth?: boolean;
  includeMessageAuthenticator?: boolean;
  operatorName?: OperatorNameType;
  operatorNameValue?: string;
  
  // RADIUS servers (up to 4 auth, 4 accounting)
  radiusAuthServers?: RADIUSServerConfig[];
  radiusAcctServers?: RADIUSServerConfig[];
}

/**
 * WLAN-level authentication method (used when enterprise security)
 */
export type WLANAuthMethod = 
  | 'RADIUS'              // Default RADIUS authentication
  | 'Proxy RADIUS'        // Proxy RADIUS
  | 'Local'               // Local authentication
  | 'LDAP';               // LDAP authentication

/**
 * Security-specific configuration for each security type
 */
export interface SecurityConfig {
  // Common
  pmfMode?: PMFMode;
  
  // WPA2 PSK modes
  passphrase?: string;
  encryptionMode?: EncryptionMode;      // For WPA2 (aesOnly, tkipOnly, both)
  keyHexEncoded?: boolean;              // String vs HEX input
  
  // WPA3 Personal specific
  saeMethod?: SAEMethod;                // SAE, H2E, or SAE/H2E
  wpa3EncryptionMode?: WPA3EncryptionMode; // AES-CCM-128, GCMP256, etc.
  
  // WEP specific (legacy)
  wepKeyLength?: WEPKeyLength;
  wepInputMethod?: WEPInputMethod;
  wepKeyIndex?: 1 | 2 | 3 | 4;
  wepKey?: string;
  
  // Enterprise specific - AAA Policy
  aaaPolicyId?: string;           // RADIUS AAA Policy UUID
  aaaPolicy?: AAAPolicy;          // Inline AAA Policy (for new policies)
  
  // Enterprise specific - WLAN-level auth settings
  wlanAuthMethod?: WLANAuthMethod;
  defaultAaaAuthMethod?: 'RADIUS' | 'Local' | 'LDAP';
  primaryRadiusServer?: string;   // IP or hostname
  backupRadiusServer?: string;
  thirdRadiusServer?: string;
  fourthRadiusServer?: string;
  ldapConfigurationId?: string;
  authenticateLocallyForMac?: boolean; // Authenticate MAC on controller
  
  // Fast Transition (802.11r)
  fastTransition?: boolean;
  mobilityDomainId?: string;      // Mobility Domain ID for 11r
  
  // Wi-Fi 7 / 6E specific
  akmSuiteSelector?: string;      // AKM Suite for Wi-Fi 7
  sixECompliance?: boolean;       // 6E WPA Compliance mode
  
  // MBA (MAC-Based Authentication)
  mbaEnabled?: boolean;
  mbaTimeoutRoleId?: string;      // Role assigned on RADIUS timeout
  
  // Default role and VLAN for authenticated users
  defaultAuthRoleId?: string;
  defaultUnauthRoleId?: string;
  defaultVlanId?: string;
}

// ============================================
// Core Entity Interfaces
// ============================================

export interface Service {
  id: string;
  name?: string;
  serviceName?: string;
  ssid: string;
  security: SecurityType;
  passphrase?: string;
  vlan?: number;
  band: '2.4GHz' | '5GHz' | '6GHz' | 'both' | 'dual' | 'all';
  enabled: boolean;
  sites?: string[]; // Site IDs this service is assigned to
  profiles?: string[]; // Profile IDs this service is assigned to
  description?: string;
  hidden?: boolean;
  maxClients?: number;
  securityConfig?: SecurityConfig;
}

export interface Site {
  id: string;
  name: string;
  siteName?: string;
  location?: string;
  country?: string;
  timezone?: string;
  description?: string;
  deviceGroups?: string[]; // May be inline or require separate fetch
  status?: string;
}

export interface SiteGroup {
  id: string;
  name: string;
  description?: string;
  siteIds: string[];
  createdAt?: string;
  lastModified?: string;
  color?: string; // For visual grouping in UI
}

export interface DeviceGroup {
  id: string;
  name: string;
  siteId: string;
  siteName?: string;
  deviceCount?: number;
  profiles?: string[]; // Profile IDs assigned to this group
  apSerialNumbers?: string[];
  description?: string;
}

export interface Profile {
  id: string;
  name: string;
  profileName?: string;
  deviceGroupId?: string;
  services?: string[]; // Service IDs assigned to this profile
  syncStatus?: 'synced' | 'pending' | 'error';
  lastSync?: string;
  enabled?: boolean;
  description?: string;
}

export interface CreateServiceRequest {
  name?: string; // Deprecated - use serviceName instead
  serviceName?: string; // Service identifier (required by API)
  ssid: string;
  security: SecurityType;
  passphrase?: string;
  vlan?: number;
  band: string;
  enabled: boolean;
  sites: string[]; // Sites to assign to
  description?: string;
  authenticatedUserDefaultRoleID?: string;
  hidden?: boolean;
  maxClients?: number;
  
  // Security configuration (type-specific options)
  securityConfig?: SecurityConfig;
  
  // Advanced options (matching controller)
  mbo?: boolean;
  accountingEnabled?: boolean;
  includeHostname?: boolean;
  enable11mcSupport?: boolean;
  enabled11kSupport?: boolean;
  uapsdEnabled?: boolean;
  admissionControlVoice?: boolean;
  admissionControlVideo?: boolean;
  admissionControlBestEffort?: boolean;
  admissionControlBackgroundTraffic?: boolean;
  clientToClientCommunication?: boolean;
  purgeOnDisconnect?: boolean;
  beaconProtection?: boolean;
  preAuthenticatedIdleTimeout?: number;
  postAuthenticatedIdleTimeout?: number;
  sessionTimeout?: number;
  topologyId?: string;
  cosId?: string;
}

export interface AutoAssignmentResponse {
  serviceId: string;
  sitesProcessed: number;
  deviceGroupsFound: number;
  profilesAssigned: number;
  assignments: AssignmentResult[];
  syncResults?: SyncResult[];
  success: boolean;
  errors?: string[];
}

export interface AssignmentResult {
  profileId: string;
  profileName: string;
  success: boolean;
  error?: string;
}

export interface SyncResult {
  profileId: string;
  profileName: string;
  success: boolean;
  error?: string;
  syncTime?: string;
}

// Form data for WLAN creation dialog
export interface WLANFormData {
  serviceName: string;
  ssid: string;
  security: SecurityType;
  passphrase: string;
  vlan: number | null;
  band: '2.4GHz' | '5GHz' | '6GHz' | 'both' | 'dual' | 'all';
  enabled: boolean;
  selectedSites: string[];
  selectedSiteGroups: string[]; // Site groups selected for deployment
  authenticatedUserDefaultRoleID?: string | null;
  topologyId?: string;
  cosId?: string;

  // Basic options
  hidden?: boolean;
  maxClients?: number;
  description?: string;

  // Security configuration (type-specific options)
  securityConfig?: SecurityConfig;

  // Advanced options (matching controller exactly)
  mbo?: boolean;                              // MultiBand Operation
  accountingEnabled?: boolean;                // RADIUS Accounting
  includeHostname?: boolean;                  // Include Hostname
  enable11mcSupport?: boolean;                // FTM (11mc) responder support
  enabled11kSupport?: boolean;                // Radio Management (11k) support
  uapsdEnabled?: boolean;                     // U-APSD (WMM-PS)
  admissionControlVoice?: boolean;            // Use Admission Control for Voice (VO)
  admissionControlVideo?: boolean;            // Use Admission Control for Video (VI)
  admissionControlBestEffort?: boolean;       // Use Admission Control for Best Effort (BE)
  admissionControlBackgroundTraffic?: boolean; // Use Global Admission Control for Background (BK)
  clientToClientCommunication?: boolean;      // Client To Client Communication
  purgeOnDisconnect?: boolean;                // Clear Session on Disconnect
  beaconProtection?: boolean;                 // Beacon Protection
  preAuthenticatedIdleTimeout?: number;       // Pre-Authenticated idle timeout (seconds)
  postAuthenticatedIdleTimeout?: number;      // Post-Authenticated idle timeout (seconds)
  sessionTimeout?: number;                    // Maximum session duration (seconds)
}

// ============================================
// Site-Centric WLAN Deployment Types
// ============================================

/**
 * Deployment mode for WLAN-to-profile assignment
 * - ALL_PROFILES_AT_SITE: Assign to all profiles at selected site (default)
 * - INCLUDE_ONLY: Assign only to specifically selected profiles
 * - EXCLUDE_SOME: Assign to all profiles except specifically excluded ones
 */
export type DeploymentMode = 'ALL_PROFILES_AT_SITE' | 'INCLUDE_ONLY' | 'EXCLUDE_SOME';

/**
 * Source of profile assignment
 * - SITE_PROPAGATION: Assignment came from site-level deployment
 * - EXPLICIT_ASSIGNMENT: Direct profile-level assignment
 * - MANUAL_OVERRIDE: User manually overrode site-level assignment
 */
export type AssignmentSource = 'SITE_PROPAGATION' | 'EXPLICIT_ASSIGNMENT' | 'MANUAL_OVERRIDE';

/**
 * Mismatch reasons when expected state doesn't match actual state
 */
export type MismatchReason =
  | 'MISSING_ASSIGNMENT'        // Expected assigned but not found
  | 'UNEXPECTED_ASSIGNMENT'     // Not expected but found assigned
  | 'PROFILE_DELETED'           // Profile no longer exists
  | 'PROFILE_MOVED'             // Profile moved to different device group
  | 'SYNC_FAILED'               // Assignment succeeded but sync failed
  | 'WLAN_NOT_DEPLOYED'         // WLAN has no assignments anywhere
  | 'SITE_ASSIGNMENT_MISSING'   // Site has no assignment for this WLAN
  | 'PROFILE_MAPPING_MISSING'   // Profile to site mapping is broken
  | 'PROVISIONING_FAILED'       // Provisioning job failed
  | 'CACHE_STALE'               // Cached data is stale
  | 'OBSERVED_ONLY'             // WLAN observed but not in intended state
  | 'INTENDED_ONLY'             // WLAN intended but not observed
  | null;

/**
 * WLAN deployment status
 */
export type WLANDeploymentStatus =
  | 'DEPLOYED'                  // WLAN has at least one assignment
  | 'NOT_DEPLOYED'              // WLAN has zero assignments
  | 'PARTIALLY_DEPLOYED'        // WLAN has some failed assignments
  | 'UNKNOWN';                  // Cannot determine status

/**
 * Site-level WLAN assignment tracking
 * Stores the user's intent for which sites should receive a WLAN and how
 */
export interface WLANSiteAssignment {
  wlanId: string;
  wlanName: string;
  siteId: string;
  siteName: string;
  siteGroupId?: string;            // Optional: site group this assignment belongs to
  siteGroupName?: string;
  deploymentMode: DeploymentMode;
  includedProfiles: string[];      // Profile IDs to include (INCLUDE_ONLY mode)
  excludedProfiles: string[];      // Profile IDs to exclude (EXCLUDE_SOME mode)
  createdAt: string;
  lastModified: string;
}

/**
 * Site group-level WLAN assignment tracking
 * Stores the user's intent for which site groups should receive a WLAN
 */
export interface WLANSiteGroupAssignment {
  wlanId: string;
  wlanName: string;
  siteGroupId: string;
  siteGroupName: string;
  deploymentMode: DeploymentMode;   // Applied to all sites in the group
  includedProfiles: string[];       // Profile IDs to include (INCLUDE_ONLY mode)
  excludedProfiles: string[];       // Profile IDs to exclude (EXCLUDE_SOME mode)
  createdAt: string;
  lastModified: string;
}

/**
 * Profile-level WLAN assignment tracking
 * Tracks expected vs actual state for reconciliation
 */
export interface WLANProfileAssignment {
  wlanId: string;
  wlanName: string;
  profileId: string;
  profileName: string;
  siteId: string;
  siteName: string;
  source: AssignmentSource;
  expectedState: 'ASSIGNED' | 'NOT_ASSIGNED';
  actualState: 'ASSIGNED' | 'NOT_ASSIGNED' | 'UNKNOWN';
  mismatch: MismatchReason;
  lastReconciled: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  syncError?: string;
}

/**
 * Calculated effective profile set for a site
 * Shows which profiles will/won't receive WLAN based on deployment mode
 */
export interface EffectiveProfileSet {
  siteId: string;
  siteName: string;
  deploymentMode: DeploymentMode;
  allProfiles: Profile[];           // All profiles at site
  selectedProfiles: Profile[];      // Profiles that will receive WLAN
  excludedProfiles: Profile[];      // Profiles that won't receive WLAN
}

/**
 * Result of reconciliation process
 * Compares expected vs actual assignments
 */
export interface ReconciliationResult {
  wlanId: string;
  wlanName: string;
  totalExpected: number;            // Profiles expected to have WLAN
  totalActual: number;              // Profiles actually having WLAN
  matched: number;                  // Profiles with correct state
  mismatched: number;               // Profiles with incorrect state
  mismatches: WLANProfileAssignment[];  // Detailed mismatch list
  timestamp: string;
}

/**
 * Remediation action to fix a mismatch
 */
export interface RemediationAction {
  type: 'ADD_ASSIGNMENT' | 'REMOVE_ASSIGNMENT' | 'RESYNC_PROFILE';
  wlanId: string;
  wlanName: string;
  profileId: string;
  profileName: string;
  siteId: string;
  reason: string;
  mismatchReason: MismatchReason;
}

/**
 * Observed WLAN state from actual device broadcasts
 */
export interface ObservedWLAN {
  id: string;
  ssid: string;
  security?: string;
  band?: string;
  vlan?: number;
  broadcastCount: number;         // Number of APs broadcasting this WLAN
  lastSeen: string;
  source: 'DEVICE_STATE' | 'TELEMETRY' | 'MANUAL';
}

/**
 * Site WLAN inventory combining intended and observed state
 */
export interface SiteWLANInventory {
  siteId: string;
  siteName: string;
  intendedWLANs: Array<{
    wlan: Service;
    expectedProfiles: number;
    actualProfiles: number;
    deploymentStatus: WLANDeploymentStatus;
    mismatchReason?: MismatchReason;
  }>;
  observedWLANs: ObservedWLAN[];
  mismatches: Array<{
    wlanId: string;
    wlanName: string;
    reason: MismatchReason;
    severity: 'error' | 'warning' | 'info';
  }>;
  timestamp: string;
}

/**
 * WLAN with deployment status for display
 */
export interface WLANWithDeploymentStatus extends Service {
  deploymentStatus: WLANDeploymentStatus;
  totalSites: number;
  totalProfiles: number;
  mismatchCount: number;
  lastReconciled?: string;
}
