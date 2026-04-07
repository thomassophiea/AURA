/**
 * AI Insights Service
 * 
 * AI ranks, correlates, and explains. It does not invent.
 * Insights are derived from existing events, RF telemetry, client performance, and network utilization.
 * 
 * Categories:
 * - Network Health: RFQI, connectivity, interference
 * - Capacity Planning: client density, throughput trends, AP load
 * - Anomaly Detection: unusual patterns, deviations from baseline
 * - Predictive Maintenance: AP health predictions, failure forecasts
 */

import { ENVIRONMENT_PROFILES, type EnvironmentProfile, evaluateMetric } from '../config/environmentProfiles';

export type InsightScope = 'NETWORK' | 'SITE' | 'AP' | 'CLIENT';
export type InsightSeverity = 'critical' | 'warning' | 'info';
export type InsightCategory = 
  | 'rf_quality' 
  | 'interference' 
  | 'channel_utilization' 
  | 'client_performance'
  | 'connectivity'
  | 'capacity'
  | 'anomaly'
  | 'trending'
  | 'predictive'
  | 'historical';

export type InsightGroup = 'network_health' | 'capacity_planning' | 'anomaly_detection' | 'predictive_maintenance';

export interface InsightEvidence {
  label: string;
  timestamp?: number;  // epoch ms - clicking should set cursor to this
  metric?: string;
  value?: number | string;
  unit?: string;
  source?: string;     // e.g., 'rfQuality API', 'client stats'
}

export interface InsightCard {
  id: string;
  title: string;              // "What happened"
  whyItMatters: string;       // Why it matters in this environment
  evidence: InsightEvidence[];
  recommendedAction: string;  // Non-destructive action
  
  // Categorization
  category: InsightCategory;
  group: InsightGroup;        // Widget group for organization
  severity: InsightSeverity;
  scope: InsightScope;
  
  // Ranking inputs (0-1)
  impact: number;
  confidence: number;
  recurrence: number;
  
  // Trend data (for trending insights)
  trend?: {
    direction: 'improving' | 'degrading' | 'stable';
    changePercent: number;
    comparedTo: string;  // e.g., "1 hour ago", "same time yesterday"
  };
  
  // Prediction data (for predictive insights)
  prediction?: {
    likelihood: number;  // 0-1
    timeframe: string;   // e.g., "next 2 hours", "within 24 hours"
    basedOn: string;     // e.g., "historical patterns", "current trajectory"
  };
  
  // Computed
  rankScore: number;
  
  // Metadata
  createdAt: number;
  expiresAt?: number;
}

// Ranking weights
const RANKING_WEIGHTS = {
  impact: 0.4,
  confidence: 0.25,
  recurrence: 0.15,
  scope: 0.2
};

// Scope weights (higher = more important)
const SCOPE_WEIGHTS: Record<InsightScope, number> = {
  NETWORK: 1.0,
  SITE: 0.75,
  AP: 0.5,
  CLIENT: 0.25
};

/**
 * Calculate rank score for an insight
 */
export function calculateRankScore(insight: Omit<InsightCard, 'rankScore'>): number {
  const scopeWeight = SCOPE_WEIGHTS[insight.scope] || 0.5;
  
  return (
    RANKING_WEIGHTS.impact * insight.impact +
    RANKING_WEIGHTS.confidence * insight.confidence +
    RANKING_WEIGHTS.recurrence * insight.recurrence +
    RANKING_WEIGHTS.scope * scopeWeight
  );
}

/**
 * Generate insights from current metrics
 */
export interface MetricsSnapshot {
  rfqi?: number;
  channelUtilization?: number;
  interference?: number;
  noiseFloorDbm?: number;
  retryRate?: number;
  clientCount?: number;
  apCount?: number;
  apOnlineCount?: number;
  throughputBps?: number;
  avgRssi?: number;
  avgSnr?: number;
  latencyMs?: number;
  timestamp?: number;
  
  // Historical data for trend analysis
  history?: {
    rfqi1hAgo?: number;
    rfqi24hAgo?: number;
    clientCount1hAgo?: number;
    clientCount24hAgo?: number;
    throughput1hAgo?: number;
    throughput24hAgo?: number;
    apOnline1hAgo?: number;
  };
  
