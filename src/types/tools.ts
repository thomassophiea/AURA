/**
 * Tools Types for ExtremeCloud IQ Controller
 * Includes Logs, Diagnostics, Reports, Workflow
 * Based on official documentation v10.17.01
 */

// ============================================
// Log Types
// ============================================

/**
 * Log severity level
 */
export type LogSeverity = 
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'
  | 'critical';

/**
 * Log category
 */
export type LogCategory = 
  | 'events'
  | 'station-events'
  | 'audit'
  | 'ap-logs'
  | 'smart-rf'
  | 'ap-upgrade';

/**
 * Generic log entry
 */
export interface LogEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  category: LogCategory;
  source: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Event log entry
 */
export interface EventLogEntry extends LogEntry {
  category: 'events';
  eventType: string;
  component: string;
  siteId?: string;
  siteName?: string;
}

/**
 * Station event log entry
 */
export interface StationEventEntry extends LogEntry {
  category: 'station-events';
  clientMac: string;
  clientIp?: string;
  ssid?: string;
  apMac?: string;
  apName?: string;
  eventType: StationEventType;
  reason?: string;
}

/**
 * Station event types
 */
export type StationEventType = 
  | 'association'
  | 'disassociation'
  | 'authentication'
  | 'deauthentication'
  | 'roam'
  | 'ip-assignment'
  | 'radius-accept'
  | 'radius-reject'
  | 'captive-portal-redirect'
  | 'captive-portal-auth';

/**
 * Audit log entry
 */
export interface AuditLogEntry extends LogEntry {
  category: 'audit';
  user: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: string;
  newValue?: string;
  ipAddress: string;
  success: boolean;
}

/**
 * AP log entry
 */
export interface APLogEntry extends LogEntry {
  category: 'ap-logs';
  apMac: string;
  apName: string;
  apIp?: string;
  siteId?: string;
  siteName?: string;
}

/**
 * Smart RF log entry
 */
export interface SmartRFLogEntry extends LogEntry {
  category: 'smart-rf';
  apMac: string;
  apName: string;
  radio: string;
  event: SmartRFEventType;
  oldChannel?: number;
  newChannel?: number;
  oldPower?: number;
  newPower?: number;
  reason?: string;
}

/**
 * Smart RF event types
 */
export type SmartRFEventType = 
  | 'channel-change'
  | 'power-change'
  | 'interference-detected'
  | 'neighbor-update'
  | 'coverage-hole'
  | 'radar-detected';

/**
 * AP upgrade log entry
 */
export interface APUpgradeLogEntry extends LogEntry {
  category: 'ap-upgrade';
  apMac: string;
  apName: string;
  oldVersion: string;
  newVersion: string;
  status: APUpgradeStatus;
  progress?: number;
  errorMessage?: string;
  startTime: string;
  endTime?: string;
}

/**
 * AP upgrade status
 */
export type APUpgradeStatus = 
  | 'pending'
  | 'downloading'
  | 'installing'
  | 'rebooting'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Log query filter
 */
export interface LogQueryFilter {
  startTime?: string;
  endTime?: string;
  severity?: LogSeverity[];
  category?: LogCategory;
  source?: string;
  searchText?: string;
  siteId?: string;
  apMac?: string;
  clientMac?: string;
  user?: string;
  limit?: number;
  offset?: number;
}

/**
 * Saved log query
 */
export interface SavedLogQuery {
  id?: string;
  name: string;
  category: LogCategory;
  filter: LogQueryFilter;
  createdAt?: string;
  lastUsed?: string;
}

// ============================================
// Diagnostics
// ============================================

/**
 * System health status
 */
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

/**
 * System health check item
 */
export interface HealthCheckItem {
  id: string;
  name: string;
  category: 'configuration' | 'operational';
  status: HealthStatus;
  message: string;
  recommendation?: string;
  lastChecked: string;
}

/**
 * System health summary
 */
export interface SystemHealthSummary {
  overallStatus: HealthStatus;
  configurationScore: number;    // 0-100
  operationalScore: number;      // 0-100
  items: HealthCheckItem[];
  lastUpdated: string;
}

/**
 * Network health site summary
 */
