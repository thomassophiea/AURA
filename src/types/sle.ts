/**
 * Service Level Expectations (SLE) Type Definitions
 */

export interface SLEMetric {
  id: string;
  name: string;
  scope: 'wireless' | 'wired';
  successRate: number; // 0-100
  status: 'good' | 'warn' | 'poor';
  unit: string;
  totalUserMinutes: number;
  affectedUserMinutes: number;
  timeSeries: SLETimeSeriesPoint[];
  classifiers: SLEClassifier[];
  description: string;
  /**
   * False when there was nothing to measure (no clients/APs in scope). Such a
   * metric must NOT be shown as a healthy 100% — an empty site is "no data",
   * not "perfect". Defaults to true (treated as data-bearing) when absent.
   */
  hasData?: boolean;
}

/**
 * Flag metrics with no measured entities as no-data, so empty sites don't render
 * as a fabricated 100%. Keeps non-empty metrics untouched.
 */
export function markSLEDataPresence(sles: SLEMetric[]): SLEMetric[] {
  return sles.map((s) => ({ ...s, hasData: s.totalUserMinutes > 0 }));
}

/** Gray treatment for no-data metrics. */
export const SLE_NODATA_COLOR = { text: 'text-muted-foreground', hex: '#6b7280' } as const;

export interface SLETimeSeriesPoint {
  timestamp: number;
  time: string;
  successRate: number;
  totalClients: number;
  affectedClients: number;
}

export interface SLEClassifier {
  id: string;
  name: string;
  impactPercent: number; // % of total failures this classifier accounts for
  affectedClients: number;
  subClassifiers?: SLEClassifier[];
}

export interface SLERootCause {
  classifierId: string;
  classifierName: string;
  description: string;
  affectedDevices: Array<{ mac: string; name: string; ap: string; rssi?: number }>;
  affectedAPs: Array<{ serial: string; name: string; status?: string }>;
  recommendations: string[];
}

export interface SLEThresholds {
  coverage: { rssiMin: number }; // default -70 dBm
  throughput: { minRateBps: number }; // default 1_000_000 (1 Mbps)
  capacity: { maxChannelUtil: number }; // default 80%
  successfulConnects: { minSuccessRate: number }; // default 95%
  timeToConnect: { maxSeconds: number }; // default 5s
  roaming: { maxLatencyMs: number }; // default 500ms
  apHealth: Record<string, never>; // status-based, no threshold
}

export const DEFAULT_SLE_THRESHOLDS: SLEThresholds = {
  coverage: { rssiMin: -70 },
  throughput: { minRateBps: 1_000_000 },
  capacity: { maxChannelUtil: 80 },
  successfulConnects: { minSuccessRate: 95 },
  timeToConnect: { maxSeconds: 5 },
  roaming: { maxLatencyMs: 500 },
  apHealth: {},
};

export function getSLEStatus(rate: number): 'good' | 'warn' | 'poor' {
  if (rate >= 95) return 'good';
  if (rate >= 80) return 'warn';
  return 'poor';
}

export const SLE_STATUS_COLORS = {
  good: { text: 'text-green-500', bg: 'bg-green-500', hex: '#22c55e' },
  warn: { text: 'text-amber-500', bg: 'bg-amber-500', hex: '#f59e0b' },
  poor: { text: 'text-red-500', bg: 'bg-red-500', hex: '#ef4444' },
} as const;
