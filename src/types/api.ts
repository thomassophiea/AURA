// Type and interface definitions for the AURA API service.
// These were extracted from src/services/api.ts for maintainability.
// src/services/api.ts re-exports everything from here to preserve backward compatibility.

export interface LoginCredentials {
  grantType: string;
  userId: string;
  password: string;
  scope?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  idle_timeout: number;
  refresh_token: string;
  adminRole: string;
}

export interface ApiError {
  message: string;
  status: number;
}

export interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  model?: string;
  hardwareType?: string;
  status?: string;
  ipAddress?: string;
  macAddress?: string;
  location?: string;
  site?: string;
  hostSite?: string; // The actual site/location field like "LAB Remote Site"
  firmware?: string;
  softwareVersion?: string; // The actual firmware field like "10.14.2.0-002R"
  clientCount?: number;

  // Device identifiers (alternative field names from different API endpoints)
  hostname?: string;
  bssid?: string;
  apModel?: string;
  deviceModel?: string;
  platformName?: string;
  hwType?: string;

  // Status / connectivity alternatives
  connectionState?: string;
  operationalState?: string;
  isUp?: boolean;
  online?: boolean;

  // Location details
  building?: string;
  floor?: string;
  floorName?: string;
  latitude?: number;
  longitude?: number;
  description?: string;

  // RF quality
  noiseFloor?: number;
  noise?: number;

  // System info
  sysUptime?: number | string;
  cpuUsage?: number;
  memoryUsage?: number;

  // Ethernet / power / operational fields
  ethMode?: string;
  ethSpeed?: number | string;
  ethPowerStatus?: string;
  tunnel?: string;
  wiredClients?: number;
  adoptedBy?: string;
  home?: string;
  pwrUsage?: number;
  pwrSource?: string;
  rfMgmtPolicyName?: string;
  switchPorts?: unknown;
  source?: string;
  environment?: string;
  profileName?: string;

  [key: string]: any;
}

export interface APQueryColumn {
  name: string;
  displayName?: string;
  type?: string;
  description?: string;
}

export interface APStation {
  macAddress: string;
  ipAddress?: string;
  hostName?: string;
  status?: string;
  associationTime?: string;
  signalStrength?: number;
  dataRate?: string;
  vlan?: string;
  [key: string]: any;
}

export interface Station {
  // Basic identification
  macAddress: string;
  ipAddress?: string;
  ipv6Address?: string;
  hostName?: string;
  status?: string;

  // Device information
  deviceType?: string;
  manufacturer?: string;
  username?: string;
  role?: string;

  // Network information
  siteId?: string; // Site ID from /v1/stations
  siteName?: string; // Site name (can be populated from mapping)
  serviceId?: string; // Service ID from /v1/stations (to be mapped to service details)
  roleId?: string; // Role ID from /v1/stations (to be mapped to role name)
  network?: string;
  networkName?: string; // Alternative field name
  profileName?: string; // Network profile name
  serviceName?: string; // Service name
  ssid?: string;
  essid?: string; // Alternative SSID field name

  // Access Point information
  apName?: string;
  apDisplayName?: string; // Alternative AP name field
  apHostname?: string; // AP hostname
  accessPointName?: string; // Full access point name
  apSerial?: string;
  apSerialNumber?: string; // Alternative serial field
  apSn?: string; // Short serial number field
  accessPointSerial?: string; // Full serial field name

  // Connection details
  channel?: number;
  radioChannel?: number; // Alternative channel field
  channelNumber?: number; // Another channel field variation
  capabilities?: string;
  signalStrength?: number;
  rssi?: number;           // RSSI in dBm (primary signal strength field)
  rss?: number;            // Alternative RSSI field name
  snr?: number;            // Signal-to-noise ratio
  band?: string;           // Frequency band (2.4GHz, 5GHz, 6GHz)
  frequencyBand?: string;  // Alternative band field name
  rxRate?: string;
  txRate?: string;         // Transmission rate
  transmittedRate?: number; // Alternative Tx rate field
  receivedRate?: number;    // Alternative Rx rate field
  protocol?: string;

