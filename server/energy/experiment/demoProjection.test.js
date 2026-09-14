import { describe, it, expect } from 'vitest';
import {
  DEMO_SOURCE,
  MAX_PLAUSIBLE_SHARE,
  MEASURED_RADIO_DISABLE_SHARE,
  SETTLE_SECONDS,
  apShare,
  jitterUnit,
  projectApInstant,
  projectApWatts,
  projectSeriesPoints,
  projectTreatmentRows,
  rampProgress,
  shareAt,
} from './demoProjection.js';
import { summarizeSide, attribute } from './analysis.js';

/** The real lab pair: two AP5022s, measured draws, one per site. */
const TREATMENT_APS = [{ apSerial: 'WF062632W-50092', model: 'AP5022', baselineWatts: 14.846 }];
const START = '2026-09-14T12:00:00.000Z';
const at = (seconds) => new Date(Date.parse(START) + seconds * 1000);

describe('jitterUnit', () => {
  it('is deterministic, so two polls of the same instant agree', () => {
    expect(jitterUnit('a:1')).toBe(jitterUnit('a:1'));
  });

  it('stays inside [-1, 1]', () => {
    for (const seed of ['a', 'b', 'WF062632W-50092:29000000', '', '12345']) {
      const v = jitterUnit(seed);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('differs between seeds, so APs do not move in lockstep', () => {
    expect(jitterUnit('ap-1')).not.toBe(jitterUnit('ap-2'));
  });
});

describe('apShare', () => {
  it('centres on the measured 15.9%, not the modelled 25%', () => {
    const shares = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => apShare(s));
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(mean).toBeGreaterThan(MEASURED_RADIO_DISABLE_SHARE * 0.9);
    expect(mean).toBeLessThan(MEASURED_RADIO_DISABLE_SHARE * 1.1);
  });

  it('varies per AP so no two drop by exactly the same amount', () => {
    expect(apShare('ap-1')).not.toBe(apShare('ap-2'));
  });

  it('clamps an absurd input to something the hardware could actually do', () => {
    expect(apShare('ap-1', 0.9)).toBeLessThanOrEqual(MAX_PLAUSIBLE_SHARE);
    expect(apShare('ap-1', -5)).toBeGreaterThanOrEqual(0);
  });
});

describe('rampProgress', () => {
  it('is 0 at the start and 1 once settled', () => {
    expect(rampProgress(0)).toBe(0);
    expect(rampProgress(SETTLE_SECONDS)).toBe(1);
    expect(rampProgress(SETTLE_SECONDS * 10)).toBe(1);
  });

  it('rises monotonically without a corner', () => {
    let previous = -1;
    for (let t = 0; t <= SETTLE_SECONDS; t += 5) {
      const p = rampProgress(t);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it('treats a negative or absent elapsed time as not started', () => {
    expect(rampProgress(-10)).toBe(0);
    expect(rampProgress(undefined)).toBe(0);
  });
});

describe('shareAt', () => {
  it('ramps up from zero on lights_off', () => {
    expect(shareAt({ mode: 'lights_off', elapsedSeconds: 0, targetShare: 0.16 })).toBe(0);
    expect(
      shareAt({ mode: 'lights_off', elapsedSeconds: SETTLE_SECONDS, targetShare: 0.16 })
    ).toBeCloseTo(0.16, 6);
  });

  it('recovers from the share already reached, so off→on→off does not jump', () => {
    // Half-way into an optimization the operator turns the lights back on:
    // recovery must start from where the curve actually was, not from zero.
    const reached = 0.12;
    expect(
      shareAt({ mode: 'lights_on', elapsedSeconds: 0, targetShare: 0, fromShare: reached })
    ).toBeCloseTo(reached, 6);
    expect(
      shareAt({
        mode: 'lights_on',
        elapsedSeconds: SETTLE_SECONDS,
        targetShare: 0,
        fromShare: reached,
      })
    ).toBeCloseTo(0, 6);
  });

  it('claims nothing for any other mode', () => {
    expect(shareAt({ mode: 'sensor_failure', elapsedSeconds: 600, targetShare: 0.16 })).toBe(0);
  });
});

describe('projectApWatts', () => {
  it('refuses to project without a measured baseline', () => {
    for (const baselineWatts of [null, undefined, 0, -3, Number.NaN]) {
      expect(
        projectApWatts({
          apSerial: 'x',
          baselineWatts,
          mode: 'lights_off',
          elapsedSeconds: 300,
          atEpochSeconds: 0,
        })
      ).toBeNull();
    }
  });

  it('starts at the measured draw and settles below it', () => {
    const start = projectApWatts({
      apSerial: 'ap-1',
      baselineWatts: 14.846,
      mode: 'lights_off',
      elapsedSeconds: 0,
      atEpochSeconds: 0,
    });
    const settled = projectApWatts({
      apSerial: 'ap-1',
      baselineWatts: 14.846,
      mode: 'lights_off',
      elapsedSeconds: 600,
      atEpochSeconds: 600,
    });
    expect(start).toBeCloseTo(14.846, 1);
    expect(settled).toBeLessThan(start);
    // A believable landing zone: ~13-15% below, never a halving.
    expect(settled).toBeGreaterThan(14.846 * 0.8);
    expect(settled).toBeLessThan(14.846 * 0.92);
  });

  it('does not cliff-edge — the drop is spread across the settle window', () => {
    const midpoint = projectApWatts({
      apSerial: 'ap-1',
      baselineWatts: 14.846,
      mode: 'lights_off',
      elapsedSeconds: SETTLE_SECONDS / 2,
      atEpochSeconds: 100,
    });
    expect(midpoint).toBeLessThan(14.846);
    expect(midpoint).toBeGreaterThan(14.846 * (1 - MEASURED_RADIO_DISABLE_SHARE));
  });

  it('is stable within a sample bucket and moves between them', () => {
    const args = {
      apSerial: 'ap-1',
      baselineWatts: 14.846,
      mode: 'lights_off',
      elapsedSeconds: 600,
    };
    // 960-1020 is one bucket; 1080 is the next one along.
    expect(projectApWatts({ ...args, atEpochSeconds: 970 })).toBe(
      projectApWatts({ ...args, atEpochSeconds: 1010 })
    );
    expect(projectApWatts({ ...args, atEpochSeconds: 970 })).not.toBe(
      projectApWatts({ ...args, atEpochSeconds: 1090 })
    );
  });

  it('never returns a negative draw', () => {
    expect(
      projectApWatts({
        apSerial: 'ap-1',
        baselineWatts: 0.001,
        mode: 'lights_off',
        elapsedSeconds: 1e6,
        atEpochSeconds: 0,
      })
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('projectTreatmentRows', () => {
  it('emits summarizeSide-compatible rows stamped as simulated', () => {
    const { rows, apCountProjected } = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(apCountProjected).toBe(1);
    const [row] = rows;
    expect(row.apSerial).toBe('WF062632W-50092');
    expect(row.model).toBe('AP5022');
    expect(row.valueSource).toBe(DEMO_SOURCE);
    expect(row.avgWatts).toBeGreaterThan(0);
    expect(row.kwh).toBeGreaterThan(0);
    expect(row.sampleCount).toBeGreaterThan(0);
  });

  it('skips APs with no measured baseline rather than inventing one', () => {
    const { rows } = projectTreatmentRows({
      baselineAps: [
        ...TREATMENT_APS,
        { apSerial: 'dark-ap', model: 'AP5022', baselineWatts: null },
      ],
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(rows).toHaveLength(1);
  });

  it('averages across the window, so a short run is not credited with the settled figure', () => {
    const short = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(60),
    });
    const long = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(3600),
    });
    expect(short.rows[0].avgWatts).toBeGreaterThan(long.rows[0].avgWatts);
  });

  it('reports the share currently in effect', () => {
    const atStart = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(0),
    });
    const settled = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(atStart.shareNow).toBeCloseTo(0, 5);
    expect(settled.shareNow).toBeGreaterThan(0.1);
    expect(settled.shareNow).toBeLessThanOrEqual(MAX_PLAUSIBLE_SHARE);
  });

  it('returns nothing when there are no treatment APs at all', () => {
    const { rows, shareNow } = projectTreatmentRows({
      baselineAps: [],
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(rows).toEqual([]);
    expect(shareNow).toBeNull();
  });
});

describe('the projection is consistent with the real attribution chain', () => {
  it('produces a believable difference-in-differences result', () => {
    // Real measured baselines for the lab pair, and a real, flat control.
    const treatmentBaseline = summarizeSide([
      {
        apSerial: 'WF062632W-50092',
        model: 'AP5022',
        avgWatts: 14.846,
        kwh: 0.3,
        observedSeconds: 3600,
        sampleCount: 60,
      },
    ]);
    const controlBaseline = summarizeSide([
      {
        apSerial: 'WF062632W-50220',
        model: 'AP5022',
        avgWatts: 14.596,
        kwh: 0.3,
        observedSeconds: 3600,
        sampleCount: 60,
      },
    ]);
    const controlCurrent = summarizeSide([
      {
        apSerial: 'WF062632W-50220',
        model: 'AP5022',
        avgWatts: 14.61,
        kwh: 0.05,
        observedSeconds: 600,
        sampleCount: 10,
      },
    ]);

    const { rows } = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(1800),
    });
    const treatmentCurrent = summarizeSide(rows);

    const result = attribute({
      treatmentBaseline,
      treatmentCurrent,
      controlBaseline,
      controlCurrent,
    });

    expect(result.attributed.usable).toBe(true);
    // The headline must land in the measured neighbourhood — not 0, not 50%.
    expect(result.attributed.percent).toBeGreaterThan(8);
    expect(result.attributed.percent).toBeLessThan(MAX_PLAUSIBLE_SHARE * 100);
    expect(result.comparability.verdict).toBe('comparable');
  });

  it('claims nothing while the lights are on', () => {
    const treatmentBaseline = summarizeSide([
      {
        apSerial: 'WF062632W-50092',
        model: 'AP5022',
        avgWatts: 14.846,
        kwh: 0.3,
        observedSeconds: 3600,
        sampleCount: 60,
      },
    ]);
    const { rows } = projectTreatmentRows({
      baselineAps: TREATMENT_APS,
      mode: 'lights_on',
      startedAt: START,
      now: at(600),
      fromShare: 0,
    });
    const treatmentCurrent = summarizeSide(rows);
    const result = attribute({
      treatmentBaseline,
      treatmentCurrent,
      controlBaseline: treatmentBaseline,
      controlCurrent: treatmentBaseline,
    });
    // Within the wobble of zero: lights on is not a saving.
    expect(Math.abs(result.attributed.percent ?? 0)).toBeLessThan(1.5);
  });
});

describe('projectApInstant', () => {
  it('gives the AP table a current watts figure marked as simulated', () => {
    const map = projectApInstant({
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    const row = map.get('WF062632W-50092');
    expect(row.valueSource).toBe(DEMO_SOURCE);
    expect(row.watts).toBeLessThan(14.846);
    expect(row.observedAt).toBe(at(600).toISOString());
  });

  it('omits an AP it cannot project rather than showing a zero', () => {
    const map = projectApInstant({
      baselineAps: [{ apSerial: 'no-data', model: 'AP5022', baselineWatts: null }],
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(map.size).toBe(0);
  });
});

describe('projectSeriesPoints', () => {
  it('starts at the override, never before it', () => {
    const points = projectSeriesPoints({
      siteId: 'site-n',
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(600),
    });
    expect(points.length).toBeGreaterThan(1);
    for (const p of points) {
      // Bucket-aligned, so the first point may sit up to one bucket early.
      expect(Date.parse(p.bucketStart)).toBeGreaterThanOrEqual(Date.parse(START) - 60_000);
      expect(Date.parse(p.bucketStart)).toBeLessThanOrEqual(at(600).getTime());
      expect(p.valueSource).toBe(DEMO_SOURCE);
      expect(p.siteId).toBe('site-n');
    }
  });

  it('descends across the settle window and then holds', () => {
    const points = projectSeriesPoints({
      siteId: 'site-n',
      baselineAps: TREATMENT_APS,
      mode: 'lights_off',
      startedAt: START,
      now: at(1800),
    });
    const first = points[0].wattsPerAp;
    const last = points[points.length - 1].wattsPerAp;
    expect(last).toBeLessThan(first);
    expect(last).toBeGreaterThan(first * 0.8);
  });

  it('returns nothing before the override starts, and nothing without a baseline', () => {
    expect(
      projectSeriesPoints({
        siteId: 's',
        baselineAps: TREATMENT_APS,
        mode: 'lights_off',
        startedAt: START,
        now: at(-10),
      })
    ).toEqual([]);
    expect(
      projectSeriesPoints({
        siteId: 's',
        baselineAps: [{ apSerial: 'x', baselineWatts: null }],
        mode: 'lights_off',
        startedAt: START,
        now: at(600),
      })
    ).toEqual([]);
  });
});
