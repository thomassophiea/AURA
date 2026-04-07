/**
 * Policy Configuration Types for ExtremeCloud IQ Controller
 * Includes Roles, VLANs, CoS, and Access Control
 * Based on official documentation v10.17.01
 */

// ============================================
// Policy Roles
// ============================================

/**
 * Default policy action
 */
export type PolicyAction = 'permit' | 'deny' | 'drop';

/**
 * Rule protocol
 */
export type RuleProtocol = 
  | 'any'
  | 'tcp'
  | 'udp'
  | 'icmp'
  | 'igmp'
  | 'gre'
  | 'esp'
  | 'ah'
  | 'sctp';

/**
 * Rule direction
 */
export type RuleDirection = 'inbound' | 'outbound' | 'both';

/**
 * L2 Rule (Layer 2)
 */
export interface L2Rule {
  id?: string;
  name: string;
  order: number;
  enabled: boolean;
  action: PolicyAction;
  sourceMAC?: string;
  destinationMAC?: string;
  etherType?: number;
  vlanId?: number;
  description?: string;
}

/**
 * L3/L4 Rule (Layer 3/4)
 */
export interface L3L4Rule {
  id?: string;
  name: string;
  order: number;
  enabled: boolean;
  action: PolicyAction;
  direction: RuleDirection;
  protocol: RuleProtocol;
  sourceIP?: string;
  sourcePort?: string;        // Can be range: "80-443"
  destinationIP?: string;
  destinationPort?: string;
  tcpFlags?: string[];        // SYN, ACK, FIN, RST, etc.
  description?: string;
}

/**
 * L7 Application Rule
 */
export interface L7Rule {
  id?: string;
  name: string;
  order: number;
  enabled: boolean;
  action: PolicyAction;
  applicationId: string;      // Reference to Application
  applicationName?: string;
  categoryId?: string;
  description?: string;
}

/**
 * Custom application definition
 */
export interface CustomApplication {
  id?: string;
  name: string;
  description?: string;
  protocol: 'tcp' | 'udp' | 'both';
  ports: string;              // Can be range or comma-separated
  enabled: boolean;
}

/**
 * Policy role configuration
 */
export interface PolicyRole {
  id?: string;
  name: string;
  description?: string;
  defaultAction: PolicyAction;
  
  // VLAN assignment
  vlanId?: string;
  vlanName?: string;
  
  // Class of Service
  cosId?: string;
  cosName?: string;
  
  // Associated profile (for deployment)
  associatedProfiles?: string[];
  
  // Rules
  l2Rules: L2Rule[];
  l3l4Rules: L3L4Rule[];
  l7Rules: L7Rule[];
  
  // Preconfigured flag
  isPreconfigured: boolean;
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

/**
 * Preconfigured (built-in) roles
 */
export type PreconfiguredRole = 
  | 'Enterprise User'
  | 'Guest'
  | 'Deny All'
  | 'Default Unauth'
  | 'Blocked';

// ============================================
// VLANs / Topologies
// ============================================

/**
 * VLAN topology mode
 */
export type TopologyMode = 
  | 'bridged-at-ap'         // Bridge traffic at AP
  | 'bridged-at-controller' // Bridge traffic at controller
  | 'tunnel-to-controller'; // Tunnel all traffic to controller

/**
 * DHCP mode for VLAN
 */
export type DHCPMode = 
  | 'none'                  // No DHCP
  | 'relay'                 // DHCP Relay
  | 'local';                // Local DHCP Server

/**
 * Multicast rule
 */
export interface MulticastRule {
  id?: string;
  name: string;
  groupAddress: string;       // Multicast group address
  sourceAddress?: string;
  action: 'permit' | 'deny';
  enabled: boolean;
}

/**
 * Exception filter
 */
export interface ExceptionFilter {
  id?: string;
  name: string;
  protocol: RuleProtocol;
  port?: number;
  action: 'permit' | 'deny';
  enabled: boolean;
}

/**
 * VLAN configuration
 */
export interface VLANConfig {
  id?: string;
  name: string;
  vlanId: number;
  description?: string;
  
