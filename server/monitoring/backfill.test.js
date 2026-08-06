import { describe, it, expect, vi } from 'vitest';

import {
  planCollectionWindow,
  supportedDurations,
  probeDurations,
  describeUnrecoverableGap,
  capabilitiesAreStale,
  DURATIONS,
} from './backfill.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const ALL_SUPPORTED = { durations: { '3H': true, '24H': true, '7D': true, '30D': true } };
// What XCC 10.18.1.0-011R actually does: only 3H works.
const ONLY_3H = { durations: { '3H': true, '24H': false, '7D': false, '30D': false } };

describe('supportedDurations', () => {
  it('assumes only 3H until a source has been probed', () => {
    expect(supportedDurations(null).map((d) => d.token)).toEqual(['3H']);
    expect(supportedDurations({}).map((d) => d.token)).toEqual(['3H']);
  });

  it('returns the probed set in ascending order', () => {
    expect(supportedDurations(ALL_SUPPORTED).map((d) => d.token)).toEqual([
      '3H',
      '24H',
      '7D',
      '30D',
    ]);
  });

  it('falls back to 3H when a probe found nothing usable', () => {
    const none = { durations: { '3H': false, '24H': false, '7D': false, '30D': false } };
    expect(supportedDurations(none).map((d) => d.token)).toEqual(['3H']);
  });
});

describe('planCollectionWindow', () => {
  it('takes the largest supported window inside retention on first contact', () => {
    const plan = planCollectionWindow({
      cursor: null,
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('7D');
    expect(plan.reason).toBe('initial');
  });

  it('never requests more history than retention keeps', () => {
    const plan = planCollectionWindow({
      cursor: null,
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 1,
    });
    expect(plan.duration).toBe('24H');
  });

  it('uses the smallest window for a routine incremental poll', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 5 * 60 * 1000),
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('3H');
    expect(plan.reason).toBe('incremental');
    expect(plan.fullyCovered).toBe(true);
  });

  it('escalates to a longer window after a multi-hour outage', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 10 * 60 * 60 * 1000),
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('24H');
    expect(plan.reason).toBe('backfill');
    expect(plan.fullyCovered).toBe(true);
  });

  it('covers a two-day outage with the 7D window when supported', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 48 * 60 * 60 * 1000),
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('7D');
    expect(plan.fullyCovered).toBe(true);
  });

  it('does not escalate past what the source supports', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 48 * 60 * 60 * 1000),
      now: NOW,
      capabilities: ONLY_3H,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('3H');
  });

  it('reports a gap it cannot cover instead of pretending it can', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 48 * 60 * 60 * 1000),
      now: NOW,
      capabilities: ONLY_3H,
      retentionDays: 7,
    });
    expect(plan.fullyCovered).toBe(false);
  });

  it('caps the requested window at retention even after a very long outage', () => {
    const plan = planCollectionWindow({
      cursor: new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000),
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(plan.duration).toBe('7D');
    expect(plan.gapHours).toBe(7 * 24);
  });

  it('pairs each duration with the resolution the UI already uses', () => {
    for (const { token, defaultResolution } of DURATIONS) {
      const plan = planCollectionWindow({
        cursor: null,
        now: NOW,
        capabilities: { durations: { [token]: true } },
        retentionDays: 30,
      });
      if (plan.duration === token) expect(plan.resolution).toBe(defaultResolution);
    }
  });
});

describe('describeUnrecoverableGap', () => {
  it('describes the portion of an outage the source cannot replay', () => {
    const cursor = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const plan = planCollectionWindow({
      cursor,
      now: NOW,
      capabilities: ONLY_3H,
      retentionDays: 7,
    });
    const gap = describeUnrecoverableGap(plan, cursor);
    expect(gap.hours).toBeCloseTo(45, 1);
    expect(gap.reason).toContain('3H');
  });

  it('returns null when the window covers everything', () => {
    const cursor = new Date(NOW.getTime() - 60 * 1000);
    const plan = planCollectionWindow({
      cursor,
      now: NOW,
      capabilities: ALL_SUPPORTED,
      retentionDays: 7,
    });
    expect(describeUnrecoverableGap(plan, cursor)).toBeNull();
  });
});

describe('probeDurations', () => {
  it('records which windows the source actually accepts', async () => {
    const attempt = vi.fn(async (duration) => ({ ok: duration === '3H', status: duration === '3H' ? 200 : 500 }));
    expect(await probeDurations(attempt)).toEqual({
      durations: { '3H': true, '24H': false, '7D': false, '30D': false },
    });
  });

  it('treats a thrown probe as unsupported rather than aborting the sweep', async () => {
    const attempt = vi.fn(async (duration) => {
      if (duration === '24H') throw new Error('boom');
      return { ok: true, status: 200 };
    });
    const result = await probeDurations(attempt);
    expect(result.durations['24H']).toBe(false);
    expect(result.durations['7D']).toBe(true);
  });

  it('probes every known duration', async () => {
    const attempt = vi.fn(async () => ({ ok: true, status: 200 }));
    await probeDurations(attempt);
    expect(attempt).toHaveBeenCalledTimes(DURATIONS.length);
  });
});

describe('capabilitiesAreStale', () => {
  it('is stale when never probed', () => {
    expect(capabilitiesAreStale(null, NOW)).toBe(true);
    expect(capabilitiesAreStale({}, NOW)).toBe(true);
  });

  it('is fresh just after a probe', () => {
    expect(
      capabilitiesAreStale({ durationsProbedAt: new Date(NOW.getTime() - 1000).toISOString() }, NOW)
    ).toBe(false);
  });

  it('is stale after a day', () => {
    const old = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(capabilitiesAreStale({ durationsProbedAt: old }, NOW)).toBe(true);
  });

  it('is stale for an unparseable timestamp', () => {
    expect(capabilitiesAreStale({ durationsProbedAt: 'not-a-date' }, NOW)).toBe(true);
  });
});