export interface NetworkHealthSite {
  siteId: string;
  siteName: string;
  status: HealthStatus;
  apCount: number;
  apOnline: number;
  apOffline: number;
  clientCount: number;
  utilizationPercent: number;
  issues: string[];
}

/**
 * Network health summary
 */
export interface NetworkHealthSummary {
  overallStatus: HealthStatus;
  totalSites: number;
  healthySites: number;
  warningSites: number;
  criticalSites: number;
  sites: NetworkHealthSite[];
  lastUpdated: string;
}

/**
 * Smart Poll target
 */
export interface SmartPollTarget {
  id?: string;
  name: string;
  targetAddress: string;
  enabled: boolean;
}

/**
 * Smart Poll result
 */
export interface SmartPollResult {
  targetId: string;
  targetName: string;
  targetAddress: string;
  siteId: string;
  siteName: string;
  apMac: string;
  apName: string;
  rttMs: number;
  packetLossPercent: number;
  jitterMs?: number;
  timestamp: string;
}

/**
 * Smart Poll site summary
 */
export interface SmartPollSiteSummary {
  siteId: string;
  siteName: string;
  avgRttMs: number;
  avgPacketLossPercent: number;
  apCount: number;
  status: HealthStatus;
}

/**
 * Network utility type
 */
export type NetworkUtilityType = 'ping' | 'traceroute' | 'nslookup' | 'tcpdump';

/**
 * Network utility request
 */
export interface NetworkUtilityRequest {
  type: NetworkUtilityType;
  target: string;
  sourceInterface?: string;
  options?: Record<string, any>;
}

/**
 * Network utility result
 */
export interface NetworkUtilityResult {
  type: NetworkUtilityType;
  target: string;
  success: boolean;
  output: string;
  startTime: string;
  endTime: string;
  statistics?: {
    packetsTransmitted?: number;
    packetsReceived?: number;
    packetLossPercent?: number;
    rttMin?: number;
    rttMax?: number;
    rttAvg?: number;
  };
}

/**
 * TCP dump configuration
 */
export interface TCPDumpConfig {
  interface: string;
  filename: string;
  saveDestination: 'local' | 'remote';
  remoteServer?: string;
  maxFileSizeMB: number;
  filter?: string;
}

/**
 * TCP dump file
 */
export interface TCPDumpFile {
  id: string;
  filename: string;
  interface: string;
  size: number;
  createdAt: string;
  duration?: number;
}

/**
 * Packet capture session
 */
export interface PacketCaptureSession {
  id: string;
  apMac: string;
  apName: string;
  status: 'running' | 'stopped' | 'completed';
  interface: string;
  filter?: string;
  startTime: string;
  endTime?: string;
  packetCount: number;
  fileSize: number;
}

/**
 * Packet capture configuration
 */
export interface PacketCaptureConfig {
  duration: number;
  maxPackets: number;
  interface: string;
  filter?: string;
  apMac?: string;
}

/**
 * Log viewer configuration
 */
export interface LogViewerConfig {
  level: LogSeverity;
  category?: LogCategory;
  searchText?: string;
  startTime?: string;
  endTime?: string;
  autoRefresh: boolean;
  refreshInterval: number;
}

/**
 * Diagnostic result
 */
export interface DiagnosticResult {
  id: string;
  type: 'packet-capture' | 'log-query' | 'network-test' | 'health-check';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  result?: Record<string, unknown>;
  errorMessage?: string;
}

// ============================================
// AP Test Suites
// ============================================

/**
 * AP test type
 */
export type APTestType = 
  | 'connectivity'
  | 'throughput'
  | 'latency'
  | 'dns'
  | 'dhcp'
  | 'radius'
  | 'internet';

/**
 * AP test suite
 */
export interface APTestSuite {
  id?: string;
  name: string;
  description?: string;
  tests: APTestType[];
  parameters: Record<string, any>;
  createdAt?: string;
}

/**
 * AP test run request
 */
export interface APTestRunRequest {
  suiteId: string;
  apMacs: string[];
  parameters?: Record<string, any>;
}

/**
 * AP test result
 */
export interface APTestResult {
  id: string;
  suiteId: string;
  suiteName: string;
  apMac: string;
  apName: string;
  testType: APTestType;
  status: 'pass' | 'fail' | 'warning' | 'skipped';
  message: string;
  details?: Record<string, any>;
  startTime: string;
  endTime: string;
  duration: number;
}

