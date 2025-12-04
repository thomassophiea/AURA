import * as kv from './kv_store.tsx';

export interface ThroughputSnapshot {
  timestamp: number;
  totalUpload: number;
  totalDownload: number;
  totalTraffic: number;
  clientCount: number;
  avgPerClient: number;
  networkBreakdown: Array<{
    network: string;
    upload: number;
    download: number;
    total: number;
    clients: number;
  }>;
}

const THROUGHPUT_PREFIX = 'throughput:';
const MAX_SNAPSHOTS = 1000; // Keep last 1000 snapshots
const SNAPSHOT_INTERVAL = 30000; // 30 seconds

/**
 * Store a throughput snapshot
 */
export async function storeThroughputSnapshot(snapshot: ThroughputSnapshot): Promise<void> {
  const key = `${THROUGHPUT_PREFIX}${snapshot.timestamp}`;
  await kv.set(key, snapshot);
  
  // Clean up old snapshots to prevent unbounded growth
  await cleanupOldSnapshots();
}

/**
 * Get throughput snapshots within a time range
 */
export async function getThroughputSnapshots(
  startTime?: number,
  endTime?: number,
  limit?: number
): Promise<ThroughputSnapshot[]> {
  const allSnapshots = await kv.getByPrefix(THROUGHPUT_PREFIX);
  
  let snapshots = allSnapshots
    .map(item => item as ThroughputSnapshot)
    .filter(s => s && s.timestamp);
  
  // Filter by time range if specified
  if (startTime) {
    snapshots = snapshots.filter(s => s.timestamp >= startTime);
  }
  if (endTime) {
    snapshots = snapshots.filter(s => s.timestamp <= endTime);
  }
  
  // Sort by timestamp (newest first)
  snapshots.sort((a, b) => b.timestamp - a.timestamp);
  
  // Apply limit if specified
  if (limit && limit > 0) {
    snapshots = snapshots.slice(0, limit);
  }
  
  // Return in chronological order (oldest first)
  return snapshots.reverse();
}

/**
 * Get the most recent throughput snapshot
 */
export async function getLatestThroughputSnapshot(): Promise<ThroughputSnapshot | null> {
  const snapshots = await getThroughputSnapshots(undefined, undefined, 1);
  return snapshots.length > 0 ? snapshots[0] : null;
}

/**
 * Calculate aggregated throughput statistics over a time period
 */
export async function getAggregatedThroughput(
  startTime: number,
  endTime: number
): Promise<{
  avgUpload: number;
  avgDownload: number;
  avgTotal: number;
  maxUpload: number;
  maxDownload: number;
  maxTotal: number;
  avgClientCount: number;
  snapshotCount: number;
}> {
  const snapshots = await getThroughputSnapshots(startTime, endTime);
  
  if (snapshots.length === 0) {
    return {
      avgUpload: 0,
      avgDownload: 0,
      avgTotal: 0,
      maxUpload: 0,
      maxDownload: 0,
      maxTotal: 0,
      avgClientCount: 0,
      snapshotCount: 0
    };
  }
  
  let totalUpload = 0;
  let totalDownload = 0;
  let totalTraffic = 0;
  let totalClients = 0;
  let maxUpload = 0;
  let maxDownload = 0;
  let maxTotal = 0;
  
  for (const snapshot of snapshots) {
    totalUpload += snapshot.totalUpload;
    totalDownload += snapshot.totalDownload;
    totalTraffic += snapshot.totalTraffic;
    totalClients += snapshot.clientCount;
    
    maxUpload = Math.max(maxUpload, snapshot.totalUpload);
    maxDownload = Math.max(maxDownload, snapshot.totalDownload);
    maxTotal = Math.max(maxTotal, snapshot.totalTraffic);
  }
  
  const count = snapshots.length;
  
  return {
    avgUpload: totalUpload / count,
    avgDownload: totalDownload / count,
    avgTotal: totalTraffic / count,
    maxUpload,
    maxDownload,
    maxTotal,
    avgClientCount: totalClients / count,
    snapshotCount: count
  };
}

/**
 * Clean up old snapshots to prevent unbounded database growth
 */
async function cleanupOldSnapshots(): Promise<void> {
  const allSnapshots = await kv.getByPrefix(THROUGHPUT_PREFIX);
  
  if (allSnapshots.length <= MAX_SNAPSHOTS) {
    return; // No cleanup needed
  }
  
  // Sort by timestamp
  const sorted = allSnapshots
    .map(item => item as ThroughputSnapshot)
    .filter(s => s && s.timestamp)
    .sort((a, b) => b.timestamp - a.timestamp);
  
  // Delete oldest snapshots
  const toDelete = sorted.slice(MAX_SNAPSHOTS);
  const keysToDelete = toDelete.map(s => `${THROUGHPUT_PREFIX}${s.timestamp}`);
  
  if (keysToDelete.length > 0) {
    await kv.mdel(keysToDelete);
    console.log(`Cleaned up ${keysToDelete.length} old throughput snapshots`);
  }
}

/**
 * Get network-specific throughput trends
 */
export async function getNetworkThroughputTrends(
  networkName: string,
  startTime?: number,
  endTime?: number
): Promise<Array<{
  timestamp: number;
  upload: number;
  download: number;
  total: number;
  clients: number;
}>> {
  const snapshots = await getThroughputSnapshots(startTime, endTime);
  
  return snapshots
    .map(snapshot => {
      const networkData = snapshot.networkBreakdown?.find(n => n.network === networkName);
      if (!networkData) {
        return null;
      }
      return {
        timestamp: snapshot.timestamp,
        upload: networkData.upload,
        download: networkData.download,
        total: networkData.total,
        clients: networkData.clients
      };
    })
    .filter(item => item !== null) as Array<{
      timestamp: number;
      upload: number;
      download: number;
      total: number;
      clients: number;
    }>;
}

/**
 * Delete all throughput data (for admin purposes)
 */
export async function clearAllThroughputData(): Promise<number> {
  const allSnapshots = await kv.getByPrefix(THROUGHPUT_PREFIX);
  const keys = allSnapshots
    .map(item => item as ThroughputSnapshot)
    .filter(s => s && s.timestamp)
    .map(s => `${THROUGHPUT_PREFIX}${s.timestamp}`);
  
  if (keys.length > 0) {
    await kv.mdel(keys);
  }
  
  return keys.length;
}
