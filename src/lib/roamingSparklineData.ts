/** Minimal shape of a roaming event needed for sparkline bucketing. */
export interface RoamingEventForSparkline {
  timestamp: number;
  isFailedRoam?: boolean;
  dataRate?: number;
  rssi?: number;
  dwell?: number;
  isLateRoam?: boolean;
  frequency?: string;
}

export interface SparklineBucket {
  label: string;
  timeMs: number;
  total: number;
  good: number;
  failed: number;
  avgDataRate: number | null;
  avgRssi: number | null;
  avgDwell: number | null;
  lateRoamCount: number;
  bandCounts: { '2.4GHz': number; '5GHz': number; '6GHz': number; other: number };
  /** Avg throughput in bps from station report, null when not fetched yet */
  throughputBps: number | null;
  /** Avg TCP round-trip time in ms from station report, null when not fetched yet */
  tcpRttMs: number | null;
}

function getBucketSizeMs(spanMs: number): number {
  if (spanMs < 2 * 3_600_000) return 5 * 60_000; // < 2h  → 5 min
  if (spanMs < 24 * 3_600_000) return 30 * 60_000; // < 24h → 30 min
  if (spanMs < 7 * 24 * 3_600_000) return 4 * 3_600_000; // < 7d  → 4 h
  return 24 * 3_600_000; // ≥ 7d  → 1 day
}

function formatBucketLabel(timeMs: number, bucketSizeMs: number): string {
  const d = new Date(timeMs);
  if (bucketSizeMs >= 24 * 3_600_000) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normBand(frequency: string | undefined): keyof SparklineBucket['bandCounts'] {
  if (!frequency) return 'other';
  if (frequency.includes('2.4')) return '2.4GHz';
  if (frequency.includes('5')) return '5GHz';
  if (frequency.includes('6')) return '6GHz';
  return 'other';
}

export function buildSparklineBuckets(events: RoamingEventForSparkline[]): SparklineBucket[] {
  if (events.length === 0) return [];

  const timestamps = events.map((e) => e.timestamp);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const spanMs = maxTime - minTime || 1;
  const bucketSizeMs = getBucketSizeMs(spanMs);

  const bucketStart = Math.floor(minTime / bucketSizeMs) * bucketSizeMs;
  const bucketCount = Math.ceil((maxTime - bucketStart) / bucketSizeMs) + 1;

  const buckets: SparklineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    label: formatBucketLabel(bucketStart + i * bucketSizeMs, bucketSizeMs),
    timeMs: bucketStart + i * bucketSizeMs,
    total: 0,
    good: 0,
    failed: 0,
    avgDataRate: null,
    avgRssi: null,
    avgDwell: null,
    lateRoamCount: 0,
    bandCounts: { '2.4GHz': 0, '5GHz': 0, '6GHz': 0, other: 0 },
    throughputBps: null,
    tcpRttMs: null,
  }));

  const rateSums = new Array<number>(bucketCount).fill(0);
  const rateCounts = new Array<number>(bucketCount).fill(0);
  const rssiSums = new Array<number>(bucketCount).fill(0);
  const rssiCounts = new Array<number>(bucketCount).fill(0);
  const dwellSums = new Array<number>(bucketCount).fill(0);
  const dwellCounts = new Array<number>(bucketCount).fill(0);

  for (const event of events) {
    const idx = Math.floor((event.timestamp - bucketStart) / bucketSizeMs);
    if (idx < 0 || idx >= buckets.length) continue;

    buckets[idx].total++;
    if (event.isFailedRoam) {
      buckets[idx].failed++;
    } else {
      buckets[idx].good++;
    }
    if (event.isLateRoam) {
      buckets[idx].lateRoamCount++;
    }

    const band = normBand(event.frequency);
    buckets[idx].bandCounts[band]++;

    if (event.dataRate != null) {
      rateSums[idx] += event.dataRate;
      rateCounts[idx]++;
    }
    if (event.rssi != null) {
      rssiSums[idx] += event.rssi;
      rssiCounts[idx]++;
    }
    if (event.dwell != null && event.dwell > 0) {
      dwellSums[idx] += event.dwell;
      dwellCounts[idx]++;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (rateCounts[i] > 0) buckets[i].avgDataRate = rateSums[i] / rateCounts[i];
    if (rssiCounts[i] > 0) buckets[i].avgRssi = rssiSums[i] / rssiCounts[i];
    if (dwellCounts[i] > 0) buckets[i].avgDwell = dwellSums[i] / dwellCounts[i];
  }

  return buckets;
}

