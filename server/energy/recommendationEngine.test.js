// server/energy/recommendationEngine.test.js
import { describe, it, expect } from 'vitest';
import { buildRecommendations } from './recommendationEngine.js';

function overnightSamples(days) {
  // One AP, a sample every hour for `days` days at 10W, low 6GHz utilization.
  const rows = [];
  const startMs = Date.parse('2026-08-10T00:00:00Z');
  for (let h = 0; h < days * 24; h += 1) {
    rows.push({
      deviceExternalId: 'AP-1',
      watts: 10,
      observedAt: new Date(startMs + h * 3600_000).toISOString(),
      band: '6',
      channelUtilization: 1, // consistently < 5%
    });
  }
  return rows;
}

describe('buildRecommendations', () => {
  it('emits a low-utilization 6 GHz recommendation with savings', () => {
    const recs = buildRecommendations({
      samples: overnightSamples(7),
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    const rec = recs.find((r) => r.type === 'low_utilization_6ghz');
    expect(rec).toBeTruthy();
    expect(rec.affectedApCount).toBe(1);
    expect(rec.savingsKwh).toBeGreaterThan(0);
    expect(rec.savingsPercent).toBeCloseTo(25, 0);
    expect(rec.estimatedAnnualSaving).toBeGreaterThan(0);
    expect(rec.confidenceLevel).toBe('high');
    expect(rec.riskLevel).toBe('low');
  });

  it('downgrades confidence on a short window', () => {
    const recs = buildRecommendations({
      samples: overnightSamples(2),
      windowDays: 2,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    for (const rec of recs) expect(rec.confidenceLevel).toBe('low');
  });

  it('returns [] when there is no qualifying signal', () => {
    const busy = overnightSamples(7).map((s) => ({ ...s, channelUtilization: 60 }));
    const recs = buildRecommendations({
      samples: busy,
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    expect(recs.find((r) => r.type === 'low_utilization_6ghz')).toBeUndefined();
  });

  it('ignores low-util 2.4 GHz samples; only 6 GHz counts', () => {
    // AP with busy 6 GHz (utilization 60%) but idle 2.4 GHz (utilization 1%).
    // Must NOT qualify: low 2.4 GHz samples must not count toward the 6 GHz signal.
    const startMs = Date.parse('2026-08-10T00:00:00Z');
    const sixGhzBusy = [];
    const twoFourGhzIdle = [];

    for (let h = 0; h < 7 * 24; h += 1) {
      const timestamp = new Date(startMs + h * 3600_000).toISOString();
      sixGhzBusy.push({
        deviceExternalId: 'AP-1',
        watts: 10,
        observedAt: timestamp,
        band: '6',
        channelUtilization: 60, // busy 6 GHz
      });
      twoFourGhzIdle.push({
        deviceExternalId: 'AP-1',
        watts: 10,
        observedAt: new Date(startMs + h * 3600_000 + 30_000).toISOString(),
        band: '2_4', // explicitly 2.4 GHz
        channelUtilization: 1, // idle 2.4 GHz
      });
    }

    const mixed = [...sixGhzBusy, ...twoFourGhzIdle];
    const recs = buildRecommendations({
      samples: mixed,
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    expect(recs.find((r) => r.type === 'low_utilization_6ghz')).toBeUndefined();
  });
});