  // Traffic statistics
  clientBandwidthBytes?: number;
  packets?: number;
  outBytes?: number;
  outPackets?: number;
  rxBytes?: number;
  txBytes?: number;
  inBytes?: number; // Added for traffic statistics

  // Timing information
  lastSeen?: string;
  associationTime?: string;
  sessionDuration?: string;

  // Rating/Quality
  siteRating?: number;

  // Roaming / quality metrics
  roamCount?: number;
  authStatus?: string;
  latency?: number;
  rtt?: number;
  packetLoss?: number;
  txDropped?: number;

  // Legacy/Additional fields
  dataRate?: string;
  vlan?: string | number;
  vlanId?: string | number; // Alternative VLAN field
  vlanTag?: string | number; // VLAN tag field
  dot1dPortNumber?: number; // VLAN ID from services
  apIpAddress?: string;
  authMethod?: string;
  encryption?: string;
  radioType?: string;
  txPower?: number;
  lastActivity?: string;

  [key: string]: any;
}

export interface StationEvent {
  timestamp: string;           // Unix timestamp in milliseconds as string
  eventType: string;           // Event type: "Roam", "Associate", "Disassociate", "Authenticate", etc.
  macAddress: string;          // Client MAC address
  ipAddress?: string;          // Client IP address
  ipv6Address?: string;        // Client IPv6 address
  apName?: string;             // Access Point name
  apSerial?: string;           // Access Point serial number
  ssid?: string;               // SSID name
  details?: string;            // Detailed event description
  type?: string;               // Event category/type
  level?: string;              // Event severity level
  category?: string;           // Event category
  context?: string;            // Event context
  id?: string;                 // Event ID
  // Additional troubleshooting fields
  channel?: number;            // WiFi channel
  band?: string;               // Frequency band (2.4GHz, 5GHz, 6GHz)
  rssi?: number;               // Signal strength in dBm
  snr?: number;                // Signal-to-noise ratio in dB
  dataRate?: number;           // PHY data rate in Mbps
  previousAp?: string;         // Previous AP name (for roaming)
  previousApSerial?: string;   // Previous AP serial (for roaming)
  reasonCode?: number;         // 802.11 reason code
  statusCode?: number;         // 802.11 status code
  authMethod?: string;         // Authentication method used
}

export interface StationTrafficStats {
  macAddress: string;
  inBytes?: number;
  outBytes?: number;
  rxBytes?: number;
  txBytes?: number;
  packets?: number;
  outPackets?: number;
  [key: string]: any;
}

// AP Event - events from the Access Point perspective
export interface APEvent {
  timestamp: string;           // Unix timestamp in milliseconds as string
  eventType: string;           // Event type
  apName?: string;             // Access Point name
  apSerial?: string;           // Access Point serial number
  details?: string;            // Event details
  type?: string;               // Event category
  level?: string;              // Severity level
  category?: string;           // Event category
  context?: string;            // Event context
  id?: string;                 // Event ID
}

// RRM Event (formerly SmartRF) - Radio Resource Management events
export interface RRMEvent {
  timestamp: string;           // Unix timestamp in milliseconds as string
  eventType: string;           // Event type (channel change, power adjustment, etc.)
  apName?: string;             // Access Point name
  apSerial?: string;           // Access Point serial number
  radio?: string;              // Radio identifier
  channel?: number;            // WiFi channel
  previousChannel?: number;    // Previous channel (for channel changes)
  txPower?: number;            // Transmit power
  previousTxPower?: number;    // Previous transmit power
  band?: string;               // Frequency band
  reason?: string;             // Reason for the change
  details?: string;            // Event details
  type?: string;               // Event category
  level?: string;              // Severity level
  id?: string;                 // Event ID
}

// Combined station events response from muEvent widget
export interface StationEventsResponse {
  stationEvents: StationEvent[];
  apEvents: APEvent[];
  smartRfEvents: RRMEvent[];  // API returns as smartRfEvents, we display as RRM Events
}

