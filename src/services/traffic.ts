/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiService } from './api';

export interface StationTrafficStats {
  macAddress: string;
  inBytes?: number;
  outBytes?: number;
  rxBytes?: number;
  txBytes?: number;
  packets?: number;
  outPackets?: number;
  rss?: number; // Signal strength (RSSI)
  signalStrength?: number; // Alias for compatibility
  [key: string]: any;
}

class TrafficService {
  // Get individual station traffic statistics from /v1/stations/{MAC_ADDRESS}
  async getStationTrafficStats(macAddress: string): Promise<StationTrafficStats | null> {
    try {
      const response = await apiService.makeAuthenticatedRequest(
        `/v1/stations/${encodeURIComponent(macAddress)}`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch station traffic stats: ${response.status} ${response.statusText}`
        );
      }
      const data = await response.json();
      return data;
    } catch (error) {
      // Silently fail for individual station requests to avoid UI disruption
      console.warn(`Traffic stats unavailable for ${macAddress}:`, error);
      return null;
    }
  }

  // Load traffic statistics for multiple stations using batch query with field projection
  // This replaces the N+1 query pattern with a single optimized query
  async loadTrafficStatisticsForStations(
    stations: { macAddress: string }[],
    limit: number = 100,
    offset: number = 0
  ): Promise<Map<string, StationTrafficStats>> {
    const trafficMap = new Map<string, StationTrafficStats>();

    try {
      // Use field projection to fetch only traffic-related fields
      // This significantly reduces payload size and improves performance
      const trafficFields = [
        'macAddress',
        'inBytes',
        'outBytes',
        'rxBytes',
        'txBytes',
        'packets',
        'outPackets',
        'rss',
        'signalStrength',
      ];

      // Fetch stations with traffic data using optimized query
      const stationsWithTraffic = await apiService.getStations({
        fields: trafficFields,
        limit: limit,
        offset: offset,
      });

      // Build map of MAC address to traffic data
      stationsWithTraffic.forEach((station) => {
        if (station.macAddress) {
          trafficMap.set(station.macAddress, {
            macAddress: station.macAddress,
            inBytes: station.inBytes || station.rxBytes || 0,
            outBytes: station.outBytes || station.txBytes || 0,
            rxBytes: station.rxBytes || station.inBytes || 0,
            txBytes: station.txBytes || station.outBytes || 0,
            packets: station.packets || 0,
            outPackets: station.outPackets || 0,
            rss: station.rss || station.signalStrength,
            signalStrength: station.signalStrength || station.rss,
          });
        }
      });
      return trafficMap;
    } catch (error) {
      console.warn(
        '[TrafficService] Error loading traffic statistics, falling back to individual queries:',
        error
      );

      // Fallback: Use the old N+1 pattern for a limited subset if batch query fails
      // This ensures backward compatibility with older API versions
      return this.loadTrafficStatisticsFallback(stations, Math.min(limit, 20));
    }
  }

  // Fallback method using individual queries (legacy N+1 pattern)
  // Only used if the batch query method fails
  private async loadTrafficStatisticsFallback(
    stations: { macAddress: string }[],
    limit: number = 20
  ): Promise<Map<string, StationTrafficStats>> {
    const trafficMap = new Map<string, StationTrafficStats>();
    const stationsToLoad = stations.slice(0, limit);

    const trafficPromises = stationsToLoad.map(async (station) => {
      try {
        const trafficData = await this.getStationTrafficStats(station.macAddress);
        return { macAddress: station.macAddress, data: trafficData };
      } catch (error) {
        console.warn(`Failed to load traffic for ${station.macAddress}:`, error);
        return { macAddress: station.macAddress, data: null };
      }
    });

    try {
      const results = await Promise.allSettled(trafficPromises);
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.data) {
          trafficMap.set(result.value.macAddress, result.value.data);
        }
      });

      return trafficMap;
    } catch (error) {
      console.warn('Error loading traffic statistics:', error);
      return trafficMap;
    }
  }
}

export const trafficService = new TrafficService();
