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

/**
 * Widget list to request from /v1/report/stations when enriching the sparkline.
 * Covers throughput, RTT, and all baseline timeseries.
 */
export const SPARKLINE_WIDGET_LIST =
  'throughputReport,averageTcpRoundTripTime,baseliningRss,baseliningTxRate,baseliningRxRate,baseliningWirelessRTT,rfQuality';

// Internal helper: pull {timestamp, value} pairs from any report array field.
function extractTimeSeries(
  report: Record<string, unknown>,
  fieldName: string,
  preferStatName?: string
): Array<{ timestamp: number; value: number }> {
  const section = report[fieldName];
  if (!Array.isArray(section) || section.length === 0) return [];

  const stats = (section[0] as Record<string, unknown>)['statistics'];
  if (!Array.isArray(stats) || stats.length === 0) return [];

  const stat = preferStatName
    ? ((stats as Array<Record<string, unknown>>).find((s) => s['statName'] === preferStatName) ??
      stats[0])
    : stats[0];

  const values = (stat as Record<string, unknown>)['values'];
  if (!Array.isArray(values)) return [];

  return (values as Array<Record<string, unknown>>)
    .filter((v) => v['timestamp'] != null && v['value'] != null)
    .map((v) => ({ timestamp: Number(v['timestamp']), value: Number(v['value']) }));
}

/** Extract throughput time series (bps) from a StationReportElement response. */
export function extractThroughputPoints(
  report: unknown
): Array<{ timestamp: number; valueBps: number }> {
  if (!report || typeof report !== 'object') return [];
  return extractTimeSeries(
    report as Record<string, unknown>,
    'throughputReport',
    'tntTotalBytes'
  ).map((p) => ({ timestamp: p.timestamp, valueBps: p.value }));
}

/** Extract TCP RTT time series (ms) from a StationReportElement response. */
export function extractRttPoints(report: unknown): Array<{ timestamp: number; rttMs: number }> {
  if (!report || typeof report !== 'object') return [];
  return extractTimeSeries(report as Record<string, unknown>, 'averageTcpRoundTripTime').map(
    (p) => ({ timestamp: p.timestamp, rttMs: p.value })
  );
}

/** Extract baseline RSS time series (dBm) from a StationReportElement response. */
export function extractRssPoints(report: unknown): Array<{ timestamp: number; rssiDbm: number }> {
  if (!report || typeof report !== 'object') return [];
  return extractTimeSeries(report as Record<string, unknown>, 'baseliningRss').map((p) => ({
    timestamp: p.timestamp,
    rssiDbm: p.value,
  }));
}

/** Extract baseline Tx rate time series (Mbps) from a StationReportElement response. */
export function extractTxRatePoints(
  report: unknown
): Array<{ timestamp: number; rateMbps: number }> {
  if (!report || typeof report !== 'object') return [];
  return extractTimeSeries(report as Record<string, unknown>, 'baseliningTxRate').map((p) => ({
    timestamp: p.timestamp,
    rateMbps: p.value,
  }));
}

/** Extract baseline wireless RTT time series (ms) from a StationReportElement. */
export function extractWirelessRttPoints(
  report: unknown
): Array<{ timestamp: number; rttMs: number }> {
  if (!report || typeof report !== 'object') return [];
  return extractTimeSeries(report as Record<string, unknown>, 'baseliningWirelessRTT').map((p) => ({
    timestamp: p.timestamp,
    rttMs: p.value,
  }));
}

/** All extracted series from a station report, ready for merging. */
export interface StationReportSeries {
  throughputPoints: Array<{ timestamp: number; valueBps: number }>;
  rttPoints: Array<{ timestamp: number; rttMs: number }>;
  rssPoints: Array<{ timestamp: number; rssiDbm: number }>;
  txRatePoints: Array<{ timestamp: number; rateMbps: number }>;
  wirelessRttPoints: Array<{ timestamp: number; rttMs: number }>;
}

