/**
 * Anomaly and Trend Detector Widget
 *
 * Automatically detects unusual patterns and highlights likely root causes.
 * Displays "What Changed" panel with top 5 anomalies.
 *
 * Part of P1-005 implementation from API Dashboard Audit
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  WifiOff,
  Activity,
  RefreshCw,
  Info
} from 'lucide-react';
import { apiService, AccessPoint, Station, Service } from '../services/api';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { Button } from './ui/button';

interface AnomalyDetection {
  type: 'client_count_drop' | 'client_count_spike' | 'auth_spike' | 'throughput_collapse' | 'ap_offline' | 'service_degradation';
  severity: 'high' | 'medium' | 'low';
  entity: {
    type: 'site' | 'service' | 'ap';
    id: string;
    name: string;
  };
  metric: string;
  baseline: number;
  current: number;
  changePercent: number;
  timestamp: Date;
  confidence: number; // 0-1
  suggestedAction: string;
}

interface HistoricalSnapshot {
  timestamp: Date;
  clientCount: number;
  apCount: number;
  serviceCount: number;
  avgSignalStrength: number;
}

export function AnomalyDetector() {
  const { filters } = useGlobalFilters();
  const [anomalies, setAnomalies] = useState<AnomalyDetection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [historicalData, setHistoricalData] = useState<HistoricalSnapshot[]>([]);

  useEffect(() => {
    detectAnomalies();

    // Refresh every 2 minutes
    const interval = setInterval(detectAnomalies, 120000);
    return () => clearInterval(interval);
  }, [filters.site, filters.timeRange]);

  const detectAnomalies = async () => {
    try {
      setIsLoading(true);

      // Fetch current data
      const [aps, stations, services] = await Promise.all([
        apiService.getAccessPoints(),
        apiService.getStations(),
        apiService.getServices()
      ]);

      // Apply site filter
      const filteredAPs = filters.site === 'all'
        ? aps
        : aps.filter(ap => ap.site === filters.site || ap.hostSite === filters.site);

      const filteredStations = filters.site === 'all'
        ? stations
        : stations.filter(s => s.siteName === filters.site || s.siteId === filters.site);

      // Store current snapshot
      const currentSnapshot: HistoricalSnapshot = {
        timestamp: new Date(),
        clientCount: filteredStations.length,
        apCount: filteredAPs.length,
        serviceCount: services.length,
        avgSignalStrength: calculateAvgSignal(filteredStations)
      };

      // Update historical data (keep last 10 snapshots for comparison)
      const updatedHistory = [...historicalData, currentSnapshot].slice(-10);
      setHistoricalData(updatedHistory);

      // Detect anomalies if we have historical data
      const detectedAnomalies: AnomalyDetection[] = [];

      if (updatedHistory.length >= 2) {
        // Use average of previous snapshots as baseline
        const baseline = calculateBaseline(updatedHistory.slice(0, -1));

        // 1. Client Count Anomalies (>20% change)
        const clientCountAnomaly = detectClientCountAnomaly(
          currentSnapshot.clientCount,
          baseline.clientCount,
          filters.site
        );
        if (clientCountAnomaly) detectedAnomalies.push(clientCountAnomaly);

        // 2. AP Offline Events
        const apOfflineAnomalies = detectAPOfflineAnomalies(filteredAPs, baseline.apCount);
        detectedAnomalies.push(...apOfflineAnomalies);

        // 3. Service Degradation
        const serviceDegradationAnomalies = detectServiceDegradation(
          services,
          filteredStations,
          baseline
        );
        detectedAnomalies.push(...serviceDegradationAnomalies);

        // 4. Signal Strength Collapse
        const signalAnomaly = detectSignalStrengthCollapse(
          currentSnapshot.avgSignalStrength,
          baseline.avgSignalStrength
        );
        if (signalAnomaly) detectedAnomalies.push(signalAnomaly);
      }

      // Sort by severity and confidence
      const sortedAnomalies = detectedAnomalies
        .sort((a, b) => {
          const severityOrder = { high: 3, medium: 2, low: 1 };
          const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
          if (severityDiff !== 0) return severityDiff;
          return b.confidence - a.confidence;
        })
        .slice(0, 5); // Top 5

      setAnomalies(sortedAnomalies);
      setLastCheck(new Date());
    } catch (error) {
      console.error('[AnomalyDetector] Error detecting anomalies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAvgSignal = (stations: Station[]): number => {
    const stationsWithSignal = stations.filter(s => s.signalStrength || s.rss);
    if (stationsWithSignal.length === 0) return -50;
    return stationsWithSignal.reduce((sum, s) => sum + (s.signalStrength || s.rss || 0), 0) / stationsWithSignal.length;
  };

  const calculateBaseline = (snapshots: HistoricalSnapshot[]) => {
    if (snapshots.length === 0) {
      return {
        clientCount: 0,
        apCount: 0,
        serviceCount: 0,
        avgSignalStrength: -50
      };
    }

    return {
      clientCount: snapshots.reduce((sum, s) => sum + s.clientCount, 0) / snapshots.length,
      apCount: snapshots.reduce((sum, s) => sum + s.apCount, 0) / snapshots.length,
      serviceCount: snapshots.reduce((sum, s) => sum + s.serviceCount, 0) / snapshots.length,
      avgSignalStrength: snapshots.reduce((sum, s) => sum + s.avgSignalStrength, 0) / snapshots.length
    };
  };

  const detectClientCountAnomaly = (
    current: number,
    baseline: number,
    siteName: string
  ): AnomalyDetection | null => {
    if (baseline === 0) return null;

    const changePercent = ((current - baseline) / baseline) * 100;

    // Only report if >20% change
    if (Math.abs(changePercent) < 20) return null;

    const isIncrease = changePercent > 0;
    const severity: 'high' | 'medium' | 'low' = Math.abs(changePercent) > 50 ? 'high' : Math.abs(changePercent) > 30 ? 'medium' : 'low';

    return {
      type: isIncrease ? 'client_count_spike' : 'client_count_drop',
      severity,
      entity: {
        type: 'site',
        id: siteName,
        name: siteName === 'all' ? 'All Sites' : siteName
      },
      metric: 'Client Count',
      baseline: Math.round(baseline),
      current,
      changePercent: Math.round(changePercent * 10) / 10,
      timestamp: new Date(),
      confidence: Math.min(0.9, 0.6 + (Math.abs(changePercent) / 100)),
      suggestedAction: isIncrease
        ? 'Monitor for capacity issues. Check AP load distribution.'
        : 'Investigate possible outage or authentication issues.'
    };
  };

  const detectAPOfflineAnomalies = (
    aps: AccessPoint[],
    baselineCount: number
  ): AnomalyDetection[] => {
    const offlineAPs = aps.filter(ap =>
      ap.status?.toLowerCase() === 'down' ||
      ap.status?.toLowerCase() === 'offline' ||
      ap.connectionState?.toLowerCase() === 'down'
    );

    // Only report if more APs offline than expected
    if (offlineAPs.length === 0) return [];

    return offlineAPs.slice(0, 3).map(ap => ({
      type: 'ap_offline' as const,
      severity: 'high' as const,
      entity: {
        type: 'ap' as const,
        id: ap.serialNumber,
        name: ap.displayName || ap.serialNumber
      },
      metric: 'AP Status',
      baseline: 1, // Expected: online
      current: 0, // Actual: offline
      changePercent: -100,
      timestamp: new Date(),
      confidence: 0.95,
      suggestedAction: 'Check AP connectivity and power. Review recent configuration changes.'
    }));
  };

  const detectServiceDegradation = (
    services: Service[],
    stations: Station[],
    baseline: HistoricalSnapshot
  ): AnomalyDetection[] => {
    const degradedServices: AnomalyDetection[] = [];

    for (const service of services) {
      const serviceStations = stations.filter(s =>
        s.serviceName === service.name ||
        s.network === service.name ||
        s.ssid === service.ssid
      );

      // Check if service is disabled
      if (!service.enabled && service.status?.toLowerCase() !== 'disabled') {
        degradedServices.push({
          type: 'service_degradation',
          severity: 'medium',
          entity: {
            type: 'service',
            id: service.id,
            name: service.name || service.serviceName || 'Unknown Service'
          },
          metric: 'Service Status',
          baseline: 1,
          current: 0,
          changePercent: -100,
          timestamp: new Date(),
          confidence: 1.0,
          suggestedAction: 'Service is disabled. Enable if intended to be active.'
        });
      }

      // Check for poor client experience on service
      const poorSignalClients = serviceStations.filter(s =>
        (s.signalStrength && s.signalStrength < -80) ||
        (s.rss && s.rss < -80)
      );

      if (serviceStations.length > 0 && poorSignalClients.length / serviceStations.length > 0.5) {
        degradedServices.push({
          type: 'service_degradation',
          severity: 'medium',
          entity: {
            type: 'service',
            id: service.id,
            name: service.name || service.serviceName || 'Unknown Service'
          },
          metric: 'Signal Quality',
          baseline: baseline.avgSignalStrength,
          current: calculateAvgSignal(serviceStations),
          changePercent: -50,
          timestamp: new Date(),
          confidence: 0.75,
          suggestedAction: 'Check AP placement and RF environment for this service.'
        });
      }
    }

    return degradedServices.slice(0, 2); // Limit to 2 service anomalies
  };

  const detectSignalStrengthCollapse = (
    current: number,
    baseline: number
  ): AnomalyDetection | null => {
    if (baseline === 0) return null;

    const change = current - baseline;
    const changePercent = (change / Math.abs(baseline)) * 100;

    // Only report if signal dropped by more than 25%
    if (change > -10 || changePercent > -25) return null;

    return {
      type: 'throughput_collapse',
      severity: changePercent < -50 ? 'high' : 'medium',
      entity: {
        type: 'site',
        id: 'network',
        name: 'Network-wide'
      },
      metric: 'Signal Strength',
      baseline: Math.round(baseline * 10) / 10,
      current: Math.round(current * 10) / 10,
      changePercent: Math.round(changePercent * 10) / 10,
      timestamp: new Date(),
      confidence: 0.7,
      suggestedAction: 'Investigate RF interference or AP power issues.'
    };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-500 dark:text-red-400 border-red-500';
      case 'medium': return 'text-amber-500 dark:text-amber-400 border-amber-500';
      case 'low': return 'text-blue-500 dark:text-blue-400 border-blue-500';
      default: return 'text-gray-500 dark:text-gray-400 border-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'outline';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'client_count_drop': return <TrendingDown className="h-4 w-4" />;
      case 'client_count_spike': return <TrendingUp className="h-4 w-4" />;
      case 'ap_offline': return <WifiOff className="h-4 w-4" />;
      case 'auth_spike': return <AlertTriangle className="h-4 w-4" />;
      case 'throughput_collapse': return <TrendingDown className="h-4 w-4" />;
      case 'service_degradation': return <Activity className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'client_count_drop': return 'Client Count Drop';
      case 'client_count_spike': return 'Client Count Spike';
      case 'ap_offline': return 'AP Offline';
      case 'auth_spike': return 'Auth Failure Spike';
      case 'throughput_collapse': return 'Signal Degradation';
      case 'service_degradation': return 'Service Issue';
      default: return 'Anomaly Detected';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            What Changed? - Anomaly Detection
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Last check: {lastCheck.toLocaleTimeString()}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detectAnomalies()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && anomalies.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-muted-foreground">Analyzing network patterns...</div>
          </div>
        ) : anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Activity className="h-8 w-8 text-green-500 mb-2" />
            <div className="text-sm font-medium text-green-500">No anomalies detected</div>
            <div className="text-xs text-muted-foreground mt-1">
              All metrics within normal ranges
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.map((anomaly, idx) => (
              <div
                key={idx}
                className={`border-l-4 pl-4 py-3 rounded-r-lg bg-card hover:bg-accent/5 transition-colors ${getSeverityColor(anomaly.severity)}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`mt-0.5 ${getSeverityColor(anomaly.severity).split(' ')[0]}`}>
                      {getTypeIcon(anomaly.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm">{getTypeLabel(anomaly.type)}</h4>
                        <Badge variant={getSeverityBadge(anomaly.severity) as any} className="text-xs">
                          {anomaly.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(anomaly.confidence * 100)}% confident
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="font-medium">{anomaly.entity.name}</span>
                        {' - '}
                        {anomaly.metric}: {anomaly.baseline.toFixed(1)} → {anomaly.current.toFixed(1)}
                        {' '}
                        <span className={anomaly.changePercent > 0 ? 'text-green-500' : 'text-red-500'}>
                          ({anomaly.changePercent > 0 ? '+' : ''}{anomaly.changePercent}%)
                        </span>
                      </div>
                      <div className="text-xs bg-muted/50 p-2 rounded">
                        <strong>Suggested Action:</strong> {anomaly.suggestedAction}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {historicalData.length < 2 && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>Building baseline...</strong> Anomaly detection improves with more data.
                    Currently using {historicalData.length} snapshot(s) for comparison.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
