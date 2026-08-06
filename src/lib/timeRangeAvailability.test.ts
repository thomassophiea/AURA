import { describe, it, expect } from 'vitest';

import { timeRangeOptions, localDateKey, localDayAtOffset } from './timeRange';
import {
  describeSelectedCoverage,
  evaluateDayCoverage,
  localHourBuckets,
  type CoverageDayInput,
} from './timeRangeAvailability';

const NOW = new Date(2026, 7, 6, 15, 50, 0, 0); // 2026-08-06 15:50 local
const RETENTION_DAYS = 7;

/** Local midnight `offset` days back, as the retention floor would express it. */
const dayKey = (offset: number) => localDateKey(localDayAtOffset(offset, NOW));

function dayOptions(maxDayOffset = RETENTION_DAYS) {
  const groups = timeRangeOptions({ now: NOW, maxDayOffset });
  return groups.find((group) => group.id === 'day')!.options;
}

function fullDay(offset: number, overrides: Partial<CoverageDayInput> = {}): CoverageDayInput {
  const start = localDayAtOffset(offset, NOW);
  return {
    localDate: localDateKey(start),
    sampleCount: 288,
    hoursPresent: 24,
    firstObservedAt: start.toISOString(),
    lastObservedAt: new Date(start.getTime() + 23 * 3_600_000).toISOString(),
    ...overrides,
  };
}

function evaluate(days: CoverageDayInput[] | null, overrides: Record<string, unknown> = {}) {
  return evaluateDayCoverage({
    options: dayOptions(),
    days,
    // 7 days back from now, i.e. partway through the oldest calendar day.
    retentionStart: new Date(NOW.getTime() - RETENTION_DAYS * 24 * 3_600_000),
    retentionDays: RETENTION_DAYS,
    neverCollected: false,
    now: NOW,
    ...overrides,
  });
}

describe('localHourBuckets', () => {
  it('counts inclusive local hour buckets', () => {
    const from = new Date(2026, 7, 6, 0, 0, 0, 0);
    expect(localHourBuckets(from, new Date(2026, 7, 6, 0, 59, 59, 999))).toBe(1);
    expect(localHourBuckets(from, new Date(2026, 7, 6, 1, 0, 0, 0))).toBe(2);
    expect(localHourBuckets(from, new Date(2026, 7, 6, 23, 59, 59, 999))).toBe(24);
  });

  it('returns zero for an inverted span', () => {
    expect(
      localHourBuckets(new Date(2026, 7, 6, 10), new Date(2026, 7, 6, 9))
    ).toBe(0);
  });
});

describe('evaluateDayCoverage', () => {
  it('marks a fully reported past day complete and selectable', () => {
    const statuses = evaluate([fullDay(2)]);
    const day = statuses.get(dayKey(2))!;
    expect(day.availability).toBe('complete');
    expect(day.selectable).toBe(true);
    expect(day.completeness).toBe(1);
    expect(day.note).toBeNull();
  });

  it('marks a day with missing hours partial but still selectable', () => {
    const statuses = evaluate([fullDay(3, { hoursPresent: 14, sampleCount: 168 })]);
    const day = statuses.get(dayKey(3))!;
    expect(day.availability).toBe('partial');
    expect(day.selectable).toBe(true);
    expect(day.note).toMatch(/14 of 24 hours/);
  });

  it('tolerates a single missing hour rather than flagging the whole day', () => {
    // One skipped poll at an hour boundary is not a data-quality story.
    const statuses = evaluate([fullDay(3, { hoursPresent: 23 })]);
    expect(statuses.get(dayKey(3))!.availability).toBe('complete');
    expect(statuses.get(dayKey(3))!.completeness).toBeCloseTo(23 / 24, 3);
  });

  it('flags a day once more than one hour is missing', () => {
    const statuses = evaluate([fullDay(3, { hoursPresent: 22 })]);
    expect(statuses.get(dayKey(3))!.availability).toBe('partial');
  });

  it('disables a day with nothing stored', () => {
    const statuses = evaluate([fullDay(1)]); // day 4 absent from coverage
    const day = statuses.get(dayKey(4))!;
    expect(day.availability).toBe('empty');
    expect(day.selectable).toBe(false);
    expect(day.note).toMatch(/No data was stored/);
  });

  it('says nothing has ever been collected when that is the situation', () => {
    const statuses = evaluate([], { neverCollected: true });
    expect(statuses.get(dayKey(2))!.note).toMatch(/has been collected yet/i);
  });

  it('treats the oldest day as partial because retention truncates it', () => {
    // Retention starts partway through this day, so even a fully reported set of
    // retained hours is not the whole calendar day.
    const statuses = evaluate([fullDay(7, { hoursPresent: 9 })]);
    const day = statuses.get(dayKey(7))!;
    expect(day.availability).toBe('partial');
    expect(day.selectable).toBe(true);
    expect(day.clippedByRetention).toBe(true);
    expect(day.expectedHours).toBeLessThan(24);
    expect(day.note).toMatch(/retention window/);
  });

  it('never reports a retention-clipped day as complete even at full coverage', () => {
    const statuses = evaluate([fullDay(7, { hoursPresent: 24 })]);
    expect(statuses.get(dayKey(7))!.availability).toBe('partial');
  });

  it('disables a day that is entirely older than retention', () => {
    const statuses = evaluateDayCoverage({
      options: dayOptions(7),
      days: [],
      // Retention floor pulled forward to 3 days ago: days 4..7 are gone.
      retentionStart: localDayAtOffset(3, NOW),
      retentionDays: 3,
      neverCollected: false,
      now: NOW,
    });
    expect(statuses.get(dayKey(5))!.availability).toBe('outside-retention');
    expect(statuses.get(dayKey(5))!.selectable).toBe(false);
    expect(statuses.get(dayKey(5))!.note).toMatch(/retention window/);
  });

  it('expects only the elapsed hours of today, not a full 24', () => {
    // 15:50 local → hour buckets 00..15 = 16.
    const statuses = evaluate([fullDay(0, { hoursPresent: 16 })]);
    const today = statuses.get(dayKey(0))!;
    expect(today.expectedHours).toBe(16);
    expect(today.availability).toBe('complete');
  });

  it('keeps every day usable while coverage is still loading', () => {
    const statuses = evaluate(null, { retentionStart: null });
    for (const status of statuses.values()) {
      expect(status.availability).toBe('unknown');
      expect(status.selectable).toBe(true);
    }
  });

  it('covers every offered day exactly once', () => {
    const statuses = evaluate([fullDay(1)]);
    expect(statuses.size).toBe(8);
  });
});

describe('describeSelectedCoverage', () => {
  it('warns for an unavailable day and informs for a partial one', () => {
    const statuses = evaluate([fullDay(3, { hoursPresent: 10 })]);
    expect(describeSelectedCoverage(statuses.get(dayKey(3)))).toEqual({
      severity: 'info',
      message: expect.stringMatching(/Incomplete/),
    });
    expect(describeSelectedCoverage(statuses.get(dayKey(4)))!.severity).toBe('warning');
  });

  it('stays quiet for a complete day', () => {
    const statuses = evaluate([fullDay(2)]);
    expect(describeSelectedCoverage(statuses.get(dayKey(2)))).toBeNull();
  });

  it('stays quiet when there is no status to describe', () => {
    expect(describeSelectedCoverage(undefined)).toBeNull();
  });
});
