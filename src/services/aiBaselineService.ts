/**
 * AI Baseline Service
 * 
 * Collects and aggregates historical network metrics to calculate
 * AI-generated baseline thresholds that adapt to actual network performance.
 * 
 * This service:
 * 1. Collects metrics over time (RFQI, client counts, AP status, etc.)
 * 2. Stores aggregated data in localStorage for offline operation
 * 3. Calculates dynamic thresholds using statistical analysis
 * 4. Provides confidence indicators based on data availability
 */

import { 
  calculateAIBaseline, 
  type AIBaselineInput, 
  type AIBaselineThresholds 
} from './aiInsights';
import { metricsStorage } from './metricsStorage';

const STORAGE_KEY = 'edge_ai_baseline_v1';
const MAX_SAMPLES = 500; // Keep last 500 data points (~3.5 days at 15-min intervals)

export interface MetricsSample {
  timestamp: number;
  rfqi: number;            // 0-100 scale
  channelUtilization: number; // 0-100
  clientCount: number;
  apOnlineCount: number;
  retryRate?: number;      // 0-100
  latencyMs?: number;
  siteId?: string;
}

export interface StoredBaselineData {
  samples: MetricsSample[];
  lastCalculated: number;
  calculatedThresholds: AIBaselineThresholds | null;
}

/**
 * AI Baseline Service - Singleton
 */
