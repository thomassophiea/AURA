import { supabase, ServiceMetricsSnapshot } from './supabaseClient';

export class MetricsStorageService {
  private static instance: MetricsStorageService;

  private constructor() {}

  static getInstance(): MetricsStorageService {
    if (!MetricsStorageService.instance) {
      MetricsStorageService.instance = new MetricsStorageService();
    }
    return MetricsStorageService.instance;
  }

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

      if (error) throw error;
      console.log(`[MetricsStorage] Saved metrics for ${snapshot.service_name}`);
    } catch (error) {
      console.error('[MetricsStorage] Failed to save:', error);
    }
  }

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

      if (error) throw error;
      return data && data.length > 0 ? (data[0] as ServiceMetricsSnapshot) : null;
    } catch (error) {
      console.error('[MetricsStorage] Failed to fetch at time:', error);
      return null;
    }
  }

  async getAvailableTimeRange(serviceId?: string): Promise<{ earliest: Date | null; latest: Date | null }> {
    try {
      let query = supabase.from('service_metrics_snapshots').select('timestamp').order('timestamp', { ascending: true });
      if (serviceId) query = query.eq('service_id', serviceId);

      const { data: earliestData } = await query.limit(1);

      let queryLatest = supabase.from('service_metrics_snapshots').select('timestamp').order('timestamp', { ascending: false });
      if (serviceId) queryLatest = queryLatest.eq('service_id', serviceId);

      const { data: latestData } = await queryLatest.limit(1);

      return {
        earliest: earliestData && earliestData.length > 0 ? new Date(earliestData[0].timestamp) : null,
        latest: latestData && latestData.length > 0 ? new Date(latestData[0].timestamp) : null
      };
    } catch (error) {
      console.error('[MetricsStorage] Failed to get time range:', error);
      return { earliest: null, latest: null };
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('service_metrics_snapshots').select('count').limit(1);
      return !error;
    } catch {
      return false;
    }
  }
}

export const metricsStorage = MetricsStorageService.getInstance();
