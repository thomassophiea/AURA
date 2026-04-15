/** Minimal shape of a roaming event needed for sparkline bucketing. */
export interface RoamingEventForSparkline {
  timestamp: number;
  isFailedRoam?: boolean;
  dataRate?: number;
}

export interface SparklineBucket {
  label: string;
  timeMs: number;
  total: number;
  good: number;
  failed: number;
  avgDataRate: number | null;
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
  }));

  const rateSums = new Array<number>(bucketCount).fill(0);
  const rateCounts = new Array<number>(bucketCount).fill(0);

  for (const event of events) {
    const idx = Math.floor((event.timestamp - bucketStart) / bucketSizeMs);
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].total++;
    if (event.isFailedRoam) {
      buckets[idx].failed++;
    } else {
      buckets[idx].good++;
    }
    if (event.dataRate != null) {
      rateSums[idx] += event.dataRate;
      rateCounts[idx]++;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (rateCounts[i] > 0) {
      buckets[i].avgDataRate = rateSums[i] / rateCounts[i];
    }
  }

  return buckets;
}
