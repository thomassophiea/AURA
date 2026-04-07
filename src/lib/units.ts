/**
 * Unit Formatting Utilities
 *
 * Implements cloud console specification for consistent unit display
 * with auto-scaling rules across all dashboards.
 */

/**
 * Format throughput with auto-scaling
 * Rules:
 * - >= 1000 Mbps → Gbps with 1 decimal
 * - >= 1 Mbps → Mbps with up to 1 decimal
 * - < 1 Mbps → Kbps with 0 decimals
 */
export function formatThroughput(mbps: number): string {
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    return `${gbps.toFixed(1)} Gbps`;
  }
  if (mbps >= 1) {
    // Show 1 decimal for values 1-999 Mbps to avoid losing precision
    return `${mbps.toFixed(1)} Mbps`;
  }
  // For very small values, show in Kbps
  const kbps = mbps * 1000;
  return `${Math.round(kbps)} Kbps`;
}

/**
 * Format data volume with auto-scaling
 * Rules:
 * - >= 1000 MB → GB with 1 decimal
 * - < 1000 MB → MB with 0 decimals
 */
export function formatDataVolume(mb: number): string {
  if (mb >= 1000) {
    const gb = mb / 1000;
    return `${gb.toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/**
 * Format bytes to auto-scaled data volume
 * Converts bytes to MB/GB following scaling rules
 */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  return formatDataVolume(mb);
}

/**
 * Format bits per second to auto-scaled throughput
 * Converts bps to Mbps/Gbps following scaling rules
 */
export function formatBitsPerSecond(bps: number): string {
  const mbps = bps / 1_000_000;
  return formatThroughput(mbps);
}

/**
 * Calculate real-time throughput from byte deltas
 * Formula: ((bytes_tx_t2 + bytes_rx_t2) - (bytes_tx_t1 + bytes_rx_t1)) * 8 / sampling_interval_seconds
 */
export function calculateThroughput(
  bytesTx1: number,
  bytesRx1: number,
  bytesTx2: number,
  bytesRx2: number,
  samplingIntervalSeconds: number
): number {
  const totalBytes1 = bytesTx1 + bytesRx1;
  const totalBytes2 = bytesTx2 + bytesRx2;
  const deltaBytes = totalBytes2 - totalBytes1;
  const deltaBits = deltaBytes * 8;
  const bps = deltaBits / samplingIntervalSeconds;
  return bps / 1_000_000; // Return as Mbps
}

/**
 * Tooltip definitions per spec
 */
export const TOOLTIPS = {
  THROUGHPUT: "Current network throughput measured in megabits per second",
  DATA_TRANSFERRED: "Total data transferred over the selected time window",
  REAL_TIME_THROUGHPUT: "Rate of data transfer calculated as bits per second over a defined sampling interval",
  CUMULATIVE_DATA: "Total amount of data transferred over a defined time window",
} as const;

/**
 * Get appropriate unit label for a value
 */
export function getThroughputUnit(mbps: number): 'Mbps' | 'Gbps' {
  return mbps >= 1000 ? 'Gbps' : 'Mbps';
}

export function getDataVolumeUnit(mb: number): 'MB' | 'GB' {
  return mb >= 1000 ? 'GB' : 'MB';
}

/**
 * Format large numbers compactly (e.g., 4,041,861 -> "4.04M")
 * Rules:
 * - >= 1 billion → B with up to 2 decimals
 * - >= 1 million → M with up to 2 decimals
 * - >= 1 thousand → K with up to 1 decimal
 * - < 1000 → full number with locale formatting
 */
export function formatCompactNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return 'N/A';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return num.toLocaleString();
}
