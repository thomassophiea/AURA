import { describe, it, expect } from 'vitest';
import { normalizeLux, commitTransition, DEFAULT_THRESHOLDS, DEFAULT_HYSTERESIS } from './lightState.js';

describe('normalizeLux', () => {
  it('classifies by lux thresholds', () => {
    expect(normalizeLux(500, null, DEFAULT_THRESHOLDS)).toBe('bright');
    expect(normalizeLux(50, null, DEFAULT_THRESHOLDS)).toBe('dim');
    expect(normalizeLux(2, null, DEFAULT_THRESHOLDS)).toBe('dark');
  });

  it('falls back to reported state when lux is absent', () => {
    expect(normalizeLux(null, 'light', DEFAULT_THRESHOLDS)).toBe('bright');
    expect(normalizeLux(undefined, 'dark', DEFAULT_THRESHOLDS)).toBe('dark');
  });

  it('is unknown when neither lux nor a usable reported state exists', () => {
    expect(normalizeLux(null, 'unknown', DEFAULT_THRESHOLDS)).toBe('unknown');
    expect(normalizeLux(null, null, DEFAULT_THRESHOLDS)).toBe('unknown');
  });
});

describe('commitTransition', () => {
  it('keeps the previous state until the candidate survives its dwell', () => {
    const prev = { state: 'bright', since: 0 };
    const res = commitTransition(prev, 'dark', 60, DEFAULT_HYSTERESIS); // 1 min < 30 min
    expect(res).toEqual({ state: 'bright', committed: false });
  });

  it('commits dark once the dark dwell elapses', () => {
    const prev = { state: 'bright', since: 0 };
    const res = commitTransition(prev, 'dark', 30 * 60, DEFAULT_HYSTERESIS);
    expect(res).toEqual({ state: 'dark', committed: true });
  });

  it('uses restore dwell when returning toward bright', () => {
    const prev = { state: 'dark', since: 0 };
    expect(commitTransition(prev, 'bright', 60, DEFAULT_HYSTERESIS)).toEqual({ state: 'dark', committed: false });
    expect(commitTransition(prev, 'bright', 5 * 60, DEFAULT_HYSTERESIS)).toEqual({ state: 'bright', committed: true });
  });

  it('never treats unknown as a committed dark', () => {
    const prev = { state: 'bright', since: 0 };
    expect(commitTransition(prev, 'unknown', 999999, DEFAULT_HYSTERESIS)).toEqual({ state: 'unknown', committed: true });
  });

  it('no-op when candidate equals current state', () => {
    const prev = { state: 'dim', since: 0 };
    expect(commitTransition(prev, 'dim', 999, DEFAULT_HYSTERESIS)).toEqual({ state: 'dim', committed: false });
  });
});
