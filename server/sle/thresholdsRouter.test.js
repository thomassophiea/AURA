import { describe, it, expect } from 'vitest';
import { validateThresholds } from './thresholdsRouter.js';

describe('SLE thresholds validation — shared state accepts only known shapes', () => {
  it('accepts the dashboard default shape', () => {
    expect(
      validateThresholds({
        coverage: { rssiMin: -70 },
        throughput: { minRateBps: 1_000_000 },
        capacity: { maxChannelUtil: 80 },
        successfulConnects: { minSuccessRate: 95 },
        timeToConnect: { maxSeconds: 5 },
        roaming: { maxLatencyMs: 500 },
        apHealth: {},
      })
    ).toBe(true);
  });

  it('rejects unknown metric keys', () => {
    expect(validateThresholds({ evilKey: { x: 1 } })).toBe(false);
  });

  it('rejects non-numeric or non-finite leaf values', () => {
    expect(validateThresholds({ coverage: { rssiMin: 'DROP TABLE' } })).toBe(false);
    expect(validateThresholds({ coverage: { rssiMin: Infinity } })).toBe(false);
    expect(validateThresholds({ coverage: { rssiMin: { nested: 1 } } })).toBe(false);
  });

  it('rejects non-object bodies and empty maps', () => {
    expect(validateThresholds(null)).toBe(false);
    expect(validateThresholds([])).toBe(false);
    expect(validateThresholds({})).toBe(false);
    expect(validateThresholds('coverage')).toBe(false);
  });
});
