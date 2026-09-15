/**
 * Cortex AI Copilot Context Types
 * Defines page context, insights, and available actions for the AI assistant layer
 * Enables smart prompting and action discovery across all AURA pages
 */

// ============================================
// Page Type Classification
// ============================================

/**
 * Cortex page type — classifies the current page for context-aware prompting
 */
export type CortexPageType =
  | 'insights'
  | 'service-levels'
  | 'clients'
  | 'client-detail'
  | 'devices'
  | 'ap-detail'
  | 'configuration'
  | 'roles'
  | 'wlans'
  | 'profiles'
  | 'dashboard'
  | 'unknown';

// ============================================
// Page Context
// ============================================

/**
 * Complete context snapshot for the current page
 * Captures: route, user state, filters, visible data, and available actions
 * Passed to Cortex on every navigation and state change
 */
export interface CortexPageContext {
  /** Current route path (e.g., '/workspace', '/configure-networks') */
  route: string;

  /** Human-readable page name (e.g., 'Dashboard', 'Service Levels') */
  pageName: string;

  /** Page classification for context-aware prompting */
  pageType: CortexPageType;

  /** Current organization ID (if available) */
  orgId?: string;

  /** Current organization name */
  orgName?: string;

  /** Current site ID (if site-scoped page) */
  siteId?: string;

  /** Current site name */
  siteName?: string;

  /** Current user role (e.g., 'admin', 'readonly') */
  userRole?: string;

  /** List of permissions the user has (e.g., 'configure:networks', 'read:events') */
  permissions?: string[];

  /** Active time range for analytics/insights pages */
  timeRange?: {
    label: string;
    start: string;
    end: string;
  };

  /** Active filters applied to the page (e.g., status, AP group, client type) */
  filters?: Record<string, unknown>;

  /** Active sorting (e.g., { field: 'clientCount', direction: 'desc' }) */
  sorting?: Record<string, unknown>;

  /** Currently selected object (e.g., a specific client, AP, or WLAN) */
  selectedObject?: unknown;

  /** Currently selected rows in a table */
  selectedRows?: unknown[];

  /** Summary of visible rows: count, column names, sample data, aggregate stats */
  visibleRowsSummary?: {
    rowCount: number;
    columns: string[];
    sampleRows: unknown[];
    aggregateStats?: Record<string, unknown>;
  };

  /** Wireless context — populated when viewing a specific client, AP, or SSID */
  clientMac?: string;
  apSerial?: string;
  apName?: string;
  ssid?: string;

  /** Page-specific metadata (e.g., active tab, expanded sections, UI state) */
  pageMetadata?: Record<string, unknown>;

  /** List of available actions on this page */
  availableActions?: CortexAvailableAction[];
}

// ============================================
// Available Actions
// ============================================

/**
 * An action available to the user on the current page
 * Enables Cortex to suggest and trigger user actions
 */
export interface CortexAvailableAction {
  /** Unique action ID (e.g., 'create-wlan', 'delete-client') */
  id: string;

  /** Human-readable label (e.g., 'Create WLAN', 'Remove Client') */
  label: string;

  /** Action category: read (query), write (mutate), navigate, or config-related */
  type: 'read' | 'write' | 'navigation' | 'config-preview' | 'config-commit';

  /** Whether this action requires user confirmation before execution */
  requiresConfirmation?: boolean;
}

// ============================================
// Insights
// ============================================

/**
 * A single insight discovered by Cortex on the current page
 * Severity-ranked, with evidence and recommended actions
 */
export interface CortexInsight {
  /** Severity: informational, warning, or critical */
  severity: 'info' | 'warning' | 'critical';

  /** Short title (e.g., 'High Client Churn', 'Misconfigured WLAN') */
  title: string;

  /** Detailed description of the insight */
  description: string;

  /** Supporting evidence (e.g., metric values, affected objects) */
  evidence?: string[];

  /** Suggested action to resolve the insight */
  recommendedAction?: string;
}

// ============================================
// Page Analysis
// ============================================

/**
 * Analysis result for the current page
 * Returned by Cortex analysis service; used to populate the copilot panel
 */
export interface CortexPageAnalysis {
  /** Brief summary of page state and key findings */
  summary: string;

  /** List of discovered insights, ranked by severity */
  insights: CortexInsight[];

  /** Suggested prompts for the user (context-aware) */
  suggestedPrompts: string[];

  /** Available actions that Cortex can suggest */
  availableActions: string[];
}

// ============================================
// Page Name Map
// ============================================

/**
 * Maps App.tsx route keys → human-readable page names
 * Used in page context and copilot UI
 */
