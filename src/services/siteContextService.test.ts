import { describe, it, expect } from 'vitest';
import {
  deriveSiteSource,
  resolveSiteContext,
  buildXiqSiteValue,
  buildXiqAllSitesValue,
  parseXiqSiteValue,
} from './siteContextService';
import type { SiteGroup } from '../types/domain';

function makeSiteGroup(overrides: Partial<SiteGroup> = {}): SiteGroup {
  return {
    id: 'sg-1',
    org_id: 'org-1',
    name: 'HQ Controller',
    controller_url: 'https://controller.example.com',
    connection_status: 'connected',
    is_default: true,
    ...overrides,
  };
}

describe('deriveSiteSource', () => {
  it('defaults to controller when no site group is selected', () => {
    expect(deriveSiteSource(null)).toBe('controller');
  });

  it('defaults a normal controller-backed site group to controller', () => {
    expect(deriveSiteSource(makeSiteGroup())).toBe('controller');
  });

  it('honors explicit source metadata over derivation', () => {
    expect(deriveSiteSource(makeSiteGroup({ source: 'xiq' }))).toBe('xiq');
    expect(deriveSiteSource(makeSiteGroup({ source: 'gateway' }))).toBe('controller');
    expect(deriveSiteSource(makeSiteGroup({ source: 'controller' }))).toBe('controller');
  });

  it('keeps a controller-backed site group on the controller path even when XIQ is also connected', () => {
    // Non-regression: existing controllers that also linked XIQ must NOT flip to XIQ.
    expect(
      deriveSiteSource(makeSiteGroup({ xiq_authenticated: true, xiq_region: 'global' }))
    ).toBe('controller');
  });

  it('treats an XIQ-authenticated site group with no controller URL as XIQ', () => {
    expect(
      deriveSiteSource(
        makeSiteGroup({ controller_url: '', xiq_authenticated: true, xiq_region: 'global' })
      )
    ).toBe('xiq');
  });
});

describe('resolveSiteContext', () => {
  it('produces a controller context for a standard site group', () => {
    const ctx = resolveSiteContext({
      siteGroup: makeSiteGroup(),
      navigationScope: 'site-group',
      siteGroups: [makeSiteGroup()],
      selectedSiteId: 'site-7',
      siteName: 'Building A',
    });
    expect(ctx.source).toBe('controller');
    expect(ctx.type).toBe('controller');
    expect(ctx.siteGroupId).toBe('sg-1');
    expect(ctx.siteId).toBe('site-7');
    expect(ctx.siteName).toBe('Building A');
    expect(ctx.controllerUrl).toBe('https://controller.example.com');
    expect(ctx.isOrgScope).toBe(false);
  });

  it('produces an XIQ context with region when the site group is XIQ-backed', () => {
    const sg = makeSiteGroup({ source: 'xiq', xiq_region: 'eu' });
    const ctx = resolveSiteContext({
      siteGroup: sg,
      navigationScope: 'site-group',
      siteGroups: [sg],
      selectedSiteId: 'all',
    });
    expect(ctx.source).toBe('xiq');
    expect(ctx.type).toBe('xiq');
    expect(ctx.xiqRegion).toBe('eu');
  });

  it('flags org scope when navigation is global with site groups present', () => {
    const ctx = resolveSiteContext({
      siteGroup: null,
      navigationScope: 'global',
      siteGroups: [makeSiteGroup(), makeSiteGroup({ id: 'sg-2' })],
      selectedSiteId: 'all',
    });
    expect(ctx.isOrgScope).toBe(true);
    expect(ctx.type).toBe('site-group');
    expect(ctx.source).toBe('controller');
  });

  it('defaults siteId to "all" when none provided', () => {
    const ctx = resolveSiteContext({
      siteGroup: makeSiteGroup(),
      navigationScope: 'site-group',
      siteGroups: [],
      selectedSiteId: '',
    });
    expect(ctx.siteId).toBe('all');
  });

  it('routes an explicitly-selected XIQ site to the XIQ source regardless of site group', () => {
    // Active site group is a normal controller, but the picked site is XIQ.
    const value = buildXiqSiteValue('sg-xiq', '2159213203790830');
    const ctx = resolveSiteContext({
      siteGroup: makeSiteGroup(), // controller-backed
      navigationScope: 'site-group',
      siteGroups: [makeSiteGroup(), makeSiteGroup({ id: 'sg-xiq', name: 'Cloud', xiq_region: 'eu' })],
      selectedSiteId: value,
      siteName: 'Audio Alterations',
    });
    expect(ctx.source).toBe('xiq');
    expect(ctx.type).toBe('xiq');
    expect(ctx.siteGroupId).toBe('sg-xiq');
    expect(ctx.siteGroupName).toBe('Cloud');
    expect(ctx.xiqLocationId).toBe('2159213203790830');
    expect(ctx.xiqRegion).toBe('eu');
  });
});

describe('XIQ site value encode/decode', () => {
  it('round-trips siteGroupId + locationId', () => {
    const v = buildXiqSiteValue('sg-1', '12345');
    expect(parseXiqSiteValue(v)).toEqual({ siteGroupId: 'sg-1', locationId: '12345' });
  });

  it('returns null for non-XIQ values', () => {
    expect(parseXiqSiteValue('all')).toBeNull();
    expect(parseXiqSiteValue('84b3642f-a5d7-4dc9-b162-a6156c97b8f0')).toBeNull();
  });

  it('"All XIQ Sites" resolves to the XIQ source with no location filter', () => {
    const value = buildXiqAllSitesValue('sg-xiq');
    expect(parseXiqSiteValue(value)).toEqual({ siteGroupId: 'sg-xiq', locationId: '' });
    const ctx = resolveSiteContext({
      siteGroup: null,
      navigationScope: 'site-group',
      siteGroups: [{ id: 'sg-xiq', org_id: 'o', name: 'Cloud', controller_url: '', connection_status: 'connected', is_default: false }],
      selectedSiteId: value,
    });
    expect(ctx.source).toBe('xiq');
    expect(ctx.siteGroupId).toBe('sg-xiq');
    expect(ctx.xiqLocationId).toBeNull(); // no per-site scoping = whole account
  });
});
