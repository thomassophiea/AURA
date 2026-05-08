import { describe, it, expect } from 'vitest';
import { PERSONA_DASHBOARD_CONFIG, isSectionVisible } from './personaDashboardConfig';
import { PERSONA_DEFINITIONS } from './personaDefinitions';
import type { PersonaId } from './personaDefinitions';
import type { DashboardSection } from './personaDashboardConfig';

describe('PERSONA_DASHBOARD_CONFIG', () => {
  it('has an entry for every persona defined in personaDefinitions', () => {
    for (const persona of PERSONA_DEFINITIONS) {
      expect(PERSONA_DASHBOARD_CONFIG[persona.id]).toBeDefined();
    }
  });

  it('every entry has dashboardLabel + accentClass + ≥ 1 section', () => {
    for (const [personaId, profile] of Object.entries(PERSONA_DASHBOARD_CONFIG)) {
      expect(profile.dashboardLabel, `${personaId}.dashboardLabel`).toBeTruthy();
      expect(profile.accentClass, `${personaId}.accentClass`).toBeTruthy();
      expect(profile.sections.length, `${personaId}.sections`).toBeGreaterThan(0);
    }
  });

  it('every section listed exists in the documented DashboardSection union', () => {
    const knownSections: DashboardSection[] = [
      'quick-stats',
      'ai-insights',
      'operational-context',
      'core-activity',
      'performance',
      'best-practices',
      'top-clients',
      'alerts',
      'venue-stats',
      'config-profiles',
      'audit-logs',
      'os-one',
      'services-health',
    ];
    for (const profile of Object.values(PERSONA_DASHBOARD_CONFIG)) {
      for (const section of profile.sections) {
        expect(knownSections).toContain(section);
      }
    }
  });

  it('super-user and platform-admin both see all 13 sections', () => {
    expect(PERSONA_DASHBOARD_CONFIG['super-user'].sections.length).toBe(13);
    expect(PERSONA_DASHBOARD_CONFIG['platform-admin'].sections.length).toBe(13);
  });
});

describe('isSectionVisible', () => {
  it('returns true when the section is in the persona allowlist', () => {
    expect(isSectionVisible('netops', 'core-activity')).toBe(true);
  });

  it('returns false when the section is not in the persona allowlist', () => {
    expect(isSectionVisible('service-catalog', 'audit-logs')).toBe(false);
  });

  it('returns true for an unknown persona (open default)', () => {
    expect(isSectionVisible('made-up' as unknown as PersonaId, 'audit-logs')).toBe(true);
  });

  it('super-user can see every section', () => {
    const sections: DashboardSection[] = [
      'quick-stats',
      'ai-insights',
      'audit-logs',
      'best-practices',
      'os-one',
    ];
    for (const s of sections) {
      expect(isSectionVisible('super-user', s)).toBe(true);
    }
  });
});
