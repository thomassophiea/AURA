/**
 * Navigation Scope Classification
 *
 * AURA uses a two-tier navigation model:
 * - Organization scope (primary): monitoring, configuration, templates, operations, admin
 * - Site Group scope (controller drill-down): firmware, backup, diagnostics, system config
 *
 * The org level is the primary working level (Mist-style enterprise model).
 * Users only enter a site group for controller-specific management.
 */

/** Pages visible at the organization level (primary scope) */
export const ORG_PAGES = new Set([
  // Monitoring
  'workspace',
  'service-levels',
  'sle-dashboard',
  'app-insights',
  'connected-clients',
  'access-points',
  'report-widgets',
  'performance-analytics',
  // Configure
  'configure-sites-groups',
  'configure-networks',
  'configure-policy',
  'configure-aaa-policies',
  'configure-adoption-rules',
  'configure-guest',
  'configure-advanced',
  // Templates & Variables
  'global-templates',
  'global-variables',
  // Operations
  'event-alarm-dashboard',
  'security-dashboard',
  'pci-report',
  // Admin & Tools
  'tools',
  'administration',
  'api-test',
  'api-documentation',
  // Help
  'help',
]);

/** Pages that require entering a site group (controller-specific management) */
export const SITE_GROUP_PAGES = new Set([
  'system-backup',
  'firmware-manager',
  'network-diagnostics',
  'license-dashboard',
  'site-group-settings',
  'guest-management',
]);

/** @deprecated Use ORG_PAGES instead */
export const GLOBAL_PAGES = ORG_PAGES;

export type NavigationScope = 'global' | 'site-group';
