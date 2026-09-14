import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decideOverlay,
  computeOverlay,
  mergeSeriesPoints,
  publicOverlay,
  VALUE_SOURCE,
} from './demoOverlay.js';
import { summarizeSide } from './analysis.js';
import * as calc from '../energyCalculator.js';

const PREFS = { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };
const EMISSIONS = 0.371;
const NOW = new Date('2026-09-14T12:30:00.000Z');
const STARTED = '2026-09-14T12:00:00.000Z';

const BASELINE_APS = [
  { apSerial: 'WF062632W-50092', model: 'AP5022', baselineWatts: 14.846, sampleCount: 60 },
];

const override = (mode, startedAt = STARTED, fromShare = 0) => ({
  active: true,
  mode,
  projection: { mode, startedAt, fromShare, episodeId: 'ep-1' },
});

afterEach(() => vi.useRealTimers());

describe('decideOverlay — simulation requires deliberate activation', () => {
  it('refuses when no operator switched it on', () => {
    expect(decideOverlay({ override: null })).toEqual({ apply: false, reason: 'no_override' });
    expect(
      decideOverlay({ override: { active: false, mode: 'live_sensor', projection: null } })
    ).toEqual({
      apply: false,
      reason: 'no_override',
    });
  });

  it('refuses for a simulated sensor failure — a dead sensor must look dead', () => {
    expect(
      decideOverlay({ override: { active: true, mode: 'sensor_failure', projection: null } }).apply
    ).toBe(false);
  });

  it('applies for a deliberate lights_off', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const decision = decideOverlay({ override: override('lights_off') });
    expect(decision).toMatchObject({
      apply: true,
      mode: 'lights_off',
      startedAt: STARTED,
      fromShare: 0,
    });
  });
});

describe('decideOverlay — real telemetry always wins', () => {
  const realSavings = {
    claimSupported: true,
    attributed: { percent: 12.4, siteWatts: 1.8 },
  };

  it('declines to project when the controller writes landed and the claim is supported', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const decision = decideOverlay({
      override: override('lights_off'),
      experiment: { controller_writes_applied: true },
      savings: realSavings,
    });
    expect(decision).toEqual({ apply: false, reason: 'real_telemetry_preferred' });
  });

  it('still projects when the writes landed but the measurement cannot support a claim', () => {
    // The radio change was applied and verified, but the collector has a gap
    // and there is nothing to show. This is a case the fallback exists for.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const decision = decideOverlay({
      override: override('lights_off'),
      experiment: { controller_writes_applied: true },
      savings: { claimSupported: false, attributed: { percent: null } },
    });
    expect(decision.apply).toBe(true);
  });

  it('still projects when the controller write never landed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const decision = decideOverlay({
      override: override('lights_off'),
      experiment: { controller_writes_applied: false },
      savings: realSavings,
    });
    expect(decision.apply).toBe(true);
  });

  it('still projects when the real path reports a negative result', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const decision = decideOverlay({
      override: override('lights_off'),
      experiment: { controller_writes_applied: true },
      savings: { claimSupported: true, attributed: { percent: -2.1 } },
    });
    expect(decision.apply).toBe(true);
  });
});

describe('decideOverlay — recovery is bounded', () => {
  it('projects the recovery curve while it is running', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(STARTED) + 60_000));
    expect(decideOverlay({ override: override('lights_on') }).apply).toBe(true);
  });

  it('hands the screen back to the real feed once recovery is over', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(STARTED) + 10 * 60_000));
    expect(decideOverlay({ override: override('lights_on') })).toEqual({
      apply: false,
      reason: 'recovery_complete',
    });
  });
});

