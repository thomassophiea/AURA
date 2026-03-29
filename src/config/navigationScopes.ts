/**
 * Navigation Scope Classification
 *
 * AURA uses a two-tier navigation model:
 * - Global scope: cross-site-group management (templates, variables, site group list)
 * - Site Group scope: features scoped to a specific controller / HA pair
 */

/** Pages visible at the AURA global level (no site group selected) */
export const GLOBAL_PAGES = new Set([
  'workspace',
  'configure-site-groups',
  'global-templates',
  'global-variables',
  'help',
]);

/** Pages that require a site group context (controller-scoped) */
export const SITE_GROUP_PAGES = new Set([
  // Monitoring
  'service-levels',
  'sle-dashboard',
  'app-insights',
  'connected-clients',
  'access-points',
  'report-widgets',
  'performance-analytics',
  // Configuration
  'configure-sites',
  'configure-networks',
  'configure-policy',
  'configure-aaa-policies',
  'configure-adoption-rules',
  'configure-guest',
  'configure-advanced',
  'site-group-settings',
  // System Management
  'system-backup',
  'license-dashboard',
  'firmware-manager',
  'network-diagnostics',
  'event-alarm-dashboard',
  'security-dashboard',
  'pci-report',
  'guest-management',
  // Tools & Administration
  'tools',
  'administration',
  'api-test',
  'api-documentation',
]);

export type NavigationScope = 'global' | 'site-group';
