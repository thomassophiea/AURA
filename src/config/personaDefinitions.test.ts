import { describe, it, expect } from 'vitest';
import { PERSONA_DEFINITIONS, PERSONA_MAP, PERSONA_GROUPS } from './personaDefinitions';
import { ORG_PAGES, SITE_GROUP_PAGES } from './navigationScopes';

describe('PERSONA_DEFINITIONS', () => {
  it('has all 12 expected persona IDs', () => {
    const ids = PERSONA_DEFINITIONS.map((p) => p.id).sort();
    expect(ids).toEqual(
      [
        'super-user',
        'netops',
        'secops',
        'aiops',
        'devops',
        'administration',
        'monitoring',
        'policy-services',
        'pxgrid',
        'platform-admin',
        'app-owner',
        'service-catalog',
      ].sort()
    );
  });

  it('every persona has the required fields populated', () => {
    for (const p of PERSONA_DEFINITIONS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.group).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(Array.isArray(p.allowedPages)).toBe(true);
      expect(p.allowedPages.length).toBeGreaterThan(0);
    }
  });

  it('every persona group is one of the four expected groups', () => {
    for (const p of PERSONA_DEFINITIONS) {
      expect(PERSONA_GROUPS).toContain(p.group);
    }
  });

  it('super-user is granted access to every navigation page', () => {
    const su = PERSONA_DEFINITIONS.find((p) => p.id === 'super-user')!;
    const all = [...ORG_PAGES, ...SITE_GROUP_PAGES];
    expect(su.allowedPages.length).toBe(all.length);
    for (const page of all) {
      expect(su.allowedPages).toContain(page);
    }
  });

  it('non-super-user personas have a strict subset of pages', () => {
    const all = new Set([...ORG_PAGES, ...SITE_GROUP_PAGES]);
    for (const p of PERSONA_DEFINITIONS) {
      if (p.id === 'super-user') continue;
      for (const page of p.allowedPages) {
        expect(all.has(page)).toBe(true);
      }
    }
  });
});

describe('PERSONA_MAP', () => {
  it('has an entry per definition', () => {
    expect(PERSONA_MAP.size).toBe(PERSONA_DEFINITIONS.length);
  });

  it('lookup by id returns the matching definition', () => {
    expect(PERSONA_MAP.get('netops')?.label).toBe('NetOps');
    expect(PERSONA_MAP.get('aiops')?.id).toBe('aiops');
  });
});

describe('PERSONA_GROUPS', () => {
  it('lists exactly the four group buckets in the documented order', () => {
    expect(PERSONA_GROUPS).toEqual([
      'Super User',
      'Professional Archetypes',
      'Technical Solution',
      'Cloud & Virtualization',
    ]);
  });
});