describe('computeOverlay', () => {
  const decision = {
    apply: true,
    reason: 'demo_simulation_active',
    mode: 'lights_off',
    startedAt: STARTED,
    fromShare: 0,
  };
  const controlCurrent = summarizeSide([
    {
      apSerial: 'WF062632W-50220',
      model: 'AP5022',
      avgWatts: 14.61,
      kwh: 0.12,
      observedSeconds: 1800,
      sampleCount: 30,
    },
  ]);

  const build = (overrides = {}) =>
    computeOverlay({
      decision,
      baselineAps: BASELINE_APS,
      treatmentSiteId: 'n-id',
      controlCurrent,
      prefs: PREFS,
      emissionsFactor: EMISSIONS,
      calc,
      now: NOW,
      ...overrides,
    });

  it('returns null when the decision was not to project', () => {
    expect(computeOverlay({ decision: { apply: false }, calc, prefs: PREFS })).toBeNull();
  });

  it('marks every figure as demo-simulated', () => {
    const overlay = build();
    expect(overlay.applied).toBe(true);
    expect(overlay.valueSource).toBe(VALUE_SOURCE.DEMO_SIMULATED);
    expect(overlay.savings.valueSource).toBe(VALUE_SOURCE.DEMO_SIMULATED);
    expect(overlay.treatment.treatment.valueSource).toBe(VALUE_SOURCE.DEMO_SIMULATED);
  });

  it('carries provenance "simulated", so every existing exclusion rule still applies', () => {
    // This is what keeps the environmental report and the scenario engine from
    // citing a simulation, with no change to either of them.
    expect(build().savings.provenance).toBe('simulated');
  });

  it('produces a believable reduction against a real control', () => {
    const overlay = build();
    expect(overlay.savings.attributed.percent).toBeGreaterThan(8);
    expect(overlay.savings.attributed.percent).toBeLessThan(25);
    expect(overlay.reductionShare).toBeGreaterThan(0.1);
    expect(overlay.reductionShare).toBeLessThanOrEqual(0.25);
    expect(overlay.savings.projected.annualKwh).toBeGreaterThan(0);
    expect(overlay.savings.projected.annualCost).toBeGreaterThan(0);
  });

  it('keeps the real control reading real', () => {
    const overlay = build();
    expect(overlay.controlAssumed).toBe(false);
    expect(overlay.treatment.control.valueSource).toBe(VALUE_SOURCE.REAL);
    expect(overlay.treatment.control.wattsPerAp).toBeCloseTo(14.61, 2);
  });

  it('declares the assumption when the control has no live reading', () => {
    const overlay = build({
      controlCurrent: null,
      baseline: {
        control: summarizeSide([
          { apSerial: 'S1', avgWatts: 14.6, kwh: 0.3, observedSeconds: 3600, sampleCount: 60 },
        ]),
      },
    });
    expect(overlay.controlAssumed).toBe(true);
    expect(overlay.treatment.control.valueSource).toBe(VALUE_SOURCE.CALCULATED);
  });

  it('simulates nothing when there is no measured history to project from', () => {
    const overlay = build({
      baselineAps: [{ apSerial: 'x', model: 'AP5022', baselineWatts: null }],
    });
    expect(overlay.applied).toBe(false);
    expect(overlay.reason).toBe('no_measured_baseline');
    expect(overlay.savings).toBeUndefined();
    expect(overlay.note).toMatch(/remain real/);
  });

  it('prefers the established real baseline over the projection starting point', () => {
    const realBaseline = {
      treatment: summarizeSide([
        {
          apSerial: 'WF062632W-50092',
          model: 'AP5022',
          avgWatts: 16.0,
          kwh: 0.5,
          observedSeconds: 3600,
          sampleCount: 60,
        },
      ]),
      control: null,
    };
    const overlay = build({ baseline: realBaseline });
    expect(overlay.baselineWattsPerAp).toBeCloseTo(16.0, 2);
  });

  it('produces chart points only for the optimized site', () => {
    const overlay = build();
    expect(overlay.seriesPoints.length).toBeGreaterThan(1);
    expect(new Set(overlay.seriesPoints.map((p) => p.siteId))).toEqual(new Set(['n-id']));
  });

  it('gives the AP table a projected instantaneous reading', () => {
    const row = build().apInstant.get('WF062632W-50092');
    expect(row.watts).toBeLessThan(14.846);
    expect(row.valueSource).toBe(VALUE_SOURCE.DEMO_SIMULATED);
  });

  it('claims nothing on a lights_on recovery from zero', () => {
    const overlay = computeOverlay({
      decision: { apply: true, reason: 'r', mode: 'lights_on', startedAt: STARTED, fromShare: 0 },
      baselineAps: BASELINE_APS,
      treatmentSiteId: 'n-id',
      controlCurrent,
      prefs: PREFS,
      emissionsFactor: EMISSIONS,
      calc,
      now: NOW,
    });
    expect(Math.abs(overlay.savings.attributed.percent ?? 0)).toBeLessThan(2);
  });
});

