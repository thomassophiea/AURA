import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effectiveSetCalculator } from './effectiveSetCalculator';
import type { Profile, WLANSiteAssignment } from '../types/network';

const profile = (id: string, name = id): Profile =>
  ({ id, name, ssid: name, security: 'WPA2' }) as unknown as Profile;

const allProfiles: Profile[] = [profile('p1'), profile('p2'), profile('p3'), profile('p4')];

const baseAssignment = (
  overrides: Partial<
    Pick<
      WLANSiteAssignment,
      'siteId' | 'siteName' | 'deploymentMode' | 'includedProfiles' | 'excludedProfiles'
    >
  > = {}
) => ({
  siteId: 'site-1',
  siteName: 'Site One',
  deploymentMode: 'ALL_PROFILES_AT_SITE' as const,
  includedProfiles: [] as string[],
  excludedProfiles: [] as string[],
  ...overrides,
});

describe('effectiveSetCalculator.calculateEffectiveSet', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('ALL_PROFILES_AT_SITE: selects every profile, excludes none', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(baseAssignment(), allProfiles);
    expect(result.selectedProfiles.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(result.excludedProfiles).toEqual([]);
    expect(result.deploymentMode).toBe('ALL_PROFILES_AT_SITE');
    expect(result.siteId).toBe('site-1');
    expect(result.siteName).toBe('Site One');
  });

  it('INCLUDE_ONLY: selects only listed ids; everything else is excluded', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'INCLUDE_ONLY', includedProfiles: ['p1', 'p3'] }),
      allProfiles
    );
    expect(result.selectedProfiles.map((p) => p.id).sort()).toEqual(['p1', 'p3']);
    expect(result.excludedProfiles.map((p) => p.id).sort()).toEqual(['p2', 'p4']);
  });

  it('EXCLUDE_SOME: selects everything except excluded ids', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'EXCLUDE_SOME', excludedProfiles: ['p2'] }),
      allProfiles
    );
    expect(result.selectedProfiles.map((p) => p.id).sort()).toEqual(['p1', 'p3', 'p4']);
    expect(result.excludedProfiles.map((p) => p.id)).toEqual(['p2']);
  });

  it('unknown deployment mode warns and falls back to ALL', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'WHATEVER' as never }),
      allProfiles
    );
    expect(result.selectedProfiles).toHaveLength(4);
    expect(result.excludedProfiles).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the original allProfiles array on the result', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(baseAssignment(), allProfiles);
    expect(result.allProfiles).toBe(allProfiles);
  });

  it('handles an empty profile pool', () => {
    const result = effectiveSetCalculator.calculateEffectiveSet(baseAssignment(), []);
    expect(result.selectedProfiles).toEqual([]);
    expect(result.excludedProfiles).toEqual([]);
  });
});

describe('effectiveSetCalculator.calculateMultipleEffectiveSets', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('maps each assignment to its per-site profile pool', () => {
    const profilesBySite = new Map<string, Profile[]>([
      ['site-a', [profile('a1'), profile('a2')]],
      ['site-b', [profile('b1'), profile('b2'), profile('b3')]],
    ]);
    const assignments = [
      baseAssignment({ siteId: 'site-a', siteName: 'A' }),
      baseAssignment({
        siteId: 'site-b',
        siteName: 'B',
        deploymentMode: 'INCLUDE_ONLY',
        includedProfiles: ['b2'],
      }),
    ];
    const results = effectiveSetCalculator.calculateMultipleEffectiveSets(
      assignments,
      profilesBySite
    );
    expect(results).toHaveLength(2);
    expect(results[0].selectedProfiles.map((p) => p.id)).toEqual(['a1', 'a2']);
    expect(results[1].selectedProfiles.map((p) => p.id)).toEqual(['b2']);
  });

  it('uses an empty pool when the site is not in the map', () => {
    const profilesBySite = new Map<string, Profile[]>();
    const results = effectiveSetCalculator.calculateMultipleEffectiveSets(
      [baseAssignment({ siteId: 'unknown' })],
      profilesBySite
    );
    expect(results[0].selectedProfiles).toEqual([]);
  });
});

