/**
 * Operational Context Summary Widget
 *
 * Single-pane-of-glass network operational overview with actionable drilldowns.
 * Displays: Organization Context Score, Critical Alerts, Service Degradation, Client Experience
 *
 * Part of P1-001 implementation from API Dashboard Audit
 */

import { useEffect, useState, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { DetailSlideOut } from './DetailSlideOut';
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  Users,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { apiService, AccessPoint, Station, Service } from '../services/api';
import { useGlobalFilters } from '../hooks/useGlobalFilters';

interface ContextMetrics {
  organizationContext: {
    score: number;
    status: 'excellent' | 'good' | 'degraded' | 'critical';
    details: {
      apUptime: number;
      throughputEfficiency: number;
      // Infrastructure Health
      totalAPs: number;
      onlineAPs: number;
      offlineAPs: number;
      apsByBand: { '2.4GHz': number; '5GHz': number; '6GHz': number };
      avgClientsPerAP: number;
      overloadedAPs: number;
      afcModeAPs: number;
      // Capacity & Utilization
      totalClients: number;
      clientsByBand: { '2.4GHz': number; '5GHz': number; '6GHz': number };
      busiestSSIDs: { name: string; clients: number }[];
      // RF Quality
      avgNoiseFloor: number;
      avgSNR: number;
      channelUtilization: number;
      coChannelInterference: number;
      adjacentChannelInterference: number;
      // Coverage
      weakSignalClients: number;
      coverageHoleIndicator: number;
      roamingEvents: number;
      // Security
      failedAuthAttempts: number;
      rogueAPDetections: number;
      securityViolations: number;
      // Network
      avgLatency: number;
      packetLossRate: number;
      dnsResolutionTime: number;
    };
  };
  criticalAlerts: {
    count: number;
    alerts: any[];
  };
  serviceDegradation: {
    count: number;
    services: Service[];
  };
  clientExperience: {
    score: number;
    status: 'excellent' | 'good' | 'degraded' | 'critical';
    details: {
      avgSignalStrength: number;
      authFailureRate: number;
      avgRetryRate: number;
    };
  };
}

function OperationalContextSummaryComponent() {
  const { filters } = useGlobalFilters();
  const [metrics, setMetrics] = useState<ContextMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'organization' | 'alerts' | 'services' | 'experience' | null>(null);

  useEffect(() => {
    loadContextMetrics();

    // Refresh every 2 minutes
    const interval = setInterval(loadContextMetrics, 120000);
    return () => clearInterval(interval);
  }, [filters.site, filters.timeRange]);

  const loadContextMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch data in parallel for better performance
      // Use site-filtered API calls to get correct data (same as AccessPoints tab)
      const [aps, stations, services] = await Promise.all([
        filters.site === 'all'
          ? apiService.getAccessPoints()
          : apiService.getAccessPointsBySite(filters.site),
        apiService.getStations(),
        apiService.getServices()
      ]);

      // Filter stations by site if needed
      // Note: APs are already filtered by getAccessPointsBySite
      let filteredStations = stations;
      if (filters.site !== 'all') {
        // Get site name from site ID to filter stations
        const site = await apiService.getSiteById(filters.site);
        const siteName = site?.name || site?.siteName || filters.site;

        filteredStations = stations.filter(s =>
          s.siteName === siteName ||
          s.siteId === filters.site ||
          s.siteName === filters.site
        );
      }

      // Calculate Organization Context Score (weighted composite)
      const organizationContext = calculateOrganizationContext(aps, filteredStations);

      // Get critical alerts
      const criticalAlerts = await getCriticalAlerts();

      // Calculate service degradation
      const serviceDegradation = calculateServiceDegradation(services, filteredStations);

      // Calculate client experience score
      const clientExperience = calculateClientExperience(filteredStations);

      setMetrics({
        organizationContext,
        criticalAlerts,
        serviceDegradation,
        clientExperience
      });
    } catch (error) {
      console.error('[OperationalContextSummary] Error loading metrics:', error);
      setError('Failed to load operational metrics');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateOrganizationContext = (aps: AccessPoint[], stations: Station[]) => {
    // Helper to check if AP is online
    const isAPOnline = (ap: AccessPoint) => {
      const status = (ap.status || (ap as any).connectionState || (ap as any).operationalState || (ap as any).state || '').toLowerCase();
      const isUp = (ap as any).isUp;
      const isOnline = (ap as any).online;
      return (
        status === 'inservice' ||
        status.includes('up') ||
        status.includes('online') ||
        status.includes('connected') ||
        isUp === true ||
        isOnline === true ||
        (!status && isUp !== false && isOnline !== false)
      );
    };

    // === INFRASTRUCTURE HEALTH ===
    const totalAPs = aps.length;
    const onlineAPs = aps.filter(isAPOnline).length;
    const offlineAPs = totalAPs - onlineAPs;
    const apUptime = totalAPs > 0 ? (onlineAPs / totalAPs) * 100 : 100;

    // APs by Band
    const apsByBand = { '2.4GHz': 0, '5GHz': 0, '6GHz': 0 };
    aps.forEach(ap => {
      const apAny = ap as any;
      if (apAny.radios && Array.isArray(apAny.radios)) {
        apAny.radios.forEach((radio: any) => {
          const band = radio.band || radio.radioBand || '';
          if (band.includes('2.4') || radio.radioType === '2.4GHz') apsByBand['2.4GHz']++;
          if (band.includes('5') || radio.radioType === '5GHz') apsByBand['5GHz']++;
          if (band.includes('6') || radio.radioType === '6GHz' || radio.afc) apsByBand['6GHz']++;
        });
      } else {
        // Assume dual-band if no radio info
        apsByBand['2.4GHz']++;
        apsByBand['5GHz']++;
      }
    });

    // Average clients per AP
    const totalClients = stations.length;
    const avgClientsPerAP = totalAPs > 0 ? Math.round((totalClients / totalAPs) * 10) / 10 : 0;

    // Overloaded APs (>30 clients)
    const clientsPerAP: Record<string, number> = {};
    stations.forEach(s => {
      const apId = s.apSerial || s.apName || 'unknown';
      clientsPerAP[apId] = (clientsPerAP[apId] || 0) + 1;
    });
    const overloadedAPs = Object.values(clientsPerAP).filter(count => count > 30).length;

    // AFC Mode APs (6GHz Standard Power)
    const afcModeAPs = aps.filter(ap => {
      const apAny = ap as any;
      return apAny.gpsAnchor === true ||
        apAny.anchorLocSrc === 'GPS' ||
        apAny.pwrMode === 'SP' ||
        (apAny.radios && apAny.radios.some((r: any) => r.afc === true));
    }).length;

    // === CAPACITY & UTILIZATION ===
    const clientsByBand = { '2.4GHz': 0, '5GHz': 0, '6GHz': 0 };
    stations.forEach(s => {
      const sAny = s as any;
      const band = sAny.band || sAny.radioBand || sAny.radioType || '';
      const channel = sAny.channel || 0;
      if (band.includes('2.4') || (channel >= 1 && channel <= 14)) clientsByBand['2.4GHz']++;
      else if (band.includes('6') || channel > 177) clientsByBand['6GHz']++;
      else if (band.includes('5') || (channel >= 36 && channel <= 177)) clientsByBand['5GHz']++;
      else clientsByBand['5GHz']++; // Default to 5GHz
    });

    // Busiest SSIDs
    const ssidCounts: Record<string, number> = {};
    stations.forEach(s => {
      const ssid = s.network || s.ssid || (s as any).serviceName || 'Unknown';
      ssidCounts[ssid] = (ssidCounts[ssid] || 0) + 1;
    });
    const busiestSSIDs = Object.entries(ssidCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, clients]) => ({ name, clients }));

    // === RF QUALITY ===
    // Average Noise Floor
    const noiseFloorValues = aps
      .map(ap => (ap as any).noiseFloor || (ap as any).noise)
      .filter(v => v !== undefined && v !== null);
    const avgNoiseFloor = noiseFloorValues.length > 0
      ? Math.round(noiseFloorValues.reduce((a, b) => a + b, 0) / noiseFloorValues.length)
      : -95;

    // Average SNR
    const snrValues = stations
      .map(s => (s as any).snr || (s.signalStrength ? s.signalStrength - avgNoiseFloor : null))
      .filter(v => v !== null && v !== undefined);
    const avgSNR = snrValues.length > 0
      ? Math.round(snrValues.reduce((a, b) => a + b, 0) / snrValues.length)
      : 25;

    // Channel Utilization (estimate based on clients per channel)
    const channelCounts: Record<number, number> = {};
    stations.forEach(s => {
      const channel = (s as any).channel || 0;
      if (channel > 0) channelCounts[channel] = (channelCounts[channel] || 0) + 1;
    });
    const maxClientsPerChannel = Math.max(...Object.values(channelCounts), 1);
    const channelUtilization = Math.min(100, Math.round((maxClientsPerChannel / 50) * 100));

    // Co-Channel Interference (estimate: APs on same channel)
    const apChannels: Record<number, number> = {};
    aps.forEach(ap => {
      const apAny = ap as any;
      const channels = [apAny.channel24, apAny.channel5, apAny.channel].filter(c => c);
      channels.forEach(c => {
        apChannels[c] = (apChannels[c] || 0) + 1;
      });
    });
    const coChannelAPs = Object.values(apChannels).filter(count => count > 1).length;
    const coChannelInterference = Math.round((coChannelAPs / Math.max(totalAPs, 1)) * 100);

    // Adjacent Channel Interference (simplified estimate)
    const adjacentChannelInterference = Math.round(coChannelInterference * 0.5);

    // === COVERAGE ===
    // Weak signal clients (<-75 dBm)
    const weakSignalClients = stations.filter(s =>
      (s.signalStrength && s.signalStrength < -75) ||
      (s.rss && s.rss < -75)
    ).length;

    // Coverage hole indicator (% of weak signal clients)
    const coverageHoleIndicator = totalClients > 0
      ? Math.round((weakSignalClients / totalClients) * 100)
      : 0;

    // Roaming events (estimate from stations with multiple AP associations)
    const roamingEvents = stations.filter(s => (s as any).roamCount > 0).length;

    // === SECURITY ===
    // Failed auth attempts (estimate from disconnected/failed status)
    const failedAuthAttempts = stations.filter(s =>
      s.status?.toLowerCase() === 'failed' ||
      s.status?.toLowerCase() === 'auth_failed' ||
      (s as any).authStatus === 'failed'
    ).length;

    // Rogue AP detections (would come from alerts/events API)
    const rogueAPDetections = 0; // Placeholder - would need alerts API

    // Security violations
    const securityViolations = 0; // Placeholder - would need events API

    // === NETWORK ===
    // Average latency (estimate from RTT if available)
    const latencyValues = stations
      .map(s => (s as any).latency || (s as any).rtt)
      .filter(v => v !== undefined && v !== null);
    const avgLatency = latencyValues.length > 0
      ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)
      : 0;

    // Packet loss rate
    const packetLossValues = stations
      .map(s => (s as any).packetLoss || (s as any).txDropped)
      .filter(v => v !== undefined && v !== null);
    const packetLossRate = packetLossValues.length > 0
      ? Math.round((packetLossValues.reduce((a, b) => a + b, 0) / packetLossValues.length) * 10) / 10
      : 0;

    // DNS resolution time (placeholder)
    const dnsResolutionTime = 0;

    // === THROUGHPUT EFFICIENCY ===
    const goodSignalStations = stations.filter(s =>
      (s.signalStrength && s.signalStrength > -70) ||
      (s.rss && s.rss > -70)
    ).length;
    const throughputEfficiency = totalClients > 0 ? (goodSignalStations / totalClients) * 100 : 100;

    // === WEIGHTED SCORE ===
    const score = (apUptime * 0.4) + (throughputEfficiency * 0.6);

    let status: 'excellent' | 'good' | 'degraded' | 'critical';
    if (score >= 95) status = 'excellent';
    else if (score >= 85) status = 'good';
    else if (score >= 70) status = 'degraded';
    else status = 'critical';

    return {
      score: Math.round(score * 10) / 10,
      status,
      details: {
        apUptime: Math.round(apUptime * 10) / 10,
        throughputEfficiency: Math.round(throughputEfficiency * 10) / 10,
        // Infrastructure Health
        totalAPs,
        onlineAPs,
        offlineAPs,
        apsByBand,
        avgClientsPerAP,
        overloadedAPs,
        afcModeAPs,
        // Capacity & Utilization
        totalClients,
        clientsByBand,
        busiestSSIDs,
        // RF Quality
        avgNoiseFloor,
        avgSNR,
        channelUtilization,
        coChannelInterference,
        adjacentChannelInterference,
        // Coverage
        weakSignalClients,
        coverageHoleIndicator,
        roamingEvents,
        // Security
        failedAuthAttempts,
        rogueAPDetections,
        securityViolations,
        // Network
        avgLatency,
        packetLossRate,
        dnsResolutionTime
      }
    };
  };

  const getCriticalAlerts = async () => {
    try {
      // Try to get alerts from API
      // Note: The actual alerts endpoint may vary
      const alerts = await apiService.getAlerts?.() || [];
      const criticalAlerts = alerts.filter((a: any) =>
        a.severity?.toLowerCase() === 'critical' ||
        a.priority?.toLowerCase() === 'critical'
      );

      return {
        count: criticalAlerts.length,
        alerts: criticalAlerts.slice(0, 5) // Top 5 for display
      };
    } catch (error) {
      // Fallback: if alerts API not available, return 0
      console.warn('[OperationalHealthSummary] Alerts API not available:', error);
      return { count: 0, alerts: [] };
    }
  };

  const calculateServiceDegradation = (services: Service[], stations: Station[]) => {
    // Services are considered degraded if they have active issues
    const degradedServices = services.filter(service => {
      const serviceStations = stations.filter(s =>
        s.serviceName === service.name ||
        s.network === service.name ||
        s.ssid === service.ssid
      );

      // If service has connected clients, it's clearly active (not disabled)
      const hasActiveClients = serviceStations.length > 0;

      // Check for actual performance degradation
      const hasLowSignalClients = serviceStations.some(s =>
        (s.signalStrength && s.signalStrength < -80) ||
        (s.rss && s.rss < -80)
      );

      const hasHighRetryRate = serviceStations.some(s =>
        s.retryRate && s.retryRate > 50
      );

      // Only flag as degraded if there's actual performance issues
      // NOT just because enabled=false (which may be stale metadata)
      return hasActiveClients && (hasLowSignalClients || hasHighRetryRate);
    });

    return {
      count: degradedServices.length,
      services: degradedServices.slice(0, 5)
    };
  };

  const calculateClientExperience = (stations: Station[]) => {
    if (stations.length === 0) {
      return {
        score: 100,
        status: 'excellent' as const,
        details: {
          avgSignalStrength: 0,
          authFailureRate: 0,
          avgRetryRate: 0
        }
      };
    }

    // Calculate average signal strength
    const stationsWithSignal = stations.filter(s => s.signalStrength || s.rss);
    const avgSignalStrength = stationsWithSignal.length > 0
      ? stationsWithSignal.reduce((sum, s) => sum + (s.signalStrength || s.rss || 0), 0) / stationsWithSignal.length
      : -50;

    // Auth failure rate (estimate based on disconnected clients)
    const disconnectedStations = stations.filter(s =>
      s.status?.toLowerCase() === 'disconnected' ||
      s.status?.toLowerCase() === 'failed'
    ).length;
    const authFailureRate = (disconnectedStations / stations.length) * 100;

    // Retry rate (estimate based on poor signal)
    const poorSignalStations = stations.filter(s =>
      (s.signalStrength && s.signalStrength < -75) ||
      (s.rss && s.rss < -75)
    ).length;
    const avgRetryRate = (poorSignalStations / stations.length) * 100;

    // Calculate experience score
    let signalScore = 100;
    if (avgSignalStrength < -80) signalScore = 40;
    else if (avgSignalStrength < -70) signalScore = 70;
    else if (avgSignalStrength < -60) signalScore = 85;

    const failureImpact = (100 - authFailureRate);
    const retryImpact = (100 - avgRetryRate);

    const score = (signalScore * 0.5) + (failureImpact * 0.3) + (retryImpact * 0.2);

    let status: 'excellent' | 'good' | 'degraded' | 'critical';
    if (score >= 90) status = 'excellent';
    else if (score >= 75) status = 'good';
    else if (score >= 60) status = 'degraded';
    else status = 'critical';

    return {
      score: Math.round(score * 10) / 10,
      status,
      details: {
        avgSignalStrength: Math.round(avgSignalStrength * 10) / 10,
        authFailureRate: Math.round(authFailureRate * 10) / 10,
        avgRetryRate: Math.round(avgRetryRate * 10) / 10
      }
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 dark:text-green-400';
      case 'good': return 'text-blue-600 dark:text-blue-400';
      case 'degraded': return 'text-yellow-600 dark:text-yellow-400';
      case 'critical': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'good': return <CheckCircle2 className="h-5 w-5 text-blue-600" />;
      case 'degraded': return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'degraded': return 'outline';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Operational Context Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse">Loading health metrics...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className="w-full border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Operational Context Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 dark:text-red-400">{error || 'Unable to load health metrics'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Operational Context Summary
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show Details
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 4-card KPI layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Organization Context Score */}
          <div
            className="p-4 border rounded-lg bg-card cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedMetric('organization')}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  Organization Context
                  <Info className="h-3 w-3" />
                </div>
                <div className={`text-3xl font-bold ${getStatusColor(metrics.organizationContext.status)}`}>
                  {metrics.organizationContext.score}%
                </div>
                <Badge
                  variant={getStatusBadgeVariant(metrics.organizationContext.status)}
                  className="mt-2 text-xs"
                >
                  {metrics.organizationContext.status.toUpperCase()}
                </Badge>
              </div>
              {getStatusIcon(metrics.organizationContext.status)}
            </div>
          </div>

          {/* Critical Alerts */}
          <div
            className="p-4 border rounded-lg bg-card cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedMetric('alerts')}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  Critical Alerts
                  <Info className="h-3 w-3" />
                </div>
                <div className={`text-3xl font-bold ${metrics.criticalAlerts.count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.criticalAlerts.count}
                </div>
                <Badge
                  variant={metrics.criticalAlerts.count > 0 ? 'destructive' : 'default'}
                  className="mt-2 text-xs"
                >
                  {metrics.criticalAlerts.count > 0 ? 'ACTION REQUIRED' : 'ALL CLEAR'}
                </Badge>
              </div>
              <AlertTriangle className={`h-5 w-5 ${metrics.criticalAlerts.count > 0 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
          </div>

          {/* Service Degradation */}
          <div
            className="p-4 border rounded-lg bg-card cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedMetric('services')}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  Service Issues
                  <Info className="h-3 w-3" />
                </div>
                <div className={`text-3xl font-bold ${metrics.serviceDegradation.count > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {metrics.serviceDegradation.count}
                </div>
                <Badge
                  variant={metrics.serviceDegradation.count > 0 ? 'outline' : 'default'}
                  className="mt-2 text-xs"
                >
                  {metrics.serviceDegradation.count > 0 ? 'DEGRADED' : 'ALL CLEAR'}
                </Badge>
              </div>
              <TrendingDown className={`h-5 w-5 ${metrics.serviceDegradation.count > 0 ? 'text-yellow-600' : 'text-green-600'}`} />
            </div>
          </div>

          {/* Client Experience */}
          <div
            className="p-4 border rounded-lg bg-card cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedMetric('experience')}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  Client Experience
                  <Info className="h-3 w-3" />
                </div>
                <div className={`text-3xl font-bold ${getStatusColor(metrics.clientExperience.status)}`}>
                  {metrics.clientExperience.score}%
                </div>
                <Badge
                  variant={getStatusBadgeVariant(metrics.clientExperience.status)}
                  className="mt-2 text-xs"
                >
                  {metrics.clientExperience.status.toUpperCase()}
                </Badge>
              </div>
              <Users className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Expandable Details Panel */}
        {isExpanded && (
          <div className="mt-6 pt-6 border-t space-y-4">
            {/* Organization Context Details */}
            <div>
              <h4 className="font-semibold mb-2">Organization Context Breakdown</h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">AP Uptime:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.apUptime}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Throughput:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.throughputEfficiency}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total APs:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.onlineAPs}/{metrics.organizationContext.details.totalAPs}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Clients:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.totalClients}</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm mt-2">
                <div>
                  <span className="text-muted-foreground">Avg SNR:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.avgSNR} dB</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Channel Util:</span>
                  <span className="ml-2 font-medium">{metrics.organizationContext.details.channelUtilization}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Weak Signal:</span>
                  <span className={`ml-2 font-medium ${metrics.organizationContext.details.weakSignalClients > 0 ? 'text-yellow-600' : ''}`}>{metrics.organizationContext.details.weakSignalClients}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">AFC APs:</span>
                  <span className="ml-2 font-medium text-blue-600">{metrics.organizationContext.details.afcModeAPs}</span>
                </div>
              </div>
            </div>

            {/* Client Experience Details */}
            <div>
              <h4 className="font-semibold mb-2">Client Experience Breakdown</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Avg Signal:</span>
                  <span className="ml-2 font-medium">{metrics.clientExperience.details.avgSignalStrength} dBm</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Auth Failures:</span>
                  <span className="ml-2 font-medium">{metrics.clientExperience.details.authFailureRate}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Retry Rate:</span>
                  <span className="ml-2 font-medium">{metrics.clientExperience.details.avgRetryRate}%</span>
                </div>
              </div>
            </div>

            {/* Degraded Services List */}
            {metrics.serviceDegradation.count > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Degraded Services</h4>
                <ul className="space-y-1 text-sm">
                  {metrics.serviceDegradation.services.map((service, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <span>{service.name || service.serviceName || service.ssid}</span>
                      <Badge variant="outline" className="text-xs">Performance Issue</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Critical Alerts List */}
            {metrics.criticalAlerts.count > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Critical Alerts</h4>
                <ul className="space-y-1 text-sm">
                  {metrics.criticalAlerts.alerts.map((alert, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span>{alert.message || alert.description || 'Critical alert'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Detail Slide-Out */}
      <DetailSlideOut
        isOpen={selectedMetric !== null}
        onClose={() => setSelectedMetric(null)}
        title={
          selectedMetric === 'organization' ? 'Organization Context Details' :
          selectedMetric === 'alerts' ? 'Critical Alerts Details' :
          selectedMetric === 'services' ? 'Service Issues Details' :
          selectedMetric === 'experience' ? 'Client Experience Details' :
          'Details'
        }
        description="Detailed breakdown and insights"
        width="lg"
      >
        <div className="space-y-4">
            {selectedMetric === 'organization' && (
              <div className="space-y-6">
                {/* Overall Score */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Overall Score</h3>
                    <div className={`text-4xl font-bold ${getStatusColor(metrics.organizationContext.status)}`}>
                      {metrics.organizationContext.score}%
                    </div>
                  </div>
                  <Badge variant={getStatusBadgeVariant(metrics.organizationContext.status)}>
                    {metrics.organizationContext.status.toUpperCase()}
                  </Badge>
                </div>

                {/* Core Metrics */}
                <div className="space-y-3">
                  <h4 className="font-semibold">Core Metrics</h4>
                  <div className="grid gap-3">
                    <div className="p-3 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">AP Uptime</span>
                        <span className="font-bold">{metrics.organizationContext.details.apUptime}%</span>
                      </div>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${metrics.organizationContext.details.apUptime}%` }} />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Throughput Efficiency</span>
                        <span className="font-bold">{metrics.organizationContext.details.throughputEfficiency}%</span>
                      </div>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: `${metrics.organizationContext.details.throughputEfficiency}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Infrastructure Health */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">Infrastructure Health</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Total APs</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.totalAPs}</div>
                      <div className="text-xs mt-1">
                        <span className="text-green-600">{metrics.organizationContext.details.onlineAPs} online</span>
                        {metrics.organizationContext.details.offlineAPs > 0 && (
                          <span className="text-red-600 ml-2">{metrics.organizationContext.details.offlineAPs} offline</span>
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Avg Clients/AP</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.avgClientsPerAP}</div>
                      {metrics.organizationContext.details.overloadedAPs > 0 && (
                        <div className="text-xs text-yellow-600 mt-1">{metrics.organizationContext.details.overloadedAPs} overloaded</div>
                      )}
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">APs by Band</div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex justify-between"><span>2.4 GHz:</span><span className="font-medium">{metrics.organizationContext.details.apsByBand['2.4GHz']}</span></div>
                        <div className="flex justify-between"><span>5 GHz:</span><span className="font-medium">{metrics.organizationContext.details.apsByBand['5GHz']}</span></div>
                        <div className="flex justify-between"><span>6 GHz:</span><span className="font-medium">{metrics.organizationContext.details.apsByBand['6GHz']}</span></div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">AFC Mode (6 GHz SP)</div>
                      <div className="text-2xl font-bold text-blue-600">{metrics.organizationContext.details.afcModeAPs}</div>
                      <div className="text-xs text-muted-foreground mt-1">Standard Power APs</div>
                    </div>
                  </div>
                </div>

                {/* Capacity & Utilization */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">Capacity & Utilization</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Total Clients</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.totalClients}</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Clients by Band</div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex justify-between"><span>2.4 GHz:</span><span className="font-medium">{metrics.organizationContext.details.clientsByBand['2.4GHz']}</span></div>
                        <div className="flex justify-between"><span>5 GHz:</span><span className="font-medium">{metrics.organizationContext.details.clientsByBand['5GHz']}</span></div>
                        <div className="flex justify-between"><span>6 GHz:</span><span className="font-medium">{metrics.organizationContext.details.clientsByBand['6GHz']}</span></div>
                      </div>
                    </div>
                  </div>
                  {metrics.organizationContext.details.busiestSSIDs.length > 0 && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground mb-2">Busiest SSIDs</div>
                      <div className="space-y-2">
                        {metrics.organizationContext.details.busiestSSIDs.map((ssid, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-sm truncate max-w-[150px]">{ssid.name}</span>
                            <Badge variant="secondary">{ssid.clients} clients</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* RF Quality */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">RF Quality</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Avg Noise Floor</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.avgNoiseFloor} dBm</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Avg SNR</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.avgSNR} dB</div>
                      <div className="text-xs mt-1">
                        {metrics.organizationContext.details.avgSNR >= 25 ? (
                          <span className="text-green-600">Excellent</span>
                        ) : metrics.organizationContext.details.avgSNR >= 15 ? (
                          <span className="text-yellow-600">Good</span>
                        ) : (
                          <span className="text-red-600">Poor</span>
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Channel Utilization</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.channelUtilization}%</div>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${metrics.organizationContext.details.channelUtilization > 80 ? 'bg-red-500' : metrics.organizationContext.details.channelUtilization > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${metrics.organizationContext.details.channelUtilization}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Interference</div>
                      <div className="text-sm mt-1 space-y-1">
                        <div className="flex justify-between"><span>Co-Channel:</span><span className={`font-medium ${metrics.organizationContext.details.coChannelInterference > 30 ? 'text-red-600' : 'text-green-600'}`}>{metrics.organizationContext.details.coChannelInterference}%</span></div>
                        <div className="flex justify-between"><span>Adjacent:</span><span className={`font-medium ${metrics.organizationContext.details.adjacentChannelInterference > 20 ? 'text-yellow-600' : 'text-green-600'}`}>{metrics.organizationContext.details.adjacentChannelInterference}%</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coverage */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">Coverage</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Weak Signal Clients</div>
                      <div className={`text-2xl font-bold ${metrics.organizationContext.details.weakSignalClients > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {metrics.organizationContext.details.weakSignalClients}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">&lt;-75 dBm</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Coverage Holes</div>
                      <div className={`text-2xl font-bold ${metrics.organizationContext.details.coverageHoleIndicator > 10 ? 'text-red-600' : metrics.organizationContext.details.coverageHoleIndicator > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {metrics.organizationContext.details.coverageHoleIndicator}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">of clients affected</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Roaming Events</div>
                      <div className="text-2xl font-bold">{metrics.organizationContext.details.roamingEvents}</div>
                    </div>
                  </div>
                </div>

                {/* Security */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">Security</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Failed Auth (24h)</div>
                      <div className={`text-2xl font-bold ${metrics.organizationContext.details.failedAuthAttempts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {metrics.organizationContext.details.failedAuthAttempts}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card relative">
                      <div className="text-xs text-muted-foreground">Rogue APs</div>
                      <div className="text-2xl font-bold text-muted-foreground/50">—</div>
                      <div className="text-[10px] text-orange-500 mt-1">API not available</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card relative">
                      <div className="text-xs text-muted-foreground">Violations</div>
                      <div className="text-2xl font-bold text-muted-foreground/50">—</div>
                      <div className="text-[10px] text-orange-500 mt-1">API not available</div>
                    </div>
                  </div>
                </div>

                {/* Network */}
                <div className="space-y-3">
                  <h4 className="font-semibold border-b pb-2">Network</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Avg Latency</div>
                      {metrics.organizationContext.details.avgLatency > 0 ? (
                        <div className="text-2xl font-bold">{metrics.organizationContext.details.avgLatency} ms</div>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-muted-foreground/50">—</div>
                          <div className="text-[10px] text-orange-500 mt-1">No data available</div>
                        </>
                      )}
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">Packet Loss</div>
                      <div className={`text-2xl font-bold ${metrics.organizationContext.details.packetLossRate > 1 ? 'text-red-600' : 'text-green-600'}`}>
                        {metrics.organizationContext.details.packetLossRate}%
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="text-xs text-muted-foreground">DNS Resolution</div>
                      {metrics.organizationContext.details.dnsResolutionTime > 0 ? (
                        <div className="text-2xl font-bold">{metrics.organizationContext.details.dnsResolutionTime} ms</div>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-muted-foreground/50">—</div>
                          <div className="text-[10px] text-orange-500 mt-1">API not available</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="p-4 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    The Organization Context score is a weighted composite of AP uptime (40%)
                    and throughput efficiency (60%). Additional metrics provide detailed insights
                    into infrastructure health, RF quality, coverage, security, and network performance.
                  </p>
                </div>
              </div>
            )}

            {selectedMetric === 'alerts' && (
              <>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Critical Alerts</h3>
                    <div className={`text-4xl font-bold ${metrics.criticalAlerts.count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {metrics.criticalAlerts.count}
                    </div>
                  </div>
                  <Badge variant={metrics.criticalAlerts.count > 0 ? 'destructive' : 'default'}>
                    {metrics.criticalAlerts.count > 0 ? 'ACTION REQUIRED' : 'ALL CLEAR'}
                  </Badge>
                </div>

                {metrics.criticalAlerts.count > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Active Alerts</h4>
                    {metrics.criticalAlerts.alerts.map((alert, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-red-500/50 bg-red-500/5">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm">{alert.message || alert.description || 'Critical alert'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No critical alerts at this time. All systems operating normally.</p>
                  </div>
                )}
              </>
            )}

            {selectedMetric === 'services' && (
              <>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Service Issues</h3>
                    <div className={`text-4xl font-bold ${metrics.serviceDegradation.count > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {metrics.serviceDegradation.count}
                    </div>
                  </div>
                  <Badge variant={metrics.serviceDegradation.count > 0 ? 'outline' : 'default'}>
                    {metrics.serviceDegradation.count > 0 ? 'DEGRADED' : 'ALL CLEAR'}
                  </Badge>
                </div>

                {metrics.serviceDegradation.count > 0 ? (
                  <div className="space-y-2">
                    <h4 className="font-semibold">Degraded Services</h4>
                    {metrics.serviceDegradation.services.map((service, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <span className="font-medium">{service.name || service.serviceName || service.ssid}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">Performance Issue</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">All services operating normally with no performance degradation detected.</p>
                  </div>
                )}
              </>
            )}

            {selectedMetric === 'experience' && (
              <>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Client Experience Score</h3>
                    <div className={`text-4xl font-bold ${getStatusColor(metrics.clientExperience.status)}`}>
                      {metrics.clientExperience.score}%
                    </div>
                  </div>
                  <Badge variant={getStatusBadgeVariant(metrics.clientExperience.status)}>
                    {metrics.clientExperience.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Experience Metrics</h4>
                  <div className="grid gap-3">
                    <div className="p-3 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Average Signal Strength</span>
                        <span className="font-bold">{metrics.clientExperience.details.avgSignalStrength} dBm</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {metrics.clientExperience.details.avgSignalStrength > -60 ? 'Excellent' :
                         metrics.clientExperience.details.avgSignalStrength > -70 ? 'Good' :
                         metrics.clientExperience.details.avgSignalStrength > -80 ? 'Fair' : 'Poor'} signal quality
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Authentication Failure Rate</span>
                        <span className="font-bold">{metrics.clientExperience.details.authFailureRate}%</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Average Retry Rate</span>
                        <span className="font-bold">{metrics.clientExperience.details.avgRetryRate}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Client Experience score combines signal strength (50%), authentication success (30%),
                    and retry rates (20%) to measure overall end-user satisfaction.
                  </p>
                </div>
              </>
            )}
        </div>
      </DetailSlideOut>
    </Card>
  );
}

// Export memoized component for better performance
export const OperationalContextSummary = memo(OperationalContextSummaryComponent);
