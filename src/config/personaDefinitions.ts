/**
 * Persona Definitions for Dev Mode
 *
 * Each persona defines a role-based view of the application,
 * filtering sidebar navigation and page access to show only
 * features relevant to that operational perspective.
 *
 * Only active when theme === 'dev'. Super User (default) shows everything.
 */

import { ORG_PAGES, SITE_GROUP_PAGES } from './navigationScopes';

export type PersonaId =
  | 'super-user'
  // Professional Archetypes
  | 'netops'
  | 'secops'
  | 'aiops'
  | 'devops'
  // Technical Solution Personas
  | 'administration'
  | 'monitoring'
  | 'policy-services'
  | 'pxgrid'
  // Cloud & Virtualization
  | 'platform-admin'
  | 'app-owner'
  | 'service-catalog';

export interface PersonaDefinition {
  id: PersonaId;
  label: string;
  group: string;
  description: string;
  allowedPages: string[];
}

const ALL_PAGES = [...ORG_PAGES, ...SITE_GROUP_PAGES];

export const PERSONA_GROUPS = [
  'Super User',
  'Professional Archetypes',
  'Technical Solution',
  'Cloud & Virtualization',
] as const;

export const PERSONA_DEFINITIONS: PersonaDefinition[] = [
  // ── Super User ──
  {
    id: 'super-user',
    label: 'Super User',
    group: 'Super User',
    description: 'Full access to all features and pages',
    allowedPages: ALL_PAGES,
  },

  // ── Professional Archetypes ──
  {
    id: 'netops',
    label: 'NetOps',
    group: 'Professional Archetypes',
    description: 'Network Operations — uptime, connectivity, hardware health',
    allowedPages: [
      'workspace', 'service-levels', 'sle-dashboard', 'connected-clients',
      'access-points', 'performance-analytics', 'report-widgets',
      'configure-networks', 'configure-sites-groups', 'configure-advanced',
      'event-alarm-dashboard', 'tools',
      'system-backup', 'firmware-manager', 'network-diagnostics', 'site-group-settings',
    ],
  },
  {
    id: 'secops',
    label: 'SecOps',
    group: 'Professional Archetypes',
    description: 'Security Operations — firewalls, IDS, identity access, compliance',
    allowedPages: [
      'workspace', 'service-levels', 'security-dashboard', 'pci-report',
      'configure-policy', 'configure-aaa-policies', 'configure-guest', 'configure-advanced',
      'event-alarm-dashboard', 'administration',
      'guest-management',
    ],
  },
  {
    id: 'aiops',
    label: 'AIOps',
    group: 'Professional Archetypes',
    description: 'AI for IT Operations — AI/ML monitoring, proactive insights',
    allowedPages: [
      'workspace', 'service-levels', 'sle-dashboard', 'app-insights',
      'performance-analytics', 'report-widgets', 'event-alarm-dashboard',
      'connected-clients', 'access-points',
    ],
  },
  {
    id: 'devops',
    label: 'DevOps',
    group: 'Professional Archetypes',
    description: 'NetDevOps — infrastructure as code, automation, API tools',
    allowedPages: [
      'workspace', 'api-test', 'api-documentation', 'tools',
      'configure-networks', 'configure-advanced', 'configure-adoption-rules',
      'global-templates', 'global-variables', 'administration',
    ],
  },

  // ── Technical Solution Personas ──
  {
    id: 'administration',
    label: 'Administration',
    group: 'Technical Solution',
    description: 'PAN — policies, user management, system configuration',
    allowedPages: [
      'workspace', 'administration', 'configure-policy', 'configure-aaa-policies',
      'configure-guest', 'configure-advanced', 'configure-sites-groups',
      'global-templates', 'global-variables',
      'site-group-settings', 'license-dashboard',
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    group: 'Technical Solution',
    description: 'MnT — logs, real-time events, troubleshooting',
    allowedPages: [
      'workspace', 'service-levels', 'sle-dashboard', 'app-insights',
      'connected-clients', 'access-points', 'performance-analytics', 'report-widgets',
      'event-alarm-dashboard', 'security-dashboard',
      'network-diagnostics',
    ],
  },
  {
    id: 'policy-services',
    label: 'Policy Services',
    group: 'Technical Solution',
    description: 'PSN — authentication, RADIUS, endpoint profiling',
    allowedPages: [
      'workspace', 'configure-policy', 'configure-aaa-policies', 'configure-guest',
      'configure-adoption-rules', 'connected-clients',
      'guest-management',
    ],
  },
  {
    id: 'pxgrid',
    label: 'pxGrid',
    group: 'Technical Solution',
    description: 'Data sharing, integrations, cross-product communication',
    allowedPages: [
      'workspace', 'api-test', 'api-documentation', 'tools',
      'event-alarm-dashboard', 'security-dashboard', 'connected-clients',
    ],
  },

  // ── Cloud & Virtualization ──
  {
    id: 'platform-admin',
    label: 'Platform Admin',
    group: 'Cloud & Virtualization',
    description: 'Full control over clusters and infrastructure',
    allowedPages: ALL_PAGES.filter(p => p !== 'api-test' && p !== 'api-documentation'),
  },
  {
    id: 'app-owner',
    label: 'App Owner',
    group: 'Cloud & Virtualization',
    description: 'Developer — deploying and managing applications',
    allowedPages: [
      'workspace', 'app-insights', 'api-test', 'api-documentation', 'tools',
      'configure-networks', 'global-templates', 'global-variables',
    ],
  },
  {
    id: 'service-catalog',
    label: 'Service Catalog',
    group: 'Cloud & Virtualization',
    description: 'Simplified view for requesting pre-configured resources',
    allowedPages: [
      'workspace', 'service-levels', 'configure-sites-groups', 'license-dashboard', 'help',
    ],
  },
];

/** Lookup map for fast access by persona ID */
export const PERSONA_MAP = new Map<PersonaId, PersonaDefinition>(
  PERSONA_DEFINITIONS.map(p => [p.id, p])
);
