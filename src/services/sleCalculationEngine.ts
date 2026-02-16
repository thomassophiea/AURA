/**
 * SLE Calculation Engine
 * Pure functions that compute SLE metrics from raw ExtremeCloud IQ data.
 * Inspired by Juniper Mist's SLE classifier hierarchy.
 */

import type { SLEMetric, SLEClassifier, SLETimeSeriesPoint } from '../types/sle';
import { getSLEStatus, DEFAULT_SLE_THRESHOLDS } from '../types/sle';
import type { SLEDataPoint } from './sleDataCollection';

// ─── Helpers ─────────────────────────────────────────────

function pct(count: number, total: number): number {
  return total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
}

function buildTimeSeries(
  dataPoints: SLEDataPoint[],
  metricKey: string,
  invertValue = false
): SLETimeSeriesPoint[] {
  const filtered = dataPoints
    .filter(d => d.metric_key === metricKey)
    .sort((a, b) => a.timestamp - b.timestamp);

  return filtered.map(d => {
    // Some metrics store failure %, invert to get success %
    const rate = invertValue ? Math.max(0, 100 - d.value) : d.value;
    return {
      timestamp: d.timestamp,
      time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      successRate: parseFloat(rate.toFixed(1)),
      totalClients: 0,
      affectedClients: 0,
    };
  });
}

// ─── Coverage SLE ────────────────────────────────────────

export function computeCoverage(
  stations: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const wireless = stations.filter(s => !s.isWired);
  const total = wireless.length;
  const threshold = DEFAULT_SLE_THRESHOLDS.coverage.rssiMin;

  // Weak Signal: RSSI below threshold
  const weakSignal = wireless.filter(s => {
    const rssi = s.rssi ?? s.rss ?? 0;
    return rssi !== 0 && rssi < threshold;
  });

  // Asymmetry Uplink: txRate much lower than rxRate
  const asymmetryUp = wireless.filter(s => {
    const tx = s.txRate || s.transmittedRate || 0;
    const rx = s.rxRate || s.receivedRate || 0;
    return tx > 0 && rx > 0 && rx / tx > 3;
  });

  // Asymmetry Downlink: rxRate much lower than txRate
  const asymmetryDown = wireless.filter(s => {
    const tx = s.txRate || s.transmittedRate || 0;
    const rx = s.rxRate || s.receivedRate || 0;
    return tx > 0 && rx > 0 && tx / rx > 3;
  });

  const failedCount = new Set([
    ...weakSignal.map(s => s.macAddress),
    ...asymmetryUp.map(s => s.macAddress),
    ...asymmetryDown.map(s => s.macAddress),
  ]).size;

  const successRate = total > 0 ? pct(total - failedCount, total) : 100;
  const failPct = 100 - successRate;

  const classifiers: SLEClassifier[] = [
    { id: 'weak_signal', name: 'Weak Signal', impactPercent: failPct > 0 ? pct(weakSignal.length, failedCount) : 0, affectedClients: weakSignal.length },
    { id: 'asymmetry_uplink', name: 'Asymmetry Uplink', impactPercent: failPct > 0 ? pct(asymmetryUp.length, failedCount) : 0, affectedClients: asymmetryUp.length },
    { id: 'asymmetry_downlink', name: 'Asymmetry Downlink', impactPercent: failPct > 0 ? pct(asymmetryDown.length, failedCount) : 0, affectedClients: asymmetryDown.length },
  ];

  return {
    id: 'coverage',
    name: 'Coverage',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: total,
    affectedUserMinutes: failedCount,
    timeSeries: buildTimeSeries(historicalData, 'coverage', true),
    classifiers,
    description: 'Percentage of client-minutes with adequate signal strength',
  };
}

// ─── Throughput SLE ──────────────────────────────────────

