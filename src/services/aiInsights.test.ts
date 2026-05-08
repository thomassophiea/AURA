import { describe, it, expect } from 'vitest';
import {
  calculateRankScore,
  getInsightsSummary,
  getInsightsByGroup,
  INSIGHT_GROUP_META,
  calculateAIBaseline,
  formatAIBaselineConfidence,
  type InsightCard,
} from './aiInsights';

const card = (overrides: Partial<InsightCard> = {}): InsightCard =>
  ({
    id: 'i-1',
    group: 'network_health',
    category: 'rf_quality',
    scope: 'NETWORK',
    severity: 'info',
    title: 'X',
    description: 'X',
    impact: 0.5,
    confidence: 0.5,
    recurrence: 0.5,
    rankScore: 0.5,
    timestamp: 0,
    ...overrides,
  }) as InsightCard;

describe('calculateRankScore', () => {
  it('weighs impact / confidence / recurrence / scope into a single score', () => {
    const score = calculateRankScore(
      card({ impact: 1, confidence: 1, recurrence: 1, scope: 'NETWORK' })
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(2); // sanity bound
  });

  it('returns a higher score for higher-impact insights', () => {
    const low = calculateRankScore(card({ impact: 0.1, confidence: 1, recurrence: 1 }));
    const high = calculateRankScore(card({ impact: 1, confidence: 1, recurrence: 1 }));
    expect(high).toBeGreaterThan(low);
  });

  it('NETWORK scope outranks AP scope (broader blast radius)', () => {
    const network = calculateRankScore(card({ scope: 'NETWORK' }));
    const ap = calculateRankScore(card({ scope: 'AP' }));
    expect(network).toBeGreaterThanOrEqual(ap);
  });
});

describe('getInsightsSummary', () => {
  it('counts by severity and group', () => {
    const insights = [
      card({ id: 'a', severity: 'critical', group: 'network_health' }),
      card({ id: 'b', severity: 'warning', group: 'capacity_planning' }),
      card({ id: 'c', severity: 'info', group: 'anomaly_detection' }),
      card({ id: 'd', severity: 'info', group: 'predictive_maintenance' }),
      card({ id: 'e', severity: 'critical', group: 'network_health' }),
    ];
    const summary = getInsightsSummary(insights);
    expect(summary.total).toBe(5);
    expect(summary.critical).toBe(2);
    expect(summary.warning).toBe(1);
    expect(summary.info).toBe(2);
    expect(summary.byGroup.network_health).toBe(2);
    expect(summary.byGroup.capacity_planning).toBe(1);
    expect(summary.byGroup.anomaly_detection).toBe(1);
    expect(summary.byGroup.predictive_maintenance).toBe(1);
    expect(summary.topInsight).toBe(insights[0]);
  });

  it('returns null topInsight on empty input', () => {
    const summary = getInsightsSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.topInsight).toBeNull();
  });
});

describe('getInsightsByGroup', () => {
  it('partitions by group', () => {
    const insights = [
      card({ id: 'a', group: 'network_health' }),
      card({ id: 'b', group: 'network_health' }),
      card({ id: 'c', group: 'capacity_planning' }),
    ];
    const grouped = getInsightsByGroup(insights);
    expect(grouped.network_health).toHaveLength(2);
    expect(grouped.capacity_planning).toHaveLength(1);
    expect(grouped.anomaly_detection).toHaveLength(0);
    expect(grouped.predictive_maintenance).toHaveLength(0);
  });
});

describe('INSIGHT_GROUP_META', () => {
  it('has metadata for every group', () => {
    expect(INSIGHT_GROUP_META.network_health).toBeDefined();
    expect(INSIGHT_GROUP_META.capacity_planning).toBeDefined();
    expect(INSIGHT_GROUP_META.anomaly_detection).toBeDefined();
    expect(INSIGHT_GROUP_META.predictive_maintenance).toBeDefined();
  });

  it('every entry has name, icon, description, color', () => {
    for (const meta of Object.values(INSIGHT_GROUP_META)) {
      expect(meta.name).toBeTruthy();
      expect(meta.icon).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.color).toBeTruthy();
    }
  });
});