class AIBaselineService {
  private static instance: AIBaselineService;
  private data: StoredBaselineData;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.data = this.loadFromStorage();
  }

  static getInstance(): AIBaselineService {
    if (!AIBaselineService.instance) {
      AIBaselineService.instance = new AIBaselineService();
    }
    return AIBaselineService.instance;
  }

  /**
   * Load baseline data from localStorage
   */
  private loadFromStorage(): StoredBaselineData {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate structure
        if (parsed.samples && Array.isArray(parsed.samples)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[AIBaseline] Failed to load from storage:', error);
    }
    
    return {
      samples: [],
      lastCalculated: 0,
      calculatedThresholds: null
    };
  }

  /**
   * Save baseline data to localStorage (debounced)
   */
  private saveToStorage(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (error) {
        console.error('[AIBaseline] Failed to save to storage:', error);
      }
    }, 1000);
  }

  /**
   * Add a new metrics sample
   */
  addSample(sample: MetricsSample): void {
    // Validate sample
    if (typeof sample.rfqi !== 'number' || typeof sample.clientCount !== 'number') {
      console.warn('[AIBaseline] Invalid sample, skipping:', sample);
      return;
    }

    // Add timestamp if not present
    if (!sample.timestamp) {
      sample.timestamp = Date.now();
    }

    // Add to samples array
    this.data.samples.push(sample);

    // Trim to max samples
    if (this.data.samples.length > MAX_SAMPLES) {
      this.data.samples = this.data.samples.slice(-MAX_SAMPLES);
    }

    this.saveToStorage();
  }

  /**
   * Record current metrics snapshot
   * Call this from dashboard/data loading routines
   */
  recordSnapshot(metrics: {
    rfqi: number;
    channelUtilization?: number;
    clientCount: number;
    apOnlineCount: number;
    retryRate?: number;
    latencyMs?: number;
    siteId?: string;
  }): void {
    this.addSample({
      timestamp: Date.now(),
      rfqi: metrics.rfqi,
      channelUtilization: metrics.channelUtilization ?? 0,
      clientCount: metrics.clientCount,
      apOnlineCount: metrics.apOnlineCount,
      retryRate: metrics.retryRate,
      latencyMs: metrics.latencyMs,
      siteId: metrics.siteId
    });
  }

  /**
   * Get samples for a specific time range
   */
  getSamples(startTime?: number, endTime?: number): MetricsSample[] {
    const start = startTime ?? 0;
    const end = endTime ?? Date.now();
    
    return this.data.samples.filter(
      s => s.timestamp >= start && s.timestamp <= end
    );
  }

  /**
   * Get the number of samples available
   */
  getSampleCount(): number {
    return this.data.samples.length;
  }

  /**
   * Get the time range covered by samples
   */
  getTimeRange(): { earliest: number | null; latest: number | null } {
    if (this.data.samples.length === 0) {
      return { earliest: null, latest: null };
    }
    
    const sorted = this.data.samples.sort((a, b) => a.timestamp - b.timestamp);
    return {
      earliest: sorted[0].timestamp,
      latest: sorted[sorted.length - 1].timestamp
    };
  }

  /**
   * Calculate AI baseline thresholds from collected data
   */
  calculateBaseline(): AIBaselineThresholds {
    const samples = this.data.samples;
    
    if (samples.length === 0) {
      // Return defaults if no data
      return {
        rfqiTarget: 75,
        rfqiPoor: 55,
        channelUtilizationPct: 65,
        noiseFloorDbm: -85,
        clientDensity: 50,
        latencyP95Ms: 75,
        retryRatePct: 15,
        interferenceHigh: 0.3,
        confidence: 0,
        sampleSize: 0,
        lastUpdated: Date.now()
      };
    }

    // Prepare input for calculation
    const input: AIBaselineInput = {
      rfqiHistory: samples.map(s => s.rfqi),
      channelUtilHistory: samples.map(s => s.channelUtilization || 0),
      clientCountHistory: samples.map(s => s.clientCount),
      apOnlineHistory: samples.map(s => s.apOnlineCount),
      retryRateHistory: samples.filter(s => s.retryRate !== undefined).map(s => s.retryRate!),
      latencyHistory: samples.filter(s => s.latencyMs !== undefined).map(s => s.latencyMs!)
    };

    const thresholds = calculateAIBaseline(input);
    
    // Cache the result
    this.data.calculatedThresholds = thresholds;
    this.data.lastCalculated = Date.now();
    this.saveToStorage();

    return thresholds;
  }

  /**
   * Get cached thresholds or calculate if needed
   */
  getThresholds(maxAgeMs: number = 15 * 60 * 1000): AIBaselineThresholds {
    // Return cached if fresh enough
    if (
      this.data.calculatedThresholds &&
      Date.now() - this.data.lastCalculated < maxAgeMs
    ) {
      return this.data.calculatedThresholds;
    }

    // Recalculate
    return this.calculateBaseline();
  }

  /**
   * Get confidence level for the baseline
   */
  getConfidenceLevel(): 'none' | 'low' | 'moderate' | 'high' {
    const count = this.data.samples.length;
    
    if (count === 0) return 'none';
    if (count < 10) return 'low';
    if (count < 50) return 'moderate';
    return 'high';
  }

  /**
   * Get human-readable confidence description
   */
  getConfidenceDescription(): string {
    const level = this.getConfidenceLevel();
    const count = this.data.samples.length;
    
    switch (level) {
      case 'none':
        return 'No data collected yet';
      case 'low':
        return `Learning (${count}/10 samples)`;
      case 'moderate':
        return `Building baseline (${count}/50 samples)`;
      case 'high':
        return `High confidence (${count} samples)`;
    }
  }

  /**
   * Get summary statistics for display
   */
  getSummary(): {
    sampleCount: number;
    confidenceLevel: 'none' | 'low' | 'moderate' | 'high';
    confidenceDescription: string;
    timeRangeHours: number;
    avgRfqi: number;
    avgClientCount: number;
    thresholds: AIBaselineThresholds | null;
  } {
    const samples = this.data.samples;
    const timeRange = this.getTimeRange();
    const timeRangeHours = timeRange.earliest && timeRange.latest
      ? (timeRange.latest - timeRange.earliest) / (1000 * 60 * 60)
      : 0;

    const avgRfqi = samples.length > 0
      ? samples.reduce((sum, s) => sum + s.rfqi, 0) / samples.length
      : 0;

    const avgClientCount = samples.length > 0
      ? samples.reduce((sum, s) => sum + s.clientCount, 0) / samples.length
      : 0;

    return {
      sampleCount: samples.length,
      confidenceLevel: this.getConfidenceLevel(),
      confidenceDescription: this.getConfidenceDescription(),
      timeRangeHours: Math.round(timeRangeHours * 10) / 10,
      avgRfqi: Math.round(avgRfqi * 10) / 10,
      avgClientCount: Math.round(avgClientCount),
      thresholds: this.data.calculatedThresholds
    };
  }

  /**
   * Clear all collected data (for testing/reset)
   */
  clearData(): void {
    this.data = {
      samples: [],
      lastCalculated: 0,
      calculatedThresholds: null
    };
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Export data for debugging
   */
  exportData(): StoredBaselineData {
    return { ...this.data };
  }
}

// Export singleton instance
export const aiBaselineService = AIBaselineService.getInstance();

/**
 * Helper hook-friendly function to record metrics
 * Call this when dashboard loads fresh data
 */
export function recordNetworkMetrics(metrics: {
  rfqi: number;
  channelUtilization?: number;
  clientCount: number;
  apOnlineCount: number;
  retryRate?: number;
  latencyMs?: number;
  siteId?: string;
}): void {
  aiBaselineService.recordSnapshot(metrics);
}

/**
 * Get AI-calculated thresholds for the AI_BASELINE profile
 */
export function getAIBaselineThresholds(): AIBaselineThresholds {
  return aiBaselineService.getThresholds();
}