/**
 * AP test run summary
 */
export interface APTestRunSummary {
  id: string;
  suiteId: string;
  suiteName: string;
  apCount: number;
  status: 'running' | 'completed' | 'failed';
  passed: number;
  failed: number;
  warnings: number;
  skipped: number;
  startTime: string;
  endTime?: string;
  results: APTestResult[];
}

// ============================================
// Reports
// ============================================

/**
 * Report type
 */
export type ReportType = 
  | 'dashboard-widget'
  | 'client-usage'
  | 'ap-usage'
  | 'network-usage'
  | 'security'
  | 'audit'
  | 'custom';

/**
 * Report format
 */
export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

/**
 * Report time range
 */
export type ReportTimeRange = 
  | 'last-hour'
  | 'last-24-hours'
  | 'last-7-days'
  | 'last-30-days'
  | 'last-90-days'
  | 'custom';

/**
 * Report schedule frequency
 */
export type ReportScheduleFrequency = 
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly';

/**
 * Report template
 */
export interface ReportTemplate {
  id?: string;
  name: string;
  description?: string;
  type: ReportType;
  widgetIds?: string[];       // For dashboard-widget type
  filters?: Record<string, any>;
  columns?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  createdAt?: string;
  lastModified?: string;
}

/**
 * Report schedule
 */
export interface ReportSchedule {
  id?: string;
  name: string;
  templateId: string;
  enabled: boolean;
  frequency: ReportScheduleFrequency;
  timeRange: ReportTimeRange;
  customStartDate?: string;
  customEndDate?: string;
  format: ReportFormat;
  recipients: string[];       // Email addresses
  dayOfWeek?: number;         // 0-6 for weekly
  dayOfMonth?: number;        // 1-31 for monthly
  time: string;               // HH:MM format
  siteIds?: string[];
  lastRun?: string;
  nextRun?: string;
  createdAt?: string;
}

/**
 * Generated report
 */
export interface GeneratedReport {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  scheduleId?: string;
  format: ReportFormat;
  timeRange: ReportTimeRange;
  startDate: string;
  endDate: string;
  fileSize: number;
  downloadUrl: string;
  generatedAt: string;
  expiresAt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
}

/**
 * Venue/User group for reports
 */
export interface ReportVenueGroup {
  id?: string;
  name: string;
  siteIds: string[];
  description?: string;
}

// ============================================
// Workflow
// ============================================

/**
 * Workflow component type
 */
export type WorkflowComponentType = 
  | 'site'
  | 'device-group'
  | 'profile'
  | 'network'
  | 'role'
  | 'vlan'
  | 'aaa-policy'
  | 'adoption-rule';

/**
 * Workflow component status
 */
export type WorkflowComponentStatus = 
  | 'configured'
  | 'incomplete'
  | 'error'
  | 'not-configured';

/**
 * Workflow component
 */
export interface WorkflowComponent {
  id: string;
  type: WorkflowComponentType;
  name: string;
  status: WorkflowComponentStatus;
  parentId?: string;
  children?: WorkflowComponent[];
  issues?: string[];
  configUrl: string;
}

/**
 * Workflow overview
 */
export interface WorkflowOverview {
  sites: WorkflowComponent[];
  completionPercent: number;
  issueCount: number;
  lastUpdated: string;
}

// ============================================
// AFC (Automated Frequency Coordination)
// ============================================

/**
 * AFC server status
 */
export type AFCServerStatus = 
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'pending';

/**
 * AFC server info
 */
export interface AFCServerInfo {
  name: string;
  url: string;
  status: AFCServerStatus;
  lastContact?: string;
  lastError?: string;
}

/**
 * AFC coverage area
 */
export interface AFCCoverageArea {
  siteId: string;
  siteName: string;
  latitude: number;
  longitude: number;
  radius: number;             // meters
  channels: number[];
  maxPower: number;           // dBm
  lastUpdated: string;
}

/**
 * AFC explorer result
 */
export interface AFCExplorerResult {
  location: {
    latitude: number;
    longitude: number;
  };
  availableChannels: Array<{
    channel: number;
    maxEirp: number;
  }>;
  server: string;
  timestamp: string;
}
