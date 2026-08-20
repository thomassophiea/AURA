import { describe, it, expect } from 'vitest';
import { supportsLightSensor, projectLightAwareSavings } from './lightSensor';

describe('supportsLightSensor', () => {
  it('matches AP4020/4060/5020 families incl. variants', () => {
    for (const m of ['AP4020', 'AP4020X', 'AP4020FX', 'AP4060', 'AP4060X', 'AP5020', 'ap5020']) {
      expect(supportsLightSensor(m)).toBe(true);
    }
  });

  it('rejects non-sensor models and junk', () => {
    for (const m of [
      'AP3000',
      'AP4000',
      'AP5010',
      'CV012408S-C0044',
      '',
      undefined as unknown as string,
    ]) {
      expect(supportsLightSensor(m)).toBe(false);
    }
  });
});

describe('projectLightAwareSavings', () => {
  const rate = 0.14;

  it('is zero when no modeled hours', () => {
    const r = projectLightAwareSavings([{ watts: 12 }], {
      darkHours: 0,
      dimHours: 0,
      darkFactor: 0.35,
      dimFactor: 0.15,
      ratePerKwh: rate,
    });
    expect(r.kwh).toBe(0);
    expect(r.cost).toBe(0);
  });

  it('sums Wh across APs and annualizes to kWh + cost', () => {
    // 2 APs @ 10W, 10 dark h × 0.35 + 4 dim h × 0.15 = 4.1 Wh/W/day
    // per AP/day = 10 × 4.1 = 41 Wh; two APs = 82 Wh/day; ×365 = 29930 Wh = 29.93 kWh
    const r = projectLightAwareSavings([{ watts: 10 }, { watts: 10 }], {
      darkHours: 10,
      dimHours: 4,
      darkFactor: 0.35,
      dimFactor: 0.15,
      ratePerKwh: rate,
    });
    expect(r.kwh).toBeCloseTo(29.93, 2);
    expect(r.cost).toBeCloseTo(29.93 * rate, 2);
  });

  it('ignores non-finite watts', () => {
    const r = projectLightAwareSavings([{ watts: 10 }, { watts: NaN as unknown as number }], {
      darkHours: 10,
      dimHours: 0,
      darkFactor: 0.35,
      dimFactor: 0,
      ratePerKwh: rate,
    });
    // only the 10W AP counts: 10 × 3.5 Wh/day × 365 = 12.775 kWh
    expect(r.kwh).toBeCloseTo(12.775, 3);
  });

  it('clamps modeled states to a non-overlapping 24-hour day', () => {
    const r = projectLightAwareSavings([{ watts: 10 }], {
      darkHours: 20,
      dimHours: 20,
      darkFactor: 0.35,
      dimFactor: 0.15,
      ratePerKwh: rate,
    });
    expect(r.kwh).toBeCloseTo(27.74, 2);
  });

  it('never turns invalid negative inputs into negative savings', () => {
    const r = projectLightAwareSavings([{ watts: -10 }, { watts: 10 }], {
      darkHours: -5,
      dimHours: 4,
      darkFactor: 2,
      dimFactor: -1,
      ratePerKwh: -0.14,
    });
    expect(r.kwh).toBe(0);
    expect(r.cost).toBe(0);
  });
});