describe('calculateAIBaseline', () => {
  it('returns a thresholds object with the expected keys', () => {
    const t = calculateAIBaseline({
      rfqiHistory: [60, 70, 80, 90],
      channelUtilHistory: [10, 20, 30, 40],
      clientCountHistory: [10, 20, 30],
      apOnlineHistory: [5, 5, 5],
    });
    expect(t).toHaveProperty('rfqiTarget');
    expect(t).toHaveProperty('rfqiPoor');
    expect(t).toHaveProperty('channelUtilizationPct');
    expect(t).toHaveProperty('clientDensity');
    expect(t).toHaveProperty('latencyP95Ms');
    expect(t).toHaveProperty('retryRatePct');
    expect(t).toHaveProperty('confidence');
    expect(t).toHaveProperty('sampleSize');
  });

  it('confidence saturates at 1.0 with 100+ samples', () => {
    const big = Array.from({ length: 200 }, () => 75);
    const t = calculateAIBaseline({
      rfqiHistory: big,
      channelUtilHistory: big,
      clientCountHistory: big,
      apOnlineHistory: big,
    });
    expect(t.confidence).toBe(1);
  });

  it('confidence is sampleSize/100 below 100 samples', () => {
    const small = Array.from({ length: 50 }, () => 75);
    const t = calculateAIBaseline({
      rfqiHistory: small,
      channelUtilHistory: small,
      clientCountHistory: small,
      apOnlineHistory: small,
    });
    expect(t.confidence).toBe(0.5);
  });

  it('rfqiTarget never falls below 60 (floor)', () => {
    const lowAll = [10, 20, 30];
    const t = calculateAIBaseline({
      rfqiHistory: lowAll,
      channelUtilHistory: lowAll,
      clientCountHistory: lowAll,
      apOnlineHistory: [1, 1, 1],
    });
    expect(t.rfqiTarget).toBeGreaterThanOrEqual(60);
  });

  it('rfqiPoor never falls below 40 (floor)', () => {
    const lowAll = [10, 15, 20];
    const t = calculateAIBaseline({
      rfqiHistory: lowAll,
      channelUtilHistory: lowAll,
      clientCountHistory: lowAll,
      apOnlineHistory: [1, 1, 1],
    });
    expect(t.rfqiPoor).toBeGreaterThanOrEqual(40);
  });

  it('channelUtilizationPct is capped at 85', () => {
    const high = Array.from({ length: 100 }, () => 95);
    const t = calculateAIBaseline({
      rfqiHistory: [70],
      channelUtilHistory: high,
      clientCountHistory: [10],
      apOnlineHistory: [1],
    });
    expect(t.channelUtilizationPct).toBeLessThanOrEqual(85);
  });

  it('clientDensity computes from clientCountHistory / apOnlineHistory ratio at P80', () => {
    const t = calculateAIBaseline({
      rfqiHistory: [70],
      channelUtilHistory: [50],
      clientCountHistory: [40, 50, 60, 80, 100],
      apOnlineHistory: [10, 10, 10, 10, 10], // densities 4..10
      retryRateHistory: undefined,
    });
    expect(t.clientDensity).toBeGreaterThanOrEqual(20); // floor
  });

  it('falls back to defaults when retry/latency history is undefined', () => {
    const t = calculateAIBaseline({
      rfqiHistory: [70],
      channelUtilHistory: [50],
      clientCountHistory: [10],
      apOnlineHistory: [1],
    });
    expect(t.retryRatePct).toBeGreaterThan(0);
    expect(t.latencyP95Ms).toBeGreaterThan(0);
  });
});

describe('formatAIBaselineConfidence', () => {
  it('returns "Learning" when confidence < 0.3', () => {
    const out = formatAIBaselineConfidence({
      confidence: 0.1,
    } as Parameters<typeof formatAIBaselineConfidence>[0]);
    expect(out).toMatch(/Learning/);
  });

  it('returns "Moderate" when 0.3 ≤ confidence < 0.7', () => {
    const out = formatAIBaselineConfidence({
      confidence: 0.5,
    } as Parameters<typeof formatAIBaselineConfidence>[0]);
    expect(out).toMatch(/Moderate/);
  });

  it('returns a high-confidence message when confidence ≥ 0.7', () => {
    const out = formatAIBaselineConfidence({
      confidence: 0.9,
    } as Parameters<typeof formatAIBaselineConfidence>[0]);
    expect(out).toBeTruthy();
    expect(out).not.toMatch(/Learning|Moderate/);
  });
});
