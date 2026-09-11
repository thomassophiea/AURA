import { describe, it, expect, vi } from 'vitest';
import { normalizeSite, normalizeAp, bandForRadio, proposePair, discover, rows } from './siteDiscovery.js';

const SITES = [
  { id: 'n-id', siteName: 'EAL-PT-N', timezone: 'America/New_York', deviceGroups: [{ apSerialNumbers: ['N1'] }] },
  { id: 's-id', siteName: 'EAL-PT-S', timezone: 'America/New_York', deviceGroups: [{ apSerialNumbers: ['S1'] }] },
  { id: 'p-id', siteName: 'PrimarySite', deviceGroups: [{ apSerialNumbers: ['P1', 'P2'] }] },
];

const APS = [
  { serialNumber: 'N1', apName: 'north-1', platformName: 'AP5020', hardwareType: 'AP5020-WW', hostSite: 'EAL-PT-N', status: 'InService', pwrUsage: 14.1, radios: [{ radioIndex: 3, channelFreq: 6035, txPower: 12, clients: 0 }] },
  { serialNumber: 'S1', apName: 'south-1', platformName: 'AP5022', hardwareType: 'AP5022-WW', hostSite: 'EAL-PT-S', status: 'InService', pwrUsage: 15.0, radios: [] },
  { serialNumber: 'P1', platformName: 'AP5020', hostSite: 'PrimarySite', status: 'InService', pwrUsage: 14.3, radios: [] },
];

function session({ sites = SITES, aps = APS, sitesOk = true, apsOk = true } = {}) {
  return {
    get: vi.fn(async (path) => {
      if (path === '/v3/sites') {
        return sitesOk ? { ok: true, data: sites } : { ok: false, errorSummary: 'sites down' };
      }
      return apsOk ? { ok: true, data: aps } : { ok: false, errorSummary: 'aps down' };
    }),
  };
}

describe('rows', () => {
  it('accepts a bare array or an envelope', () => {
    expect(rows([1, 2])).toEqual([1, 2]);
    expect(rows({ sites: [1] }, ['sites'])).toEqual([1]);
    expect(rows(null)).toEqual([]);
  });
});

describe('bandForRadio', () => {
  it('derives the band from the operating frequency', () => {
    expect(bandForRadio({ channelFreq: 2462 })).toBe('2.4');
    expect(bandForRadio({ channelFreq: 5180 })).toBe('5');
    expect(bandForRadio({ channelFreq: 6035 })).toBe('6');
  });

  it('falls back to the 802.11 mode string', () => {
    expect(bandForRadio({ mode: 'gnxbe' })).toBe('2.4');
    expect(bandForRadio({ mode: 'ax6be' })).toBe('6');
  });
});

describe('normalizeSite / normalizeAp', () => {
  it('flattens declared AP membership across device groups', () => {
    const s = normalizeSite({ id: 'x', siteName: 'X', deviceGroups: [{ apSerialNumbers: ['A'] }, { apSerialNumbers: ['B'] }] });
    expect(s.declaredSerials).toEqual(['A', 'B']);
  });

  it('reads measured watts from pwrUsage and sums clients across radios', () => {
    const a = normalizeAp({ serialNumber: 'Z', pwrUsage: 14.005, radios: [{ clients: 1 }, { clients: 2 }] });
    expect(a.watts).toBeCloseTo(14.005, 3);
    expect(a.clientCount).toBe(3);
  });

  it('reports missing power as null, not zero', () => {
    expect(normalizeAp({ serialNumber: 'Z', pwrUsage: null }).watts).toBeNull();
  });
});

describe('proposePair', () => {
  it('proposes an unambiguous north/south pair from site names', () => {
    const p = proposePair(SITES.map(normalizeSite));
    expect(p.north.siteName).toBe('EAL-PT-N');
    expect(p.south.siteName).toBe('EAL-PT-S');
  });

  it('proposes nothing when the match is ambiguous rather than guessing', () => {
    const p = proposePair([
      { siteName: 'North Campus' }, { siteName: 'North Annex' }, { siteName: 'South Wing' },
    ]);
    expect(p.north).toBeNull();
    expect(p.northCandidates).toHaveLength(2);
    expect(p.south.siteName).toBe('South Wing');
  });
});

describe('discover', () => {
  it('resolves membership from the AP inventory, keyed on site name', async () => {
    const found = await discover({ session: session() });
    expect(found.ok).toBe(true);
    expect(found.membership.north.map((a) => a.serial)).toEqual(['N1']);
    expect(found.membership.south.map((a) => a.serial)).toEqual(['S1']);
  });

  it('honours a configured pair over the name heuristic', async () => {
    const found = await discover({
      session: session(),
      configuredPair: { northSiteId: 'p-id', southSiteId: 's-id' },
    });
    expect(found.pair.north.siteName).toBe('PrimarySite');
    expect(found.membership.north.map((a) => a.serial)).toEqual(['P1']);
  });

  it('raises an anomaly when a configured site no longer exists', async () => {
    const found = await discover({
      session: session(),
      configuredPair: { northSiteId: 'deleted-id', southSiteId: 's-id' },
    });
    expect(found.anomalies.join(' ')).toMatch(/no longer exists/);
  });

  it('raises an anomaly for an empty treatment site', async () => {
    const found = await discover({
      session: session({ aps: APS.filter((a) => a.serialNumber !== 'N1') }),
    });
    expect(found.membership.north).toHaveLength(0);
    expect(found.anomalies.join(' ')).toMatch(/has no access points/);
  });

  it('raises an anomaly when the site record and AP inventory disagree', async () => {
    const found = await discover({
      session: session({ aps: APS.map((a) => (a.serialNumber === 'N1' ? { ...a, hostSite: 'PrimarySite' } : a)) }),
    });
    expect(found.anomalies.join(' ')).toMatch(/does not report that site/);
  });

  it('raises an anomaly for unequal group sizes so totals are not compared raw', async () => {
    const found = await discover({
      session: session({
        aps: [...APS, { serialNumber: 'N2', platformName: 'AP5020', hostSite: 'EAL-PT-N', status: 'InService', pwrUsage: 14, radios: [] }],
      }),
    });
    expect(found.anomalies.join(' ')).toMatch(/normalized per AP/);
  });

  it('raises an anomaly for an AP that is not in service', async () => {
    const found = await discover({
      session: session({ aps: APS.map((a) => (a.serialNumber === 'S1' ? { ...a, status: 'Unknown' } : a)) }),
    });
    expect(found.anomalies.join(' ')).toMatch(/is 'Unknown'/);
  });

  it('fails cleanly when the controller cannot answer', async () => {
    expect((await discover({ session: session({ sitesOk: false }) })).ok).toBe(false);
    expect((await discover({ session: session({ apsOk: false }) })).ok).toBe(false);
  });
});
