import { describe, it, expect } from 'vitest';
import {
  formatThroughput,
  formatDataVolume,
  formatBytes,
  formatBitsPerSecond,
  calculateThroughput,
  TOOLTIPS,
  getThroughputUnit,
  getDataVolumeUnit,
  formatCompactNumber,
} from './units';

describe('formatThroughput', () => {
  it('returns Gbps with 1 decimal at >= 1000 Mbps', () => {
    expect(formatThroughput(1000)).toBe('1.0 Gbps');
    expect(formatThroughput(1234.567)).toBe('1.2 Gbps');
    expect(formatThroughput(99_999)).toBe('100.0 Gbps');
  });

  it('returns Mbps with 1 decimal in the 1..999.99 range', () => {
    expect(formatThroughput(1)).toBe('1.0 Mbps');
    expect(formatThroughput(45.678)).toBe('45.7 Mbps');
    expect(formatThroughput(999.9)).toBe('999.9 Mbps');
  });

  it('returns rounded Kbps below 1 Mbps', () => {
    expect(formatThroughput(0.5)).toBe('500 Kbps');
    expect(formatThroughput(0.001)).toBe('1 Kbps');
    expect(formatThroughput(0)).toBe('0 Kbps');
  });

  it('boundary: 999.9999 Mbps stays Mbps', () => {
    expect(formatThroughput(999.9999)).toMatch(/Mbps$/);
  });

  it('boundary: 1000 Mbps flips to Gbps', () => {
    expect(formatThroughput(1000)).toMatch(/Gbps$/);
  });
});

describe('formatDataVolume', () => {
  it('returns GB with 1 decimal at >= 1000 MB', () => {
    expect(formatDataVolume(1000)).toBe('1.0 GB');
    expect(formatDataVolume(2500)).toBe('2.5 GB');
  });

  it('returns rounded MB below 1000 MB', () => {
    expect(formatDataVolume(0)).toBe('0 MB');
    expect(formatDataVolume(123.4)).toBe('123 MB');
    expect(formatDataVolume(999)).toBe('999 MB');
  });
});

describe('formatBytes', () => {
  it('converts bytes to MB before delegating', () => {
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(1_500_000_000)).toBe('1.5 GB');
  });

  it('handles small inputs as 0 MB', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(100)).toBe('0 MB');
  });
});

describe('formatBitsPerSecond', () => {
  it('converts bps to Mbps before delegating', () => {
    expect(formatBitsPerSecond(1_000_000)).toBe('1.0 Mbps');
    expect(formatBitsPerSecond(1_500_000_000)).toBe('1.5 Gbps');
  });

  it('zero bps stays at 0 Kbps', () => {
    expect(formatBitsPerSecond(0)).toBe('0 Kbps');
  });

  it('1 Kbps input shows as Kbps via the sub-Mbps branch', () => {
    expect(formatBitsPerSecond(1_000)).toBe('1 Kbps');
  });
});

describe('calculateThroughput', () => {
  it('subtracts byte counters then converts bits-per-interval to Mbps', () => {
    // 125_000 bytes/sec * 8 = 1_000_000 bps = 1 Mbps
    expect(calculateThroughput(0, 0, 100_000, 25_000, 1)).toBe(1);
  });

  it('handles non-1-second sampling intervals', () => {
    // 8_000_000 bits / 4 sec = 2_000_000 bps = 2 Mbps
    expect(calculateThroughput(0, 0, 1_000_000, 0, 4)).toBe(2);
  });

  it('returns 0 when both samples are equal (no traffic)', () => {
    expect(calculateThroughput(500, 500, 500, 500, 1)).toBe(0);
  });

  it('returns negative when counter wrapped or reset', () => {
    expect(calculateThroughput(1_000_000, 1_000_000, 0, 0, 1)).toBeLessThan(0);
  });
});

describe('TOOLTIPS', () => {
  it('has the four documented keys with non-empty strings', () => {
    expect(typeof TOOLTIPS.THROUGHPUT).toBe('string');
    expect(typeof TOOLTIPS.DATA_TRANSFERRED).toBe('string');
    expect(typeof TOOLTIPS.REAL_TIME_THROUGHPUT).toBe('string');
    expect(typeof TOOLTIPS.CUMULATIVE_DATA).toBe('string');
    expect(TOOLTIPS.THROUGHPUT.length).toBeGreaterThan(0);
  });
});

describe('getThroughputUnit', () => {
  it('Gbps at >= 1000', () => {
    expect(getThroughputUnit(1000)).toBe('Gbps');
    expect(getThroughputUnit(50_000)).toBe('Gbps');
  });
  it('Mbps below 1000', () => {
    expect(getThroughputUnit(0)).toBe('Mbps');
    expect(getThroughputUnit(999.99)).toBe('Mbps');
  });
});

describe('getDataVolumeUnit', () => {
  it('GB at >= 1000', () => {
    expect(getDataVolumeUnit(1000)).toBe('GB');
  });
  it('MB below 1000', () => {
    expect(getDataVolumeUnit(0)).toBe('MB');
    expect(getDataVolumeUnit(999)).toBe('MB');
  });
});

describe('formatCompactNumber', () => {
  it('returns N/A for null / undefined', () => {
    expect(formatCompactNumber(null)).toBe('N/A');
    expect(formatCompactNumber(undefined)).toBe('N/A');
  });

  it('formats billions with B suffix', () => {
    expect(formatCompactNumber(1_000_000_000)).toBe('1B');
    expect(formatCompactNumber(2_500_000_000)).toBe('2.5B');
    expect(formatCompactNumber(1_234_567_890)).toBe('1.23B');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactNumber(1_000_000)).toBe('1M');
    expect(formatCompactNumber(4_041_861)).toBe('4.04M');
    expect(formatCompactNumber(999_999_999)).toMatch(/M$/);
  });

  it('formats thousands with K suffix', () => {
    expect(formatCompactNumber(1_000)).toBe('1K');
    expect(formatCompactNumber(12_500)).toBe('12.5K');
    expect(formatCompactNumber(999_999)).toMatch(/K$/);
  });

  it('formats sub-thousand values with locale formatting', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(42)).toBe('42');
    expect(formatCompactNumber(999)).toBe('999');
  });

  it('strips trailing zeros from suffixed values', () => {
    expect(formatCompactNumber(2_000_000)).toBe('2M');
    expect(formatCompactNumber(2_100_000)).toBe('2.1M');
    expect(formatCompactNumber(2_120_000)).toBe('2.12M');
  });
});
