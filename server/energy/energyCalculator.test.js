import { describe, it, expect } from 'vitest';
import {
  kwhFromWattSeconds,
  projectDaily,
  projectMonthly,
  projectAnnual,
  estimateCost,
  savingsPercent,
  windowDays,
  dataQualityForDays,
} from './energyCalculator.js';

describe('kwhFromWattSeconds', () => {
  it('integrates watts over seconds into kWh', () => {
    // 1000 W for 3600 s = 1 kWh
    expect(kwhFromWattSeconds(1000, 3600)).toBeCloseTo(1, 6);
  });
  it('returns 0 for zero elapsed time', () => {
    expect(kwhFromWattSeconds(1000, 0)).toBe(0);
  });
  it('returns null on non-finite input', () => {
    expect(kwhFromWattSeconds(Number.NaN, 3600)).toBeNull();
    expect(kwhFromWattSeconds(1000, -5)).toBeNull();
  });
  it('returns null on negative watts', () => {
    expect(kwhFromWattSeconds(-100, 3600)).toBeNull();
  });
});

describe('projectDaily', () => {
  it('scales a period to a 24h day', () => {
    // 10 kWh over 12h -> 20 kWh/day
    expect(projectDaily(10, 43200)).toBeCloseTo(20, 6);
  });
  it('returns null on zero window', () => {
    expect(projectDaily(10, 0)).toBeNull();
  });
});

describe('projectMonthly / projectAnnual', () => {
  it('multiplies daily by 30 and 365', () => {
    expect(projectMonthly(2)).toBe(60);
    expect(projectAnnual(2)).toBe(730);
  });
  it('propagates null', () => {
    expect(projectMonthly(null)).toBeNull();
    expect(projectAnnual(null)).toBeNull();
  });
});

describe('estimateCost', () => {
  it('multiplies kWh by rate', () => {
    expect(estimateCost(100, 0.14)).toBeCloseTo(14, 6);
  });
  it('returns null on bad rate', () => {
    expect(estimateCost(100, 0)).toBeNull();
    expect(estimateCost(100, null)).toBeNull();
  });
  it('returns null on negative kwh', () => {
    expect(estimateCost(-50, 0.14)).toBeNull();
  });
});

describe('savingsPercent', () => {
  it('computes percent reduction', () => {
    expect(savingsPercent(100, 80)).toBeCloseTo(20, 6);
  });
  it('returns null when baseline is zero', () => {
    expect(savingsPercent(0, 0)).toBeNull();
  });
  it('returns null on negative baseline', () => {
    expect(savingsPercent(-100, 80)).toBeNull();
  });
});

describe('windowDays', () => {
  it('returns fractional days between two ISO instants', () => {
    expect(windowDays('2026-08-10T00:00:00Z', '2026-08-17T00:00:00Z')).toBeCloseTo(7, 6);
  });
  it('returns null on invalid dates', () => {
    expect(windowDays('nope', '2026-08-17T00:00:00Z')).toBeNull();
  });
  it('returns null on zero-duration window', () => {
    expect(windowDays('2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z')).toBeNull();
  });
  it('returns null on reversed dates', () => {
    expect(windowDays('2026-08-17T00:00:00Z', '2026-08-10T00:00:00Z')).toBeNull();
  });
});

describe('dataQualityForDays', () => {
  it('classifies by observation length', () => {
    expect(dataQualityForDays(7)).toBe('high');
    expect(dataQualityForDays(4)).toBe('medium');
    expect(dataQualityForDays(2)).toBe('low');
    expect(dataQualityForDays(null)).toBe('low');
  });
});