/** Extract all sparkline-relevant timeseries from a StationReportElement in one pass. */
export function extractAllSeriesFromReport(report: unknown): StationReportSeries {
  return {
    throughputPoints: extractThroughputPoints(report),
    rttPoints: extractRttPoints(report),
    rssPoints: extractRssPoints(report),
    txRatePoints: extractTxRatePoints(report),
    wirelessRttPoints: extractWirelessRttPoints(report),
  };
}

/**
 * Merge station-report timeseries into existing sparkline buckets.
 *
 * - throughputBps / tcpRttMs: always written from report data
 * - avgRssi / avgDataRate: only written for buckets where events provided no value
 *   (baseline fills gaps without overwriting precise event-time measurements)
 *
 * Returns a new array; the original is not mutated.
 */
export function mergeReportIntoBuckets(
  buckets: SparklineBucket[],
  series: StationReportSeries
): SparklineBucket[] {
  if (buckets.length === 0) return buckets;

  const updated = buckets.map((b) => ({ ...b }));
  const bucketSizeMs = buckets.length > 1 ? buckets[1].timeMs - buckets[0].timeMs : 5 * 60_000;
  const firstBucketMs = buckets[0].timeMs;
  const n = buckets.length;

  function idx(ts: number) {
    return Math.floor((ts - firstBucketMs) / bucketSizeMs);
  }

  // Throughput
  const tptSums = new Array<number>(n).fill(0);
  const tptCounts = new Array<number>(n).fill(0);
  for (const pt of series.throughputPoints) {
    const i = idx(pt.timestamp);
    if (i >= 0 && i < n) {
      tptSums[i] += pt.valueBps;
      tptCounts[i]++;
    }
  }

  // TCP RTT
  const rttSums = new Array<number>(n).fill(0);
  const rttCounts = new Array<number>(n).fill(0);
  for (const pt of series.rttPoints) {
    const i = idx(pt.timestamp);
    if (i >= 0 && i < n) {
      rttSums[i] += pt.rttMs;
      rttCounts[i]++;
    }
  }

  // Baseline RSS — backfill only
  const rssSums = new Array<number>(n).fill(0);
  const rssCounts = new Array<number>(n).fill(0);
  for (const pt of series.rssPoints) {
    const i = idx(pt.timestamp);
    if (i >= 0 && i < n) {
      rssSums[i] += pt.rssiDbm;
      rssCounts[i]++;
    }
  }

  // Baseline Tx rate — backfill only
  const rateSums = new Array<number>(n).fill(0);
  const rateCounts = new Array<number>(n).fill(0);
  for (const pt of series.txRatePoints) {
    const i = idx(pt.timestamp);
    if (i >= 0 && i < n) {
      rateSums[i] += pt.rateMbps;
      rateCounts[i]++;
    }
  }

  // Wireless RTT — use when TCP RTT isn't available
  const wRttSums = new Array<number>(n).fill(0);
  const wRttCounts = new Array<number>(n).fill(0);
  for (const pt of series.wirelessRttPoints) {
    const i = idx(pt.timestamp);
    if (i >= 0 && i < n) {
      wRttSums[i] += pt.rttMs;
      wRttCounts[i]++;
    }
  }

  for (let i = 0; i < n; i++) {
    if (tptCounts[i] > 0) updated[i].throughputBps = tptSums[i] / tptCounts[i];

    // TCP RTT, fall back to wireless RTT if TCP not present
    if (rttCounts[i] > 0) {
      updated[i].tcpRttMs = rttSums[i] / rttCounts[i];
    } else if (wRttCounts[i] > 0) {
      updated[i].tcpRttMs = wRttSums[i] / wRttCounts[i];
    }

    // Backfill avgRssi only when events didn't provide it
    if (updated[i].avgRssi == null && rssCounts[i] > 0) {
      updated[i].avgRssi = rssSums[i] / rssCounts[i];
    }

    // Backfill avgDataRate only when events didn't provide it
    if (updated[i].avgDataRate == null && rateCounts[i] > 0) {
      updated[i].avgDataRate = rateSums[i] / rateCounts[i];
    }
  }

  return updated;
}