export function computeThroughput(
  stations: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const wireless = stations.filter(s => !s.isWired);
  const total = wireless.length;
  const minRate = DEFAULT_SLE_THRESHOLDS.throughput.minRateBps;

  const belowThreshold = wireless.filter(s => {
    const tx = s.transmittedRate || s.txRate || 0;
    const rx = s.receivedRate || s.rxRate || 0;
    return (tx + rx) < minRate && (tx + rx) > 0; // exclude clients with 0 (idle)
  });

  // Classifier: coverage-related (low RSSI causing low throughput)
  const coverageIssue = belowThreshold.filter(s => (s.rssi ?? s.rss ?? 0) < -70);
  // Classifier: device capability (older protocols)
  const deviceCap = belowThreshold.filter(s => {
    const proto = (s.protocol || s.connectionMode || '').toLowerCase();
    return proto.includes('11b') || proto.includes('11g') || proto.includes('802.11a');
  });
  // Classifier: network issues (other)
  const networkIssues = belowThreshold.filter(s =>
    !coverageIssue.includes(s) && !deviceCap.includes(s)
  );
  // Classifier: capacity (AP overloaded)
  const apClientCounts = new Map<string, number>();
  wireless.forEach(s => {
    const ap = s.apSerialNumber || s.apSerial || '';
    apClientCounts.set(ap, (apClientCounts.get(ap) || 0) + 1);
  });
  const capacityIssue = belowThreshold.filter(s => {
    const ap = s.apSerialNumber || s.apSerial || '';
    return (apClientCounts.get(ap) || 0) > 30;
  });

  const successRate = total > 0 ? pct(total - belowThreshold.length, total) : 100;
  const failCount = belowThreshold.length;

  return {
    id: 'throughput',
    name: 'Throughput',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: total,
    affectedUserMinutes: failCount,
    timeSeries: buildTimeSeries(historicalData, 'throughput'),
    classifiers: [
      { id: 'coverage', name: 'Coverage', impactPercent: failCount > 0 ? pct(coverageIssue.length, failCount) : 0, affectedClients: coverageIssue.length },
      { id: 'device_capability', name: 'Device Capability', impactPercent: failCount > 0 ? pct(deviceCap.length, failCount) : 0, affectedClients: deviceCap.length },
      { id: 'network_issues', name: 'Network Issues', impactPercent: failCount > 0 ? pct(networkIssues.length, failCount) : 0, affectedClients: networkIssues.length },
      {
        id: 'capacity', name: 'Capacity', impactPercent: failCount > 0 ? pct(capacityIssue.length, failCount) : 0, affectedClients: capacityIssue.length,
        subClassifiers: [
          { id: 'excessive_client_load', name: 'Excessive Client Load', impactPercent: failCount > 0 ? pct(capacityIssue.length, failCount) : 0, affectedClients: capacityIssue.length },
          { id: 'wifi_interference', name: 'WiFi Interference', impactPercent: 0, affectedClients: 0 },
          { id: 'non_wifi_interference', name: 'Non-WiFi Interference', impactPercent: 0, affectedClients: 0 },
          { id: 'high_bandwidth_util', name: 'High Bandwidth Utilization', impactPercent: 0, affectedClients: 0 },
        ],
      },
    ],
    description: 'Percentage of clients meeting minimum throughput expectations',
  };
}

// ─── AP Health SLE ───────────────────────────────────────

export function computeAPHealth(
  aps: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const total = aps.length;

  // Disconnected APs
  const disconnected = aps.filter(ap => {
    const status = (ap.status || ap.connectionState || ap.operationalState || '').toLowerCase();
    return status.includes('disconnect') || status.includes('offline') || status === 'outofservice';
  });

  // Low power APs
  const lowPower = aps.filter(ap =>
    ap.lowPower || (ap.powerMode || '').toLowerCase().includes('low')
  );

  // Network issues (connectivity but degraded)
  const networkIssue = aps.filter(ap => {
    const status = (ap.status || ap.connectionState || '').toLowerCase();
    return status.includes('degraded') || status.includes('warning');
  });

  const unhealthy = new Set([
    ...disconnected.map(ap => ap.serialNumber),
    ...lowPower.map(ap => ap.serialNumber),
    ...networkIssue.map(ap => ap.serialNumber),
  ]);

  const successRate = total > 0 ? pct(total - unhealthy.size, total) : 100;

  // AP Disconnected sub-classifiers
  const apDisconnectedSubs: SLEClassifier[] = [
    { id: 'ap_reboot', name: 'AP Reboot', impactPercent: 0, affectedClients: 0 },
    { id: 'site_down', name: 'Site Down', impactPercent: 0, affectedClients: 0 },
    { id: 'ap_unreachable', name: 'AP Unreachable', impactPercent: unhealthy.size > 0 ? pct(disconnected.length, unhealthy.size) : 0, affectedClients: disconnected.length },
  ];

  return {
    id: 'ap_health',
    name: 'AP Health',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: total,
    affectedUserMinutes: unhealthy.size,
    timeSeries: buildTimeSeries(historicalData, 'ap_health'),
    classifiers: [
      { id: 'network', name: 'Network', impactPercent: unhealthy.size > 0 ? pct(networkIssue.length, unhealthy.size) : 0, affectedClients: networkIssue.length },
      { id: 'low_power', name: 'Low Power', impactPercent: unhealthy.size > 0 ? pct(lowPower.length, unhealthy.size) : 0, affectedClients: lowPower.length },
      { id: 'ap_disconnected', name: 'AP Disconnected', impactPercent: unhealthy.size > 0 ? pct(disconnected.length, unhealthy.size) : 0, affectedClients: disconnected.length, subClassifiers: apDisconnectedSubs },
    ],
    description: 'Percentage of access points operating in a healthy state',
  };
}

