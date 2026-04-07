/**
 * Environment Context Profiles
 * 
 * Profiles only affect interpretation and scoring.
 * Raw telemetry remains unchanged.
 * Profiles tune what is considered abnormal.
 */

export type EnvironmentProfileType = 
  | 'AI_BASELINE'
  | 'RETAIL' 
  | 'WAREHOUSE' 
  | 'DISTRIBUTION' 
  | 'HQ' 
  | 'CAMPUS' 
  | 'CUSTOM';

export interface ProfileThresholds {
  rfqiTarget: number;           // Target RFQI score (0-100)
  rfqiPoor: number;             // Below this is "poor" 
  channelUtilizationPct: number; // Max acceptable channel utilization %
  noiseFloorDbm: number;        // Noise floor threshold (more negative = better)
  clientDensity: number;        // Expected clients per AP
  latencyP95Ms: number;         // P95 latency threshold in ms
  retryRatePct: number;         // Max acceptable retry rate %
  interferenceHigh: number;     // Interference level considered high (0-1)
}

export interface EnvironmentProfile {
  id: EnvironmentProfileType;
  name: string;
  description: string;
  icon: string;
  thresholds: ProfileThresholds;
}

export const ENVIRONMENT_PROFILES: Record<EnvironmentProfileType, EnvironmentProfile> = {
  AI_BASELINE: {
    id: 'AI_BASELINE',
    name: 'AI Baseline',
    description: 'Auto-generated thresholds based on your network\'s actual performance patterns',
    icon: 'Sparkles',
    thresholds: {
      rfqiTarget: 75,
      rfqiPoor: 55,
      channelUtilizationPct: 65,
      noiseFloorDbm: -85,
      clientDensity: 50,
      latencyP95Ms: 75,
      retryRatePct: 15,
      interferenceHigh: 0.3
    }
  },
  RETAIL: {
    id: 'RETAIL',
    name: 'Retail Store',
    description: 'High client density, critical customer experience, moderate RF challenges',
    icon: 'Store',
    thresholds: {
      rfqiTarget: 80,
      rfqiPoor: 60,
      channelUtilizationPct: 60,
      noiseFloorDbm: -85,
      clientDensity: 50,
      latencyP95Ms: 50,
      retryRatePct: 15,
      interferenceHigh: 0.25
    }
  },
  WAREHOUSE: {
    id: 'WAREHOUSE',
    name: 'Warehouse',
    description: 'Sparse client density, RF challenges from metal/racking, high mobility',
    icon: 'Warehouse',
    thresholds: {
      rfqiTarget: 70,
      rfqiPoor: 50,
      channelUtilizationPct: 70,
      noiseFloorDbm: -80,
      clientDensity: 20,
      latencyP95Ms: 100,
      retryRatePct: 20,
      interferenceHigh: 0.35
    }
  },
  DISTRIBUTION: {
    id: 'DISTRIBUTION',
    name: 'Distribution Center',
    description: 'Mixed environment, high device mobility, critical for operations',
    icon: 'Package',
    thresholds: {
      rfqiTarget: 65,
      rfqiPoor: 45,
      channelUtilizationPct: 75,
      noiseFloorDbm: -80,
      clientDensity: 30,
      latencyP95Ms: 75,
      retryRatePct: 25,
      interferenceHigh: 0.4
    }
  },
  HQ: {
    id: 'HQ',
    name: 'Headquarters',
    description: 'Office environment, high density, low tolerance for issues',
    icon: 'Building2',
    thresholds: {
      rfqiTarget: 85,
      rfqiPoor: 65,
      channelUtilizationPct: 50,
      noiseFloorDbm: -90,
      clientDensity: 100,
      latencyP95Ms: 30,
      retryRatePct: 10,
      interferenceHigh: 0.2
    }
  },
  CAMPUS: {
    id: 'CAMPUS',
    name: 'Campus',
    description: 'Mixed use, varied building types, balance of performance and coverage',
    icon: 'GraduationCap',
    thresholds: {
      rfqiTarget: 75,
      rfqiPoor: 55,
      channelUtilizationPct: 65,
      noiseFloorDbm: -85,
      clientDensity: 75,
      latencyP95Ms: 50,
      retryRatePct: 15,
      interferenceHigh: 0.3
    }
  },
  CUSTOM: {
    id: 'CUSTOM',
    name: 'Custom',
    description: 'User-defined thresholds for unique environments',
    icon: 'Settings',
    thresholds: {
      rfqiTarget: 75,
      rfqiPoor: 55,
      channelUtilizationPct: 65,
      noiseFloorDbm: -85,
      clientDensity: 75,
      latencyP95Ms: 50,
      retryRatePct: 15,
      interferenceHigh: 0.3
    }
  }
};

// Helper to get profile by ID
export function getEnvironmentProfile(id: EnvironmentProfileType): EnvironmentProfile {
  return ENVIRONMENT_PROFILES[id] || ENVIRONMENT_PROFILES.CAMPUS;
}

// Helper to evaluate if a metric is within acceptable range for a profile
export function evaluateMetric(
  profile: EnvironmentProfile,
  metric: 'rfqi' | 'channelUtilization' | 'noiseFloor' | 'latency' | 'retryRate' | 'interference',
  value: number
): 'good' | 'warning' | 'poor' {
  const t = profile.thresholds;
  
  switch (metric) {
    case 'rfqi':
      if (value >= t.rfqiTarget) return 'good';
      if (value >= t.rfqiPoor) return 'warning';
      return 'poor';
    case 'channelUtilization':
      if (value <= t.channelUtilizationPct * 0.8) return 'good';
      if (value <= t.channelUtilizationPct) return 'warning';
      return 'poor';
    case 'noiseFloor':
      // More negative is better
      if (value <= t.noiseFloorDbm - 5) return 'good';
      if (value <= t.noiseFloorDbm) return 'warning';
      return 'poor';
    case 'latency':
      if (value <= t.latencyP95Ms * 0.7) return 'good';
      if (value <= t.latencyP95Ms) return 'warning';
      return 'poor';
    case 'retryRate':
      if (value <= t.retryRatePct * 0.7) return 'good';
      if (value <= t.retryRatePct) return 'warning';
      return 'poor';
    case 'interference':
      if (value <= t.interferenceHigh * 0.7) return 'good';
      if (value <= t.interferenceHigh) return 'warning';
      return 'poor';
    default:
      return 'good';
  }
}