export const CORTEX_PAGE_NAMES: Record<string, string> = {
  workspace: 'Report Studio',
  insights: 'Network Overview',
  'service-levels': 'Operational Insights',
  'app-insights': 'App Analytics',
  'access-points': 'Access Points',
  'connected-clients': 'Clients',
  'energy-optimization': 'Energy',
  'performance-analytics': 'Performance Analytics',
  'report-widgets': 'Report Widgets',
  'pci-report': 'PCI Report',
  'audit-logs': 'Audit Logs',
  'config-history': 'Config History',
  'system-backup': 'Backup & Storage',
  'license-dashboard': 'License Management',
  'firmware-manager': 'Firmware Manager',
  'network-diagnostics': 'Network Diagnostics',
  'diagnostics-system-health': 'System Health',
  'event-alarm-dashboard': 'Events & Alarms',
  'security-dashboard': 'Security Dashboard',
  'guest-management': 'Guest Accounts',
  'configure-catalog': 'Configure Feature Catalog',
  'configure-networks': 'Configure Networks',
  'configure-policy': 'Configure Roles & Policy',
  'configure-aaa-policies': 'Configure AAA Policies',
  'configure-adoption-rules': 'Configure Adoption',
  'configure-private-credentials': 'Configure Private Credentials',
  'configure-ppsk': 'Configure Private Credentials (PPSK)',
  'configure-private-sae': 'Configure Private Credentials (Private SAE)',
  'configure-cloud-portal': 'Configure Cloud Captive Portal',
  'configure-access-control': 'Configure Access Control',
  'configure-profiles': 'Configure Device Profiles',
  'configure-rrm': 'Configure RF Management',
  'configure-access-points': 'Configure Access Points',
  'configure-device-groups': 'Configure Device Groups',
  'configure-site-afc-geo': 'Configure Site AFC & Geo',
  'configure-meshpoints': 'Configure Meshpoints',
  'configure-service-profiles': 'Configure Service Profiles',
  'configure-system': 'Configure System & Security',
  'global-templates': 'Global Templates',
  'global-variables': 'Global Variables',
  'global-assignments': 'Global Assignments',
  'site-group-settings': 'Site Group Settings',
  tools: 'Tools',
  administration: 'Administration',
  'api-documentation': 'API Documentation',
  help: 'Help',
};

// ============================================
// Page Type Map
// ============================================

/**
 * Maps App.tsx route keys → CortexPageType
 * Used to classify pages for context-aware prompting
 */
export const CORTEX_PAGE_TYPES: Record<string, CortexPageType> = {
  workspace: 'dashboard',
  insights: 'insights',
  'service-levels': 'service-levels',
  'app-insights': 'insights',
  'access-points': 'devices',
  'connected-clients': 'clients',
  'client-detail': 'client-detail',
  'ap-detail': 'ap-detail',
  'performance-analytics': 'insights',
  'report-widgets': 'dashboard',
  'pci-report': 'unknown',
  'system-backup': 'unknown',
  'license-dashboard': 'unknown',
  'firmware-manager': 'devices',
  'network-diagnostics': 'unknown',
  'event-alarm-dashboard': 'insights',
  'security-dashboard': 'insights',
  'guest-management': 'unknown',
  'configure-catalog': 'configuration',
  'configure-networks': 'configuration',
  'configure-policy': 'configuration',
  'configure-aaa-policies': 'configuration',
  'configure-adoption-rules': 'configuration',
  'configure-private-credentials': 'configuration',
  'configure-ppsk': 'configuration',
  'configure-private-sae': 'configuration',
  'configure-cloud-portal': 'configuration',
  'configure-access-control': 'configuration',
  'configure-profiles': 'configuration',
  'configure-rrm': 'configuration',
  'configure-access-points': 'configuration',
  'configure-device-groups': 'configuration',
  'configure-site-afc-geo': 'configuration',
  'configure-meshpoints': 'configuration',
  'configure-service-profiles': 'configuration',
  'configure-system': 'configuration',
  'energy-optimization': 'insights',
  'audit-logs': 'unknown',
  'config-history': 'configuration',
  'diagnostics-system-health': 'unknown',
  'global-templates': 'configuration',
  'global-variables': 'configuration',
  'global-assignments': 'configuration',
  'site-group-settings': 'configuration',
  'configure-sites-groups': 'configuration',
  tools: 'unknown',
  administration: 'unknown',
  'api-documentation': 'unknown',
  help: 'unknown',
};

// ============================================
// Suggested Prompts by Page Type
// ============================================

/**
 * Context-aware suggested prompts for each page type
 * Shown in the Cortex copilot panel to help users ask relevant questions
 */
