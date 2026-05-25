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
  workspace: 'Dashboard',
  'service-levels': 'Service Levels',
  'sle-dashboard': 'Service Level Dashboard',
  'app-insights': 'App Insights',
  'access-points': 'Access Points',
  'connected-clients': 'Connected Clients',
  'performance-analytics': 'Performance Analytics',
  'report-widgets': 'Report Widgets',
  'pci-report': 'PCI Report',
  'system-backup': 'System Backup',
  'license-dashboard': 'License Dashboard',
  'firmware-manager': 'Firmware Manager',
  'network-diagnostics': 'Network Diagnostics',
  'event-alarm-dashboard': 'Events & Alarms',
  'security-dashboard': 'Security Dashboard',
  'guest-management': 'Guest Management',
  'configure-networks': 'Configure Networks',
  'configure-policy': 'Configure Policy',
  'configure-aaa-policies': 'Configure AAA Policies',
  'configure-adoption-rules': 'Configure Adoption Rules',
  'configure-guest': 'Configure Guest',
  'configure-profiles': 'Configure Profiles',
  'configure-rrm': 'Configure RRM',
  'configure-advanced': 'Configure Advanced',
  'global-templates': 'Global Templates',
  'global-variables': 'Global Variables',
  'global-assignments': 'Global Assignments',
  'site-group-settings': 'Site Group Settings',
  'configure-sites-groups': 'Sites & Groups',
  tools: 'Tools',
  administration: 'Administration',
  'api-test': 'API Test',
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
  'service-levels': 'service-levels',
  'sle-dashboard': 'service-levels',
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
  'configure-networks': 'configuration',
  'configure-policy': 'configuration',
  'configure-aaa-policies': 'configuration',
  'configure-adoption-rules': 'configuration',
  'configure-guest': 'configuration',
  'configure-profiles': 'configuration',
  'configure-rrm': 'configuration',
  'configure-advanced': 'configuration',
  'global-templates': 'configuration',
  'global-variables': 'configuration',
  'global-assignments': 'configuration',
  'site-group-settings': 'configuration',
  'configure-sites-groups': 'configuration',
  tools: 'unknown',
  administration: 'unknown',
  'api-test': 'unknown',
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
 * RULES (see memory: "Cortex suggestion discipline"):
 * - Every prompt here must be answerable by the read-only tool catalog in
 *   server/cortex/toolCatalog.js (sites, APs, clients, services, smart RF,
 *   audit logs, client events).
 * - Do not advertise capabilities that don't exist yet: reboot/locate/capture,
 *   AAA/role/profile/drift introspection, multi-window time-series compare,
 *   change-plan generation.
 */
export const CORTEX_SUGGESTED_PROMPTS: Record<CortexPageType, string[]> = {
  'service-levels': [
    'Which sites are below SLE threshold right now? Rank them worst to best.',
    'Which AP in this network has the highest channel utilization? Show me the top 5.',
    'What changed in the last hour? Cross-reference audit logs with any site degradation.',
  ],
  clients: [
    'Which clients have RSSI below -75 dBm? Name the AP they are on and the signal.',
    'Break down clients by band -- how many on 2.4GHz vs 5GHz vs 6GHz?',
    'Which AP is carrying the most clients right now, and is it overloaded?',
  ],
  'client-detail': [
    "Walk me through this client's last 10 connection events including any auth failures.",
    "What is this client's current signal strength, data rate, and which radio it is on?",
    'Has this client roamed in the last hour? Show me which APs it hit.',
  ],
  devices: [
    'Which APs are offline right now? Show serial, site, and how long they have been down.',
    'Rank APs by channel utilization -- show the top 10 with site and radio stats.',
    'Which APs triggered smart RF channel changes in the last 24 hours and why?',
  ],
  'ap-detail': [
    'What is the channel utilization on each radio right now? Compare to typical thresholds.',
    'List every client connected to this AP -- signal strength, band, and data rate.',
    "Show this AP's smart RF history -- channel changes, power adjustments, DFS events.",
  ],
  insights: [
    'Which site has the worst SLE performance over the last 7 days? Break down by category.',
    'Find the top RF trouble spots across all sites -- high utilization, DFS events, noise.',
    'Correlate config changes from the last 24 hours with any site or client degradation.',
  ],
  configuration: [
    'List all SSIDs with their security mode, band, and current client count.',
    'Are any SSIDs running open or WPA2-Personal auth? Flag them as security risks.',
    'What config changes happened in the last 24 hours and who made them?',
  ],
  dashboard: [
    'Give me a full health brief: site status, AP counts, client counts, any alerts.',
    'Which site needs my attention most right now and what is wrong with it?',
    'Are there any active drift alerts or config changes I should know about?',
  ],
  wlans: [
    'Which SSIDs are live right now and how many clients are on each?',
    'Show me the security config for every SSID -- flag anything weaker than WPA3.',
    'Which SSID has the highest client load and is the AP carrying it overloaded?',
  ],
  roles: [],
  profiles: [],
  unknown: [
    'Give me a full health brief: site status, AP counts, client counts, any alerts.',
    'Which site needs my attention most right now and what is wrong with it?',
    'Are there any active drift alerts or config changes I should know about?',
  ],
};
