/**
 * System Configuration Types for ExtremeCloud IQ Controller
 * Based on official documentation v10.17.01
 */

// ============================================
// Network Interfaces
// ============================================

/**
 * Interface mode types
 */
export type InterfaceMode = 
  | 'dhcp-client'      // DHCP Client mode
  | 'static'           // Static IP configuration
  | 'dhcp-server';     // DHCP Server mode

/**
 * Port type for L2 configuration
 */
export type PortType = 'uplink' | 'access' | 'trunk';

/**
 * LAG (Link Aggregation Group) mode
 */
export type LAGMode = 'static' | 'lacp';

/**
 * Network interface configuration
 */
export interface NetworkInterface {
  id?: string;
  name: string;
  type: 'admin' | 'data' | 'bridge' | 'lag';
  mode: InterfaceMode;
  ipAddress?: string;
  cidr?: number;
  gateway?: string;
  vlanId?: number;
  enabled: boolean;
  dhcpEnabled?: boolean;
  dhcpRangeStart?: string;
  dhcpRangeEnd?: string;
  description?: string;
}

/**
 * L2 Port configuration
 */
export interface L2Port {
  id: string;
  name: string;
  portNumber: number;
  portType: PortType;
  speed: string;
  duplex: 'full' | 'half' | 'auto';
  enabled: boolean;
  lagId?: string;
  vlans?: number[];
  statistics?: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
    errors: number;
  };
}

/**
 * LAG interface configuration
 */
export interface LAGInterface {
  id: string;
  name: string;
  mode: LAGMode;
  members: string[];    // Port IDs
  enabled: boolean;
}

/**
 * Static route configuration
 */
export interface StaticRoute {
  id?: string;
  destination: string;  // Network address (CIDR)
  gateway: string;
  metric?: number;
  interface?: string;
  description?: string;
}

/**
 * Host attributes (system-level network config)
 */
export interface HostAttributes {
  hostName: string;
  domainName?: string;
  defaultGateway: string;
  dnsServers: string[];
}

// ============================================
// Network Time (NTP)
// ============================================

/**
 * NTP server configuration
 */
export interface NTPServer {
  id?: string;
  address: string;
  enabled: boolean;
  preferred?: boolean;
}

/**
 * Network time configuration
 */
export interface NetworkTimeConfig {
  timezone: string;
  ntpEnabled: boolean;
  ntpServers: NTPServer[];
  manualTime?: string;
}

// ============================================
// SNMP Configuration
// ============================================

/**
 * SNMP version
 */
export type SNMPVersion = 'disabled' | 'v2c' | 'v3';

/**
 * SNMPv2c community access level
 */
export type SNMPCommunityAccess = 'read' | 'write';

/**
 * SNMPv3 authentication protocol
 */
export type SNMPv3AuthProtocol = 'none' | 'md5' | 'sha';

/**
 * SNMPv3 privacy protocol
 */
export type SNMPv3PrivacyProtocol = 'none' | 'des' | 'aes128' | 'aes192' | 'aes256';

/**
 * SNMPv3 security level
 */
export type SNMPv3SecurityLevel = 
  | 'noAuthNoPriv'    // No Authentication/No Privacy
  | 'authNoPriv'      // Authentication/No Privacy
  | 'authPriv';       // Authentication/Privacy

/**
 * SNMP trap severity
 */
export type SNMPTrapLevel = 'none' | 'information' | 'minor' | 'major' | 'critical';

/**
 * SNMPv2c community configuration
 */
export interface SNMPCommunity {
  id?: string;
  name: string;
  accessLevel: SNMPCommunityAccess;
}

/**
 * SNMPv3 user configuration
 */
export interface SNMPv3User {
  id?: string;
  username: string;
  securityLevel: SNMPv3SecurityLevel;
  authProtocol?: SNMPv3AuthProtocol;
  authPassword?: string;
  privacyProtocol?: SNMPv3PrivacyProtocol;
  privacyPassword?: string;
}

/**
 * SNMP notification target
 */
export interface SNMPNotification {
  id?: string;
  targetAddress: string;
  port: number;
  community?: string;      // For v2c
  username?: string;       // For v3
  enabled: boolean;
}

/**
 * Complete SNMP configuration
 */
export interface SNMPConfig {
  version: SNMPVersion;
  engineId?: string;           // SNMPv3
  contextString?: string;      // SNMPv3
  forwardTraps: SNMPTrapLevel;
  communities: SNMPCommunity[];
  v3Users: SNMPv3User[];
  notifications: SNMPNotification[];
}

