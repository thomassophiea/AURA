import { describe, it, expect } from 'vitest';
import {
  VERTICALS,
  calculateBenchmarkScore,
  generateRecommendations,
  SELF_BENCHMARK_WINDOWS,
  type BenchmarkMetrics,
  type VerticalBaseline,
} from './peerBenchmarkData';

const enterprise = VERTICALS.find((v) => v.id === 'enterprise')!;

const matchBaseline = (vertical: VerticalBaseline): BenchmarkMetrics => ({
  avgThroughput: vertical.metrics.avgThroughput,
  apUptime: vertical.metrics.apUptime,
  roamingSuccessRate: vertical.metrics.roamingSuccessRate,
  meanTimeToAssociate: vertical.metrics.meanTimeToAssociate,
  clientDensityPerAP: vertical.metrics.clientDensityPerAP,
  highBandAdoption: vertical.metrics.highBandAdoption,
});

describe('VERTICALS reference data', () => {
  it('contains all eight expected vertical ids', () => {
    const ids = VERTICALS.map((v) => v.id).sort();
    expect(ids).toEqual([
      'education',
      'enterprise',
      'government',
      'healthcare',
      'hospitality',
      'logistics',
      'manufacturing',
      'retail',
    ]);
  });

  it('every vertical has a positive peerCount and the six required metrics', () => {
    for (const v of VERTICALS) {
      expect(v.peerCount).toBeGreaterThan(0);
      expect(v.name).toBeTruthy();
      const m = v.metrics;
      expect(m.avgThroughput).toBeGreaterThan(0);
      expect(m.apUptime).toBeGreaterThan(0);
      expect(m.roamingSuccessRate).toBeGreaterThan(0);
      expect(m.meanTimeToAssociate).toBeGreaterThan(0);
      expect(m.clientDensityPerAP).toBeGreaterThan(0);
      expect(m.highBandAdoption).toBeGreaterThan(0);
    }
  });
});

describe('calculateBenchmarkScore', () => {
  it('matching the baseline produces a score of 50 (neutral)', () => {
    const score = calculateBenchmarkScore(matchBaseline(enterprise), enterprise);
    expect(score.overall).toBe(50);
    expect(score.vertical).toBe('Enterprise');
    expect(score.peerCount).toBe(enterprise.peerCount);
  });

  it('exceeding the baseline lifts the overall score above 50', () => {
    const better: BenchmarkMetrics = {
      avgThroughput: enterprise.metrics.avgThroughput * 1.5,
      apUptime: 99.95,
      roamingSuccessRate: 99,
      meanTimeToAssociate: enterprise.metrics.meanTimeToAssociate * 0.5, // lowerIsBetter
      clientDensityPerAP: enterprise.metrics.clientDensityPerAP * 1.3,
      highBandAdoption: 90,
    };
    const score = calculateBenchmarkScore(better, enterprise);
    expect(score.overall).toBeGreaterThan(50);
  });

  it('falling far below the baseline drops the overall score below 50', () => {
    const worse: BenchmarkMetrics = {
      avgThroughput: enterprise.metrics.avgThroughput * 0.4,
      apUptime: 95,
      roamingSuccessRate: 80,
      meanTimeToAssociate: enterprise.metrics.meanTimeToAssociate * 3,
      clientDensityPerAP: enterprise.metrics.clientDensityPerAP * 0.5,
      highBandAdoption: 30,
    };
    const score = calculateBenchmarkScore(worse, enterprise);
    expect(score.overall).toBeLessThan(50);
  });

  it('tags individual metrics as better/worse/neutral correctly', () => {
    const mixed: BenchmarkMetrics = {
      avgThroughput: enterprise.metrics.avgThroughput * 1.5, // better
      apUptime: enterprise.metrics.apUptime * 0.9, // worse
      roamingSuccessRate: enterprise.metrics.roamingSuccessRate, // neutral
      meanTimeToAssociate: enterprise.metrics.meanTimeToAssociate * 0.5, // better (lowerIsBetter)
      clientDensityPerAP: enterprise.metrics.clientDensityPerAP * 0.95, // within 5%, neutral edge
      highBandAdoption: enterprise.metrics.highBandAdoption,
    };
    const score = calculateBenchmarkScore(mixed, enterprise);
    const find = (k: keyof BenchmarkMetrics) => score.metrics.find((m) => m.key === k)!;
    expect(find('avgThroughput').isBetter).toBe(true);
    expect(find('apUptime').isBetter).toBe(false);
    expect(find('roamingSuccessRate').isNeutral).toBe(true);
    expect(find('meanTimeToAssociate').isBetter).toBe(true);
  });

  it('topPercent is the complement of overall, floored at 1', () => {
    const score = calculateBenchmarkScore(matchBaseline(enterprise), enterprise);
    expect(score.topPercent).toBe(50);
    // Force overall = 100 by sending vastly better metrics
    const great = calculateBenchmarkScore(
      {
        avgThroughput: 1_000,
        apUptime: 100,
        roamingSuccessRate: 100,
        meanTimeToAssociate: 0.001,
        clientDensityPerAP: 1_000,
        highBandAdoption: 100,
      },
      enterprise
    );
    expect(great.topPercent).toBeGreaterThanOrEqual(1);
  });
});

