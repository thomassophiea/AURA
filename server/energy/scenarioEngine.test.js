import { describe, it, expect } from 'vitest';
import { simulatedWattsForSample, replayScenario, SIX_GHZ_BAND_SHARE } from './scenarioEngine.js';

const at = (iso, watts, extra = {}) => ({
  deviceExternalId: 'AP-1',
  watts,
  observedAt: iso,
  band: null,
  channelUtilization: null,
  ...extra,
});

describe('simulatedWattsForSample', () => {
  it('is unchanged when no policy rule applies', () => {
    const s = at('2026-08-10T12:00:00Z', 10);
    expect(simulatedWattsForSample(s, {})).toBe(10);
  });

  it('removes the 6 GHz share during disable hours', () => {
    // 02:00 UTC, policy disables 6 GHz for hours 0-5
    const s = at('2026-08-10T02:00:00Z', 10);
    const policy = { disable6GhzHours: [0, 1, 2, 3, 4, 5] };
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(10 * (1 - SIX_GHZ_BAND_SHARE), 6);
  });

  it('applies after-hours reduction outside business hours', () => {
    // 23:00 UTC is after-hours (start 22, end 6), reduce 20%
    const s = at('2026-08-10T23:00:00Z', 10);
    const policy = { afterHoursStart: 22, afterHoursEnd: 6, reduceTxPower: true, reducePercent: 20 };
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(8, 6);
  });

  it('does not reduce during business hours', () => {
    const s = at('2026-08-10T12:00:00Z', 10);
    const policy = { afterHoursStart: 22, afterHoursEnd: 6, reduceTxPower: true, reducePercent: 20 };
    expect(simulatedWattsForSample(s, policy)).toBe(10);
  });

  it('zeroes low-utilization radio share below threshold', () => {
    const s = at('2026-08-10T03:00:00Z', 10, { channelUtilization: 2 });
    const policy = { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 };
    // low-util share modeled at SIX_GHZ_BAND_SHARE of draw
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(10 * (1 - SIX_GHZ_BAND_SHARE), 6);
  });
});

describe('replayScenario', () => {
  it('integrates baseline and simulated and reports savings', () => {
    // Two samples 1h apart, 2W each, disable 6GHz for the hours they fall in.
    const samples = [
      at('2026-08-10T02:00:00Z', 2),
      at('2026-08-10T03:00:00Z', 2),
    ];
    const policy = { disable6GhzHours: [0, 1, 2, 3, 4, 5] };
    const out = replayScenario({ samples, policy, maxGapSeconds: 7200 });
    // baseline: 2W * 3600s = 0.002 kWh; simulated: 1.5W * 3600s = 0.0015 kWh
    expect(out.baselineKwh).toBeCloseTo(0.002, 6);
    expect(out.simulatedKwh).toBeCloseTo(0.0015, 6);
    expect(out.savingsKwh).toBeCloseTo(0.0005, 6);
    expect(out.savingsPercent).toBeCloseTo(25, 6);
    expect(out.apWithDataCount).toBe(1);
  });

  it('excludes gaps larger than maxGapSeconds', () => {
    const samples = [
      at('2026-08-10T00:00:00Z', 2),
      at('2026-08-11T00:00:00Z', 2), // 24h gap
    ];
    const out = replayScenario({ samples, policy: {}, maxGapSeconds: 7200 });
    expect(out.baselineKwh).toBe(0); // the only interval exceeds the clamp
  });
});
