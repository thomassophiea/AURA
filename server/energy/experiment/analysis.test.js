import { describe, it, expect } from 'vitest';
import * as calc from '../energyCalculator.js';
import {
  selectBaselineWindow,
  matchedTimeWindows,
  summarizeSide,
  assessComparability,
  attribute,
  projectSavings,
  assessQuality,
} from './analysis.js';

const NOW = new Date('2026-09-11T20:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('selectBaselineWindow', () => {
  it('picks the longest window both sides can support', () => {
    const w = selectBaselineWindow({
      coverage: { north: { earliest: hoursAgo(200) }, south: { earliest: hoursAgo(190) } },
      treatmentStart: NOW.toISOString(),
      now: NOW,
    });
    expect(w.key).toBe('7d');
    expect(w.sufficient).toBe(true);
  });

  it('is governed by the weaker side, not the stronger', () => {
    const w = selectBaselineWindow({
      coverage: { north: { earliest: hoursAgo(200) }, south: { earliest: hoursAgo(80) } },
      treatmentStart: NOW.toISOString(),
      now: NOW,
    });
    expect(w.key).toBe('3d');
  });

  it('reports limited history honestly instead of promoting it', () => {
    const w = selectBaselineWindow({
      coverage: { north: { earliest: hoursAgo(9) }, south: { earliest: hoursAgo(9) } },
      treatmentStart: NOW.toISOString(),
      now: NOW,
    });
    expect(w.sufficient).toBe(false);
    expect(w.key).toBe('partial');
    expect(w.label).toMatch(/9\.0 hours available/);
  });

  it('returns no baseline at all when there is no history', () => {
    const w = selectBaselineWindow({ coverage: {}, now: NOW });
    expect(w.key).toBeNull();
    expect(w.sufficient).toBe(false);
  });
});

describe('matchedTimeWindows', () => {
  it('produces the same clock hours on each preceding day', () => {
    const windows = matchedTimeWindows({
      treatmentStart: '2026-09-11T20:00:00Z',
      treatmentEnd: '2026-09-11T22:00:00Z',
      days: 3,
      now: NOW,
    });
    expect(windows).toHaveLength(3);
    expect(windows[0].start).toBe('2026-09-10T20:00:00.000Z');
    expect(windows[2].start).toBe('2026-09-08T20:00:00.000Z');
    expect(windows.every((w) => (new Date(w.end) - new Date(w.start)) / 3_600_000 === 2)).toBe(true);
  });

  it('returns nothing for an inverted or unparseable range', () => {
    expect(matchedTimeWindows({ treatmentStart: 'x', treatmentEnd: 'y', days: 3 })).toEqual([]);
    expect(
      matchedTimeWindows({ treatmentStart: '2026-09-11T22:00:00Z', treatmentEnd: '2026-09-11T20:00:00Z', days: 3 })
    ).toEqual([]);
  });
});

describe('summarizeSide', () => {
  const rows = [
    { apSerial: 'A', avgWatts: 14, kwh: 0.028, observedSeconds: 7200, sampleCount: 120, model: 'AP5020' },
    { apSerial: 'B', avgWatts: 16, kwh: 0.032, observedSeconds: 7200, sampleCount: 120, model: 'AP5020' },
  ];

  it('normalizes per AP and keeps the site total separate', () => {
    const s = summarizeSide(rows);
    expect(s.wattsPerAp).toBeCloseTo(15, 6);
    expect(s.siteWatts).toBeCloseTo(30, 6);
    expect(s.apCount).toBe(2);
  });

  it('weights by observed time so a barely-reporting AP cannot dominate', () => {
    const s = summarizeSide([
      { apSerial: 'A', avgWatts: 14, kwh: 0.028, observedSeconds: 7200 },
      { apSerial: 'B', avgWatts: 40, kwh: 0.001, observedSeconds: 120 },
    ]);
    expect(s.wattsPerAp).toBeLessThan(20);
  });

  it('excludes APs with too little observation and says how many were enrolled', () => {
    const s = summarizeSide([...rows, { apSerial: 'C', avgWatts: 99, observedSeconds: 5 }]);
    expect(s.apCountWithData).toBe(2);
    expect(s.apCountEnrolled).toBe(3);
  });

  it('returns nulls rather than zeros when nothing is usable', () => {
    const s = summarizeSide([]);
    expect(s.wattsPerAp).toBeNull();
    expect(s.siteWatts).toBeNull();
  });
});

describe('assessComparability', () => {
  it('calls two sites comparable when they drew within 5% per AP', () => {
    expect(
      assessComparability({ northBaseline: { wattsPerAp: 14 }, southBaseline: { wattsPerAp: 14.3 } }).verdict
    ).toBe('comparable');
  });

  it('flags a divergent pre-period so the cross-site claim is not leaned on', () => {
    const r = assessComparability({ northBaseline: { wattsPerAp: 10 }, southBaseline: { wattsPerAp: 20 } });
    expect(r.verdict).toBe('divergent');
    expect(r.note).toMatch(/within-North/);
  });

  it('is unknown, not comparable, when a side has no baseline', () => {
    expect(assessComparability({ northBaseline: {}, southBaseline: { wattsPerAp: 14 } }).verdict).toBe('unknown');
  });
});

