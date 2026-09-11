import { describe, it, expect } from 'vitest';
import { darkRunSeconds, lightRunSeconds, evaluateSide } from './lightSignal.js';

const NOW = new Date('2026-09-11T20:00:00Z');
const agoS = (s) => new Date(NOW.getTime() - s * 1000);

/** Newest-first sample list, one every 15s, with the given raw values. */
function feed(values, { startSecondsAgo = 0, stepSeconds = 15 } = {}) {
  return values.map((raw, i) => ({
    raw,
    observedAt: agoS(startSecondsAgo + i * stepSeconds),
    reportedState: raw == null ? 'unknown' : raw <= 3 ? 'dark' : 'light',
  }));
}

const DARK = { threshold: 3, persistenceSeconds: 120, now: NOW };
const LIGHT = { threshold: 6, persistenceSeconds: 60, now: NOW };

describe('darkRunSeconds', () => {
  it('satisfies persistence after a sustained dark run', () => {
    const r = darkRunSeconds(feed([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]), DARK);
    expect(r.seconds).toBeGreaterThanOrEqual(120);
    expect(r.satisfied).toBe(true);
  });

  it('does not fire on a momentary dark reading', () => {
    const r = darkRunSeconds(feed([2, 40, 41, 39]), DARK);
    expect(r.seconds).toBeLessThan(120);
    expect(r.satisfied).toBe(false);
  });

  it('a single reading above threshold resets the run', () => {
    // dark for a long time, but one flash of light 30s ago.
    const samples = [...feed([2, 2]), { raw: 50, observedAt: agoS(30) }, ...feed([2, 2, 2, 2, 2, 2], { startSecondsAgo: 45 })];
    const r = darkRunSeconds(samples, DARK);
    expect(r.satisfied).toBe(false);
  });

  it('treats a silent feed as unknown, never as dark', () => {
    expect(darkRunSeconds([], DARK).satisfied).toBe(false);
    expect(darkRunSeconds([], DARK).stale).toBe(true);
  });

  it('refuses to fire on a stale feed even if the last reading was dark', () => {
    const r = darkRunSeconds(
      [{ raw: 2, observedAt: agoS(600) }, { raw: 2, observedAt: agoS(615) }],
      DARK
    );
    expect(r.stale).toBe(true);
    expect(r.satisfied).toBe(false);
  });

  it('requires at least two samples so one report cannot trigger a shutdown', () => {
    const r = darkRunSeconds([{ raw: 2, observedAt: agoS(200) }], { ...DARK, staleAfterSeconds: 300 });
    expect(r.sampleCount).toBe(1);
    expect(r.satisfied).toBe(false);
  });

  it('falls back to the reported label when no numeric reading exists', () => {
    const samples = [
      { raw: null, reportedState: 'dark', observedAt: agoS(0) },
      { raw: null, reportedState: 'dark', observedAt: agoS(15) },
      { raw: null, reportedState: 'dark', observedAt: agoS(140) },
    ];
    expect(darkRunSeconds(samples, DARK).satisfied).toBe(true);
  });

  it('never reads "unknown" as dark', () => {
    const samples = [
      { raw: null, reportedState: 'unknown', observedAt: agoS(0) },
      { raw: null, reportedState: 'unknown', observedAt: agoS(200) },
    ];
    expect(darkRunSeconds(samples, DARK).satisfied).toBe(false);
  });
});

describe('lightRunSeconds', () => {
  it('satisfies recovery once light is back for long enough', () => {
    const r = lightRunSeconds(feed([50, 48, 52, 49, 51, 50]), LIGHT);
    expect(r.satisfied).toBe(true);
  });

  it('does not recover on a single bright sample', () => {
    expect(lightRunSeconds(feed([50, 2, 2, 2]), LIGHT).satisfied).toBe(false);
  });
});

describe('evaluateSide', () => {
  const serials = ['N1', 'N2', 'N3'];

  it('fires when a quorum of reporting sensors agree', () => {
    const map = new Map([
      ['N1', feed([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])],
      ['N2', feed([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])],
      ['N3', feed([50, 50, 50])],
    ]);
    const r = evaluateSide({ samplesByAp: map, serials, ...DARK, mode: 'dark' });
    expect(r.satisfiedCount).toBe(2);
    expect(r.reportingCount).toBe(3);
    expect(r.triggered).toBe(true);
  });

  it('never fires when nothing is reporting — a dead feed is not a dark room', () => {
    const r = evaluateSide({ samplesByAp: new Map(), serials, ...DARK, mode: 'dark' });
    expect(r.reportingCount).toBe(0);
    expect(r.triggered).toBe(false);
    expect(r.sensorSilentCount).toBe(3);
  });

  it('excludes silent sensors from the denominator and says how many', () => {
    const map = new Map([['N1', feed([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])]]);
    const r = evaluateSide({ samplesByAp: map, serials, ...DARK, mode: 'dark' });
    expect(r.reportingCount).toBe(1);
    expect(r.sensorSilentCount).toBe(2);
    expect(r.quorumRatio).toBe(1);
    expect(r.triggered).toBe(true);
  });

  it('does not fire below quorum', () => {
    const map = new Map([
      ['N1', feed([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])],
      ['N2', feed([50, 50, 50])],
      ['N3', feed([50, 50, 50])],
    ]);
    const r = evaluateSide({ samplesByAp: map, serials, ...DARK, mode: 'dark' });
    expect(r.quorumRatio).toBeCloseTo(1 / 3, 5);
    expect(r.triggered).toBe(false);
  });
});