  // AP-level metrics for predictive maintenance
  apMetrics?: Array<{
    serialNumber: string;
    name: string;
    uptime?: number;
    restartCount?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    temperature?: number;
    clientCount?: number;
    rfqi?: number;
    lastRestart?: number;
  }>;
}

export function generateInsights(
  metrics: MetricsSnapshot,
  profile: EnvironmentProfile,
  existingEvents?: Array<{ type: string; timestamp: number; message: string }>
): InsightCard[] {
  const insights: InsightCard[] = [];
  const now = Date.now();
  const thresholds = profile.thresholds;
  
  // =========================================
  // NETWORK HEALTH INSIGHTS
  // =========================================
  
  // 1. RFQI Degradation
  if (metrics.rfqi !== undefined && metrics.rfqi < thresholds.rfqiPoor) {
    const severity: InsightSeverity = metrics.rfqi < thresholds.rfqiPoor * 0.7 ? 'critical' : 'warning';
    insights.push({
      id: `rfqi-low-${now}`,
      title: 'RF Quality Below Threshold',
      whyItMatters: `In a ${profile.name} environment, RF quality below ${thresholds.rfqiPoor}% impacts client connectivity and user experience.`,
      evidence: [
        { label: 'Current RFQI', value: metrics.rfqi, unit: '%', metric: 'rfqi', timestamp: metrics.timestamp },
        { label: 'Target', value: thresholds.rfqiTarget, unit: '%' },
        { label: 'Profile', value: profile.name }
      ],
      recommendedAction: 'Review RF environment for interference sources. Consider channel optimization or AP power adjustments.',
      category: 'rf_quality',
      group: 'network_health',
      severity,
      scope: 'SITE',
      impact: 1 - (metrics.rfqi / 100),
      confidence: 0.9,
      recurrence: 0.5,
      rankScore: 0,
      createdAt: now
    });
  }
  
  // 2. High Channel Utilization
  if (metrics.channelUtilization !== undefined && metrics.channelUtilization > thresholds.channelUtilizationPct) {
    insights.push({
      id: `channel-util-high-${now}`,
      title: 'High Channel Utilization Detected',
      whyItMatters: `Channel utilization above ${thresholds.channelUtilizationPct}% in ${profile.name} environments can cause client contention and reduced throughput.`,
      evidence: [
        { label: 'Channel Utilization', value: metrics.channelUtilization, unit: '%', metric: 'channelUtilization', timestamp: metrics.timestamp },
        { label: 'Threshold', value: thresholds.channelUtilizationPct, unit: '%' }
      ],
      recommendedAction: 'Consider load balancing clients across APs or adding capacity in high-density areas.',
      category: 'channel_utilization',
      group: 'network_health',
      severity: 'warning',
      scope: 'SITE',
      impact: (metrics.channelUtilization - thresholds.channelUtilizationPct) / (100 - thresholds.channelUtilizationPct),
      confidence: 0.85,
      recurrence: 0.6,
      rankScore: 0,
      createdAt: now
    });
  }
  
  // 3. High Interference
  if (metrics.interference !== undefined && metrics.interference > thresholds.interferenceHigh) {
    insights.push({
      id: `interference-high-${now}`,
      title: 'RF Interference Elevated',
      whyItMatters: `Interference above ${(thresholds.interferenceHigh * 100).toFixed(0)}% degrades signal quality and increases retries in ${profile.name} deployments.`,
      evidence: [
        { label: 'Interference Level', value: `${(metrics.interference * 100).toFixed(1)}%`, metric: 'interference', timestamp: metrics.timestamp },
        { label: 'Threshold', value: `${(thresholds.interferenceHigh * 100).toFixed(0)}%` }
      ],
      recommendedAction: 'Identify interference sources (microwaves, Bluetooth, neighboring networks). Consider dynamic channel selection.',
      category: 'interference',
      group: 'network_health',
      severity: 'warning',
      scope: 'SITE',
      impact: Math.min(1, (metrics.interference - thresholds.interferenceHigh) / 0.3),
      confidence: 0.8,
      recurrence: 0.4,
      rankScore: 0,
      createdAt: now
    });
  }
  
  // 4. High Retry Rate
  if (metrics.retryRate !== undefined && metrics.retryRate > thresholds.retryRatePct) {
    insights.push({
      id: `retry-rate-high-${now}`,
      title: 'Elevated Wireless Retry Rate',
      whyItMatters: `Retry rates above ${thresholds.retryRatePct}% indicate RF issues or interference affecting ${profile.name} operations.`,
      evidence: [
        { label: 'Retry Rate', value: metrics.retryRate, unit: '%', metric: 'retryRate', timestamp: metrics.timestamp },
        { label: 'Acceptable Limit', value: thresholds.retryRatePct, unit: '%' }
      ],
      recommendedAction: 'Check for co-channel interference, adjust AP transmit power, or relocate affected clients.',
      category: 'rf_quality',
      group: 'network_health',
      severity: 'warning',
      scope: 'AP',
      impact: Math.min(1, (metrics.retryRate - thresholds.retryRatePct) / 20),
      confidence: 0.75,
      recurrence: 0.5,
      rankScore: 0,
      createdAt: now
    });
  }
  
  // 5. AP Connectivity Issues
  if (metrics.apCount !== undefined && metrics.apOnlineCount !== undefined) {
    const offlineCount = metrics.apCount - metrics.apOnlineCount;
    const offlinePercent = (offlineCount / metrics.apCount) * 100;
    
    if (offlineCount > 0 && offlinePercent > 5) {
      insights.push({
        id: `ap-offline-${now}`,
        title: `${offlineCount} Access Points Offline`,
        whyItMatters: `${offlinePercent.toFixed(0)}% of APs offline creates coverage gaps in ${profile.name} deployment.`,
        evidence: [
          { label: 'Offline APs', value: offlineCount },
          { label: 'Total APs', value: metrics.apCount },
          { label: 'Online', value: metrics.apOnlineCount }
        ],
        recommendedAction: 'Check network connectivity to offline APs. Verify power and physical connections.',
        category: 'connectivity',
        group: 'network_health',
        severity: offlinePercent > 20 ? 'critical' : 'warning',
        scope: 'SITE',
        impact: Math.min(1, offlinePercent / 30),
        confidence: 1.0,
        recurrence: 0.3,
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // =========================================
  // CAPACITY PLANNING INSIGHTS
  // =========================================
  
  // 6. Client Density Warning
  if (metrics.clientCount !== undefined && metrics.apOnlineCount !== undefined && metrics.apOnlineCount > 0) {
    const clientsPerAP = metrics.clientCount / metrics.apOnlineCount;
    if (clientsPerAP > thresholds.clientDensity * 1.2) {
      insights.push({
        id: `client-density-${now}`,
        title: 'High Client Density Per AP',
        whyItMatters: `${clientsPerAP.toFixed(0)} clients per AP exceeds ${profile.name} capacity planning threshold of ${thresholds.clientDensity}.`,
        evidence: [
          { label: 'Clients/AP', value: clientsPerAP.toFixed(1) },
          { label: 'Total Clients', value: metrics.clientCount },
          { label: 'Online APs', value: metrics.apOnlineCount }
        ],
        recommendedAction: 'Consider adding access points to high-density areas or enabling band steering.',
        category: 'capacity',
        group: 'capacity_planning',
        severity: 'info',
        scope: 'SITE',
        impact: Math.min(1, (clientsPerAP - thresholds.clientDensity) / thresholds.clientDensity),
        confidence: 0.9,
        recurrence: 0.7,
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // 7. Poor Client Signal Quality
  if (metrics.avgRssi !== undefined && metrics.avgRssi < -75) {
    insights.push({
      id: `rssi-low-${now}`,
      title: 'Clients Experiencing Weak Signal',
      whyItMatters: `Average RSSI of ${metrics.avgRssi} dBm is below -75 dBm threshold for reliable connectivity.`,
      evidence: [
        { label: 'Average RSSI', value: metrics.avgRssi, unit: 'dBm', metric: 'rssi', timestamp: metrics.timestamp },
        { label: 'Recommended', value: '-65 to -70', unit: 'dBm' }
      ],
      recommendedAction: 'Review AP placement. Clients may be too far from access points or experiencing physical obstructions.',
      category: 'client_performance',
      group: 'network_health',
      severity: metrics.avgRssi < -80 ? 'warning' : 'info',
      scope: 'CLIENT',
      impact: Math.min(1, (-75 - metrics.avgRssi) / 15),
      confidence: 0.7,
      recurrence: 0.6,
      rankScore: 0,
      createdAt: now
    });
  }
  
  // =========================================
  // TRENDING / HISTORICAL COMPARISON INSIGHTS
  // =========================================
  
  // 8. RFQI Trending Analysis (compare to 1 hour ago)
  if (metrics.rfqi !== undefined && metrics.history?.rfqi1hAgo !== undefined) {
    const change = metrics.rfqi - metrics.history.rfqi1hAgo;
    const changePercent = (change / metrics.history.rfqi1hAgo) * 100;
    
    if (Math.abs(changePercent) > 10) {
      const direction = change > 0 ? 'improving' : 'degrading';
      const severity: InsightSeverity = direction === 'degrading' && changePercent < -20 ? 'warning' : 'info';
      
      insights.push({
        id: `rfqi-trend-1h-${now}`,
        title: `RF Quality ${direction === 'improving' ? 'Improving' : 'Degrading'}`,
        whyItMatters: direction === 'degrading' 
          ? `RFQI has dropped ${Math.abs(changePercent).toFixed(0)}% in the last hour, indicating emerging RF issues.`
          : `RFQI has improved ${changePercent.toFixed(0)}% in the last hour, showing positive network health trend.`,
        evidence: [
          { label: 'Current RFQI', value: metrics.rfqi.toFixed(0), unit: '%', timestamp: metrics.timestamp },
          { label: '1 Hour Ago', value: metrics.history.rfqi1hAgo.toFixed(0), unit: '%' },
          { label: 'Change', value: `${change > 0 ? '+' : ''}${changePercent.toFixed(0)}%` }
        ],
        recommendedAction: direction === 'degrading' 
          ? 'Investigate recent changes: new interference sources, increased client load, or environmental factors.'
          : 'Continue monitoring. Recent optimizations or reduced load may be contributing to improvement.',
        category: 'trending',
        group: 'anomaly_detection',
        severity,
        scope: 'SITE',
        impact: Math.min(1, Math.abs(changePercent) / 30),
        confidence: 0.85,
        recurrence: 0.4,
        trend: {
          direction,
          changePercent: Math.abs(changePercent),
          comparedTo: '1 hour ago'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // 9. RFQI Historical Comparison (same time yesterday)
  if (metrics.rfqi !== undefined && metrics.history?.rfqi24hAgo !== undefined) {
    const change = metrics.rfqi - metrics.history.rfqi24hAgo;
    const changePercent = (change / metrics.history.rfqi24hAgo) * 100;
    
    if (changePercent < -15) {
      insights.push({
        id: `rfqi-historical-24h-${now}`,
        title: 'RF Quality Lower Than Yesterday',
        whyItMatters: `RFQI is ${Math.abs(changePercent).toFixed(0)}% lower than the same time yesterday, suggesting a recurring or new issue.`,
        evidence: [
          { label: 'Current RFQI', value: metrics.rfqi.toFixed(0), unit: '%', timestamp: metrics.timestamp },
          { label: 'Yesterday', value: metrics.history.rfqi24hAgo.toFixed(0), unit: '%' },
          { label: 'Difference', value: `${changePercent.toFixed(0)}%` }
        ],
        recommendedAction: 'Compare environmental conditions. Check for patterns (e.g., peak hours, external interference).',
        category: 'historical',
        group: 'anomaly_detection',
        severity: 'info',
        scope: 'SITE',
        impact: Math.min(1, Math.abs(changePercent) / 30),
        confidence: 0.7,
        recurrence: 0.6,
        trend: {
          direction: 'degrading',
          changePercent: Math.abs(changePercent),
          comparedTo: 'same time yesterday'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // 10. Client Count Spike Detection
  if (metrics.clientCount !== undefined && metrics.history?.clientCount1hAgo !== undefined) {
    const change = metrics.clientCount - metrics.history.clientCount1hAgo;
    const changePercent = metrics.history.clientCount1hAgo > 0 
      ? (change / metrics.history.clientCount1hAgo) * 100 
      : 0;
    
    if (changePercent > 50 && change > 10) {
      insights.push({
        id: `client-spike-${now}`,
        title: 'Unusual Client Surge Detected',
        whyItMatters: `Client count increased by ${changePercent.toFixed(0)}% (+${change} clients) in the last hour, which may strain network capacity.`,
        evidence: [
          { label: 'Current Clients', value: metrics.clientCount, timestamp: metrics.timestamp },
          { label: '1 Hour Ago', value: metrics.history.clientCount1hAgo },
          { label: 'Increase', value: `+${change} (+${changePercent.toFixed(0)}%)` }
        ],
        recommendedAction: 'Monitor for capacity issues. Ensure load balancing is active and consider temporary capacity measures.',
        category: 'anomaly',
        group: 'anomaly_detection',
        severity: changePercent > 100 ? 'warning' : 'info',
        scope: 'SITE',
        impact: Math.min(1, changePercent / 100),
        confidence: 0.9,
        recurrence: 0.3,
        trend: {
          direction: 'degrading',
          changePercent,
          comparedTo: '1 hour ago'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // =========================================
  // PREDICTIVE MAINTENANCE INSIGHTS
  // =========================================
  
  // 11. AP Restart Pattern Detection
  if (metrics.apMetrics && metrics.apMetrics.length > 0) {
    const apsWithHighRestarts = metrics.apMetrics.filter(ap => 
      (ap.restartCount || 0) >= 3 && 
      ap.lastRestart && 
      (now - ap.lastRestart) < 24 * 60 * 60 * 1000
    );
    
    if (apsWithHighRestarts.length > 0) {
      insights.push({
        id: `ap-restart-pattern-${now}`,
        title: `${apsWithHighRestarts.length} AP(s) Showing Restart Patterns`,
        whyItMatters: 'Multiple restarts in 24 hours indicate potential hardware issues or firmware instability.',
        evidence: [
          { label: 'Affected APs', value: apsWithHighRestarts.length },
          { label: 'AP Names', value: apsWithHighRestarts.slice(0, 3).map(ap => ap.name).join(', ') },
          { label: 'Avg Restarts', value: (apsWithHighRestarts.reduce((sum, ap) => sum + (ap.restartCount || 0), 0) / apsWithHighRestarts.length).toFixed(1) }
        ],
        recommendedAction: 'Schedule maintenance check. Consider firmware update or hardware replacement for persistently unstable APs.',
        category: 'predictive',
        group: 'predictive_maintenance',
        severity: 'warning',
        scope: 'AP',
        impact: Math.min(1, apsWithHighRestarts.length / 5),
        confidence: 0.8,
        recurrence: 0.7,
        prediction: {
          likelihood: 0.75,
          timeframe: 'next 48 hours',
          basedOn: 'restart frequency pattern'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // 12. AP Memory/CPU Stress Prediction
  if (metrics.apMetrics && metrics.apMetrics.length > 0) {
    const stressedAPs = metrics.apMetrics.filter(ap => 
      (ap.memoryUsage !== undefined && ap.memoryUsage > 85) ||
      (ap.cpuUsage !== undefined && ap.cpuUsage > 90)
    );
    
    if (stressedAPs.length > 0) {
      insights.push({
        id: `ap-resource-stress-${now}`,
        title: `${stressedAPs.length} AP(s) Under Resource Stress`,
        whyItMatters: 'High memory or CPU usage may lead to performance degradation or unexpected reboots.',
        evidence: [
          { label: 'Stressed APs', value: stressedAPs.length },
          { label: 'AP Names', value: stressedAPs.slice(0, 3).map(ap => ap.name).join(', ') },
          { label: 'Avg Memory', value: `${(stressedAPs.reduce((sum, ap) => sum + (ap.memoryUsage || 0), 0) / stressedAPs.length).toFixed(0)}%` }
        ],
        recommendedAction: 'Review client distribution. Consider offloading clients to nearby APs or investigate memory leaks.',
        category: 'predictive',
        group: 'predictive_maintenance',
        severity: 'warning',
        scope: 'AP',
        impact: Math.min(1, stressedAPs.length / 3),
        confidence: 0.85,
        recurrence: 0.5,
        prediction: {
          likelihood: 0.6,
          timeframe: 'next 4 hours',
          basedOn: 'resource utilization trend'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // 13. Capacity Planning Forecast
  if (metrics.clientCount !== undefined && 
      metrics.apOnlineCount !== undefined && 
      metrics.history?.clientCount24hAgo !== undefined &&
      metrics.apOnlineCount > 0) {
    const clientsPerAP = metrics.clientCount / metrics.apOnlineCount;
    const growthRate = metrics.history.clientCount24hAgo > 0 
      ? (metrics.clientCount - metrics.history.clientCount24hAgo) / metrics.history.clientCount24hAgo 
      : 0;
    
    // If growing and approaching capacity
    if (growthRate > 0.1 && clientsPerAP > thresholds.clientDensity * 0.8) {
      const projectedClientsPerAP = clientsPerAP * (1 + growthRate);
      const daysToCapacity = clientsPerAP < thresholds.clientDensity 
        ? Math.ceil((thresholds.clientDensity - clientsPerAP) / (clientsPerAP * growthRate))
        : 0;
      
      insights.push({
        id: `capacity-forecast-${now}`,
        title: 'Network Approaching Capacity Limits',
        whyItMatters: `At current growth rate (${(growthRate * 100).toFixed(0)}%/day), network will exceed capacity thresholds ${daysToCapacity > 0 ? `in ~${daysToCapacity} days` : 'very soon'}.`,
        evidence: [
          { label: 'Current Load', value: `${clientsPerAP.toFixed(1)} clients/AP` },
          { label: 'Threshold', value: `${thresholds.clientDensity} clients/AP` },
          { label: 'Daily Growth', value: `+${(growthRate * 100).toFixed(0)}%` },
          { label: 'Projected', value: `${projectedClientsPerAP.toFixed(1)} clients/AP` }
        ],
        recommendedAction: 'Plan for additional AP deployment. Review high-density areas and consider load balancing optimizations.',
        category: 'predictive',
        group: 'capacity_planning',
        severity: daysToCapacity <= 3 ? 'warning' : 'info',
        scope: 'SITE',
        impact: Math.min(1, growthRate * 2),
        confidence: 0.65,
        recurrence: 0.8,
        prediction: {
          likelihood: 0.7,
          timeframe: daysToCapacity > 0 ? `${daysToCapacity} days` : 'imminent',
          basedOn: '24-hour growth trend'
        },
        rankScore: 0,
        createdAt: now
      });
    }
  }
  
  // Calculate rank scores
  insights.forEach(insight => {
    insight.rankScore = calculateRankScore(insight);
  });
  
  // Sort by rank score descending
  return insights.sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Get insights summary for display
 */
export function getInsightsSummary(insights: InsightCard[]): {
  total: number;
  critical: number;
  warning: number;
  info: number;
  topInsight: InsightCard | null;
  byGroup: Record<InsightGroup, number>;
} {
  return {
    total: insights.length,
    critical: insights.filter(i => i.severity === 'critical').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    info: insights.filter(i => i.severity === 'info').length,
    topInsight: insights[0] || null,
    byGroup: {
      network_health: insights.filter(i => i.group === 'network_health').length,
      capacity_planning: insights.filter(i => i.group === 'capacity_planning').length,
      anomaly_detection: insights.filter(i => i.group === 'anomaly_detection').length,
      predictive_maintenance: insights.filter(i => i.group === 'predictive_maintenance').length,
    }
  };
}

/**
 * Get insights grouped by category for organized display
 */
export function getInsightsByGroup(insights: InsightCard[]): Record<InsightGroup, InsightCard[]> {
  return {
    network_health: insights.filter(i => i.group === 'network_health'),
    capacity_planning: insights.filter(i => i.group === 'capacity_planning'),
    anomaly_detection: insights.filter(i => i.group === 'anomaly_detection'),
    predictive_maintenance: insights.filter(i => i.group === 'predictive_maintenance'),
  };
}

/**
 * Group metadata for display
 */
export const INSIGHT_GROUP_META: Record<InsightGroup, { name: string; icon: string; description: string; color: string }> = {
  network_health: {
    name: 'Network Health',
    icon: 'Activity',
    description: 'RF quality, connectivity, and interference issues',
    color: 'blue'
  },
  capacity_planning: {
    name: 'Capacity Planning',
    icon: 'TrendingUp',
    description: 'Client density, throughput trends, and load forecasting',
    color: 'purple'
  },
  anomaly_detection: {
    name: 'Anomaly Detection',
    icon: 'AlertTriangle',
    description: 'Unusual patterns, trend deviations, and spikes',
    color: 'amber'
  },
  predictive_maintenance: {
    name: 'Predictive Maintenance',
    icon: 'Wrench',
    description: 'AP health predictions and failure forecasting',
    color: 'red'
  }
};

/**
 * Calculate AI Baseline thresholds from actual network metrics
 * Uses statistical analysis to set thresholds at appropriate levels
 */
export interface AIBaselineInput {
  rfqiHistory: number[];           // Array of RFQI values (0-100)
  channelUtilHistory: number[];    // Array of channel utilization values
  clientCountHistory: number[];    // Array of client counts
  apOnlineHistory: number[];       // Array of online AP counts
  retryRateHistory?: number[];     // Optional retry rate history
  latencyHistory?: number[];       // Optional latency history
}

export interface AIBaselineThresholds {
  rfqiTarget: number;
  rfqiPoor: number;
  channelUtilizationPct: number;
  noiseFloorDbm: number;
  clientDensity: number;
  latencyP95Ms: number;
  retryRatePct: number;
  interferenceHigh: number;
  confidence: number;              // 0-1, how confident we are in these thresholds
  sampleSize: number;              // Number of data points used
  lastUpdated: number;             // Timestamp
}

/**
 * Calculate percentile value from an array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Generate AI Baseline thresholds from historical network data
 * 
 * Strategy:
 * - RFQI Target: Set at P75 (75th percentile) - achievable goal
 * - RFQI Poor: Set at P25 (25th percentile) - below this is concerning
 * - Channel Util: Set at P90 - allow headroom for spikes
 * - Client Density: Set at P80 of clients/AP ratio
 * - Latency: Set at P95 - consistent with industry practice
 * - Retry Rate: Set at P85 - allow some variation
 */
export function calculateAIBaseline(input: AIBaselineInput): AIBaselineThresholds {
  const now = Date.now();
  
  // Need minimum samples for confidence
  const minSamples = 10;
  const sampleSize = Math.min(
    input.rfqiHistory.length,
    input.channelUtilHistory.length,
    input.clientCountHistory.length
  );
  
  const confidence = Math.min(1, sampleSize / 100); // Full confidence at 100 samples
  
  // Calculate RFQI thresholds
  const rfqiP75 = percentile(input.rfqiHistory, 75);
  const rfqiP25 = percentile(input.rfqiHistory, 25);
  const rfqiMean = mean(input.rfqiHistory);
  
  // Channel utilization - use P90 as the "high" threshold
  const chUtilP90 = percentile(input.channelUtilHistory, 90);
  const chUtilMean = mean(input.channelUtilHistory);
  
  // Client density - calculate clients per AP
  let clientDensityP80 = 50; // Default
  if (input.clientCountHistory.length > 0 && input.apOnlineHistory.length > 0) {
    const densities = input.clientCountHistory.map((clients, i) => {
      const aps = input.apOnlineHistory[i] || 1;
      return clients / Math.max(1, aps);
    });
    clientDensityP80 = percentile(densities, 80);
  }
  
  // Retry rate threshold
  const retryP85 = input.retryRateHistory && input.retryRateHistory.length > 0
    ? percentile(input.retryRateHistory, 85)
    : 15; // Default
  
  // Latency P95
  const latencyP95 = input.latencyHistory && input.latencyHistory.length > 0
    ? percentile(input.latencyHistory, 95)
    : 75; // Default
  
  return {
    // RFQI target is P75 or mean + 5, whichever is higher (aspirational but achievable)
    rfqiTarget: Math.round(Math.max(rfqiP75, rfqiMean + 5, 60)),
    // RFQI poor is P25 or mean - 15, whichever is lower
    rfqiPoor: Math.round(Math.max(rfqiP25, rfqiMean - 15, 40)),
    // Channel util threshold at P90 + 5% headroom, capped at 85%
    channelUtilizationPct: Math.min(85, Math.round(Math.max(chUtilP90 + 5, chUtilMean + 10, 50))),
    // Noise floor - use default, would need RF data
    noiseFloorDbm: -85,
    // Client density at P80
    clientDensity: Math.round(Math.max(clientDensityP80, 20)),
    // Latency P95
    latencyP95Ms: Math.round(Math.max(latencyP95, 30)),
    // Retry rate at P85 + 5% margin
    retryRatePct: Math.round(Math.min(30, retryP85 + 5)),
    // Interference - default, would need RF data
    interferenceHigh: 0.3,
    confidence,
    sampleSize,
    lastUpdated: now
  };
}

/**
 * Format AI baseline thresholds for display
 */
export function formatAIBaselineConfidence(baseline: AIBaselineThresholds): string {
  if (baseline.confidence < 0.3) {
    return 'Learning (need more data)';
  } else if (baseline.confidence < 0.7) {
    return 'Moderate confidence';
  } else {
    return 'High confidence';
  }
}
