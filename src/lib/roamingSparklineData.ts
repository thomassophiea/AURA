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
