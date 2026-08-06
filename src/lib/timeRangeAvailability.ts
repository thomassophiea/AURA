/**
 * Turns raw per-day coverage from the store into what the date selector needs:
 * which days are selectable, which are only partly there, and a sentence saying
 * why.
 *
 * The rule this encodes is that a day is never presented as whole when it is
 * not. Two things make a day incomplete and they are different:
 *
 *   - **retention** truncates the oldest day. "7 days ago" as a local date began
 *     before `now - 7d`, so only its later hours still exist. This is expected
 *     and permanent, not a fault.
 *   - **gaps** mean the collector did not report for part of a day the store
 *     otherwise covers — a gateway outage, a redeploy, a paused source.
 *
 * Completeness is measured in local hour buckets rather than sample counts. The
 * collector's interval is configurable and differs per metric family, so "how
 * many samples should a full day have" is not answerable here; "did every hour
 * report something" is.
 */

import {
  endOfLocalDay,
  localDayAtOffset,
  type TimeRangeOption,
} from './timeRange';

export type DayAvailability =
  /** Every hour in scope reported. */
  | 'complete'
  /** Some hours are missing, or retention truncates the day. Still selectable. */
  | 'partial'
  /** Inside the window but nothing was stored. Not selectable. */
  | 'empty'
  /** Entirely older than retention. Not selectable. */
  | 'outside-retention'
  /** Coverage has not loaded yet. Selectable — never lock the selector on a pending fetch. */
  | 'unknown';

export interface DayCoverageStatus {
  localDate: string;
  availability: DayAvailability;
  selectable: boolean;
  sampleCount: number;
  hoursPresent: number;
  /** Hours that *could* have reported, after retention and "now" are applied. */
  expectedHours: number;
  /** 0…1. */
  completeness: number;
  clippedByRetention: boolean;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** One sentence for the UI, or null when the day is unremarkable. */
  note: string | null;
}

/**
 * A day short of this fraction of its hours is flagged partial.
 *
 * Not 1.0: the current hour is always in progress, and a single skipped poll at
 * an hour boundary should not brand a whole day incomplete. At 0.95 a 24-hour
 * day tolerates roughly one missing hour.
 */
const COMPLETE_THRESHOLD = 0.95;

/**
 * Count local hour buckets spanned, inclusive of both ends.
 *
 * Aligned to local hours rather than to `Math.floor(ms / 3600000)`, because that
 * only agrees with local hours in zones whose offset is a whole number of hours
 * — it would be off by one everywhere in India and Nepal. Matches the
 * `date_trunc('hour', … AT TIME ZONE …)` grouping the store performs.
 */
export function localHourBuckets(from: Date, to: Date): number {
  const startHour = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours());
  const endHour = new Date(to.getFullYear(), to.getMonth(), to.getDate(), to.getHours());
  if (endHour.getTime() < startHour.getTime()) return 0;
  return Math.round((endHour.getTime() - startHour.getTime()) / 3_600_000) + 1;
}