describe('attribute', () => {
  it('credits the action only with North’s change relative to South’s', () => {
    // Both sites drift down 10% (evening lull); North drops a further ~16%.
    const r = attribute({
      northBaseline: { wattsPerAp: 14 },
      northTreatment: { wattsPerAp: 10.6, apCount: 3 },
      southBaseline: { wattsPerAp: 14 },
      southTreatment: { wattsPerAp: 12.6 },
    });
    // Within-North looks like 24.3%; the honest attributed figure is ~15.9%.
    expect(r.withinNorth.percent).toBeCloseTo(24.3, 1);
    expect(r.attributed.percent).toBeCloseTo(15.87, 1);
    expect(r.attributed.method).toMatch(/difference-in-differences/);
  });

  it('does not credit the action when South moved exactly as much', () => {
    const r = attribute({
      northBaseline: { wattsPerAp: 14 },
      northTreatment: { wattsPerAp: 12.6, apCount: 3 },
      southBaseline: { wattsPerAp: 14 },
      southTreatment: { wattsPerAp: 12.6 },
    });
    expect(r.attributed.percent).toBeCloseTo(0, 6);
  });

  it('scales the per-AP figure to the site by the treatment AP count', () => {
    const r = attribute({
      northBaseline: { wattsPerAp: 14 },
      northTreatment: { wattsPerAp: 11.8, apCount: 6 },
      southBaseline: { wattsPerAp: 14 },
      southTreatment: { wattsPerAp: 14 },
    });
    expect(r.attributed.siteWatts).toBeCloseTo(2.2 * 6, 5);
  });

  it('falls back to within-North and says so when there is no control drift', () => {
    const r = attribute({
      northBaseline: { wattsPerAp: 14 },
      northTreatment: { wattsPerAp: 11.8, apCount: 3 },
      southBaseline: { wattsPerAp: null },
      southTreatment: { wattsPerAp: null },
    });
    expect(r.attributed.method).toMatch(/within-North only/);
    expect(r.attributed.deltaWattsPerAp).toBeCloseTo(2.2, 6);
  });

  it('produces nulls, never NaN, when nothing is measurable', () => {
    const r = attribute({
      northBaseline: {}, northTreatment: {}, southBaseline: {}, southTreatment: {},
    });
    expect(r.attributed.deltaWattsPerAp).toBeNull();
    expect(r.attributed.percent).toBeNull();
  });
});

describe('projectSavings', () => {
  it('converts an observed watt saving into energy, money and carbon', () => {
    const p = projectSavings({
      attributedSiteWatts: 6.732,
      elapsedSeconds: 3600,
      ratePerKwh: 0.14,
      emissionsFactorKgPerKwh: 0.371,
      calc,
    });
    expect(p.observedKwh).toBeCloseTo(0.006732, 6);
    expect(p.dailyKwh).toBeCloseTo(0.161568, 5);
    expect(p.annualKwh).toBeCloseTo(58.972, 2);
    expect(p.annualCost).toBeCloseTo(58.972 * 0.14, 2);
    expect(p.co2eKg).toBeCloseTo(0.006732 * 0.371, 8);
  });

  it('returns nulls for a non-positive saving rather than inventing one', () => {
    const p = projectSavings({ attributedSiteWatts: -1, elapsedSeconds: 3600, ratePerKwh: 0.14, calc });
    expect(p.observedKwh).toBeNull();
    expect(p.annualCost).toBeNull();
  });
});

describe('assessQuality', () => {
  const side = (enrolled, reporting, seconds) => ({
    apCountEnrolled: enrolled,
    apCountWithData: reporting,
    perAp: Array.from({ length: reporting }, (_, i) => ({ apSerial: `A${i}`, observedSeconds: seconds })),
  });

  it('supports a savings claim when both sides have full coverage', () => {
    const q = assessQuality({ north: side(3, 3, 3600), south: side(3, 3, 3600), windowSeconds: 3600 });
    expect(q.rating).toBe('good');
    expect(q.savingsClaimSupported).toBe(true);
  });

  it('withholds the claim when the window is too short to mean anything', () => {
    const q = assessQuality({ north: side(3, 3, 60), south: side(3, 3, 60), windowSeconds: 60 });
    expect(q.savingsClaimSupported).toBe(false);
  });

  it('withholds the claim when a side is reporting nothing', () => {
    const q = assessQuality({ north: side(3, 3, 3600), south: side(3, 0, 0), windowSeconds: 3600 });
    expect(q.rating).toBe('insufficient');
    expect(q.savingsClaimSupported).toBe(false);
  });

  it('downgrades to fair when some APs are missing but the claim still stands', () => {
    const q = assessQuality({ north: side(6, 5, 3600), south: side(6, 6, 3600), windowSeconds: 3600 });
    expect(q.rating).toBe('fair');
    expect(q.north.missingAps).toBe(1);
    expect(q.savingsClaimSupported).toBe(true);
  });
});
