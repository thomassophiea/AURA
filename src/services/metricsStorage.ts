import { supabase, ServiceMetricsSnapshot, NetworkSnapshot } from './supabaseClient';

/**
 * Metrics Storage Service
 * Handles storing and retrieving time-series metrics data for Network Rewind feature
 */

export class MetricsStorageService {
  private static instance: MetricsStorageService;
  private collectionInterval: NodeJS.Timeout | null = null;
  private isCollecting = false;

  private constructor() {}

  static getInstance(): MetricsStorageService {
    if (!MetricsStorageService.instance) {
      MetricsStorageService.instance = new MetricsStorageService();
    }
    return MetricsStorageService.instance;
  }

  /**
   * Save a service metrics snapshot
   */
  async saveServiceMetrics(snapshot: Omit<ServiceMetricsSnapshot, 'id' | 'created_at'>): Promise<void> {
    try {
      const { error } = await supabase
        .from('service_metrics_snapshots')
        .insert({
          service_id: snapshot.service_id,
          service_name: snapshot.service_name,
          timestamp: snapshot.timestamp,
          metrics: snapshot.metrics
        });

      if (error) {
        console.error('[MetricsStorage] Error saving service metrics:', error);
        throw error;
      }

      console.log(`[MetricsStorage] Saved metrics for service ${snapshot.service_name}`);
    } catch (error) {
      console.error('[MetricsStorage] Failed to save service metrics:', error);
      // Don't throw - we don't want to break the app if storage fails
    }
  }

  /**
   * Save a network-wide snapshot
   */
  async saveNetworkSnapshot(snapshot: Omit<NetworkSnapshot, 'id' | 'created_at'>): Promise<void> {
    try {
      const { error } = await supabase
        .from('network_snapshots')
        .insert({
          timestamp: snapshot.timestamp,
          site_id: snapshot.site_id,
          site_name: snapshot.site_name,
          total_services: snapshot.total_services,
          total_clients: snapshot.total_clients,
          total_throughput: snapshot.total_throughput,
          average_reliability: snapshot.average_reliability
        });

      if (error) {
        console.error('[MetricsStorage] Error saving network snapshot:', error);
        throw error;
      }

      console.log('[MetricsStorage] Saved network snapshot');
    } catch (error) {
      console.error('[MetricsStorage] Failed to save network snapshot:', error);
    }
  }

  /**
   * Get service metrics for a specific time range
   */
  async getServiceMetrics(
    serviceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ServiceMetricsSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('service_metrics_snapshots')
        .select('*')
        .eq('service_id', serviceId)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('[MetricsStorage] Error fetching service metrics:', error);
        return [];
      }

      return data as ServiceMetricsSnapshot[];
    } catch (error) {
      console.error('[MetricsStorage] Failed to fetch service metrics:', error);
      return [];
    }
  }

  /**
   * Get the closest service metrics snapshot to a specific timestamp
   */
  async getServiceMetricsAtTime(
    serviceId: string,
    targetTime: Date,
    toleranceMinutes: number = 15
  ): Promise<ServiceMetricsSnapshot | null> {
    try {
      const startTime = new Date(targetTime.getTime() - toleranceMinutes * 60 * 1000);
      const endTime = new Date(targetTime.getTime() + toleranceMinutes * 60 * 1000);

      const { data, error } = await supabase
        .from('service_metrics_snapshots')
        .select('*')
        .eq('service_id', serviceId)
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[MetricsStorage] Error fetching metrics at time:', error);
        return null;
      }

      return data && data.length > 0 ? (data[0] as ServiceMetricsSnapshot) : null;
    } catch (error) {
      console.error('[MetricsStorage] Failed to fetch metrics at time:', error);
      return null;
    }
  }

  /**
   * Get network snapshots for a time range
   */
  async getNetworkSnapshots(
    startTime: Date,
    endTime: Date
  ): Promise<NetworkSnapshot[]> {
    try {
      const { data, error } = await supabase
        .from('network_snapshots')
        .select('*')
        .gte('timestamp', startTime.toISOString())
        .lte('timestamp', endTime.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('[MetricsStorage] Error fetching network snapshots:', error);
        return [];
      }

      return data as NetworkSnapshot[];
    } catch (error) {
      console.error('[MetricsStorage] Failed to fetch network snapshots:', error);
      return [];
    }
  }

  /**
   * Get available time range for historical data
   */
  async getAvailableTimeRange(serviceId?: string): Promise<{ earliest: Date | null; latest: Date | null }> {
    try {
      const table = serviceId ? 'service_metrics_snapshots' : 'network_snapshots';
      let query = supabase.from(table).select('timestamp').order('timestamp', { ascending: true });

      if (serviceId) {
        query = query.eq('service_id', serviceId);
      }

      const { data: earliestData } = await query.limit(1);

      let queryLatest = supabase.from(table).select('timestamp').order('timestamp', { ascending: false });
      if (serviceId) {
        queryLatest = queryLatest.eq('service_id', serviceId);
      }

      const { data: latestData } = await queryLatest.limit(1);

      return {
        earliest: earliestData && earliestData.length > 0 ? new Date(earliestData[0].timestamp) : null,
        latest: latestData && latestData.length > 0 ? new Date(latestData[0].timestamp) : null
      };
    } catch (error) {
      console.error('[MetricsStorage] Failed to get available time range:', error);
      return { earliest: null, latest: null };
    }
  }

  /**
   * Clean up old data (older than 90 days)
   */
  async cleanupOldData(): Promise<void> {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { error: serviceError } = await supabase
        .from('service_metrics_snapshots')
        .delete()
        .lt('timestamp', ninetyDaysAgo.toISOString());

      const { error: networkError } = await supabase
        .from('network_snapshots')
        .delete()
        .lt('timestamp', ninetyDaysAgo.toISOString());

      if (serviceError || networkError) {
        console.error('[MetricsStorage] Error cleaning up old data:', serviceError || networkError);
      } else {
        console.log('[MetricsStorage] Successfully cleaned up data older than 90 days');
      }
    } catch (error) {
      console.error('[MetricsStorage] Failed to cleanup old data:', error);
    }
  }

  /**
   * Start periodic metrics collection
   * @param intervalMinutes - How often to collect metrics (default: 15 minutes)
   */
  startPeriodicCollection(intervalMinutes: number = 15, collectCallback: () => Promise<void>): void {
    if (this.isCollecting) {
      console.warn('[MetricsStorage] Periodic collection already running');
      return;
    }

    this.isCollecting = true;
    console.log(`[MetricsStorage] Starting periodic collection every ${intervalMinutes} minutes`);

    // Collect immediately
    collectCallback().catch(err =>
      console.error('[MetricsStorage] Error in initial collection:', err)
    );

    // Then set up interval
    this.collectionInterval = setInterval(() => {
      collectCallback().catch(err =>
        console.error('[MetricsStorage] Error in periodic collection:', err)
      );
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop periodic metrics collection
   */
  stopPeriodicCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      this.isCollecting = false;
      console.log('[MetricsStorage] Stopped periodic collection');
    }
  }

  /**
   * Check if Supabase is configured and accessible
   */
  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('service_metrics_snapshots').select('count').limit(1);
      if (error) {
        console.warn('[MetricsStorage] Supabase connection check failed:', error.message);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[MetricsStorage] Supabase not accessible:', error);
      return false;
    }
  }
}

export const metricsStorage = MetricsStorageService.getInstance();
