import { describe, it, expect, afterEach } from 'vitest';
import {
  setOverride,
  shareAtHandover,
  recordShare,
  clearOverride,
  getOverride,
  evaluationSampleSource,
  describeOverride,
  __resetOverrides,
} from './demoOverrideRegistry.js';

afterEach(() => __resetOverrides());

describe('demoOverrideRegistry', () => {
  it('listens to the live sensor channel by default', () => {
    expect(evaluationSampleSource('src-1')).toBe('live');
    expect(describeOverride('src-1')).toEqual({ active: false, mode: 'live_sensor', projection: null });
  });

  it('switches the trigger to the simulated channel while an override is active', () => {
    // The real agents keep reporting during a demo. Mixing their "light" rows
    // into the evaluation resets the dark run and persistence never completes.
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now' });
    expect(evaluationSampleSource('src-1')).toBe('simulated');
  });

  it('scopes the override to one controller', () => {
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now' });
    expect(evaluationSampleSource('src-2')).toBe('live');
  });

  it('returns to the live channel when cleared', () => {
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now' });
    clearOverride('src-1');
    expect(evaluationSampleSource('src-1')).toBe('live');
    expect(getOverride('src-1')).toBeNull();
  });

  it('stops the emitter timer when cleared, so a reset really stops emitting', () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 1);
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now', timer });
    clearOverride('src-1');
    const after = ticks;
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(ticks).toBe(after);
        resolve();
      }, 20);
    });
  });

  it('describes a sensor failure as producing no samples at all', () => {
    setOverride('src-1', { mode: 'sensor_failure', startedAt: 'now' });
    expect(describeOverride('src-1').note).toMatch(/no sensor samples/i);
    // Still the simulated channel — and it is empty, which is the point.
    expect(evaluationSampleSource('src-1')).toBe('simulated');
  });
});

describe('the projection handover', () => {
  it('starts a first lights-off from the measured baseline', () => {
    expect(shareAtHandover('src-1')).toBe(0);
  });

  it('remembers the share reached, so a recovery does not start from zero', () => {
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now' });
    recordShare('src-1', 0.11);
    expect(shareAtHandover('src-1')).toBeCloseTo(0.11, 6);
  });

  it('ignores a non-numeric share rather than corrupting the curve', () => {
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now' });
    recordShare('src-1', Number.NaN);
    expect(shareAtHandover('src-1')).toBe(0);
  });

  it('drives the projection for the light modes but not for a dead sensor', () => {
    setOverride('src-1', { mode: 'lights_off', startedAt: 'now', fromShare: 0.05 });
    expect(describeOverride('src-1').projection).toMatchObject({ mode: 'lights_off', fromShare: 0.05 });

    setOverride('src-2', { mode: 'sensor_failure', startedAt: 'now' });
    expect(describeOverride('src-2').projection).toBeNull();
  });
});