describe('effectiveSetCalculator.mergeEffectiveSets', () => {
  it('deduplicates by profile id across sets', () => {
    const a = effectiveSetCalculator.calculateEffectiveSet(baseAssignment({ siteId: 'a' }), [
      profile('p1'),
      profile('p2'),
    ]);
    const b = effectiveSetCalculator.calculateEffectiveSet(baseAssignment({ siteId: 'b' }), [
      profile('p2'),
      profile('p3'),
    ]);
    const merged = effectiveSetCalculator.mergeEffectiveSets([a, b]);
    expect(merged.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns empty for an empty input', () => {
    expect(effectiveSetCalculator.mergeEffectiveSets([])).toEqual([]);
  });
});

describe('effectiveSetCalculator.validateSiteAssignment', () => {
  it('valid: ALL_PROFILES_AT_SITE with empty include/exclude lists', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'ALL_PROFILES_AT_SITE',
      includedProfiles: [],
      excludedProfiles: [],
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('valid: INCLUDE_ONLY with non-empty include list and empty exclude list', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'INCLUDE_ONLY',
      includedProfiles: ['p1'],
      excludedProfiles: [],
    });
    expect(r.valid).toBe(true);
  });

  it('valid: EXCLUDE_SOME with non-empty exclude list and empty include list', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'EXCLUDE_SOME',
      includedProfiles: [],
      excludedProfiles: ['p1'],
    });
    expect(r.valid).toBe(true);
  });

  it('invalid: unknown deployment mode', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'BOGUS' as never,
      includedProfiles: [],
      excludedProfiles: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/Invalid deployment mode/);
  });

  it('invalid: INCLUDE_ONLY without any included profiles', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'INCLUDE_ONLY',
      includedProfiles: [],
      excludedProfiles: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /at least one profile/i.test(e))).toBe(true);
  });

  it('invalid: INCLUDE_ONLY with both included and excluded lists', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'INCLUDE_ONLY',
      includedProfiles: ['p1'],
      excludedProfiles: ['p2'],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /should not have excluded/i.test(e))).toBe(true);
  });

  it('invalid: EXCLUDE_SOME without any excluded profiles', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'EXCLUDE_SOME',
      includedProfiles: [],
      excludedProfiles: [],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /at least one profile/i.test(e))).toBe(true);
  });

  it('invalid: EXCLUDE_SOME with both lists populated', () => {
    const r = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'EXCLUDE_SOME',
      includedProfiles: ['p1'],
      excludedProfiles: ['p2'],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /should not have included/i.test(e))).toBe(true);
  });

  it('invalid: ALL_PROFILES_AT_SITE with non-empty include or exclude list', () => {
    const r1 = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'ALL_PROFILES_AT_SITE',
      includedProfiles: ['p1'],
      excludedProfiles: [],
    });
    expect(r1.valid).toBe(false);
    const r2 = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'ALL_PROFILES_AT_SITE',
      includedProfiles: [],
      excludedProfiles: ['p1'],
    });
    expect(r2.valid).toBe(false);
  });

  it('detects duplicate ids in include / exclude lists', () => {
    const r1 = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'INCLUDE_ONLY',
      includedProfiles: ['p1', 'p1', 'p2'],
      excludedProfiles: [],
    });
    expect(r1.errors.some((e) => /Included.*duplicates/i.test(e))).toBe(true);
    const r2 = effectiveSetCalculator.validateSiteAssignment({
      deploymentMode: 'EXCLUDE_SOME',
      includedProfiles: [],
      excludedProfiles: ['p1', 'p1'],
    });
    expect(r2.errors.some((e) => /Excluded.*duplicates/i.test(e))).toBe(true);
  });
});

describe('effectiveSetCalculator.getSummary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('reports counts and rounded percent', () => {
    const set = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'INCLUDE_ONLY', includedProfiles: ['p1', 'p2', 'p3'] }),
      allProfiles
    );
    const s = effectiveSetCalculator.getSummary(set);
    expect(s.total).toBe(4);
    expect(s.assigned).toBe(3);
    expect(s.excluded).toBe(1);
    expect(s.assignedPercent).toBe(75);
  });

  it('returns 0% when there are no profiles at all', () => {
    const set = effectiveSetCalculator.calculateEffectiveSet(baseAssignment(), []);
    const s = effectiveSetCalculator.getSummary(set);
    expect(s.total).toBe(0);
    expect(s.assignedPercent).toBe(0);
  });
});

describe('effectiveSetCalculator.getDeploymentModeDescription', () => {
  it('returns human-readable strings for each mode', () => {
    expect(effectiveSetCalculator.getDeploymentModeDescription('ALL_PROFILES_AT_SITE')).toMatch(
      /all profiles/i
    );
    expect(effectiveSetCalculator.getDeploymentModeDescription('INCLUDE_ONLY')).toMatch(
      /specific profiles only/i
    );
    expect(effectiveSetCalculator.getDeploymentModeDescription('EXCLUDE_SOME')).toMatch(
      /except selected/i
    );
    expect(effectiveSetCalculator.getDeploymentModeDescription('NEVER' as never)).toMatch(
      /unknown/i
    );
  });
});

describe('effectiveSetCalculator.isProfileInEffectiveSet & getExplicitSelections', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('isProfileInEffectiveSet matches by id', () => {
    const set = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'INCLUDE_ONLY', includedProfiles: ['p1', 'p3'] }),
      allProfiles
    );
    expect(effectiveSetCalculator.isProfileInEffectiveSet('p1', set)).toBe(true);
    expect(effectiveSetCalculator.isProfileInEffectiveSet('p2', set)).toBe(false);
    expect(effectiveSetCalculator.isProfileInEffectiveSet('does-not-exist', set)).toBe(false);
  });

  it('getExplicitSelections returns empty arrays for ALL_PROFILES_AT_SITE', () => {
    const set = effectiveSetCalculator.calculateEffectiveSet(baseAssignment(), allProfiles);
    const ex = effectiveSetCalculator.getExplicitSelections(set);
    expect(ex.explicitlySelected).toEqual([]);
    expect(ex.explicitlyExcluded).toEqual([]);
  });

  it('getExplicitSelections returns the selected/excluded for INCLUDE_ONLY', () => {
    const set = effectiveSetCalculator.calculateEffectiveSet(
      baseAssignment({ deploymentMode: 'INCLUDE_ONLY', includedProfiles: ['p1'] }),
      allProfiles
    );
    const ex = effectiveSetCalculator.getExplicitSelections(set);
    expect(ex.explicitlySelected.map((p) => p.id)).toEqual(['p1']);
    expect(ex.explicitlyExcluded.map((p) => p.id).sort()).toEqual(['p2', 'p3', 'p4']);
  });
});
