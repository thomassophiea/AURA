import { describe, it, expect } from 'vitest';
import {
  resolveApState,
  BAND_SHARE,
  ALL_RADIOS_OFF_SHARE,
  MAX_REMOVED_SHARE,
  CHAIN_SHARE,
} from './powerModel.js';

describe('measured constants', () => {
  it('6 GHz is the measured AP5020 share (14.112 W -> 11.868 W)', () => {
    expect(BAND_SHARE['6']).toBeCloseTo((14.112 - 11.868) / 14.112, 3);
  });

  it('the three bands together equal the measured AP5022 all-radios-off saving', () => {
    const sum = BAND_SHARE['2.4'] + BAND_SHARE['5'] + BAND_SHARE['6'];
    expect(sum).toBeCloseTo(ALL_RADIOS_OFF_SHARE, 3);
    // Lab, 2026-10-08: 33.5 / 34.9 / 35.1 % across three channel plans.
    expect(ALL_RADIOS_OFF_SHARE).toBeGreaterThanOrEqual(0.335);
    expect(ALL_RADIOS_OFF_SHARE).toBeLessThanOrEqual(0.351);
  });

  it('2.4 GHz is the cheapest band, as measured (0.39 W below 5 GHz on the same radio)', () => {
    expect(BAND_SHARE['2.4']).toBeLessThan(BAND_SHARE['5']);
    expect((BAND_SHARE['5'] - BAND_SHARE['2.4']) * 16.39).toBeCloseTo(0.39, 1);
  });
});

describe('resolveApState', () => {
  it('returns baseline unchanged with no optimizations', () => {
    expect(resolveApState(20, [])).toBe(20);
  });

  it('removes a single band share once', () => {
    expect(resolveApState(20, [{ kind: 'disableRadio', band: '6' }])).toBeCloseTo(20 * (1 - 0.159), 6);
  });

  it('counts the same band disabled by two sources only once (no double-count)', () => {
    const opts = [
      { kind: 'disableRadio', band: '6', source: 'whatif' },
      { kind: 'disableRadio', band: '6', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.159), 6);
  });

  it('all three radios off reproduces the lab: mean idle 16.66 W -> ~10.91 W', () => {
    const opts = ['2.4', '5', '6'].map((band) => ({ kind: 'disableRadio', band }));
    const idle = (16.389 + 16.782 + 16.824) / 3;
    const off = (10.893 + 10.923 + 10.914) / 3;
    expect(Math.abs(resolveApState(idle, opts) - off)).toBeLessThan(0.05);
  });

  it('reconciles overlapping Tx reductions to the deepest single percent, applied to radio draw only', () => {
    const opts = [
      { kind: 'reduceTxPower', reducePercent: 20, source: 'whatif' },
      { kind: 'reduceTxPower', reducePercent: 30, source: 'lightAware' },
    ];
    // 30% of the radio share (0.345), never of the platform draw.
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.345 * 0.3), 6);
  });

  it('applies Tx reduction to the radio draw remaining after band disables', () => {
    const opts = [
      { kind: 'disableRadio', band: '6' },
      { kind: 'reduceTxPower', reducePercent: 30 },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.159 - (0.345 - 0.159) * 0.3), 6);
  });

  it('a 100% Tx cut can never save more than switching the radios off', () => {
    expect(resolveApState(20, [{ kind: 'reduceTxPower', reducePercent: 100 }])).toBeCloseTo(
      20 * (1 - ALL_RADIOS_OFF_SHARE),
      6
    );
  });

  it('counts chain reduction once regardless of source count', () => {
    const opts = [
      { kind: 'reduceChains', source: 'whatif' },
      { kind: 'reduceChains', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - CHAIN_SHARE), 6);
  });

  it('adds one WLAN share per distinct wlanId', () => {
    const opts = [
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'b' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.1), 6); // 2 distinct * 0.05
  });

  it('caps stacked actions at the all-radios-off saving — the platform draw remains', () => {
    const opts = [
      { kind: 'disableRadio', band: '2.4' },
      { kind: 'disableRadio', band: '5' },
      { kind: 'disableRadio', band: '6' },
      { kind: 'reduceChains' },
      { kind: 'lowPowerProfile' },
      { kind: 'disableWlan', wlanId: 'a' },
    ];
    expect(MAX_REMOVED_SHARE).toBe(ALL_RADIOS_OFF_SHARE);
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - ALL_RADIOS_OFF_SHARE), 6);
  });

  it('returns 0 for non-finite baseline', () => {
    expect(resolveApState(NaN, [{ kind: 'reduceChains' }])).toBe(0);
    expect(resolveApState(-5, [])).toBe(0);
  });
});