// AP Alarm/Event - individual alarm from the AP alarms endpoint
export interface APAlarm {
  log: string;                // Message/description
  ts: number;                 // Timestamp in milliseconds
  pos: number;                // Position/order
  ApSerial: string;           // AP Serial number
  ApName: string;             // AP Name
  Id: number;                 // Event ID
  Context: string;            // Context (ConnectDetails, ChannelChange, etc.)
  Category: string;           // Category (Discovery, AlarmCleared, etc.)
  Level: string;              // Severity level (Critical, Major, etc.)
}

// AP Alarm Type - groups alarms by type
export interface APAlarmType {
  id: string;                 // Alarm type ID (ChannelChange, ConnectDetails, etc.)
  severity: string;           // Severity level
  alarms: APAlarm[];          // List of alarms
}

// AP Alarm Category - groups alarm types by category
export interface APAlarmCategory {
  category: string[];         // Category names
  alarmTypes: APAlarmType[];  // List of alarm types
}

// AP Insights - Timeseries data point
export interface APInsightsDataPoint {
  timestamp: number;
  value: string;
  numPoints?: string;
}

// AP Insights - Statistic within a report
export interface APInsightsStatistic {
  statName: string;
  type: string;
  unit: string;
  values: APInsightsDataPoint[];
  count?: number;
}

// AP Insights - Report data
export interface APInsightsReport {
  reportName: string;
  reportType: string;
  band?: string;
  legacy?: boolean;
  fromTimeInMillis: number;
  toTimeInMillis: number;
  statistics: APInsightsStatistic[];
}

// AP Insights - Full response
export interface APInsightsResponse {
  deviceSerialNo: string;
  timeStamp: number;
  macAddress: string;
  hwType: string;
  location: string;
  ipAddress: string;
  swVersion: string;
  sysUptime: number;
  throughputReport?: APInsightsReport[];
  countOfUniqueUsersReport?: APInsightsReport[];
  baseliningAPRss?: APInsightsReport[];
  apPowerConsumptionTimeseries?: APInsightsReport[];
  channelUtilization5?: APInsightsReport[];
  channelUtilization2_4?: APInsightsReport[];
  noisePerRadio?: APInsightsReport[];
  apQoE?: any[];
}

// Client Insights - App Group data for donut chart
export interface ClientAppGroupData {
  name: string;
  value: number;
  percentage?: number;
}

// Client Insights - Full response
export interface ClientInsightsResponse {
  macAddress: string;
  ipAddress: string;
  manufacturer?: string;
  osType?: string;
  deviceFamily?: string;
  deviceType?: string;
  ssid?: string;
  // Default view reports
  throughputReport?: APInsightsReport[];
  rfQuality?: APInsightsReport[];
  topAppGroupsByThroughputReport?: Array<{
    reportName: string;
    statistics: ClientAppGroupData[];
    totalThroughput?: number;
  }>;
  appGroupsThroughputDetails?: APInsightsReport[];
  // Expert view reports
  baseliningRFQI?: APInsightsReport[];
  baseliningWirelessRTT?: APInsightsReport[];
  baseliningNetworkRTT?: APInsightsReport[];
  baseliningRss?: APInsightsReport[];
  baseliningRxRate?: APInsightsReport[];
  baseliningTxRate?: APInsightsReport[];
  muEvent?: APInsightsReport[];
  // Troubleshoot view reports
  dlRetries?: APInsightsReport[];
  stationEvents?: APInsightsReport[];
}

export interface APRadio {
  radioName: string;
  radioIndex: number;
  adminState: boolean;
  mode: string;
  channelwidth: string;
  useSmartRf: boolean;
  reqChannel: string;
  txMaxPower: number;
  [key: string]: any;
}

export interface APDetails extends AccessPoint {
  uptime?: string;
  memoryUsage?: number;
  cpuUsage?: number;
  channelUtilization?: number;
  txPower?: number;
  channel?: number;
  associatedClients?: number;
  radios?: APRadio[];
  [key: string]: any;
}