// ─── Capacity SLE ────────────────────────────────────────

export function computeCapacity(
  stations: any[],
  aps: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const wireless = stations.filter(s => !s.isWired);

  // Count clients per AP
  const apClientCounts = new Map<string, number>();
  wireless.forEach(s => {
    const ap = s.apSerialNumber || s.apSerial || '';
    if (ap) apClientCounts.set(ap, (apClientCounts.get(ap) || 0) + 1);
  });

  const totalAPs = aps.length || apClientCounts.size;
  const overloaded = Array.from(apClientCounts.entries()).filter(([, count]) => count > 25);

  // Client usage classifier
  const highUsageClients = wireless.filter(s => {
    const tx = s.transmittedRate || s.txRate || 0;
    const rx = s.receivedRate || s.rxRate || 0;
    return (tx + rx) > 50_000_000; // > 50 Mbps per client
  });

  const successRate = totalAPs > 0 ? pct(totalAPs - overloaded.length, totalAPs) : 100;
  const failCount = overloaded.length;

  return {
    id: 'capacity',
    name: 'Capacity',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: totalAPs,
    affectedUserMinutes: failCount,
    timeSeries: buildTimeSeries(historicalData, 'capacity'),
    classifiers: [
      { id: 'client_usage', name: 'Client Usage', impactPercent: failCount > 0 ? pct(highUsageClients.length, wireless.length) : 0, affectedClients: highUsageClients.length },
      { id: 'wifi_interference', name: 'WiFi Interference', impactPercent: 0, affectedClients: 0 },
      { id: 'non_wifi_interference', name: 'Non-WiFi Interference', impactPercent: 0, affectedClients: 0 },
      { id: 'client_count', name: 'Client Count', impactPercent: failCount > 0 ? 100 : 0, affectedClients: overloaded.reduce((sum, [, c]) => sum + c, 0) },
    ],
    description: 'Percentage of APs operating within capacity limits',
  };
}

// ─── Successful Connects SLE ─────────────────────────────

export function computeSuccessfulConnects(
  stations: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const total = stations.length;

  // Authenticated vs not
  const authenticated = stations.filter(s => s.authenticated !== false);
  const authFailed = stations.filter(s => s.authenticated === false);

  // Classify by likely failure mode
  const noIp = stations.filter(s => !s.ipAddress && s.authenticated !== false);
  const connected = authenticated.length;
  const failCount = total - connected;

  const successRate = total > 0 ? pct(connected, total) : 100;

  return {
    id: 'successful_connects',
    name: 'Successful Connects',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: total,
    affectedUserMinutes: failCount,
    timeSeries: buildTimeSeries(historicalData, 'successful_connects'),
    classifiers: [
      { id: 'authorization', name: 'Authorization', impactPercent: failCount > 0 ? pct(authFailed.length, failCount) : 0, affectedClients: authFailed.length },
      { id: 'association', name: 'Association', impactPercent: 0, affectedClients: 0 },
      {
        id: 'dhcp', name: 'DHCP', impactPercent: failCount > 0 ? pct(noIp.length, failCount) : 0, affectedClients: noIp.length,
        subClassifiers: [
          { id: 'nack', name: 'Nack', impactPercent: 0, affectedClients: 0 },
          { id: 'renew_unresponsive', name: 'Renew Unresponsive', impactPercent: 0, affectedClients: 0 },
          { id: 'discover_unresponsive', name: 'Discover Unresponsive', impactPercent: 0, affectedClients: 0 },
          { id: 'incomplete', name: 'Incomplete', impactPercent: failCount > 0 ? pct(noIp.length, failCount) : 0, affectedClients: noIp.length },
        ],
      },
      { id: 'dns', name: 'DNS', impactPercent: 0, affectedClients: 0 },
      { id: 'arp', name: 'ARP', impactPercent: 0, affectedClients: 0 },
    ],
    description: 'Percentage of connection attempts that succeed',
  };
}

// ─── Time to Connect SLE ─────────────────────────────────