// ============================================
// System Logging
// ============================================

/**
 * Log severity level
 */
export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

/**
 * Syslog facility
 */
export type SyslogFacility = 
  | 'local0' | 'local1' | 'local2' | 'local3'
  | 'local4' | 'local5' | 'local6' | 'local7';

/**
 * Remote syslog server configuration
 */
export interface SyslogServer {
  id?: string;
  address: string;
  port: number;
  protocol: 'udp' | 'tcp' | 'tls';
  facility: SyslogFacility;
  enabled: boolean;
}

/**
 * System logging configuration
 */
export interface SystemLoggingConfig {
  logLevel: LogLevel;
  localLogging: boolean;
  remoteLogging: boolean;
  syslogServers: SyslogServer[];
  auditLogging: boolean;
  stationEventLogging: boolean;
}

// ============================================
// Software Upgrade & Backup
// ============================================

/**
 * Backup type
 */
export type BackupType = 'full' | 'configuration';

/**
 * Backup destination
 */
export type BackupDestination = 'local' | 'remote';

/**
 * Backup schedule frequency
 */
export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * Backup configuration
 */
export interface BackupConfig {
  id?: string;
  name: string;
  type: BackupType;
  destination: BackupDestination;
  remoteServer?: string;
  remotePath?: string;
  username?: string;
  password?: string;
  scheduledEnabled: boolean;
  frequency?: BackupFrequency;
  dayOfWeek?: number;   // 0-6, Sunday = 0
  dayOfMonth?: number;  // 1-31
  time?: string;        // HH:MM format
  retentionDays?: number;
  lastBackup?: string;
  lastBackupStatus?: 'success' | 'failed';
}

/**
 * Backup file metadata
 */
export interface BackupFile {
  id: string;
  filename: string;
  type: BackupType;
  size: number;
  createdAt: string;
  description?: string;
}

/**
 * Software image metadata
 */
export interface SoftwareImage {
  id: string;
  version: string;
  filename: string;
  size: number;
  uploadedAt: string;
  isRescue: boolean;
  isCurrent: boolean;
}

/**
 * Upgrade schedule
 */
export interface UpgradeSchedule {
  enabled: boolean;
  scheduledTime?: string;
  imageId?: string;
  backupBeforeUpgrade: boolean;
  rescueImageDestination?: string;
}

// ============================================
// Availability (High Availability)
// ============================================

/**
 * Availability mode
 */
export type AvailabilityMode = 'standalone' | 'primary' | 'secondary';

/**
 * Availability pair status
 */
export type AvailabilityStatus = 
  | 'active'
  | 'standby'
  | 'synchronizing'
  | 'failover'
  | 'disconnected'
  | 'error';

/**
 * Availability pair configuration
 */
export interface AvailabilityConfig {
  mode: AvailabilityMode;
  peerAddress?: string;
  peerPort?: number;
  sharedSecret?: string;
  syncEnabled: boolean;
  autoFailover: boolean;
  failoverDelay?: number;     // seconds
  heartbeatInterval?: number; // seconds
  status?: AvailabilityStatus;
  lastSync?: string;
}

/**
 * Mobility settings for HA
 */
export interface MobilitySettings {
  mobilityEnabled: boolean;
  mobilityGroupName?: string;
  mobilityPeers?: string[];
}

// ============================================
// Administrator Accounts
// ============================================

/**
 * Admin role
 */
export type AdminRole = 'admin' | 'operator' | 'viewer' | 'custom';

/**
 * Administrator account
 */
export interface AdminAccount {
  id?: string;
  username: string;
  email?: string;
  role: AdminRole;
  customPermissions?: string[];
  enabled: boolean;
  lockedOut: boolean;
  lastLogin?: string;
  passwordExpiry?: string;
  mfaEnabled?: boolean;
}

/**
 * RADIUS server for admin authentication
 */
export interface AdminRADIUSServer {
  id?: string;
  address: string;
  port: number;
  secret: string;
  timeout: number;
  retries: number;
  enabled: boolean;
}

/**
 * Admin authentication settings
 */
export interface AdminAuthConfig {
  localAuthEnabled: boolean;
  radiusAuthEnabled: boolean;
  radiusServers: AdminRADIUSServer[];
  sessionTimeout: number;      // minutes
  maxLoginAttempts: number;
  lockoutDuration: number;     // minutes
  passwordMinLength: number;
  passwordComplexity: boolean;
  passwordExpireDays: number;
}

