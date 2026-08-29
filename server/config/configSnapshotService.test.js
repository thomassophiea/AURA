import { describe, it, expect } from 'vitest';
import { diffSections, sectionHash, computeRestorePlan } from './configSnapshotService.js';

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

describe('computeRestorePlan', () => {
  const current = {
    wlans: [
      { id: 'w1', serviceName: 'Corp', vlan: 10 },
      { id: 'w2', serviceName: 'Guest', vlan: 20 },
    ],
    networks: [{ id: 't1', name: 'v10', vlanid: 10 }],
    aaaPolicies: [],
    profiles: [],
    sites: [{ id: 's1', siteName: 'HQ' }],
  };

  it('detects creates, updates, and deletes needed to reach the target', () => {
    const target = {
      wlans: [
        { id: 'w1', serviceName: 'Corp', vlan: 99 }, // update (changed)
        { id: 'w3', serviceName: 'IoT', vlan: 30 }, // create
      ], // w2 Guest would be deleted
      networks: [{ id: 't1', name: 'v10', vlanid: 10 }], // unchanged
      aaaPolicies: [],
      profiles: [],
      sites: [{ id: 's1', siteName: 'HQ' }],
    };

    const plan = computeRestorePlan(current, target);
    const wlans = plan.find((p) => p.section === 'wlans');
    expect(wlans.toCreate).toEqual(['IoT']);
    expect(wlans.toUpdate).toEqual(['Corp']);
    expect(wlans.toDelete).toEqual(['Guest']);
    expect(wlans.items.create).toEqual([{ id: 'w3', serviceName: 'IoT', vlan: 30 }]);
    expect(wlans.items.update).toEqual([{ id: 'w1', serviceName: 'Corp', vlan: 99 }]);
    // The delete item is CURRENT's copy (it carries the id a DELETE call needs).
    expect(wlans.items.delete).toEqual([{ id: 'w2', serviceName: 'Guest', vlan: 20 }]);

    const networks = plan.find((p) => p.section === 'networks');
    expect(networks.toCreate).toEqual([]);
    expect(networks.toUpdate).toEqual([]);
    expect(networks.toDelete).toEqual([]);
  });

  it('reports no-op plans for identical current and target', () => {
    const plan = computeRestorePlan(current, JSON.parse(JSON.stringify(current)));
    for (const section of plan) {
      expect(section.toCreate).toEqual([]);
      expect(section.toUpdate).toEqual([]);
      expect(section.toDelete).toEqual([]);
    }
  });

  it('filters to the requested sections only', () => {
    const target = {
      wlans: [{ id: 'w9', serviceName: 'New' }],
      networks: [{ id: 't9', name: 'new-net', vlanid: 99 }],
      aaaPolicies: [],
      profiles: [],
      sites: [],
    };
    const plan = computeRestorePlan(current, target, { sections: ['wlans'] });
    expect(plan).toHaveLength(1);
    expect(plan[0].section).toBe('wlans');
    expect(plan[0].toCreate).toEqual(['New']);
  });

  it('an empty sections filter array behaves like no filter', () => {
    const plan = computeRestorePlan(current, current, { sections: [] });
    expect(plan.map((p) => p.section)).toEqual(['wlans', 'networks', 'aaaPolicies', 'profiles', 'sites']);
  });

  it('is insensitive to key ordering, consistent with diffSections', () => {
    const reordered = {
      ...current,
      wlans: [
        { serviceName: 'Corp', vlan: 10, id: 'w1' },
        { vlan: 20, id: 'w2', serviceName: 'Guest' },
      ],
    };
    const plan = computeRestorePlan(current, reordered);
    const wlans = plan.find((p) => p.section === 'wlans');
    expect(wlans.toUpdate).toEqual([]);
    expect(wlans.toCreate).toEqual([]);
    expect(wlans.toDelete).toEqual([]);
  });

  it('handles empty and missing sections without throwing', () => {
    expect(() => computeRestorePlan({}, {})).not.toThrow();
    const plan = computeRestorePlan({}, {});
    for (const section of plan) {
      expect(section.toCreate).toEqual([]);
      expect(section.toUpdate).toEqual([]);
      expect(section.toDelete).toEqual([]);
      expect(section.items).toEqual({ create: [], update: [], delete: [] });
    }

    const planFromNull = computeRestorePlan(null, undefined);
    expect(planFromNull).toHaveLength(5);
  });
});
