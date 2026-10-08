import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  describeActivation,
  mergeDayStatuses,
  operatorTimeZone,
  powerSourceLabel,
  timeZoneLabel,
  DEFAULT_OPERATOR_TIME_ZONE,
} from './energyCalc';

afterEach(() => vi.restoreAllMocks());

const day = (availability: string, selectable: boolean, completeness: number) => ({
  availability,
  selectable,
  completeness,
});

describe('mergeDayStatuses', () => {
  it('takes the better of the measured and report coverage per day', () => {
    const measured = new Map([
      ['2026-10-07', day('complete', true, 1)],
      ['2026-10-01', day('empty', false, 0)],
    ]);
    const report = new Map([
      ['2026-10-07', day('partial', true, 0.4)],
      ['2026-10-01', day('partial', true, 0.6)],
      ['2026-09-30', day('partial', true, 0.2)],
    ]);
    const merged = mergeDayStatuses(measured, report);
    expect(merged.get('2026-10-07')?.availability).toBe('complete');
    // Measured has nothing that day; the fallback series makes it selectable.
    expect(merged.get('2026-10-01')).toMatchObject({ availability: 'partial', selectable: true });
    expect(merged.get('2026-09-30')?.completeness).toBe(0.2);
  });
});

describe('describeActivation', () => {
  it('reports real counts and reasons', () => {
    expect(
      describeActivation({
        targetCount: 3,
        appliedCount: 1,
        effectiveCount: 0,
        skippedCount: 1,
        failedCount: 1,
        skipped: [{ reason: 'already_in_target_state' }],
        failed: [{ reason: 'write_failed' }],
      })
    ).toBe(
      'Applied to 1/3 Treatment AP(s); 0 confirmed off the air; 1 skipped (1 already disabled); 1 failed (1 write failed).'
    );
  });

  it('labels a simulation as having written nothing', () => {
    expect(describeActivation({ simulated: true })).toMatch(/no controller writes/);
  });
});

describe('time zone and provenance labels', () => {
  it('uses the browser zone and falls back to America/New_York', () => {
    expect(operatorTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(operatorTimeZone()).toBe(DEFAULT_OPERATOR_TIME_ZONE);
  });

  it('formats a short zone label', () => {
    expect(timeZoneLabel('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe('EDT');
    expect(timeZoneLabel('Not/AZone')).toBe('Not/AZone');
  });

  it('labels each power source', () => {
    expect(powerSourceLabel('measured_ap_state')).toBe('Measured AP power');
    expect(powerSourceLabel('ap_report')).toMatch(/fallback/);
    expect(powerSourceLabel(null)).toBeNull();
  });
});