// ─── Station report enrichment ─────────────────────────────────────────────

/** Extract throughput time series from a StationReportElement response. */
export function extractThroughputPoints(
  report: unknown
): Array<{ timestamp: number; valueBps: number }> {
  if (!report || typeof report !== 'object') return [];
  const r = report as Record<string, unknown>;
  const throughputReport = r['throughputReport'];
  if (!Array.isArray(throughputReport) || throughputReport.length === 0) return [];

  const stats = (throughputReport[0] as Record<string, unknown>)['statistics'];
  if (!Array.isArray(stats) || stats.length === 0) return [];

  // Prefer tntTotalBytes stat; fall back to first available
  const stat =
    (stats as Array<Record<string, unknown>>).find((s) => s['statName'] === 'tntTotalBytes') ||
    stats[0];
  const values = (stat as Record<string, unknown>)['values'];
  if (!Array.isArray(values)) return [];

  return (values as Array<Record<string, unknown>>)
    .filter((v) => v['timestamp'] != null && v['value'] != null)
    .map((v) => ({
      timestamp: Number(v['timestamp']),
      valueBps: Number(v['value']),
    }));
}

/** Extract TCP RTT time series from a StationReportElement response. */
export function extractRttPoints(report: unknown): Array<{ timestamp: number; rttMs: number }> {
  if (!report || typeof report !== 'object') return [];
  const r = report as Record<string, unknown>;
  const rttReport = r['averageTcpRoundTripTime'];
  if (!Array.isArray(rttReport) || rttReport.length === 0) return [];

  const stats = (rttReport[0] as Record<string, unknown>)['statistics'];
  if (!Array.isArray(stats) || stats.length === 0) return [];

  const stat = stats[0] as Record<string, unknown>;
  const values = stat['values'];
  if (!Array.isArray(values)) return [];

  return (values as Array<Record<string, unknown>>)
    .filter((v) => v['timestamp'] != null && v['value'] != null)
    .map((v) => ({
      timestamp: Number(v['timestamp']),
      rttMs: Number(v['value']),
    }));
}

/**
 * Merge station-report timeseries (throughput, RTT) into existing sparkline buckets.
 * Returns a new array; the original is not mutated.
 */
export function mergeReportIntoBuckets(
  buckets: SparklineBucket[],
  throughputPoints: Array<{ timestamp: number; valueBps: number }>,
  rttPoints: Array<{ timestamp: number; rttMs: number }>
): SparklineBucket[] {
  if (buckets.length === 0) return buckets;

  const updated = buckets.map((b) => ({ ...b }));
  const bucketSizeMs = buckets.length > 1 ? buckets[1].timeMs - buckets[0].timeMs : 5 * 60_000;
  const firstBucketMs = buckets[0].timeMs;

  const tptSums = new Array<number>(buckets.length).fill(0);
  const tptCounts = new Array<number>(buckets.length).fill(0);
  const rttSums = new Array<number>(buckets.length).fill(0);
  const rttCounts = new Array<number>(buckets.length).fill(0);

  for (const pt of throughputPoints) {
    const idx = Math.floor((pt.timestamp - firstBucketMs) / bucketSizeMs);
    if (idx >= 0 && idx < buckets.length) {
      tptSums[idx] += pt.valueBps;
      tptCounts[idx]++;
    }
  }

  for (const pt of rttPoints) {
    const idx = Math.floor((pt.timestamp - firstBucketMs) / bucketSizeMs);
    if (idx >= 0 && idx < buckets.length) {
      rttSums[idx] += pt.rttMs;
      rttCounts[idx]++;
    }
  }

  for (let i = 0; i < updated.length; i++) {
    if (tptCounts[i] > 0) updated[i].throughputBps = tptSums[i] / tptCounts[i];
    if (rttCounts[i] > 0) updated[i].tcpRttMs = rttSums[i] / rttCounts[i];
  }

  return updated;
}
