/**
 * Persona Dashboard Configuration
 *
 * Maps each persona to the dashboard sections most relevant to their role.
 * Used by DashboardEnhanced to prioritize/highlight widgets when
 * dev-mode persona filtering is active.
 *
 * Section IDs correspond to the major dashboard content blocks.
 */

import type { PersonaId } from './personaDefinitions';

export type DashboardSection =
  | 'quick-stats'        // AP count, client count, throughput, alerts
  | 'ai-insights'        // Bird's-eye RFQI / health overview
  | 'operational-context' // OperationalContextSummary banner
  | 'core-activity'      // AP status, client throughput, network breakdown
  | 'performance'        // RF quality, SLE, band/SNR distribution
  | 'best-practices'     // Config recommendations
  | 'top-clients'        // Top clients by throughput
  | 'alerts'             // Recent alerts/notifications
  | 'venue-stats'        // Venue statistics widget
  | 'config-profiles'    // Configuration profiles
  | 'audit-logs'         // Audit log viewer
  | 'os-one'             // OS ONE system info
  | 'services-health';   // Poor services alert

export interface PersonaDashboardProfile {
  /** Sections to display (in order) */
  sections: DashboardSection[];
  /** Short label shown in the dashboard header when persona is active */
  dashboardLabel: string;
  /** Accent colour class for the persona badge */
  accentClass: string;
}

const ALL_SECTIONS: DashboardSection[] = [
  'quick-stats', 'ai-insights', 'operational-context', 'core-activity',
  'performance', 'best-practices', 'top-clients', 'alerts',
  'venue-stats', 'config-profiles', 'audit-logs', 'os-one', 'services-health',
];

export const PERSONA_DASHBOARD_CONFIG: Record<PersonaId, PersonaDashboardProfile> = {
  'super-user': {
    sections: ALL_SECTIONS,
    dashboardLabel: 'Full View',
    accentClass: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },

  // ── Professional Archetypes ──
  netops: {
    sections: [
      'quick-stats', 'operational-context', 'core-activity',
      'performance', 'top-clients', 'alerts', 'services-health',
      'venue-stats', 'os-one',
    ],
    dashboardLabel: 'Network Ops',
    accentClass: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  secops: {
    sections: [
      'quick-stats', 'operational-context', 'alerts',
      'best-practices', 'audit-logs', 'services-health',
      'config-profiles', 'performance',
    ],
    dashboardLabel: 'Security Ops',
    accentClass: 'text-red-400 bg-red-500/10 border-red-500/30',
  },
  aiops: {
    sections: [
      'quick-stats', 'ai-insights', 'operational-context',
      'performance', 'core-activity', 'top-clients',
      'services-health', 'venue-stats',
    ],
    dashboardLabel: 'AI Ops',
    accentClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  devops: {
    sections: [
      'quick-stats', 'operational-context', 'core-activity',
      'config-profiles', 'os-one', 'audit-logs',
      'best-practices', 'services-health',
    ],
    dashboardLabel: 'DevOps',
    accentClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },

  // ── Technical Solution Personas ──
  administration: {
    sections: [
      'quick-stats', 'operational-context', 'config-profiles',
      'audit-logs', 'best-practices', 'os-one',
      'alerts', 'services-health',
    ],
    dashboardLabel: 'Admin',
    accentClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  monitoring: {
    sections: [
      'quick-stats', 'ai-insights', 'operational-context',
      'core-activity', 'performance', 'alerts',
      'top-clients', 'services-health', 'venue-stats',
    ],
    dashboardLabel: 'Monitoring',
    accentClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  'policy-services': {
    sections: [
      'quick-stats', 'operational-context', 'core-activity',
      'best-practices', 'config-profiles', 'alerts',
      'audit-logs', 'services-health',
    ],
    dashboardLabel: 'Policy',
    accentClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  },
  pxgrid: {
    sections: [
      'quick-stats', 'operational-context', 'core-activity',
      'alerts', 'services-health', 'audit-logs',
      'os-one',
    ],
    dashboardLabel: 'pxGrid',
    accentClass: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
  },

  // ── Cloud & Virtualization ──
  'platform-admin': {
    sections: ALL_SECTIONS,
    dashboardLabel: 'Platform',
    accentClass: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  'app-owner': {
    sections: [
      'quick-stats', 'operational-context', 'core-activity',
      'config-profiles', 'services-health', 'os-one',
    ],
    dashboardLabel: 'App Owner',
    accentClass: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  },
  'service-catalog': {
    sections: [
      'quick-stats', 'operational-context', 'services-health',
      'venue-stats',
    ],
    dashboardLabel: 'Catalog',
    accentClass: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
  },
};

/** Check if a dashboard section should be visible for the active persona */
export function isSectionVisible(personaId: PersonaId, section: DashboardSection): boolean {
  const config = PERSONA_DASHBOARD_CONFIG[personaId];
  return config ? config.sections.includes(section) : true;
}
