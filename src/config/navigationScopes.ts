/**
 * Navigation Scope Classification
 *
 * AURA uses a two-tier navigation model:
 * - Organization scope (primary): monitoring, configuration, templates, operations, admin
 * - Site Group scope (Gateway drill-down): firmware, backup, diagnostics, licensing
 *
 * The org level is the primary working level.
 * Users only enter a site group for Gateway-appliance management.
 *
 * Configure page ids are derived from the feature registry
 * (src/config/featureRegistry.ts) so the sets cannot drift from the Sidebar
 * and Feature Catalog again.
 */
import { CONFIGURE_PAGE_IDS } from './featureRegistry';

/** Pages visible at the organization level (primary scope) */
export const ORG_PAGES = new Set([
  // Monitoring
  'workspace',
  'insights',
  'service-levels',
  'app-insights',
  'connected-clients',
  'access-points',
  'energy-optimization',
  'report-widgets',
  'performance-analytics',
  // Configure (canonical features + legacy deep-link aliases)
  ...CONFIGURE_PAGE_IDS,
  // Templates & Variables
  'global-templates',
  'global-variables',
  'global-assignments',
  // Operations
  'event-alarm-dashboard',
  'security-dashboard',
  'diagnostics-system-health',
  'audit-logs',
  'config-history',
  'pci-report',
  // Admin & Tools
  'tools',
  'administration',
  'api-documentation',
  // Help
  'help',
]);

/** Pages that require entering a site group (Gateway-appliance management) */
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
