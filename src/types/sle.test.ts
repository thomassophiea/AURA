import { describe, it, expect } from 'vitest';
import { DEFAULT_SLE_THRESHOLDS, getSLEStatus, SLE_STATUS_COLORS } from './sle';

describe('DEFAULT_SLE_THRESHOLDS', () => {
  it('exposes all 7 SLE categories with sensible defaults', () => {
    expect(DEFAULT_SLE_THRESHOLDS.coverage.rssiMin).toBe(-70);
    expect(DEFAULT_SLE_THRESHOLDS.throughput.minRateBps).toBe(1_000_000);
    expect(DEFAULT_SLE_THRESHOLDS.capacity.maxChannelUtil).toBe(80);
    expect(DEFAULT_SLE_THRESHOLDS.successfulConnects.minSuccessRate).toBe(95);
    expect(DEFAULT_SLE_THRESHOLDS.timeToConnect.maxSeconds).toBe(5);
    expect(DEFAULT_SLE_THRESHOLDS.roaming.maxLatencyMs).toBe(500);
    expect(DEFAULT_SLE_THRESHOLDS.apHealth).toEqual({});
  });
});

describe('getSLEStatus', () => {
  it.each([
    [100, 'good'],
    [95, 'good'],
    [94.99, 'warn'],
    [80, 'warn'],
    [79.99, 'poor'],
    [0, 'poor'],
  ] as const)('rate=%s → %s', (rate, expected) => {
    expect(getSLEStatus(rate)).toBe(expected);
  });
});

describe('SLE_STATUS_COLORS', () => {
  it('has good/warn/poor entries with text/bg/hex', () => {
    for (const status of ['good', 'warn', 'poor'] as const) {
      const color = SLE_STATUS_COLORS[status];
      expect(color.text).toMatch(/^text-/);
      expect(color.bg).toMatch(/^bg-/);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
