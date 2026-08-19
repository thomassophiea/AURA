import { describe, it, expect } from 'vitest';
import { resolveApState } from './powerModel.js';

describe('resolveApState', () => {
  it('returns baseline unchanged with no optimizations', () => {
    expect(resolveApState(20, [])).toBe(20);
  });

  it('removes a single band share once', () => {
    // 6 GHz share 0.25 -> 20 * 0.75
    expect(resolveApState(20, [{ kind: 'disableRadio', band: '6' }])).toBeCloseTo(15, 6);
  });

  it('counts the same band disabled by two sources only once (no double-count)', () => {
    const opts = [
      { kind: 'disableRadio', band: '6', source: 'whatif' },
      { kind: 'disableRadio', band: '6', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(15, 6);
  });

  it('reconciles overlapping Tx reductions to the deepest single percent', () => {
    const opts = [
      { kind: 'reduceTxPower', reducePercent: 20, source: 'whatif' },
      { kind: 'reduceTxPower', reducePercent: 30, source: 'lightAware' },
    ];
    // deepest 30% -> 20 * 0.70, NOT 20 * 0.8 * 0.7
    expect(resolveApState(20, opts)).toBeCloseTo(14, 6);
  });

  it('applies Tx reduction to the draw remaining after band disables', () => {
    const opts = [
      { kind: 'disableRadio', band: '6' }, // -0.25 share
      { kind: 'reduceTxPower', reducePercent: 30 },
    ];
    // remaining = 20*0.75 = 15; then *0.70 = 10.5
    expect(resolveApState(20, opts)).toBeCloseTo(10.5, 6);
  });

  it('counts chain reduction once regardless of source count', () => {
    const opts = [
      { kind: 'reduceChains', source: 'whatif' },
      { kind: 'reduceChains', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * 0.9, 6);
  });

  it('adds one WLAN share per distinct wlanId', () => {
    const opts = [
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'b' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.1), 6); // 2 distinct * 0.05
  });

  it('clamps total removed share at MAX_REMOVED_SHARE', () => {
    const opts = [
      { kind: 'disableRadio', band: '2.4' },
      { kind: 'disableRadio', band: '5' },
      { kind: 'disableRadio', band: '6' },
      { kind: 'reduceChains' },
      { kind: 'lowPowerProfile' },
      { kind: 'disableWlan', wlanId: 'a' },
    ]; // shares sum > 0.9
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.9), 6);
  });

  it('returns 0 for non-finite baseline', () => {
    expect(resolveApState(NaN, [{ kind: 'reduceChains' }])).toBe(0);
    expect(resolveApState(-5, [])).toBe(0);
  });
});
