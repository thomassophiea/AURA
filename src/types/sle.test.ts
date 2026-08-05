import { describe, it, expect } from 'vitest';
import { DEFAULT_SLE_THRESHOLDS, getSLEStatus, SLE_STATUS_COLORS } from './sle';
import { STATUS_COLORS } from '../config/colorPalette';

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
  it('has good/warn/poor entries with a hex value', () => {
    for (const status of ['good', 'warn', 'poor'] as const) {
      expect(SLE_STATUS_COLORS[status].hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('is wired to the EP1 brand palette', () => {
    expect(SLE_STATUS_COLORS.good.hex).toBe(STATUS_COLORS.success);
    expect(SLE_STATUS_COLORS.warn.hex).toBe(STATUS_COLORS.warning);
    expect(SLE_STATUS_COLORS.poor.hex).toBe(STATUS_COLORS.critical);
  });
});
