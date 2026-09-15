import { describe, it, expect } from 'vitest';
import {
  expandBlastRadius,
  counterfactual,
  describeBlastRadius,
  bandOf,
  keyOf,
  MIN_COHORT,
} from './correlationEngine.js';

/** Build a MuTable-shaped row. */
let seq = 0;
const row = (over = {}) => ({
  MAC: `AA:BB:CC:00:00:${(seq++).toString(16).padStart(2, '0').toUpperCase()}`,
  ApName: 'AP-1',
  SSID: 'Corp',
  SiteName: 'AURA_LAB',
  Channel: 36,
  Manufacturer: 'Apple',
  OsName: 'macOS',
  Vlan: '20',
  ...over,
});

beforeEach(() => {
  seq = 0;
});

describe('bandOf', () => {
  it('reads the band from the channel number', () => {
    expect(bandOf({ Channel: 6 })).toBe('2.4 GHz');
    expect(bandOf({ Channel: 36 })).toBe('5 GHz');
  });

  it('is null for the idle-client placeholder rather than guessing a band', () => {
    // An idle client keeps a row with Channel None.
    expect(bandOf({ Channel: 'None' })).toBeNull();
    expect(bandOf({ Channel: 0 })).toBeNull();
  });
});

describe('expandBlastRadius', () => {
  it('refuses a verdict below the cohort floor', () => {
    const population = Array.from({ length: 20 }, () => row());
    const r = expandBlastRadius({ affected: population.slice(0, 2), population });
    expect(r.verdict).toBe('too_few_peers');
    expect(r.boundary).toBeNull();
    expect(r.note).toMatch(new RegExp(`below the ${MIN_COHORT}`));
  });

  it('finds the AP that bounds the failure', () => {
    const healthy = Array.from({ length: 30 }, () => row({ ApName: 'AP-healthy' }));
    const broken = Array.from({ length: 8 }, () => row({ ApName: 'AP-23' }));
    const population = [...healthy, ...broken];
    const r = expandBlastRadius({ affected: broken, population });
    expect(r.verdict).toBe('boundary_found');
    expect(r.boundary).toMatchObject({ dimension: 'apName', value: 'AP-23', coverage: 1 });
    expect(r.boundary.specificity).toBe(1);
  });

  it('discards an attribute that merely reflects the base rate', () => {
    // Everyone is on SSID "Corp", so "all affected clients are on Corp" is true,
    // useless, and must not be reported as the boundary.
    const healthy = Array.from({ length: 30 }, () => row({ ApName: 'AP-healthy' }));
    const broken = Array.from({ length: 8 }, () => row({ ApName: 'AP-23' }));
    const r = expandBlastRadius({ affected: broken, population: [...healthy, ...broken] });
    expect(r.candidates.some((c) => c.dimension === 'ssid')).toBe(false);
  });

  it('reports no shared attribute when the affected set has nothing in common', () => {
    const population = [
      ...Array.from({ length: 10 }, (_, i) =>
        row({ ApName: `AP-${i}`, SSID: `SSID-${i}`, Vlan: String(i), Manufacturer: `M${i}`, OsName: `OS${i}`, Channel: 36 + i * 4 })
      ),
    ];
    const affected = [population[0], population[3], population[7]];
    const r = expandBlastRadius({ affected, population });
    expect(r.verdict).toBe('no_shared_attribute');
    expect(r.note).toMatch(/several independent ones/);
  });

  it('says so when there is no population to compare against', () => {
    expect(expandBlastRadius({ affected: [row()], population: [] }).verdict).toBe('no_population');
  });

  it('prefers the narrower boundary when both a VLAN and a site explain the set', () => {
    // 12 broken clients on VLAN 72 at SiteB; SiteB also holds 20 healthy ones.
    // VLAN 72 covers the affected completely and exclusively; the site does not.
    const healthySiteA = Array.from({ length: 30 }, () => row({ SiteName: 'SiteA', Vlan: '20', ApName: 'AP-a' }));
    const healthySiteB = Array.from({ length: 20 }, () => row({ SiteName: 'SiteB', Vlan: '20', ApName: 'AP-b' }));
    const broken = Array.from({ length: 12 }, (_, i) =>
      row({ SiteName: 'SiteB', Vlan: '72', ApName: `AP-b${i % 8}` })
    );
    const r = expandBlastRadius({
      affected: broken,
      population: [...healthySiteA, ...healthySiteB, ...broken],
    });
    expect(r.boundary.dimension).toBe('vlan');
    expect(r.boundary.value).toBe('72');
    expect(r.boundary.specificity).toBe(1);
  });
});

describe('counterfactual', () => {
  it('needs both populations', () => {
    expect(counterfactual({ broken: [row()], healthy: [] }).comparable).toBe(false);
  });

  it('names what only the broken population has', () => {
    const healthy = Array.from({ length: 10 }, () => row({ OsName: 'macOS', Vlan: '20' }));
    const broken = Array.from({ length: 10 }, () => row({ OsName: 'Android 11', Vlan: '20' }));
    const diff = counterfactual({ broken, healthy });
    expect(diff.comparable).toBe(true);
    expect(diff.differences.some((d) => d.value === 'Android 11' && d.direction === 'only-in-broken')).toBe(
      true
    );
  });

  it('names what only the healthy population has', () => {
    const healthy = Array.from({ length: 10 }, () => row({ Vlan: '20' }));
    const broken = Array.from({ length: 10 }, () => row({ Vlan: '72' }));
    const diff = counterfactual({ broken, healthy });
    expect(diff.differences.some((d) => d.value === '20' && d.direction === 'only-in-healthy')).toBe(true);
  });

  it('reports nothing distinguishing rather than inventing a difference', () => {
    const same = Array.from({ length: 20 }, () => row());
    const diff = counterfactual({ broken: same.slice(0, 10), healthy: same.slice(10) });
    expect(diff.differences).toHaveLength(0);
    expect(diff.note).toMatch(/Nothing distinguishes/i);
  });
});

describe('describeBlastRadius', () => {
  it('writes a line a non-engineer can act on', () => {
    const healthy = Array.from({ length: 30 }, () => row({ ApName: 'AP-healthy' }));
    const broken = Array.from({ length: 8 }, () => row({ ApName: 'AP-23' }));
    const line = describeBlastRadius(
      expandBlastRadius({ affected: broken, population: [...healthy, ...broken] })
    );
    expect(line).toMatch(/8 of 38 clients affected/);
    expect(line).toMatch(/access point AP-23/);
    // No jargon in the headline.
    expect(line).not.toMatch(/RFQI|SNR|dBm/);
  });

  it('does not claim a shared cause below the cohort floor', () => {
    const population = Array.from({ length: 20 }, () => row());
    const line = describeBlastRadius(
      expandBlastRadius({ affected: population.slice(0, 2), population })
    );
    expect(line).toMatch(/too few to identify a shared cause/i);
  });
});

describe('keyOf', () => {
  it('is case-insensitive on MAC so affected and population rows match', () => {
    expect(keyOf({ MAC: 'aa:bb:cc:dd:ee:ff' })).toBe(keyOf({ MAC: 'AA:BB:CC:DD:EE:FF' }));
  });
});
