import { describe, it, expect } from 'vitest';
import { ENVIRONMENT_PROFILES, getEnvironmentProfile, evaluateMetric } from './environmentProfiles';
import type { EnvironmentProfileType } from './environmentProfiles';

describe('ENVIRONMENT_PROFILES', () => {
  it('has all 7 profile entries with consistent shape', () => {
    const ids: EnvironmentProfileType[] = [
      'AI_BASELINE',
      'RETAIL',
      'WAREHOUSE',
      'DISTRIBUTION',
      'HQ',
      'CAMPUS',
      'CUSTOM',
    ];
    expect(Object.keys(ENVIRONMENT_PROFILES).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const p = ENVIRONMENT_PROFILES[id];
      expect(p.id).toBe(id);
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(typeof p.thresholds.rfqiTarget).toBe('number');
      expect(typeof p.thresholds.rfqiPoor).toBe('number');
      expect(typeof p.thresholds.channelUtilizationPct).toBe('number');
      expect(typeof p.thresholds.noiseFloorDbm).toBe('number');
      expect(typeof p.thresholds.clientDensity).toBe('number');
      expect(typeof p.thresholds.latencyP95Ms).toBe('number');
      expect(typeof p.thresholds.retryRatePct).toBe('number');
      expect(typeof p.thresholds.interferenceHigh).toBe('number');
    }
  });
});

describe('getEnvironmentProfile', () => {
  it('returns the matching profile for a known id', () => {
    expect(getEnvironmentProfile('RETAIL').id).toBe('RETAIL');
    expect(getEnvironmentProfile('AI_BASELINE').id).toBe('AI_BASELINE');
  });

  it('falls back to CAMPUS for an unknown id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getEnvironmentProfile('does-not-exist' as any).id).toBe('CAMPUS');
  });
});

describe('evaluateMetric', () => {
  const profile = ENVIRONMENT_PROFILES.HQ;

  it.each([
    ['rfqi', profile.thresholds.rfqiTarget + 1, 'good'],
    ['rfqi', profile.thresholds.rfqiPoor + 1, 'warning'],
    ['rfqi', profile.thresholds.rfqiPoor - 1, 'poor'],
  ] as const)('rfqi: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it.each([
    ['channelUtilization', profile.thresholds.channelUtilizationPct * 0.5, 'good'],
    ['channelUtilization', profile.thresholds.channelUtilizationPct * 0.9, 'warning'],
    ['channelUtilization', profile.thresholds.channelUtilizationPct + 5, 'poor'],
  ] as const)('channelUtilization: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it.each([
    ['noiseFloor', profile.thresholds.noiseFloorDbm - 10, 'good'], // more negative
    ['noiseFloor', profile.thresholds.noiseFloorDbm - 1, 'warning'],
    ['noiseFloor', profile.thresholds.noiseFloorDbm + 5, 'poor'], // less negative
  ] as const)('noiseFloor: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it.each([
    ['latency', profile.thresholds.latencyP95Ms * 0.5, 'good'],
    ['latency', profile.thresholds.latencyP95Ms * 0.9, 'warning'],
    ['latency', profile.thresholds.latencyP95Ms + 10, 'poor'],
  ] as const)('latency: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it.each([
    ['retryRate', profile.thresholds.retryRatePct * 0.5, 'good'],
    ['retryRate', profile.thresholds.retryRatePct * 0.9, 'warning'],
    ['retryRate', profile.thresholds.retryRatePct + 5, 'poor'],
  ] as const)('retryRate: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it.each([
    ['interference', profile.thresholds.interferenceHigh * 0.5, 'good'],
    ['interference', profile.thresholds.interferenceHigh * 0.9, 'warning'],
    ['interference', profile.thresholds.interferenceHigh + 0.5, 'poor'],
  ] as const)('interference: %s → %s', (metric, value, expected) => {
    expect(evaluateMetric(profile, metric, value)).toBe(expected);
  });

  it('unknown metric falls back to "good"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(evaluateMetric(profile, 'made-up' as any, 50)).toBe('good');
  });
});
