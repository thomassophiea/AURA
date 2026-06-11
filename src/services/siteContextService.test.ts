import { describe, it, expect } from 'vitest';
import { deriveSiteSource, resolveSiteContext } from './siteContextService';
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
});
