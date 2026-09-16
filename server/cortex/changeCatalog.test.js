import { describe, it, expect } from 'vitest';
import { CHANGE_CATALOG, getCatalogEntry } from './changeCatalog.js';

describe('CHANGE_CATALOG', () => {
  it('offers only fields confirmed present on the live service object', () => {
    // The 50-key shape returned by GET /v1/services on 2026-09-16.
    const LIVE_KEYS = new Set([
      'enabled11kSupport',
      'rm11kBeaconReport',
      'rm11kQuietIe',
      'mbo',
      'clientToClientCommunication',
      'uapsdEnabled',
      'suppressSsid',
      'preAuthenticatedIdleTimeout',
      'postAuthenticatedIdleTimeout',
    ]);
    for (const e of CHANGE_CATALOG) expect(LIVE_KEYS.has(e.path)).toBe(true);
  });

  it('never offers a change that drops every client on a WLAN', () => {
    const paths = CHANGE_CATALOG.map((e) => e.path);
    expect(paths).not.toContain('status');
    expect(paths).not.toContain('privacy');
    expect(paths).not.toContain('defaultTopology');
  });

  it('gives every entry a verify() that can actually fail', () => {
    // An entry whose predicate always passes turns a silent drop into a
    // success, which is worse than having no entry at all.
    for (const e of CHANGE_CATALOG) {
      const desired = e.type === 'boolean' ? true : (e.min ?? 5);
      const unchanged = e.type === 'boolean' ? false : (e.min ?? 5) + 1;
      expect(e.verify(desired, desired)).toBe(true);
      expect(e.verify(unchanged, desired)).toBe(false);
    }
  });

  it('has unique ids and looks them up', () => {
    const ids = CHANGE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCatalogEntry('wlan.11k').path).toBe('enabled11kSupport');
    expect(getCatalogEntry('nope')).toBeNull();
  });

  it('bounds both idle timeouts at the Gateway’s own limits', () => {
    for (const id of ['wlan.idleTimeout.preAuth', 'wlan.idleTimeout.postAuth']) {
      const e = getCatalogEntry(id);
      expect(e.min).toBe(5);
      expect(e.max).toBe(999999);
    }
  });

  it('gives every entry the metadata a preview needs', () => {
    for (const e of CHANGE_CATALOG) {
      expect(e.label).toBeTruthy();
      expect(e.rationale).toBeTruthy();
      expect(['low', 'medium']).toContain(e.risk);
      expect(e.resource).toBe('service');
    }
  });
});
