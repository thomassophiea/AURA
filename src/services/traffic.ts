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
      const response = await apiService.makeAuthenticatedRequest(`/v1/stations/${encodeURIComponent(macAddress)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch station traffic stats: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      // Silently fail for individual station requests to avoid UI disruption
      console.warn(`Traffic stats unavailable for ${macAddress}:`, error);
      return null;
    }
  }

  // Load traffic statistics for multiple stations
  async loadTrafficStatisticsForStations(stations: { macAddress: string }[]): Promise<Map<string, StationTrafficStats>> {
    const trafficMap = new Map<string, StationTrafficStats>();
    
    // Load traffic statistics for each station (limit to first 20 to avoid overwhelming the API)
    const stationsToLoad = stations.slice(0, 20);
    
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