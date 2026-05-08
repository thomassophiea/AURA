import { describe, it, expect } from 'vitest';
import { ORG_PAGES, SITE_GROUP_PAGES, GLOBAL_PAGES } from './navigationScopes';

describe('navigationScopes', () => {
  it('ORG_PAGES is a Set with the documented pages', () => {
    expect(ORG_PAGES).toBeInstanceOf(Set);
    expect(ORG_PAGES.has('workspace')).toBe(true);
    expect(ORG_PAGES.has('service-levels')).toBe(true);
    expect(ORG_PAGES.has('configure-networks')).toBe(true);
    expect(ORG_PAGES.has('global-templates')).toBe(true);
    expect(ORG_PAGES.has('event-alarm-dashboard')).toBe(true);
    expect(ORG_PAGES.has('help')).toBe(true);
  });

  it('SITE_GROUP_PAGES is a Set with controller-specific pages', () => {
    expect(SITE_GROUP_PAGES).toBeInstanceOf(Set);
    expect(SITE_GROUP_PAGES.has('system-backup')).toBe(true);
    expect(SITE_GROUP_PAGES.has('firmware-manager')).toBe(true);
    expect(SITE_GROUP_PAGES.has('site-group-settings')).toBe(true);
  });

  it('ORG_PAGES and SITE_GROUP_PAGES do not overlap', () => {
    for (const page of SITE_GROUP_PAGES) {
      expect(ORG_PAGES.has(page)).toBe(false);
    }
  });

  it('GLOBAL_PAGES alias points at the same Set as ORG_PAGES', () => {
    expect(GLOBAL_PAGES).toBe(ORG_PAGES);
  });

  it('ORG_PAGES has a sensible non-trivial size (≥ 20 entries)', () => {
    expect(ORG_PAGES.size).toBeGreaterThanOrEqual(20);
  });

  it('SITE_GROUP_PAGES is a small set (≤ 10 entries)', () => {
    expect(SITE_GROUP_PAGES.size).toBeLessThanOrEqual(10);
  });
});