describe('mergeSeriesPoints — measured points are never overwritten', () => {
  const measured = [
    {
      siteId: 'n-id',
      bucketStart: '2026-09-14T12:00:00.000Z',
      wattsPerAp: 14.8,
      siteWatts: 14.8,
      apCount: 1,
    },
    {
      siteId: 's-id',
      bucketStart: '2026-09-14T12:00:00.000Z',
      wattsPerAp: 14.6,
      siteWatts: 14.6,
      apCount: 1,
    },
  ];
  const projected = [
    {
      siteId: 'n-id',
      bucketStart: '2026-09-14T12:00:00.000Z',
      wattsPerAp: 12.5,
      siteWatts: 12.5,
      apCount: 1,
      valueSource: 'DEMO_SIMULATED',
    },
    {
      siteId: 'n-id',
      bucketStart: '2026-09-14T12:01:00.000Z',
      wattsPerAp: 12.4,
      siteWatts: 12.4,
      apCount: 1,
      valueSource: 'DEMO_SIMULATED',
    },
  ];

  it('keeps the measured value where both exist', () => {
    const merged = mergeSeriesPoints(measured, projected, 'n-id');
    const clash = merged.filter(
      (p) => p.siteId === 'n-id' && p.bucketStart === '2026-09-14T12:00:00.000Z'
    );
    expect(clash).toHaveLength(1);
    expect(clash[0].wattsPerAp).toBe(14.8);
    expect(clash[0].valueSource).toBe(VALUE_SOURCE.REAL);
  });

  it('fills only the buckets the real feed does not cover', () => {
    const merged = mergeSeriesPoints(measured, projected, 'n-id');
    const filled = merged.find((p) => p.bucketStart === '2026-09-14T12:01:00.000Z');
    expect(filled.valueSource).toBe('DEMO_SIMULATED');
  });

  it('leaves the control series entirely alone', () => {
    const merged = mergeSeriesPoints(measured, projected, 'n-id');
    const control = merged.filter((p) => p.siteId === 's-id');
    expect(control).toHaveLength(1);
    expect(control[0].valueSource).toBe(VALUE_SOURCE.REAL);
  });

  it('marks everything real when nothing is projected', () => {
    const merged = mergeSeriesPoints(measured, [], 'n-id');
    expect(merged.every((p) => p.valueSource === VALUE_SOURCE.REAL)).toBe(true);
  });

  it('returns points in chronological order', () => {
    const merged = mergeSeriesPoints(measured, projected, 'n-id');
    const times = merged.map((p) => Date.parse(p.bucketStart));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('publicOverlay — the wire format', () => {
  const overlay = computeOverlay({
    decision: {
      apply: true,
      reason: 'demo_simulation_active',
      mode: 'lights_off',
      startedAt: STARTED,
      fromShare: 0,
    },
    baselineAps: BASELINE_APS,
    treatmentSiteId: 'n-id',
    controlCurrent: summarizeSide([
      { apSerial: 'S1', avgWatts: 14.61, kwh: 0.12, observedSeconds: 1800, sampleCount: 30 },
    ]),
    prefs: PREFS,
    emissionsFactor: EMISSIONS,
    calc,
    now: NOW,
  });

  it('drops the fields the router consumes internally', () => {
    const wire = publicOverlay(overlay);
    // A Map JSON-serializes to {}, which would put a meaningless empty object
    // on the wire, and the points are already in the series payload.
    expect(wire).not.toHaveProperty('apInstant');
    expect(wire).not.toHaveProperty('seriesPoints');
  });

  it('keeps everything a client needs to label the figures', () => {
    const wire = publicOverlay(overlay);
    expect(wire).toMatchObject({
      active: true,
      applied: true,
      valueSource: VALUE_SOURCE.DEMO_SIMULATED,
      mode: 'lights_off',
    });
    expect(wire.savings).toBeDefined();
    expect(wire.reductionShare).toBeGreaterThan(0);
  });

  it('survives a null overlay', () => {
    expect(publicOverlay(null)).toBeNull();
  });

  it('is JSON-serializable with no empty-object artefacts', () => {
    const round = JSON.parse(JSON.stringify(publicOverlay(overlay)));
    expect(Object.values(round).some((v) => JSON.stringify(v) === '{}')).toBe(false);
  });
});
