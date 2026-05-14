/**
 * Ultr0n AI Copilot Context Types
 * Defines page context, insights, and available actions for the AI assistant layer
 * Enables smart prompting and action discovery across all AURA pages
 */

// ============================================
// Page Type Classification
// ============================================

/**
 * Ultr0n page type — classifies the current page for context-aware prompting
 */
export type UltronPageType =
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
 * Passed to Ultr0n on every navigation and state change
 */
export interface UltronPageContext {
  /** Current route path (e.g., '/workspace', '/configure-networks') */
  route: string;

  /** Human-readable page name (e.g., 'Dashboard', 'Service Levels') */
  pageName: string;

  /** Page classification for context-aware prompting */
  pageType: UltronPageType;

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
  availableActions?: UltronAvailableAction[];
}

// ============================================
// Available Actions
// ============================================

/**
 * An action available to the user on the current page
 * Enables Ultr0n to suggest and trigger user actions
 */
export interface UltronAvailableAction {
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
 * A single insight discovered by Ultr0n on the current page
 * Severity-ranked, with evidence and recommended actions
 */
export interface UltronInsight {
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
 * Returned by Ultr0n analysis service; used to populate the copilot panel
 */
export interface UltronPageAnalysis {
  /** Brief summary of page state and key findings */
  summary: string;

  /** List of discovered insights, ranked by severity */
  insights: UltronInsight[];

  /** Suggested prompts for the user (context-aware) */
  suggestedPrompts: string[];

  /** Available actions that Ultr0n can suggest */
  availableActions: string[];
}

// ============================================
// Page Name Map
// ============================================

/**
 * Maps App.tsx route keys → human-readable page names
 * Used in page context and copilot UI
 */
export const ULTR0N_PAGE_NAMES: Record<string, string> = {
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
 * Maps App.tsx route keys → UltronPageType
 * Used to classify pages for context-aware prompting
 */
export const ULTR0N_PAGE_TYPES: Record<string, UltronPageType> = {
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
 * Shown in the Ultr0n copilot panel to help users ask relevant questions
 */
/**
 * Suggested prompts shown in the empty conversation state.
 *
 * RULES (see memory: "Ultr0n suggestion discipline"):
 * - Every prompt here must be answerable by the read-only tool catalog in
 *   server/ultr0n/toolCatalog.js (sites, APs, clients, services, smart RF,
 *   audit logs, client events).
 * - Do not advertise capabilities that don't exist yet: reboot/locate/capture,
 *   AAA/role/profile/drift introspection, multi-window time-series compare,
 *   change-plan generation.
 */
export const ULTR0N_SUGGESTED_PROMPTS: Record<UltronPageType, string[]> = {
  clients: [
    'Which clients have the worst RSSI right now?',
    'Show clients seeing authentication failures.',
    'Which AP is each impacted client connected to?',
  ],
  'service-levels': [
    'Which sites are unhealthy right now?',
    'Which APs at this site are overloaded?',
    'What config changed in the last 24 hours?',
  ],
  insights: [
    'Which sites are unhealthy and why?',
    'Which APs have the highest channel utilization?',
    'What config changes happened recently?',
  ],
  'client-detail': [
    'Show the recent connection events for this client.',
    'Which AP is this client on, and what is its RF state?',
    'What SSID is this client using and how is it configured?',
  ],
  devices: [
    'Which APs are offline right now?',
    'Which APs have the highest channel utilization?',
    'Show recent smart RF events across the site.',
  ],
  'ap-detail': [
    'Show this AP’s channel utilization and noise.',
    'Show recent smart RF events for this AP.',
    'Which clients are connected to this AP right now?',
  ],
  configuration: [
    'What WLAN services are configured on the controller?',
    'Show the configuration for this WLAN.',
    'What config changes happened in the last 24 hours?',
  ],
  dashboard: [
    'Summarize current site health across the org.',
    'Which APs are offline or overloaded right now?',
    'What config changes happened in the last 24 hours?',
  ],
  wlans: [
    'What WLAN services are configured?',
    'Show the security and AAA settings for this WLAN.',
    'Which clients are currently on this WLAN?',
  ],
  roles: [],
  profiles: [],
  unknown: [
    'Summarize current site health across the org.',
    'Which APs are offline or overloaded right now?',
    'What config changes happened in the last 24 hours?',
  ],
};