export interface APPlatform {
  name: string;
  description?: string;
  [key: string]: any;
}

export interface APHardwareType {
  name: string;
  description?: string;
  [key: string]: any;
}

export interface Service {
  id: string;
  name?: string; // Optional as API may use serviceName instead
  serviceName?: string; // Alternative name field used by Extreme Platform ONE
  description?: string;
  enabled?: boolean;
  status?: string; // 'enabled' or 'disabled'
  ssid?: string;
  security?: {
    type?: string;
    privacyType?: string;
    authType?: string;
    authMethod?: string;
    encryption?: string;
    passphrase?: string;
    [key: string]: any;
  };
  vlan?: number;
  band?: string;
  maxClients?: number;
  maxClientsPer24?: number; // Max clients on 2.4GHz band
  maxClientsPer5?: number; // Max clients on 5GHz band
  hidden?: boolean;
  suppressSsid?: boolean; // Alternative field for hidden SSID
  captivePortal?: boolean;
  enableCaptivePortal?: boolean; // Alternative field name for captive portal
  guestAccess?: boolean;

  // Extreme Platform ONE specific fields
  canEdit?: boolean;
  canDelete?: boolean;

  // Network/VLAN Configuration
  dot1dPortNumber?: number; // VLAN ID / Service ID
  defaultTopology?: string; // Topology UUID for VLAN assignment
  proxied?: string; // "Local" or "Centralized" - traffic forwarding mode

  // Security Configuration - Top-level elements
  WpaPskElement?: {
    mode?: string; // Security mode like "aesOnly", "tkipOnly", "mixed"
    pmfMode?: string; // Protected Management Frames
    presharedKey?: string;
    keyHexEncoded?: boolean;
    [key: string]: any;
  };
  WpaEnterpriseElement?: {
    mode?: string; // Enterprise security mode "aesOnly", "wpa3only", etc.
    pmfMode?: string;
    fastTransitionEnabled?: boolean; // 802.11r
    fastTransitionMdId?: number; // Mobility Domain ID for 802.11r
    [key: string]: any;
  };
  WpaSaeElement?: {
    pmfMode?: string; // Protected Management Frames mode: "required", "capable", "disabled"
    presharedKey?: string;
    keyHexEncoded?: boolean;
    saeMethod?: string; // SAE method: "SaeH2e" (Hash-to-Element) or "SaeLoop"
    encryption?: string; // Encryption like "AES_CCM_128"
    akmSuiteSelector?: string;
    [key: string]: any;
  };