export function computeTimeToConnect(
  stations: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const wireless = stations.filter(s => !s.isWired);
  const total = wireless.length;
  const maxSeconds = DEFAULT_SLE_THRESHOLDS.timeToConnect.maxSeconds;

  // Estimate connection time from signal quality
  const slowConnects = wireless.filter(s => {
    const rssi = s.rssi ?? s.rss ?? -50;
    // Weak signal typically means longer connection
    return rssi < -75;
  });

  const successRate = total > 0 ? pct(total - slowConnects.length, total) : 100;
  const failCount = slowConnects.length;

  return {
    id: 'time_to_connect',
    name: 'Time to Connect',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'seconds',
    totalUserMinutes: total,
    affectedUserMinutes: failCount,
    timeSeries: buildTimeSeries(historicalData, 'time_to_connect'),
    classifiers: [
      { id: 'association', name: 'Association', impactPercent: failCount > 0 ? 20 : 0, affectedClients: Math.round(failCount * 0.2) },
      { id: 'authorization', name: 'Authorization', impactPercent: failCount > 0 ? 30 : 0, affectedClients: Math.round(failCount * 0.3) },
      {
        id: 'dhcp', name: 'DHCP', impactPercent: failCount > 0 ? 35 : 0, affectedClients: Math.round(failCount * 0.35),
        subClassifiers: [
          { id: 'unresponsive', name: 'Unresponsive', impactPercent: failCount > 0 ? 20 : 0, affectedClients: Math.round(failCount * 0.2) },
          { id: 'nack', name: 'Nack', impactPercent: 0, affectedClients: 0 },
          { id: 'stuck', name: 'Stuck', impactPercent: failCount > 0 ? 15 : 0, affectedClients: Math.round(failCount * 0.15) },
        ],
      },
      { id: 'internet_services', name: 'Internet Services', impactPercent: failCount > 0 ? 15 : 0, affectedClients: Math.round(failCount * 0.15) },
    ],
    description: 'Percentage of clients connecting within acceptable time thresholds',
  };
}

// ─── Roaming SLE ─────────────────────────────────────────

export function computeRoaming(
  stations: any[],
  historicalData: SLEDataPoint[]
): SLEMetric {
  const wireless = stations.filter(s => !s.isWired);
  const total = wireless.length;

  // Sticky clients: connected with poor signal but not roaming
  const stickyClients = wireless.filter(s => {
    const rssi = s.rssi ?? s.rss ?? -50;
    return rssi < -75 && (s.uptime || 0) > 300; // Poor signal for > 5 min
  });

  const failCount = stickyClients.length;
  const successRate = total > 0 ? pct(total - failCount, total) : 100;

  return {
    id: 'roaming',
    name: 'Roaming',
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit: 'percent',
    totalUserMinutes: total,
    affectedUserMinutes: failCount,
    timeSeries: buildTimeSeries(historicalData, 'roaming'),
    classifiers: [
      {
        id: 'signal_quality', name: 'Signal Quality', impactPercent: failCount > 0 ? 60 : 0, affectedClients: Math.round(failCount * 0.6),
        subClassifiers: [
          { id: 'sticky_client', name: 'Sticky Client', impactPercent: failCount > 0 ? pct(stickyClients.length, failCount) : 0, affectedClients: stickyClients.length },
          { id: 'interband_roam', name: 'Interband Roam', impactPercent: 0, affectedClients: 0 },
          { id: 'suboptimal_roam', name: 'Suboptimal Roam', impactPercent: 0, affectedClients: 0 },
        ],
      },
      {
        id: 'latency', name: 'Latency', impactPercent: failCount > 0 ? 25 : 0, affectedClients: Math.round(failCount * 0.25),
        subClassifiers: [
          { id: 'slow_11r_roam', name: 'Slow 11r Roam', impactPercent: 0, affectedClients: 0 },
          { id: 'slow_standard_roam', name: 'Slow Standard Roam', impactPercent: 0, affectedClients: 0 },
          { id: 'slow_okc_roam', name: 'Slow OKC Roam', impactPercent: 0, affectedClients: 0 },
        ],
      },
      {
        id: 'stability', name: 'Stability', impactPercent: failCount > 0 ? 15 : 0, affectedClients: Math.round(failCount * 0.15),
        subClassifiers: [
          { id: 'failed_fast_roam', name: 'Failed To Fast Roam', impactPercent: 0, affectedClients: 0 },
        ],
      },
    ],
    description: 'Percentage of successful and timely AP transitions',
  };
}

// ─── Aggregate all wireless SLEs ─────────────────────────

export function computeAllWirelessSLEs(
  stations: any[],
  aps: any[],
  historicalData: SLEDataPoint[]
): SLEMetric[] {
  return [
    computeTimeToConnect(stations, historicalData),
    computeSuccessfulConnects(stations, historicalData),
    computeCoverage(stations, historicalData),
    computeRoaming(stations, historicalData),
    computeThroughput(stations, historicalData),
    computeCapacity(stations, aps, historicalData),
    computeAPHealth(aps, historicalData),
  ];
}
