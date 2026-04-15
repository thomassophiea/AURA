import { describe, it, expect } from 'vitest';
import { buildSparklineBuckets } from './roamingSparklineData';
import type { RoamingEventForSparkline } from './roamingSparklineData';

// Fixed base timestamp: a known point in time to make bucket math deterministic
const BASE = 1_700_000_000_000; // Nov 14 2023 22:13:20 UTC

describe('buildSparklineBuckets', () => {
  it('returns empty array for empty input', () => {
    expect(buildSparklineBuckets([])).toEqual([]);
  });

  it('produces a single bucket for a single event', () => {
    const events: RoamingEventForSparkline[] = [{ timestamp: BASE }];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.some((b) => b.total === 1)).toBe(true);
  });

  it('places two events within 5 min into the same bucket (< 2h span)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 1 * 60_000 }, // +1 min
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].total).toBe(2);
  });

  it('places events 6 min apart into different buckets (< 2h span → 5 min buckets)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 6 * 60_000 }, // +6 min → next 5-min bucket
    ];
    const buckets = buildSparklineBuckets(events);
    const filled = buckets.filter((b) => b.total > 0);
    expect(filled.length).toBe(2);
  });

  it('counts good and failed correctly', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, isFailedRoam: false },
      { timestamp: BASE + 1_000, isFailedRoam: true },
      { timestamp: BASE + 2_000, isFailedRoam: true },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].total).toBe(3);
    expect(buckets[0].good).toBe(1);
    expect(buckets[0].failed).toBe(2);
  });

  it('avgDataRate is null when no events have dataRate', () => {
    const events: RoamingEventForSparkline[] = [{ timestamp: BASE }, { timestamp: BASE + 1_000 }];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBeNull();
  });

  it('computes avgDataRate correctly', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, dataRate: 100 },
      { timestamp: BASE + 1_000, dataRate: 200 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBe(150);
  });

  it('omits null dataRate events from the average', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, dataRate: 300 },
      { timestamp: BASE + 1_000 }, // no dataRate
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBe(300);
  });

  it('uses 30-min buckets for spans between 2h and 24h', () => {
    // 3h span → 30 min buckets → expect ~7 buckets
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 3 * 3_600_000 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThanOrEqual(6);
    expect(buckets.length).toBeLessThanOrEqual(10);
  });

  it('uses 4-hour buckets for spans between 24h and 7d', () => {
    // 48h span → 4h buckets → expect ~13 buckets
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 48 * 3_600_000 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThanOrEqual(12);
    expect(buckets.length).toBeLessThanOrEqual(15);
  });

  it('good = total - failed (no undefined state)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE }, // no isFailedRoam → good
      { timestamp: BASE + 500, isFailedRoam: true }, // failed
    ];
    const buckets = buildSparklineBuckets(events);
    const b = buckets[0];
    expect(b.good + b.failed).toBe(b.total);
  });
});