describe('generateRecommendations', () => {
  it('returns no recommendations when matching baseline', () => {
    const score = calculateBenchmarkScore(matchBaseline(enterprise), enterprise);
    const recs = generateRecommendations(score);
    expect(recs).toEqual([]);
  });

  it('returns no recommendations when outperforming baseline', () => {
    const better: BenchmarkMetrics = {
      avgThroughput: 500,
      apUptime: 100,
      roamingSuccessRate: 100,
      meanTimeToAssociate: 0.5,
      clientDensityPerAP: 30,
      highBandAdoption: 95,
    };
    const score = calculateBenchmarkScore(better, enterprise);
    const recs = generateRecommendations(score);
    expect(recs).toEqual([]);
  });

  it('returns the throughput recommendation when underperforming by >= 10%', () => {
    const slow: BenchmarkMetrics = {
      ...matchBaseline(enterprise),
      avgThroughput: enterprise.metrics.avgThroughput * 0.7, // 30% under
    };
    const score = calculateBenchmarkScore(slow, enterprise);
    const recs = generateRecommendations(score);
    const tp = recs.find((r) => r.metric === 'avgThroughput');
    expect(tp).toBeDefined();
    expect(tp!.severity).toBe('warning');
  });

  it('returns the AP-uptime recommendation when underperforming by >= 1% (critical severity)', () => {
    const flaky: BenchmarkMetrics = {
      ...matchBaseline(enterprise),
      apUptime: enterprise.metrics.apUptime * 0.97, // 3% under
    };
    const score = calculateBenchmarkScore(flaky, enterprise);
    const recs = generateRecommendations(score);
    const r = recs.find((r) => r.metric === 'apUptime');
    expect(r).toBeDefined();
    expect(r!.severity).toBe('critical');
  });

  it('does not duplicate recommendations across calls', () => {
    const slow: BenchmarkMetrics = {
      ...matchBaseline(enterprise),
      avgThroughput: enterprise.metrics.avgThroughput * 0.5,
      apUptime: enterprise.metrics.apUptime * 0.9,
    };
    const score = calculateBenchmarkScore(slow, enterprise);
    const recs = generateRecommendations(score);
    const ids = recs.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('SELF_BENCHMARK_WINDOWS', () => {
  it('contains windows in ascending day order', () => {
    expect(SELF_BENCHMARK_WINDOWS.length).toBeGreaterThan(0);
    for (let i = 1; i < SELF_BENCHMARK_WINDOWS.length; i++) {
      expect(SELF_BENCHMARK_WINDOWS[i].days).toBeGreaterThan(SELF_BENCHMARK_WINDOWS[i - 1].days);
    }
  });

  it('every window has a non-empty label and positive day count', () => {
    for (const w of SELF_BENCHMARK_WINDOWS) {
      expect(w.label).toBeTruthy();
      expect(w.days).toBeGreaterThan(0);
    }
  });
});