  // Topology
  mode: TopologyMode;
  egressPort?: string;
  
  // IP configuration (for Bridged@AC)
  ipAddress?: string;
  subnetMask?: string;
  gateway?: string;
  
  // DHCP
  dhcpMode: DHCPMode;
  dhcpServerIp?: string;
  dhcpRelayIp?: string;
  dhcpRangeStart?: string;
  dhcpRangeEnd?: string;
  dhcpLeaseTime?: number;     // seconds
  dhcpOptions?: Record<string, string>;
  
  // Filters
  multicastRules: MulticastRule[];
  exceptionFilters: ExceptionFilter[];
  
  // Fabric Attach
  fabricAttachEnabled?: boolean;
  fabricAttachIsid?: number;
  
  // VxLAN
  vxlanEnabled?: boolean;
  vxlanVni?: number;
  vxlanVtepIp?: string;
  
  // GRE
  greEnabled?: boolean;
  greTunnelIp?: string;
  greRemoteIp?: string;
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

/**
 * VLAN Group configuration
 */
export interface VLANGroup {
  id?: string;
  name: string;
  description?: string;
  vlanIds: number[];
  createdAt?: string;
}

// ============================================
// Class of Service (CoS)
// ============================================

/**
 * CoS queue mapping
 */
export type CoSQueue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * DSCP value (0-63)
 */
export type DSCPValue = number;

/**
 * ToS/DSCP mapping entry
 */
export interface DSCPMapping {
  dscp: DSCPValue;
  queue: CoSQueue;
}

/**
 * Bandwidth rate limiting
 */
export interface BandwidthRate {
  id?: string;
  name: string;
  description?: string;
  upstreamRate: number;       // kbps
  downstreamRate: number;     // kbps
  burstSize?: number;         // bytes
}

/**
 * Class of Service configuration
 */
export interface CoSConfig {
  id?: string;
  name: string;
  description?: string;
  
  // DSCP classification
  dscpEnabled: boolean;
  dscpMappings: DSCPMapping[];
  
  // 802.1p priority mapping
  dot1pEnabled: boolean;
  dot1pMappings?: Array<{
    priority: number;         // 0-7
    queue: CoSQueue;
  }>;
  
  // Bandwidth rate limiting
  bandwidthRateId?: string;
  bandwidthRate?: BandwidthRate;
  
  // WMM settings
  wmmEnabled: boolean;
  
  // Associated roles
  associatedRoles?: string[];
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

// ============================================
// Access Control Groups
// ============================================

/**
 * Access control group type
 */
export type AccessControlGroupType = 
  | 'end-system'      // MAC-based groups
  | 'device-type'     // Device type groups
  | 'location'        // Location-based groups
  | 'time';           // Time-based groups

/**
 * Time range for time-based access
 */
export interface TimeRange {
  startTime: string;          // HH:MM format
  endTime: string;            // HH:MM format
  daysOfWeek: number[];       // 0-6, Sunday = 0
}

/**
 * Access control group
 */
export interface AccessControlGroup {
  id?: string;
  name: string;
  type: AccessControlGroupType;
  description?: string;
  
  // End-system group entries (MAC addresses)
  macAddresses?: string[];
  
  // Device type entries
  deviceTypes?: string[];
  
  // Location entries (site IDs or names)
  locations?: string[];
  
  // Time-based entries
  timeRanges?: TimeRange[];
  
