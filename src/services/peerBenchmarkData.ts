/**
 * Peer Benchmarking - Industry baselines and recommendation engine
 * Curated reference data per vertical for network performance comparison
 */

export interface BenchmarkMetrics {
  avgThroughput: number;       // Mbps
  apUptime: number;            // %
  roamingSuccessRate: number;  // %
  meanTimeToAssociate: number; // seconds (lower is better)
  clientDensityPerAP: number;  // peak client count
  highBandAdoption: number;    // % on 5GHz/6GHz
}

export interface VerticalBaseline {
  id: string;
  name: string;
  peerCount: number;
  metrics: BenchmarkMetrics;
}

export interface MetricDelta {
  key: keyof BenchmarkMetrics;
  label: string;
  unit: string;
  value: number;
  baselineValue: number;
  deltaPercent: number;
  isBetter: boolean;
  isNeutral: boolean;
  lowerIsBetter: boolean;
}

export interface BenchmarkScore {
  overall: number;        // 0-100
  topPercent: number;     // "Top X%"
  peerCount: number;
  vertical: string;
  metrics: MetricDelta[];
}

export interface Recommendation {
  id: string;
  metric: keyof BenchmarkMetrics;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export const VERTICALS: VerticalBaseline[] = [
  {
    id: 'enterprise',
    name: 'Enterprise',
    peerCount: 3842,
    metrics: {
      avgThroughput: 210.5,
      apUptime: 99.6,
      roamingSuccessRate: 96.2,
      meanTimeToAssociate: 3.2,
      clientDensityPerAP: 18.5,
      highBandAdoption: 72.4,
    },
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    peerCount: 1893,
    metrics: {
      avgThroughput: 175.8,
      apUptime: 99.8,
      roamingSuccessRate: 97.1,
      meanTimeToAssociate: 2.8,
      clientDensityPerAP: 14.2,
      highBandAdoption: 68.9,
    },
  },
  {
    id: 'education',
    name: 'Education',
    peerCount: 1247,
    metrics: {
      avgThroughput: 164.3,
      apUptime: 99.2,
      roamingSuccessRate: 93.8,
      meanTimeToAssociate: 4.5,
      clientDensityPerAP: 32.7,
      highBandAdoption: 58.2,
    },
  },
  {
    id: 'retail',
    name: 'Retail',
    peerCount: 2156,
    metrics: {
      avgThroughput: 142.6,
      apUptime: 99.1,
      roamingSuccessRate: 91.4,
      meanTimeToAssociate: 5.1,
      clientDensityPerAP: 22.3,
      highBandAdoption: 52.7,
    },
  },
  {
    id: 'hospitality',
    name: 'Hospitality',
    peerCount: 1654,
    metrics: {
      avgThroughput: 156.2,
      apUptime: 99.3,
      roamingSuccessRate: 94.5,
      meanTimeToAssociate: 3.9,
      clientDensityPerAP: 26.1,
      highBandAdoption: 61.8,
    },
  },
  {
    id: 'government',
    name: 'Government',
    peerCount: 987,
    metrics: {
      avgThroughput: 195.4,
      apUptime: 99.7,
      roamingSuccessRate: 95.8,
      meanTimeToAssociate: 3.5,
      clientDensityPerAP: 12.8,
      highBandAdoption: 65.3,
    },
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    peerCount: 1432,
    metrics: {
      avgThroughput: 132.7,
      apUptime: 99.4,
      roamingSuccessRate: 92.6,
      meanTimeToAssociate: 4.8,
      clientDensityPerAP: 8.4,
      highBandAdoption: 48.5,
    },
  },
  {
    id: 'logistics',
    name: 'Logistics',
    peerCount: 1108,
    metrics: {
      avgThroughput: 118.9,
      apUptime: 99.0,
      roamingSuccessRate: 90.2,
      meanTimeToAssociate: 5.6,
      clientDensityPerAP: 10.6,
      highBandAdoption: 44.1,
    },
  },
];

const METRIC_LABELS: Record<keyof BenchmarkMetrics, { label: string; unit: string; lowerIsBetter: boolean }> = {
  avgThroughput: { label: 'Avg client throughput', unit: 'Mbps', lowerIsBetter: false },
  apUptime: { label: 'AP uptime', unit: '%', lowerIsBetter: false },
  roamingSuccessRate: { label: 'Roaming success rate', unit: '%', lowerIsBetter: false },
  meanTimeToAssociate: { label: 'Mean time to associate', unit: 's', lowerIsBetter: true },
  clientDensityPerAP: { label: 'Client density per AP (peak)', unit: '', lowerIsBetter: false },
  highBandAdoption: { label: '5GHz / 6GHz adoption', unit: '%', lowerIsBetter: false },
};

const METRIC_WEIGHTS: Record<keyof BenchmarkMetrics, number> = {
  avgThroughput: 0.20,
  apUptime: 0.20,
  roamingSuccessRate: 0.15,
  meanTimeToAssociate: 0.15,
  clientDensityPerAP: 0.15,
  highBandAdoption: 0.15,
};

const NEUTRAL_THRESHOLD = 2; // within 2% is considered neutral

function computeMetricScore(value: number, baseline: number, lowerIsBetter: boolean): number {
  if (baseline === 0) return 50;
  const ratio = lowerIsBetter ? baseline / value : value / baseline;
  const score = Math.min(100, Math.max(0, ratio * 50));
  return score;
}

export function calculateBenchmarkScore(
  currentMetrics: BenchmarkMetrics,
  vertical: VerticalBaseline
): BenchmarkScore {
  const metricDeltas: MetricDelta[] = (Object.keys(METRIC_LABELS) as (keyof BenchmarkMetrics)[]).map((key) => {
    const { label, unit, lowerIsBetter } = METRIC_LABELS[key];
    const value = currentMetrics[key];
    const baselineValue = vertical.metrics[key];
    const rawDelta = baselineValue === 0 ? 0 : ((value - baselineValue) / baselineValue) * 100;
    const isBetter = lowerIsBetter ? value < baselineValue : value > baselineValue;
    const isNeutral = Math.abs(rawDelta) < NEUTRAL_THRESHOLD;

    return {
      key,
      label,
      unit,
      value,
      baselineValue,
      deltaPercent: Math.abs(rawDelta),
      isBetter,
      isNeutral,
      lowerIsBetter,
    };
  });

  let weightedScore = 0;
  for (const delta of metricDeltas) {
    const score = computeMetricScore(delta.value, delta.baselineValue, delta.lowerIsBetter);
    weightedScore += score * METRIC_WEIGHTS[delta.key];
  }

  const overall = Math.round(Math.min(100, Math.max(0, weightedScore)));
  const topPercent = Math.max(1, 100 - overall);

  return {
    overall,
    topPercent,
    peerCount: vertical.peerCount,
    vertical: vertical.name,
    metrics: metricDeltas,
  };
}

const RECOMMENDATION_RULES: Array<{
  metric: keyof BenchmarkMetrics;
  thresholdPercent: number;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}> = [
  {
    metric: 'avgThroughput',
    thresholdPercent: 10,
    title: 'Improve client throughput',
    description: 'Consider enabling band steering to 5GHz/6GHz, reducing co-channel interference, or upgrading APs in high-density areas to Wi-Fi 6E/7.',
    severity: 'warning',
  },
  {
    metric: 'apUptime',
    thresholdPercent: 1,
    title: 'Investigate AP reliability',
    description: 'Review AP health logs for recurring reboots or power issues. Consider PoE+ switches for consistent power delivery and firmware updates.',
    severity: 'critical',
  },
  {
    metric: 'roamingSuccessRate',
    thresholdPercent: 5,
    title: 'Optimize roaming experience',
    description: 'Enable 802.11r (Fast BSS Transition) and 802.11k (Neighbor Reports). Verify AP overlap zones have adequate signal strength (-67 dBm or better).',
    severity: 'warning',
  },
  {
    metric: 'meanTimeToAssociate',
    thresholdPercent: 15,
    title: 'Reduce association latency',
    description: 'Check DHCP server response times and DNS resolution. Enable PMKID caching or OKC for faster re-authentication. Reduce RADIUS timeout values.',
    severity: 'info',
  },
  {
    metric: 'clientDensityPerAP',
    thresholdPercent: 20,
    title: 'Review AP placement density',
    description: 'High client density may indicate insufficient AP coverage. Consider adding APs in congested areas or enabling load balancing.',
    severity: 'info',
  },
  {
    metric: 'highBandAdoption',
    thresholdPercent: 10,
    title: 'Increase 5GHz/6GHz adoption',
    description: 'Enable band steering policies to guide capable clients to higher bands. Consider minimum RSSI thresholds to discourage 2.4GHz association.',
    severity: 'warning',
  },
];

export function generateRecommendations(score: BenchmarkScore): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const rule of RECOMMENDATION_RULES) {
    const metric = score.metrics.find((m) => m.key === rule.metric);
    if (!metric) continue;

    const isUnderperforming = !metric.isBetter && !metric.isNeutral;
    if (isUnderperforming && metric.deltaPercent >= rule.thresholdPercent) {
      recommendations.push({
        id: `rec-${rule.metric}`,
        metric: rule.metric,
        title: rule.title,
        description: rule.description,
        severity: rule.severity,
      });
    }
  }

  return recommendations;
}

