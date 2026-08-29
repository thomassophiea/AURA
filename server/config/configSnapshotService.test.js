import { describe, it, expect } from 'vitest';
import { diffSections, sectionHash } from './configSnapshotService.js';

describe('config snapshot diff', () => {
  const base = {
    wlans: [
      { id: 'w1', serviceName: 'Corp', vlan: 10 },
      { id: 'w2', serviceName: 'Guest', vlan: 20 },
    ],
    networks: [{ id: 't1', name: 'v10', vlanid: 10 }],
    aaaPolicies: [],
    profiles: [],
    sites: [{ id: 's1', siteName: 'HQ' }],
  };

  it('reports no changes for identical snapshots', () => {
    const diff = diffSections(base, JSON.parse(JSON.stringify(base)));
    for (const section of diff) {
      expect(section.added).toEqual([]);
      expect(section.removed).toEqual([]);
      expect(section.changed).toEqual([]);
    }
  });

  it('names added, removed, and changed items per section', () => {
    const next = JSON.parse(JSON.stringify(base));
    next.wlans = [
      { id: 'w1', serviceName: 'Corp', vlan: 99 }, // changed
      { id: 'w3', serviceName: 'IoT', vlan: 30 }, // added
    ]; // w2 Guest removed
    const diff = diffSections(base, next);
    const wlans = diff.find((d) => d.section === 'wlans');
    expect(wlans.added).toEqual(['IoT']);
    expect(wlans.removed).toEqual(['Guest']);
    expect(wlans.changed).toEqual(['Corp']);
    expect(wlans.unchanged).toBe(0);

    const sites = diff.find((d) => d.section === 'sites');
    expect(sites.unchanged).toBe(1);
  });

  it('is insensitive to key ordering (stable hashing)', () => {
    const a = sectionHash([{ b: 2, a: 1 }]);
    const b = sectionHash([{ a: 1, b: 2 }]);
    expect(a).toBe(b);
    expect(sectionHash([{ a: 1, b: 3 }])).not.toBe(a);
  });

  it('tolerates missing sections on either side', () => {
    const diff = diffSections({}, base);
    const wlans = diff.find((d) => d.section === 'wlans');
    expect(wlans.added).toEqual(['Corp', 'Guest']);
    expect(wlans.removed).toEqual([]);
  });
});
