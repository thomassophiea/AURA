import { describe, it, expect } from 'vitest';

import {
  controllerDurationFor,
  dayLabel,
  dayToken,
  endOfLocalDay,
  localDateKey,
  localDayAtOffset,
  normalizeTimeRangeToken,
  parseDayToken,
  resolveTimeRange,
  startOfLocalDay,
  timeRangeOptions,
  DEFAULT_TIME_RANGE_TOKEN,
} from './timeRange';

/**
 * All assertions are built from the local Date constructor rather than from ISO
 * literals, so the suite is correct in whatever timezone it runs in — which is
 * the whole point of the module.
 */
const NOW = new Date(2026, 7, 6, 15, 50, 12, 345); // 2026-08-06 15:50 local

describe('token parsing', () => {
  it('round-trips day tokens', () => {
    expect(dayToken(0)).toBe('day-0');
    expect(dayToken(7)).toBe('day-7');
    expect(parseDayToken('day-3')).toBe(3);
  });

  it('rejects non-day and malformed tokens', () => {
    expect(parseDayToken('24h')).toBeNull();
    expect(parseDayToken('day-')).toBeNull();
    expect(parseDayToken('day-x')).toBeNull();
    expect(parseDayToken('day--1')).toBeNull();
  });
});

describe('normalizeTimeRangeToken', () => {
  it('passes through known tokens', () => {
    expect(normalizeTimeRangeToken('7d')).toBe('7d');
    expect(normalizeTimeRangeToken('day-4')).toBe('day-4');
  });

  it('maps 30d down to the retention ceiling instead of serving an empty window', () => {
    expect(normalizeTimeRangeToken('30d')).toBe('7d');
  });

  it('falls back to the default for legacy custom and unknown values', () => {
    expect(normalizeTimeRangeToken('custom')).toBe(DEFAULT_TIME_RANGE_TOKEN);
    expect(normalizeTimeRangeToken('')).toBe(DEFAULT_TIME_RANGE_TOKEN);
    expect(normalizeTimeRangeToken(undefined)).toBe(DEFAULT_TIME_RANGE_TOKEN);
    expect(normalizeTimeRangeToken(42)).toBe(DEFAULT_TIME_RANGE_TOKEN);
  });

  it('clamps a day token past retention to the oldest available day', () => {
    expect(normalizeTimeRangeToken('day-12', 7)).toBe('day-7');
    expect(normalizeTimeRangeToken('day-2', 7)).toBe('day-2');
  });
});

describe('local day boundaries', () => {
  it('startOfLocalDay is local midnight', () => {
    const start = startOfLocalDay(NOW);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(6);
  });

  it('endOfLocalDay is one millisecond before the next local midnight', () => {
    const end = endOfLocalDay(NOW);
    const nextMidnight = new Date(2026, 7, 7, 0, 0, 0, 0);
    expect(end.getTime()).toBe(nextMidnight.getTime() - 1);
  });

  it('spans a full day even across a DST transition', () => {
    // US spring-forward 2026 is March 8. The day is 23 hours long there, and 24
    // in a zone without DST — both are "the whole day", which is what matters.
    const dstDay = new Date(2026, 2, 8, 12, 0, 0, 0);
    const start = startOfLocalDay(dstDay);
    const end = endOfLocalDay(dstDay);
    const hours = (end.getTime() + 1 - start.getTime()) / 3_600_000;
    expect([23, 24, 25]).toContain(hours);
    // Whatever the length, the boundaries are still midnight-to-midnight.
    expect(start.getHours()).toBe(0);
    expect(new Date(end.getTime() + 1).getDate()).toBe(9);
  });

  it('localDateKey does not shift the date into another day', () => {
    // A late-evening local time is already "tomorrow" in UTC for western zones;
    // toISOString would report the wrong day here.
    const lateEvening = new Date(2026, 7, 6, 23, 30, 0, 0);
    expect(localDateKey(lateEvening)).toBe('2026-08-06');
  });

  it('localDayAtOffset walks back calendar days, including across a month edge', () => {
    const augustFirst = new Date(2026, 7, 1, 9, 0, 0, 0);
    expect(localDateKey(localDayAtOffset(1, augustFirst))).toBe('2026-07-31');
    expect(localDateKey(localDayAtOffset(7, augustFirst))).toBe('2026-07-25');
  });
});