// ============================================
// Trust Points (Certificates)
// ============================================

/**
 * Certificate type
 */
export type CertificateType = 
  | 'browser'      // Browser/HTTPS certificate
  | 'radius'       // RADIUS server certificate
  | 'radsec'       // RadSec (secure RADIUS) certificate
  | 'ca';          // Certificate Authority

/**
 * Certificate status
 */
export type CertificateStatus = 'valid' | 'expired' | 'expiring-soon' | 'invalid';

/**
 * Trust point / certificate
 */
export interface TrustPoint {
  id?: string;
  name: string;
  type: CertificateType;
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  status: CertificateStatus;
  fingerprint?: string;
  privateKeyPresent: boolean;
}

// ============================================
// System Information
// ============================================

/**
 * System information (read-only)
 */
export interface SystemInfo {
  hostname: string;
  model: string;
  serialNumber: string;
  softwareVersion: string;
  buildNumber: string;
  uptime: number;           // seconds
  cpuUsage: number;         // percentage
  memoryUsage: number;      // percentage
  diskUsage: number;        // percentage
  managementIp: string;
  macAddress: string;
  licensedDevices: number;
  totalDevices: number;
}

// ============================================
// External Integrations
// ============================================

/**
 * Web proxy configuration
 */
export interface WebProxyConfig {
  enabled: boolean;
  address: string;
  port: number;
  username?: string;
  password?: string;
  noProxyHosts?: string[];
}

/**
 * External NAT configuration
 */
export interface ExternalNATConfig {
  enabled: boolean;
  externalAddress: string;
  mappedPorts?: Array<{
    internal: number;
    external: number;
    protocol: 'tcp' | 'udp';
  }>;
}

/**
 * Dynamic Authorization Server (CoA/DM)
 */
export interface DASConfig {
  enabled: boolean;
  port: number;
  secret: string;
  allowedClients: string[];
}

// ============================================
// Settings
// ============================================

/**
 * MAC address format for display
 */
export type MACFormat = 
  | 'colon-separated'    // 00:11:22:33:44:55
  | 'hyphen-separated'   // 00-11-22-33-44-55
  | 'dot-separated'      // 0011.2233.4455
  | 'no-separator';      // 001122334455

/**
 * AP transmit power representation
 */
export type TxPowerRepresentation = 'dBm' | 'mW' | 'percentage';

/**
 * Broadcast/multicast traffic control
 */
export interface TrafficControlConfig {
  broadcastControl: boolean;
  broadcastThreshold?: number;
  multicastControl: boolean;
  multicastThreshold?: number;
  unknownUnicastControl: boolean;
}

/**
 * General system settings
 */
export interface SystemSettings {
  macFormat: MACFormat;
  txPowerRepresentation: TxPowerRepresentation;
  trafficControl: TrafficControlConfig;
  webProxy?: WebProxyConfig;
  externalNAT?: ExternalNATConfig;
  das?: DASConfig;
}

// ============================================
// Applications (Docker)
// ============================================

/**
 * Application status
 */
export type AppStatus = 'running' | 'stopped' | 'error' | 'installing' | 'upgrading';

/**
 * Installed application
 */
export interface Application {
  id: string;
  name: string;
  description?: string;
  version: string;
  status: AppStatus;
  ports?: number[];
  apiKeyRequired: boolean;
  configTemplateId?: string;
  installedAt: string;
  lastUpdated: string;
}

/**
 * API key for application access
 */
export interface APIKey {
  id: string;
  name: string;
  applicationId: string;
  keyPrefix: string;      // First few characters for identification
  createdAt: string;
  expiresAt?: string;
  enabled: boolean;
}

// ============================================
// Licensing
// ============================================

/**
 * License state
 */
export type LicenseState = 
  | 'valid'
  | 'expired'
  | 'grace-period'
  | 'evaluation'
  | 'unlicensed';

/**
 * License information
 */
export interface LicenseInfo {
  state: LicenseState;
  type: string;
  maxDevices: number;
  usedDevices: number;
  expirationDate?: string;
  gracePeriodEnd?: string;
  features: string[];
  activationId?: string;
}

/**
 * License entitlement
 */
export interface LicenseEntitlement {
  id: string;
  name: string;
  quantity: number;
  used: number;
  startDate: string;
  endDate: string;
}
