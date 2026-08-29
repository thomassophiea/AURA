import { describe, it, expect } from 'vitest';
import {
  isQuietHour,
  filterForRouting,
  alertsToEscalate,
  hourInZone,
  DEFAULT_QUIET_HOURS,
} from './alertRouting.js';

const at = (iso) => new Date(iso);

describe('quiet hours', () => {
  it('is off when disabled', () => {
    expect(isQuietHour({ ...DEFAULT_QUIET_HOURS, enabled: false })).toBe(false);
  });

  it('handles a same-day window', () => {
    const quiet = { enabled: true, startHour: 9, endHour: 17, tz: 'UTC' };
    expect(isQuietHour(quiet, at('2026-08-29T10:00:00Z'))).toBe(true);
    expect(isQuietHour(quiet, at('2026-08-29T08:59:00Z'))).toBe(false);
    expect(isQuietHour(quiet, at('2026-08-29T17:00:00Z'))).toBe(false); // end exclusive
  });

  it('handles a window that wraps midnight (22:00–07:00)', () => {
    const quiet = { enabled: true, startHour: 22, endHour: 7, tz: 'UTC' };
    expect(isQuietHour(quiet, at('2026-08-29T23:30:00Z'))).toBe(true);
    expect(isQuietHour(quiet, at('2026-08-29T03:00:00Z'))).toBe(true);
    expect(isQuietHour(quiet, at('2026-08-29T12:00:00Z'))).toBe(false);
  });

  it('respects the timezone', () => {
    // 02:00 UTC is 22:00 previous day in New York (UTC-4 in August)
    const quiet = { enabled: true, startHour: 22, endHour: 7, tz: 'America/New_York' };
    expect(isQuietHour(quiet, at('2026-08-29T02:00:00Z'))).toBe(true);
    expect(hourInZone(at('2026-08-29T02:00:00Z'), 'America/New_York')).toBe(22);
  });
});

describe('filterForRouting', () => {
  const crit = { id: 'c', severity: 'critical' };
  const warn = { id: 'w', severity: 'warning' };
  const day = at('2026-08-29T12:00:00Z');
  const night = at('2026-08-29T23:00:00Z');
  const quiet = { enabled: true, startHour: 22, endHour: 7, tz: 'UTC', allowCritical: true };

  it('routes both severities by default outside quiet hours', () => {
    const out = filterForRouting([crit, warn], { minSeverity: 'warning', quiet }, day);
    expect(out.map((a) => a.id)).toEqual(['c', 'w']);
  });

  it('critical-only min severity drops warnings', () => {
    const out = filterForRouting([crit, warn], { minSeverity: 'critical', quiet }, day);
    expect(out.map((a) => a.id)).toEqual(['c']);
  });

  it('during quiet hours, only criticals route', () => {
    const out = filterForRouting([crit, warn], { minSeverity: 'warning', quiet }, night);
    expect(out.map((a) => a.id)).toEqual(['c']);
  });

  it('quiet hours can suppress even criticals when allowCritical is false', () => {
    const q = { ...quiet, allowCritical: false };
    expect(filterForRouting([crit, warn], { minSeverity: 'warning', quiet: q }, night)).toEqual([]);
  });
});

describe('escalation', () => {
  const esc = { enabled: true, afterMinutes: 30 };
  const now = at('2026-08-29T12:00:00Z');
  const stale = { id: 'a', severity: 'critical', firstSeenAt: '2026-08-29T11:00:00Z', acknowledgedAt: null, resolvedAt: null };
  const fresh = { id: 'b', severity: 'critical', firstSeenAt: '2026-08-29T11:55:00Z', acknowledgedAt: null, resolvedAt: null };

  it('escalates an unacked critical past the threshold', () => {
    expect(alertsToEscalate([stale, fresh], esc, new Set(), now).map((a) => a.id)).toEqual(['a']);
  });

  it('does not escalate acknowledged, resolved, warning, or already-escalated alerts', () => {
    const acked = { ...stale, id: 'ack', acknowledgedAt: '2026-08-29T11:30:00Z' };
    const resolved = { ...stale, id: 'res', resolvedAt: '2026-08-29T11:40:00Z' };
    const warnStale = { ...stale, id: 'warn', severity: 'warning' };
    const out = alertsToEscalate([acked, resolved, warnStale, stale], esc, new Set(['a']), now);
    expect(out).toEqual([]);
  });

  it('is off when disabled', () => {
    expect(alertsToEscalate([stale], { enabled: false, afterMinutes: 30 }, new Set(), now)).toEqual(
      []
    );
  });
});