describe('resolveTimeRange — calendar days', () => {
  it('yesterday covers the whole previous calendar day', () => {
    const range = resolveTimeRange('day-1', NOW);
    expect(range.kind).toBe('calendar-day');
    expect(range.dayOffset).toBe(1);
    expect(range.localDate).toBe('2026-08-05');
    expect(range.start.getTime()).toBe(new Date(2026, 7, 5, 0, 0, 0, 0).getTime());
    expect(range.end.getTime()).toBe(new Date(2026, 7, 6, 0, 0, 0, 0).getTime() - 1);
    expect(range.label).toBe('Yesterday');
  });

  it('yesterday is not a rolling 24 hours', () => {
    const calendar = resolveTimeRange('day-1', NOW);
    const rolling = resolveTimeRange('24h', NOW);
    expect(calendar.startIso).not.toBe(rolling.startIso);
    expect(calendar.start.getHours()).toBe(0);
    expect(rolling.start.getHours()).toBe(NOW.getHours());
  });

  it('a finished day is not live, so callers stop polling the gateway for it', () => {
    expect(resolveTimeRange('day-1', NOW).isLive).toBe(false);
    expect(resolveTimeRange('day-7', NOW).isLive).toBe(false);
  });

  it('today runs from local midnight to now and stays live', () => {
    const range = resolveTimeRange('day-0', NOW);
    expect(range.start.getTime()).toBe(new Date(2026, 7, 6, 0, 0, 0, 0).getTime());
    expect(range.end.getTime()).toBe(NOW.getTime());
    expect(range.isLive).toBe(true);
    expect(range.label).toBe('Today');
    // No dead space padded onto the end of an in-progress day.
    expect(range.end.getTime()).toBeLessThan(endOfLocalDay(NOW).getTime());
  });

  it('labels intermediate offsets in the "N Days Ago" form', () => {
    expect(dayLabel(0)).toBe('Today');
    expect(dayLabel(1)).toBe('Yesterday');
    expect(dayLabel(2)).toBe('2 Days Ago');
    expect(dayLabel(7)).toBe('7 Days Ago');
    expect(resolveTimeRange('day-4', NOW).label).toBe('4 Days Ago');
  });

  it('states the selected date and both bounds in the header label', () => {
    const label = resolveTimeRange('day-1', NOW).rangeLabel;
    expect(label).toContain('2026');
    expect(label).toContain('–');
    // The date, not just a duration.
    expect(label.toLowerCase()).toContain('5');
  });
});

describe('resolveTimeRange — rolling windows', () => {
  it('ends at now and starts a fixed duration back', () => {
    const range = resolveTimeRange('7d', NOW);
    expect(range.kind).toBe('rolling');
    expect(range.end.getTime()).toBe(NOW.getTime());
    expect(range.durationMs).toBe(7 * 24 * 3_600_000);
    expect(range.isLive).toBe(true);
    expect(range.dayOffset).toBeNull();
    expect(range.localDate).toBeNull();
  });

  it('emits explicit ISO bounds for every token', () => {
    for (const token of ['15m', '1h', '24h', '3d', '7d', 'day-0', 'day-3']) {
      const range = resolveTimeRange(token, NOW);
      expect(range.startIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(range.endIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(range.startIso).getTime()).toBeLessThan(new Date(range.endIso).getTime());
    }
  });

  it('normalizes an unresolvable token rather than throwing', () => {
    expect(resolveTimeRange('nonsense', NOW).token).toBe(DEFAULT_TIME_RANGE_TOKEN);
  });
});

describe('timeRangeOptions', () => {
  it('offers every day inside retention plus the rolling windows', () => {
    const groups = timeRangeOptions({ now: NOW, maxDayOffset: 7 });
    const days = groups.find((group) => group.id === 'day')!;
    const recent = groups.find((group) => group.id === 'recent')!;

    expect(days.options).toHaveLength(8); // today .. 7 days ago
    expect(days.options.map((option) => option.token)).toEqual([
      'day-0',
      'day-1',
      'day-2',
      'day-3',
      'day-4',
      'day-5',
      'day-6',
      'day-7',
    ]);
    expect(recent.options.map((option) => option.token)).toEqual([
      '15m',
      '1h',
      '24h',
      '3d',
      '7d',
    ]);
  });

  it('carries the real date on each day option for joining against coverage', () => {
    const groups = timeRangeOptions({ now: NOW, maxDayOffset: 7 });
    const days = groups.find((group) => group.id === 'day')!;
    expect(days.options[0].localDate).toBe('2026-08-06');
    expect(days.options[1].localDate).toBe('2026-08-05');
    expect(days.options[7].localDate).toBe('2026-07-30');
    expect(days.options[1].detail).toBeTruthy();
  });

  it('shrinks with retention', () => {
    const groups = timeRangeOptions({ now: NOW, maxDayOffset: 2 });
    expect(groups.find((group) => group.id === 'day')!.options).toHaveLength(3);
  });
});

describe('controllerDurationFor', () => {
  it('maps live windows to the controller report duration tokens', () => {
    expect(controllerDurationFor(resolveTimeRange('24h', NOW))).toBe('24H');
    expect(controllerDurationFor(resolveTimeRange('7d', NOW))).toBe('7D');
    expect(controllerDurationFor(resolveTimeRange('15m', NOW))).toBe('15M');
  });

  it('returns null for a finished day — the controller cannot express "that Tuesday"', () => {
    expect(controllerDurationFor(resolveTimeRange('day-1', NOW))).toBeNull();
    expect(controllerDurationFor(resolveTimeRange('day-6', NOW))).toBeNull();
  });

  it('covers today with a duration long enough to reach back to midnight', () => {
    const earlyMorning = new Date(2026, 7, 6, 1, 30, 0, 0);
    expect(controllerDurationFor(resolveTimeRange('day-0', earlyMorning))).toBe('3H');
    expect(controllerDurationFor(resolveTimeRange('day-0', NOW))).toBe('24H');
  });
});