  // Security Configuration - Nested in privacy object
  privacy?: {
    WpaPskElement?: {
      mode?: string;
      pmfMode?: string;
      presharedKey?: string;
      keyHexEncoded?: boolean;
      [key: string]: any;
    };
    WpaEnterpriseElement?: {
      mode?: string;
      pmfMode?: string;
      fastTransitionEnabled?: boolean;
      fastTransitionMdId?: number;
      [key: string]: any;
    };
    WpaSaeElement?: {
      pmfMode?: string;
      presharedKey?: string;
      keyHexEncoded?: boolean;
      saeMethod?: string;
      encryption?: string;
      akmSuiteSelector?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };

  // OWE (Opportunistic Wireless Encryption) - Enhanced Open
  oweAutogen?: boolean; // Auto-generate OWE transition SSID
  oweCompanion?: string | null; // Companion service ID for OWE

  // Advanced Security
  beaconProtection?: boolean; // WPA3 beacon protection

  // AAA/RADIUS Configuration
  aaaPolicyId?: string | null; // AAA Policy UUID for RADIUS
  accountingEnabled?: boolean; // RADIUS accounting

  // Role Assignment
  unAuthenticatedUserDefaultRoleID?: string; // Default role before authentication
  authenticatedUserDefaultRoleID?: string; // Default role after authentication
  mbatimeoutRoleId?: string | null; // Role after MAC-based auth timeout
  defaultCoS?: string; // Class of Service UUID

  // 802.11k/v/r Support
  enabled11kSupport?: boolean; // 802.11k Radio Resource Management
  rm11kBeaconReport?: boolean; // 802.11k beacon report
  rm11kQuietIe?: boolean; // 802.11k quiet IE
  enable11mcSupport?: boolean; // 802.11v BSS Transition Management

  // Band Steering & Multi-band
  bandSteering?: boolean; // Steer clients to less congested band
  mbo?: boolean; // Multi-Band Operation (802.11k/v enhancements)

  // QoS & Admission Control
  uapsdEnabled?: boolean; // WMM Power Save (U-APSD)
  admissionControlVideo?: boolean; // QoS admission control for video
  admissionControlVoice?: boolean; // QoS admission control for voice
  admissionControlBestEffort?: boolean; // QoS admission control for best effort
  admissionControlBackgroundTraffic?: boolean; // QoS admission control for background
  dscp?: {
    codePoints?: number[]; // Array of 64 DSCP to UP mappings (0-7)
  };

  // Client Management
  clientToClientCommunication?: boolean; // Allow wireless client-to-client (false = isolation)
  flexibleClientAccess?: boolean; // Dynamic client access control
  purgeOnDisconnect?: boolean; // Clear client data on disconnect
  includeHostname?: boolean; // Send hostname to RADIUS
  mbaAuthorization?: boolean; // MAC-Based Authorization

  // Timeouts
  preAuthenticatedIdleTimeout?: number; // Idle timeout before auth (seconds)
  postAuthenticatedIdleTimeout?: number; // Idle timeout after auth (seconds)
  sessionTimeout?: number; // Maximum session duration (seconds)

  // Captive Portal
  captivePortalType?: string | null; // Type of captive portal
  eGuestPortalId?: string | null; // eGuest portal UUID
  eGuestSettings?: any[]; // eGuest portal settings
  cpNonAuthenticatedPolicyName?: string | null; // Captive portal policy name

  // Hotspot 2.0 / Passpoint
  hotspotType?: string; // "Disabled", "Hotspot20", etc.
  hotspot?: any | null; // Hotspot 2.0 configuration object

  // Roaming
  roamingAssistPolicy?: string | null; // Roaming assistance policy UUID
  loadBalancing?: boolean; // Distribute clients across APs

  // RADIUS Attributes
  vendorSpecificAttributes?: string[]; // Custom RADIUS VSAs: ["apName", "vnsName", "ssid", etc.]

  // Mesh
  shutdownOnMeshpointLoss?: boolean; // Disable service if mesh connection lost

  // Features
  features?: string[]; // Feature flags like ["CENTRALIZED-SITE"]

  // Additional security-related fields that might exist at the service level
  privacyType?: string;
  authType?: string;
  authMethod?: string;
  encryption?: string;
  securityMode?: string;
  securityType?: string;
  mode?: string; // Security mode that may exist at top level
  [key: string]: any;
}

export interface Role {
  id: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
  predefined: boolean;
  l2Filters: any[];
  l3Filters: any[];
  l3SrcDestFilters: any[];
  l7Filters: any[];
  defaultAction: 'allow' | 'deny' | string;
  topology: string | null;
  defaultCos: string | null;
  cpTopologyId: string | null;
  cpRedirect: string;
  cpIdentity: string;
  cpSharedKey: string;
  cpDefaultRedirectUrl: string;
  cpRedirectUrlSelect: string;
  cpHttp: boolean;
  cpUseFQDN: boolean;
  cpAddIpAndPort: boolean;
  cpAddApNameAndSerial: boolean;
  cpAddBssid: boolean;
  cpAddVnsName: boolean;
  cpAddSsid: boolean;
  cpAddMac: boolean;
  cpAddRole: boolean;
  cpAddVlan: boolean;
  cpAddTime: boolean;
  cpAddSign: boolean;
  cpOauthUseGoogle: boolean;
  cpOauthUseFacebook: boolean;
  cpOauthUseMicrosoft: boolean;
  cpRedirectPorts: number[];
  features: string[];
  profiles: string[];
  [key: string]: any;
}

export interface ClassOfService {
  id: string;
  cosName: string;
  canEdit: boolean;
  canDelete: boolean;
  predefined: boolean;
  cosQos: {
    priority: string;
    tosDscp: number | null;
    mask: number | null;
  };
  inboundRateLimiterId: string | null;
  outboundRateLimiterId: string | null;
}

export interface Topology {
  id: string;
  name: string;
  vlanid: number;
  tagged: boolean;
  canEdit: boolean;
  canDelete: boolean;
  mode: string;
  [key: string]: any;
}

export interface AaaPolicy {
  id: string;
  name: string;
  policyName?: string;
  description?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  radiusServer?: string;
  radiusPort?: number;
  radiusSecret?: string;
  radiusAuthPort?: number;
  radiusAcctPort?: number;
  accountingEnabled?: boolean;
  [key: string]: any;
}

export interface Site {
  id: string;
  name: string;
  siteName?: string; // ConfigureSites component uses this field
  country?: string;
  timezone?: string;
  status?: string;
  roles?: number;
  networks?: number;
  switches?: number;
  aps?: number;
  adoptionPrimary?: string;
  adoptionBackup?: string;
  activeAPs?: number;
  nonActiveAPs?: number;
  allClients?: number;
  campus?: string;
  description?: string;
  address?: string;
  contactInfo?: any;
  settings?: any;
  [key: string]: any;
}

export interface Country {
  name: string;
  code: string;
  timezones?: string[];
  [key: string]: any;
}

export interface SiteStats {
  totalStations?: number;
  activeAPs?: number;
  totalAPs?: number;
  [key: string]: any;
}

export interface ApiCallLog {
  id: number;
  timestamp: Date;
  method: string;
  endpoint: string;
  status?: number;
  duration?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  isPending: boolean;
}

// ==================== OS ONE INTERFACES ====================

/**
 * OS ONE External Service Status
 */
export interface OSOneExternalService {
  service: string;
  status: string;
  address: string;
}

/**
 * OS ONE Disk Partition
 */
export interface OSOneDiskPartition {
  name: string;
  totalSpace: number;
  used: number;
  available: number;
  usePercent: number;
}

/**
 * OS ONE Port Interface
 */
export interface OSOnePortInterface {
  port: number;
  state: string;
  speed: number;
}

/**
 * OS ONE System Information
 * Contains CPU, memory, disk, port, and external service data
 */
export interface OSOneSystemInfo {
  raw: string;
  externalServices: OSOneExternalService[];
  lastUpgrade?: number;
  sysUptime?: number;
  uptime: string;
  cpuUtilization: number;
  memoryFreePercent: number;
  diskPartitions: OSOneDiskPartition[];
  ports: OSOnePortInterface[];
}

/**
 * OS ONE Manufacturing Information
 * Contains hardware and software version details
 */
export interface OSOneManufacturingInfo {
  raw: string;
  smxVersion?: string;
  guiVersion?: string;
  nacVersion?: string;
  softwareVersion?: string;
  model?: string;
  cpuType?: string;
  cpuFrequency?: number;
  numberOfCpus?: number;
  totalMemory?: number;
  hwEncryption?: boolean;
  lan1Mac?: string;
  lan2Mac?: string;
  adminMac?: string;
  lockingId?: string;
}

/**
 * Complete OS ONE Information
 */
export interface OSOneInfo {
  system: OSOneSystemInfo | null;
  manufacturing: OSOneManufacturingInfo | null;
  timestamp: number;
}

/**
 * Query options for API requests
 * Supports field projection, pagination, sorting, and filtering
 */
export interface QueryOptions {
  /** Specific fields to return (field projection) */
  fields?: string[];

  /** Maximum number of results to return */
  limit?: number;

  /** Number of results to skip (pagination) */
  offset?: number;

  /** Field to sort by */
  sortBy?: string;

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Additional query parameters */
  params?: Record<string, string | number | boolean>;
}
