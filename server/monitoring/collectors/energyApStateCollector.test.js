import { describe, it, expect, vi } from 'vitest';
import { samplesForAp, collectEnergyApState, METRIC } from './energyApStateCollector.js';

const CONTEXT = {
  monitoredSourceId: 'src-1',
  orgId: null,
  siteGroupId: null,
  siteId: 'site-1',
  collectedAt: new Date('2026-09-11T20:00:00Z'),
  retentionDays: 7,
};

const AP = {
  serialNumber: 'CV012408S-C0102',
  platformName: 'AP5020',
  hostSite: 'PrimarySite',
  status: 'InService',
  pwrUsage: 14.112,
  pwrSource: 'Bt',
  radios: [
    { radioIndex: 1, channelFreq: 2462, txPower: 17, clients: 1, channelOccupancy: 3, mode: 'gnxbe' },
    { radioIndex: 3, channelFreq: 6035, txPower: 12, clients: 0, channelOccupancy: 0, mode: 'ax6be' },
  ],
};

const byName = (samples, name) => samples.filter((s) => s.metricName === name);

describe('samplesForAp', () => {
  it('writes measured watts straight from pwrUsage', () => {
    const power = byName(samplesForAp(AP, CONTEXT), METRIC.POWER_WATTS)[0];
    expect(power.numericValue).toBeCloseTo(14.112, 4);
    expect(power.unit).toBe('W');
    expect(power.dimensions.source).toBe('measured');
    expect(power.deviceExternalId).toBe('CV012408S-C0102');
  });

  it('writes NO power sample for an offline AP rather than a zero', () => {
    const samples = samplesForAp({ ...AP, status: 'Unknown' }, CONTEXT);
    expect(byName(samples, METRIC.POWER_WATTS)).toHaveLength(0);
  });

  it('writes no power sample when the AP reports no draw', () => {
    const samples = samplesForAp({ ...AP, pwrUsage: null }, CONTEXT);
    expect(byName(samples, METRIC.POWER_WATTS)).toHaveLength(0);
  });

  it('marks the timestamp as ours, because the controller supplies none', () => {
    expect(samplesForAp(AP, CONTEXT).every((s) => s.qualityState === 'collection_timestamped')).toBe(true);
  });

  it('derives radio admin state from tx power and labels it derived', () => {
    const samples = samplesForAp(AP, CONTEXT);
    const admin = byName(samples, METRIC.RADIO_ADMIN);
    expect(admin.find((s) => s.radioExternalId === '3').numericValue).toBe(1);
    expect(admin[0].dimensions.source).toBe('derived');

    const off = samplesForAp(
      { ...AP, radios: [{ radioIndex: 3, channelFreq: 6035, txPower: 0, clients: 0 }] },
      CONTEXT
    );
    expect(byName(off, METRIC.RADIO_ADMIN)[0].numericValue).toBe(0);
  });

  it('tags each radio series with its band', () => {
    const tx = byName(samplesForAp(AP, CONTEXT), METRIC.RADIO_TX_POWER);
    expect(tx.find((s) => s.radioExternalId === '1').dimensions.band).toBe('2.4');
    expect(tx.find((s) => s.radioExternalId === '3').dimensions.band).toBe('6');
  });

  it('stamps expiry from the retention setting', () => {
    const s = samplesForAp(AP, CONTEXT)[0];
    expect(s.expiresAt.toISOString()).toBe('2026-09-18T20:00:00.000Z');
  });

  it('drops an AP with no serial rather than keying it on nothing', () => {
    expect(samplesForAp({ pwrUsage: 10 }, CONTEXT)).toEqual([]);
  });
});

function session({ apsOk = true, sitesOk = true } = {}) {
  return {
    get: vi.fn(async (path) => {
      if (path === '/v3/sites') {
        return sitesOk
          ? { ok: true, data: [{ id: 'site-1', siteName: 'PrimarySite' }] }
          : { ok: false, errorClass: 'network', errorSummary: 'down' };
      }
      return apsOk
        ? { ok: true, data: [AP] }
        : { ok: false, errorClass: 'network', errorSummary: 'down', status: null };
    }),
  };
}

const SOURCE = { id: 'src-1', orgId: null, siteGroupId: null };
const CONFIG = { retentionDays: 7 };

describe('collectEnergyApState', () => {
  it('resolves the site id from the AP’s site NAME', async () => {
    const result = await collectEnergyApState({ session: session(), source: SOURCE, config: CONFIG });
    expect(result.fatal).toBeNull();
    expect(result.samples.every((s) => s.siteId === 'site-1')).toBe(true);
  });

  it('still records samples when the site list is unavailable, and says so', async () => {
    const result = await collectEnergyApState({
      session: session({ sitesOk: false }), source: SOURCE, config: CONFIG,
    });
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.samples.every((s) => s.siteId === null)).toBe(true);
    expect(result.notes.join(' ')).toMatch(/without a site id/);
  });

  it('reports a fatal and writes nothing when the AP inventory fails', async () => {
    const result = await collectEnergyApState({
      session: session({ apsOk: false }), source: SOURCE, config: CONFIG,
    });
    expect(result.samples).toEqual([]);
    expect(result.fatal).not.toBeNull();
  });

  it('notes APs whose site name matches no known site', async () => {
    const s = {
      get: vi.fn(async (path) =>
        path === '/v3/sites'
          ? { ok: true, data: [{ id: 'other', siteName: 'Elsewhere' }] }
          : { ok: true, data: [AP] }
      ),
    };
    const result = await collectEnergyApState({ session: s, source: SOURCE, config: CONFIG });
    expect(result.notes.join(' ')).toMatch(/matches no site id/);
  });
});
