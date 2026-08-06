import { describe, it, expect } from 'vitest';

import { computeCounterDelta, computeCounterDeltaSeries } from './counterDelta.js';

const at = (iso) => new Date(iso);

describe('computeCounterDelta', () => {
  it('returns null when there is no previous reading — the first sample is not an interval', () => {
    const result = computeCounterDelta(null, { value: 500, observedAt: at('2026-08-05T00:05:00Z') });
    expect(result).toBeNull();
  });

  it('subtracts consecutive readings of a monotonic counter', () => {
    const result = computeCounterDelta(
      { value: 500, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 1500, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result).toMatchObject({
      delta: 1000,
      qualityState: 'observed',
      intervalSeconds: 300,
    });
  });

  it('reports a zero delta for an idle counter rather than suppressing the point', () => {
    const result = computeCounterDelta(
      { value: 500, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 500, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result.delta).toBe(0);
    expect(result.qualityState).toBe('observed');
  });

  it('detects a counter reset (device reboot / client reassociation) and does not emit a negative delta', () => {
    const result = computeCounterDelta(
      { value: 9_000_000, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 120, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result.delta).toBeNull();
    expect(result.qualityState).toBe('counter_reset');
  });

  it('never invents post-reset traffic by treating the new reading as the delta', () => {
    const result = computeCounterDelta(
      { value: 9_000_000, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 120, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result.delta).not.toBe(120);
  });

  it('returns null for a non-advancing timestamp instead of dividing by a zero interval', () => {
    const result = computeCounterDelta(
      { value: 100, observedAt: at('2026-08-05T00:05:00Z') },
      { value: 200, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result).toBeNull();
  });

  it('returns null when the reading goes backwards in time', () => {
    const result = computeCounterDelta(
      { value: 100, observedAt: at('2026-08-05T00:10:00Z') },
      { value: 200, observedAt: at('2026-08-05T00:05:00Z') }
    );
    expect(result).toBeNull();
  });

  it('flags a gap longer than maxIntervalSeconds as partial rather than attributing it all to one bucket', () => {
    const result = computeCounterDelta(
      { value: 0, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 5000, observedAt: at('2026-08-05T06:00:00Z') },
      { maxIntervalSeconds: 900 }
    );
    expect(result.delta).toBe(5000);
    expect(result.qualityState).toBe('partial');
  });
});

describe('computeCounterDeltaSeries', () => {
  it('produces one fewer delta than there are readings', () => {
    const readings = [
      { value: 0, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 100, observedAt: at('2026-08-05T00:05:00Z') },
      { value: 250, observedAt: at('2026-08-05T00:10:00Z') },
    ];
    const deltas = computeCounterDeltaSeries(readings);
    expect(deltas.map((d) => d.delta)).toEqual([100, 150]);
  });

  it('sorts unordered readings before differencing', () => {
    const readings = [
      { value: 250, observedAt: at('2026-08-05T00:10:00Z') },
      { value: 0, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 100, observedAt: at('2026-08-05T00:05:00Z') },
    ];
    const deltas = computeCounterDeltaSeries(readings);
    expect(deltas.map((d) => d.delta)).toEqual([100, 150]);
  });

  it('carries a reset through as a null delta and resumes normally afterwards', () => {
    const readings = [
      { value: 900, observedAt: at('2026-08-05T00:00:00Z') },
      { value: 10, observedAt: at('2026-08-05T00:05:00Z') },
      { value: 60, observedAt: at('2026-08-05T00:10:00Z') },
    ];
    const deltas = computeCounterDeltaSeries(readings);
    expect(deltas[0]).toMatchObject({ delta: null, qualityState: 'counter_reset' });
    expect(deltas[1]).toMatchObject({ delta: 50, qualityState: 'observed' });
  });

  it('returns an empty array for zero or one reading', () => {
    expect(computeCounterDeltaSeries([])).toEqual([]);
    expect(computeCounterDeltaSeries([{ value: 1, observedAt: at('2026-08-05T00:00:00Z') }])).toEqual(
      []
    );
  });
});