  // Is default/preconfigured
  isDefault: boolean;
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

/**
 * Default access control groups
 */
export type DefaultAccessControlGroup = 
  | 'All End Systems'
  | 'All Devices'
  | 'All Locations'
  | 'Business Hours'
  | 'After Hours';

// ============================================
// Access Control Rules
// ============================================

/**
 * Access control rule action
 */
export type ACRuleAction = 
  | 'accept'          // Accept with policy
  | 'deny'            // Deny access
  | 'redirect';       // Redirect to portal

/**
 * Access control rule
 */
export interface AccessControlRule {
  id?: string;
  name: string;
  order: number;
  enabled: boolean;
  
  // Match criteria
  endSystemGroupId?: string;
  deviceTypeGroupId?: string;
  locationGroupId?: string;
  timeGroupId?: string;
  
  // Auth type filter
  authType?: string;          // WPA2, WPA3, etc.
  
  // Action
  action: ACRuleAction;
  
  // Policy assignment (for accept action)
  policyRoleId?: string;
  policyRoleName?: string;
  
  // Portal assignment (for redirect action)
  portalId?: string;
  portalName?: string;
  
  // Description
  description?: string;
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

// ============================================
// Captive Portal
// ============================================

/**
 * Captive portal type
 */
export type CaptivePortalType = 
  | 'internal'                // Built-in portal
  | 'external'                // External portal URL
  | 'extremeguest'            // ExtremeGuest integration
  | 'cwa';                    // Centralized Web Authentication

/**
 * Internal portal mode
 */
export type InternalPortalMode = 
  | 'guest'                   // Guest access
  | 'authenticated';          // Authenticated access

/**
 * Walled garden rule
 */
export interface WalledGardenRule {
  id?: string;
  name: string;
  type: 'url' | 'ip' | 'domain';
  value: string;
  enabled: boolean;
}

/**
 * Captive portal configuration
 */
export interface CaptivePortalConfig {
  id?: string;
  name: string;
  type: CaptivePortalType;
  enabled: boolean;
  
  // Internal portal settings
  mode?: InternalPortalMode;
  welcomeMessage?: string;
  termsAndConditions?: string;
  logoUrl?: string;
  backgroundColor?: string;
  
  // External portal settings
  externalUrl?: string;
  redirectUrl?: string;
  
  // ExtremeGuest settings
  extremeGuestServerId?: string;
  
  // Walled garden
  walledGardenEnabled: boolean;
  walledGardenRules: WalledGardenRule[];
  
  // Redirect port list (ports to intercept)
  redirectPorts: number[];
  
  // Session settings
  sessionTimeout: number;     // minutes
  idleTimeout: number;        // minutes
  
  // Third-party auth (social login)
  socialLoginEnabled: boolean;
  facebookEnabled?: boolean;
  googleEnabled?: boolean;
  linkedinEnabled?: boolean;
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}

// ============================================
// Local User Repository
// ============================================

/**
 * Local user account
 */
export interface LocalUser {
  id?: string;
  username: string;
  password?: string;          // Write-only for creation
  email?: string;
  fullName?: string;
  enabled: boolean;
  expirationDate?: string;
  maxDevices?: number;
  vlanOverride?: number;
  roleOverride?: string;
  groupIds?: string[];
  createdAt?: string;
  lastLogin?: string;
}

/**
 * Local user group
 */
export interface LocalUserGroup {
  id?: string;
  name: string;
  description?: string;
  vlanId?: number;
  roleId?: string;
  memberCount?: number;
}

// ============================================
// LDAP Configuration
// ============================================

/**
 * LDAP server configuration
 */
export interface LDAPConfig {
  id?: string;
  name: string;
  enabled: boolean;
  
  // Server settings
  serverAddress: string;
  port: number;
  useTLS: boolean;
  
  // Bind credentials
  bindDN: string;
  bindPassword?: string;      // Write-only
  
  // Search settings
  baseDN: string;
  userSearchFilter: string;
  groupSearchFilter?: string;
  
  // Schema mappings
  usernameAttribute: string;
  groupMemberAttribute?: string;
  
  // Timeout
  timeout: number;            // seconds
  
  // Timestamps
  createdAt?: string;
  lastModified?: string;
}