/**
 * Suggested prompts shown in the empty conversation state.
 *
 * A suggestion is a PROMISE. Clicking one must produce an answer, not a refusal
 * and not an invented number — so every prompt below is pinned to a tool that
 * exists on the path the panel actually uses.
 *
 * RULES:
 * - The backing surface is `server/cortex/diagnosticTools.js` (17 read-only
 *   tools, enumerated by its `TOOL_ACTIVITY` export). That is the PRIMARY path:
 *   `CortexContext.sendMessage` calls `/api/cortex/investigate` first and only
 *   falls back to the older `server/cortex/toolCatalog.js` loop when the
 *   investigation agent is unavailable. Writing prompts against the fallback is
 *   what put SLE thresholds, Smart RF history and drift alerts on this list —
 *   none of which the primary path can read.
 * - Do not advertise what no tool returns: SLE thresholds or SLE categories,
 *   Smart RF / DFS history, drift alerts, per-SSID client counts, AP downtime
 *   duration, per-client data rate, roam duration, or the REASON for a deauth,
 *   an AP reboot or a RADIUS reject. Those are documented absences, not gaps
 *   waiting to be filled.
 * - Airtime is measured PER RADIO, not per AP, and `getRfHealth` returns a
 *   four-way split (own clients / co-channel / non-Wi-Fi / available) rather
 *   than one "utilization" figure. Ask for the thing the tool returns.
 * - Vocabulary: Gateway (never controller), WLAN for the configuration object,
 *   SSID only for the broadcast name.
 *
 * Guarded by `src/types/cortex.prompts.test.ts`, which fails if a prompt names
 * a concept the tool surface cannot answer.
 */
export const CORTEX_SUGGESTED_PROMPTS: Record<CortexPageType, string[]> = {
  // getSiteOverview (fleet findings) · getMetricHistory(metricFamily:'sle')
  // · getRecentChanges(hours:1)
  'service-levels': [
    'Which sites have clients with problems right now? Rank them worst first, and flag any site with no telemetry at all.',
    'How does this site compare with the same window yesterday?',
    'What configuration changed in the last hour, and did anything degrade with it?',
  ],
  // getSiteOverview (scored worst clients) · getRfHealth (clients per radio,
  // with band) · getApHealth + getRfHealth
  clients: [
    'Which clients have the worst signal right now? Name the AP, the WLAN and the RSSI.',
    'How many clients are on each band -- 2.4, 5 and 6 GHz?',
    'Which AP is carrying the most clients, and how much airtime is left on its radios?',
  ],
  // getClientTimeline · diagnoseClient (lifecycle ladder) ·
  // compareClientToPeers
  'client-detail': [
    "Walk me through this client's timeline -- associations, roams and any authentication failures.",
    'Where does this client actually fail -- association, authentication, addressing or forwarding?',
    'Is this just this client, or are its neighbours on the same AP and WLAN affected too?',
  ],
  // getApHealth (statusCounts) · getRfHealth (airtime + named offenders) ·
  // findVanishedDevices
  devices: [
    'Which APs are offline right now? Show serial and site.',
    'Rank radios by least available airtime -- top 10, and name the co-channel offenders.',
    'Have any APs dropped out of inventory recently?',
  ],
  // getRfHealth(apSerial) (radioOff flag) · getApHealth(apSerial) (tunnel
  // state, channel, power) · getMetricHistory(deviceId, 'ap_report')
  'ap-detail': [
    'What is the airtime split on each radio right now, and are any radios off the air?',
    'Is this AP healthy -- status, tunnel state, and what channel and power each radio is on?',
    "How does this AP's airtime compare with the same window yesterday?",
  ],
  // getSiteOverview + correlateProblem · listSites (silent sites) ·
  // getRecentChanges
  insights: [
    'What is wrong on the network right now? Give me the failure boundary, not one client.',
    'Which sites have no telemetry at all? Those are unknown, not healthy.',
    'What changed in the last 24 hours, and who made the change?',
  ],
  // getWlanConfig (security, VLAN, topologyResolves) · getRecentChanges
  configuration: [
    'List every WLAN with its security mode, VLAN, and whether its topology resolves.',
    'Are any WLANs open or WPA2-Personal? Flag them.',
    'What configuration changed in the last 24 hours, and who made it?',
  ],
  // getSiteOverview · getSiteOverview + correlateProblem · getRecentChanges
  dashboard: [
    'Give me a health brief: sites, AP status counts, client counts, and which clients have problems.',
    'Which site needs attention most right now, and what exactly is wrong there?',
    'What configuration changed in the last 24 hours?',
  ],
  // getWlanConfig · getWlanConfig · getWlanConfig (topologyResolves)
  wlans: [
    'Which WLANs are enabled, and what security is each one running?',
    'Flag any WLAN weaker than WPA3.',
    'Which WLANs have a topology that does not resolve? Those pass no traffic.',
  ],
  roles: [],
  profiles: [],
  // getSiteOverview · listSites · getCapabilities
  unknown: [
    'Give me a health brief: sites, AP status counts, client counts, and which clients have problems.',
    'Which sites have no telemetry at all? Those are unknown, not healthy.',
    'What can this Gateway actually report, and what can it not?',
  ],
};