// Self-benchmark: mock historical data for demo
export interface SelfBenchmarkWindow {
  label: string;
  days: number;
}

export const SELF_BENCHMARK_WINDOWS: SelfBenchmarkWindow[] = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

export function generateMockHistoricalMetrics(
  current: BenchmarkMetrics,
  daysAgo: number
): BenchmarkMetrics {
  // Simulate older metrics being slightly worse (network improving over time)
  const degradation = 1 - (daysAgo / 1000); // subtle regression
  const jitter = () => 0.95 + Math.random() * 0.1; // +/- 5% random noise

  return {
    avgThroughput: +(current.avgThroughput * degradation * jitter()).toFixed(1),
    apUptime: +Math.min(100, current.apUptime * (1 - daysAgo * 0.0003) * jitter()).toFixed(1),
    roamingSuccessRate: +Math.min(100, current.roamingSuccessRate * degradation * jitter()).toFixed(1),
    meanTimeToAssociate: +(current.meanTimeToAssociate / degradation * jitter()).toFixed(1),
    clientDensityPerAP: +(current.clientDensityPerAP * jitter()).toFixed(1),
    highBandAdoption: +Math.min(100, current.highBandAdoption * degradation * jitter()).toFixed(1),
  };
}

export function calculateSelfBenchmarkScore(
  current: BenchmarkMetrics,
  historical: BenchmarkMetrics
): BenchmarkScore {
  const metricDeltas: MetricDelta[] = (Object.keys(METRIC_LABELS) as (keyof BenchmarkMetrics)[]).map((key) => {
    const { label, unit, lowerIsBetter } = METRIC_LABELS[key];
    const value = current[key];
    const baselineValue = historical[key];
    const rawDelta = baselineValue === 0 ? 0 : ((value - baselineValue) / baselineValue) * 100;
    const isBetter = lowerIsBetter ? value < baselineValue : value > baselineValue;
    const isNeutral = Math.abs(rawDelta) < NEUTRAL_THRESHOLD;

    return {
      key,
      label,
      unit,
      value,
      baselineValue,
      deltaPercent: Math.abs(rawDelta),
      isBetter,
      isNeutral,
      lowerIsBetter,
    };
  });

  // For self-benchmark, score is improvement percentage
  let improvementCount = 0;
  for (const d of metricDeltas) {
    if (d.isBetter) improvementCount++;
  }
  const overall = Math.round((improvementCount / metricDeltas.length) * 100);

  return {
    overall,
    topPercent: 0, // not applicable for self
    peerCount: 0,
    vertical: 'Self',
    metrics: metricDeltas,
  };
}
