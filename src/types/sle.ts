/**
 * Service Level Expectations (SLE) Type Definitions
 * Inspired by Juniper Mist SLE architecture
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
}

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
  apHealth: { /* status-based, no threshold */ };
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