export interface CoverageDayInput {
  localDate: string;
  sampleCount: number;
  hoursPresent: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface EvaluateCoverageParams {
  /** Day options from `timeRangeOptions`, in the same local calendar. */
  options: TimeRangeOption[];
  /** Rows from `/api/monitoring/coverage`. Null while loading. */
  days: CoverageDayInput[] | null;
  /** Oldest retained instant, from coverage meta. Null while loading. */
  retentionStart: Date | null;
  retentionDays: number;
  /** True when the store has never held a sample for this scope. */
  neverCollected: boolean;
  now: Date;
}

/** Availability for each day option, keyed by local date. */
export function evaluateDayCoverage({
  options,
  days,
  retentionStart,
  retentionDays,
  neverCollected,
  now,
}: EvaluateCoverageParams): Map<string, DayCoverageStatus> {
  const byDate = new Map((days ?? []).map((day) => [day.localDate, day]));
  const result = new Map<string, DayCoverageStatus>();

  for (const option of options) {
    if (option.dayOffset === null || option.localDate === null) continue;

    const dayStart = localDayAtOffset(option.dayOffset, now);
    const dayEndRaw = endOfLocalDay(dayStart);
    // An in-progress day is only expected to cover the hours that have happened.
    const dayEnd = dayEndRaw.getTime() > now.getTime() ? now : dayEndRaw;

    const row = byDate.get(option.localDate);
    const base = {
      localDate: option.localDate,
      sampleCount: row?.sampleCount ?? 0,
      hoursPresent: row?.hoursPresent ?? 0,
      firstObservedAt: row?.firstObservedAt ?? null,
      lastObservedAt: row?.lastObservedAt ?? null,
    };

    // Coverage has not arrived. Report unknown and keep the option usable:
    // greying out every day until a fetch resolves is worse than a brief
    // moment without completeness annotations.
    if (days === null || retentionStart === null) {
      result.set(option.localDate, {
        ...base,
        availability: 'unknown',
        selectable: true,
        expectedHours: localHourBuckets(dayStart, dayEnd),
        completeness: 0,
        clippedByRetention: false,
        note: null,
      });
      continue;
    }

    const clippedByRetention = dayStart.getTime() < retentionStart.getTime();
    const effectiveStart = clippedByRetention ? retentionStart : dayStart;

    // The whole day predates retention: the data is gone, not missing.
    if (effectiveStart.getTime() >= dayEnd.getTime()) {
      result.set(option.localDate, {
        ...base,
        availability: 'outside-retention',
        selectable: false,
        expectedHours: 0,
        completeness: 0,
        clippedByRetention: true,
        note: `Outside the ${retentionDays}-day retention window.`,
      });
      continue;
    }

    const expectedHours = localHourBuckets(effectiveStart, dayEnd);
    const completeness = expectedHours > 0 ? Math.min(1, base.hoursPresent / expectedHours) : 0;

    if (base.sampleCount === 0) {
      result.set(option.localDate, {
        ...base,
        availability: 'empty',
        selectable: false,
        expectedHours,
        completeness: 0,
        clippedByRetention,
        note: neverCollected
          ? 'No monitoring data has been collected yet.'
          : 'No data was stored for this day.',
      });
      continue;
    }

    const isPartial = clippedByRetention || completeness < COMPLETE_THRESHOLD;

    result.set(option.localDate, {
      ...base,
      availability: isPartial ? 'partial' : 'complete',
      selectable: true,
      expectedHours,
      completeness,
      clippedByRetention,
      note: describePartialDay({
        clippedByRetention,
        retentionDays,
        hoursPresent: base.hoursPresent,
        expectedHours,
        isPartial,
      }),
    });
  }

  return result;
}

function describePartialDay({
  clippedByRetention,
  retentionDays,
  hoursPresent,
  expectedHours,
  isPartial,
}: {
  clippedByRetention: boolean;
  retentionDays: number;
  hoursPresent: number;
  expectedHours: number;
  isPartial: boolean;
}): string | null {
  if (!isPartial) return null;
  if (clippedByRetention) {
    return `Only the part of this day inside the ${retentionDays}-day retention window is stored (${hoursPresent} of ${expectedHours} retained hours reported).`;
  }
  return `Incomplete: ${hoursPresent} of ${expectedHours} hours reported.`;
}

/**
 * One-line summary of the selected window's completeness, for the header.
 * Returns null when there is nothing worth saying.
 */
export function describeSelectedCoverage(
  status: DayCoverageStatus | undefined
): { severity: 'info' | 'warning'; message: string } | null {
  if (!status) return null;
  switch (status.availability) {
    case 'outside-retention':
      return { severity: 'warning', message: status.note ?? 'Outside the retention window.' };
    case 'empty':
      return { severity: 'warning', message: status.note ?? 'No data stored for this day.' };
    case 'partial':
      return { severity: 'info', message: status.note ?? 'This day has incomplete data.' };
    default:
      return null;
  }
}
