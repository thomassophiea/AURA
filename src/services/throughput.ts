import { projectId, publicAnonKey } from '../utils/supabase/info';

const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/make-server-efba0687`;

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

export interface AggregatedThroughputStats {
  avgUpload: number;
  avgDownload: number;
  avgTotal: number;
  maxUpload: number;
  maxDownload: number;
  maxTotal: number;
  avgClientCount: number;
  snapshotCount: number;
}

export interface NetworkThroughputTrend {
  timestamp: number;
  upload: number;
  download: number;
  total: number;
  clients: number;
}

class ThroughputService {
  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Store a throughput snapshot
   */
  async storeSnapshot(snapshot: ThroughputSnapshot): Promise<void> {
    await this.makeRequest('/throughput/snapshot', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  }

  /**
   * Get throughput snapshots within a time range
   */
  async getSnapshots(
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<ThroughputSnapshot[]> {
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime.toString());
    if (endTime) params.append('endTime', endTime.toString());
    if (limit) params.append('limit', limit.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/throughput/snapshots?${queryString}` : '/throughput/snapshots';
    
    const result = await this.makeRequest(endpoint);
    return result.snapshots || [];
  }

  /**
   * Get the latest throughput snapshot
   */
  async getLatestSnapshot(): Promise<ThroughputSnapshot | null> {
    const result = await this.makeRequest('/throughput/latest');
    return result.snapshot || null;
  }

  /**
   * Get aggregated throughput statistics over a time period
   */
  async getAggregatedStats(
    startTime: number,
    endTime: number
  ): Promise<AggregatedThroughputStats> {
    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
    });
    
    return this.makeRequest(`/throughput/aggregated?${params.toString()}`);
  }

  /**
   * Get network-specific throughput trends
   */
  async getNetworkTrends(
    networkName: string,
    startTime?: number,
    endTime?: number
  ): Promise<NetworkThroughputTrend[]> {
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime.toString());
    if (endTime) params.append('endTime', endTime.toString());

    const queryString = params.toString();
    const endpoint = queryString 
      ? `/throughput/network/${encodeURIComponent(networkName)}?${queryString}` 
      : `/throughput/network/${encodeURIComponent(networkName)}`;
    
    const result = await this.makeRequest(endpoint);
    return result.trends || [];
  }

  /**
   * Clear all throughput data
   */
  async clearAllData(): Promise<number> {
    const result = await this.makeRequest('/throughput/clear', {
      method: 'DELETE',
    });
    return result.deletedCount || 0;
  }

  /**
   * Get snapshots for the last N hours
   */
  async getSnapshotsForLastHours(hours: number): Promise<ThroughputSnapshot[]> {
    const endTime = Date.now();
    const startTime = endTime - (hours * 60 * 60 * 1000);
    return this.getSnapshots(startTime, endTime);
  }

  /**
   * Get snapshots for the last N minutes
   */
  async getSnapshotsForLastMinutes(minutes: number): Promise<ThroughputSnapshot[]> {
    const endTime = Date.now();
    const startTime = endTime - (minutes * 60 * 1000);
    return this.getSnapshots(startTime, endTime);
  }

  /**
   * Get today's throughput statistics
   */
  async getTodayStats(): Promise<AggregatedThroughputStats> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endTime = Date.now();
    return this.getAggregatedStats(startOfDay, endTime);
  }
}

export const throughputService = new ThroughputService();