/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ-native SLE engine.
 *
 * Computes the same 7 wireless SLE metrics the OS-ONE page shows, but from XIQ
 * dashboard grid data instead of controller stations/APs. Output is the shared
 * `SLEMetric` shape so the existing honeycomb / classifier / scoring UI renders
 * identically — only the data source and calculations differ.
 *
 * Inputs (per selected site) come from three XIQ grids:
 *   /dashboard/wireless/client-health/grid   -> per-client: rssi, snr, auth/assoc/dhcp
 *                                               issues + timings, roaming, retries
 *   /dashboard/wireless/device-health/grid   -> per-AP: cpu, memory, reboots, channel changes
 *   /dashboard/wireless/usage-capacity/grid  -> per-AP: radio utilization, interference
 *
 * Thresholds/weights follow the anomaly-detection reference implementation.
 */

import type { SLEMetric, SLEClassifier } from '../../types/sle';
import { getSLEStatus } from '../../types/sle';

// ── Thresholds (from the anomaly-detection reference) ──────────────────────
const COVERAGE_WARNING_RSSI = -70; // dBm; below this is weak
const COVERAGE_WARNING_SNR = 15; // dB; below this is poor
const TTC_WARN_MS = 5000; // time-to-connect above this is slow
const ROAM_BAD_MS = 3000; // roam duration above this is bad
const RADIO_UTIL_THRESHOLD = 70; // % radio utilization considered congested
const AP_CPU_THRESHOLD = 85;
const AP_MEMORY_THRESHOLD = 90;
const RETRY_FRACTION_THRESHOLD = 0.2; // tx+rx client retry fraction considered high

function pct(count: number, total: number): number {
  return total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === 'true';
}

function metric(
  id: string,
  name: string,
  unit: string,
  total: number,
  failCount: number,
  classifiers: SLEClassifier[],
  description: string
): SLEMetric {
  const successRate = total > 0 ? pct(total - failCount, total) : 100;
  return {
    id,
    name,
    scope: 'wireless',
    successRate,
    status: getSLEStatus(successRate),
    unit,
    totalUserMinutes: total,
    affectedUserMinutes: failCount,
    timeSeries: [], // XIQ history not collected yet
    classifiers,
    description,
  };
}

// ── Coverage ───────────────────────────────────────────────────────────────
function computeCoverage(clients: any[]): SLEMetric {
  const total = clients.length;
  const weakSignal = clients.filter((c) => c.rssi != null && num(c.rssi) < COVERAGE_WARNING_RSSI);
  const lowSnr = clients.filter((c) => c.snr != null && num(c.snr) < COVERAGE_WARNING_SNR);
  const failed = new Set<string>([
    ...weakSignal.map((c) => String(c.client_mac)),
    ...lowSnr.map((c) => String(c.client_mac)),
  ]);
  const failCount = failed.size;
  return metric(
    'coverage',
    'Coverage',
    'percent',
    total,
    failCount,
    [
      {
        id: 'weak_signal',
        name: 'Weak Signal',
        impactPercent: failCount > 0 ? pct(weakSignal.length, failCount) : 0,
        affectedClients: weakSignal.length,
      },
      {
        id: 'low_snr',
        name: 'Low SNR',
        impactPercent: failCount > 0 ? pct(lowSnr.length, failCount) : 0,
        affectedClients: lowSnr.length,
      },
    ],
    'Percentage of clients with adequate signal strength (RSSI/SNR)'
  );
}

// ── Throughput (client experience proxy: retries / airtime / slowness) ──────
function computeThroughput(clients: any[]): SLEMetric {
  const total = clients.length;
  const highRetries = clients.filter(
    (c) => num(c.tx_client_retries) + num(c.rx_client_retries) >= RETRY_FRACTION_THRESHOLD
  );
  const airtime = clients.filter((c) => bool(c.air_time_warning));
  const slow = clients.filter((c) => num(c.slowness) > 0);
  const failed = new Set<string>([
    ...highRetries.map((c) => String(c.client_mac)),
    ...airtime.map((c) => String(c.client_mac)),
    ...slow.map((c) => String(c.client_mac)),
  ]);
  const failCount = failed.size;
  return metric(
    'throughput',
    'Throughput',
    'percent',
    total,
    failCount,
    [
      {
        id: 'client_retries',
        name: 'Client Retries',
        impactPercent: failCount > 0 ? pct(highRetries.length, failCount) : 0,
        affectedClients: highRetries.length,
      },
      {
        id: 'airtime',
        name: 'Airtime Saturation',
        impactPercent: failCount > 0 ? pct(airtime.length, failCount) : 0,
        affectedClients: airtime.length,
      },
      {
        id: 'slowness',
        name: 'Slowness',
        impactPercent: failCount > 0 ? pct(slow.length, failCount) : 0,
        affectedClients: slow.length,
      },
    ],
    'Percentage of clients without retry/airtime/slowness degradation'
  );
}

// ── Time to Connect ─────────────────────────────────────────────────────────
function computeTimeToConnect(clients: any[]): SLEMetric {
  const total = clients.length;
  const ttc = (c: any) =>
    num(c.association_duration) + num(c.authentication_response_time) + num(c.dhcp_ip_assignation_time);
  const slow = clients.filter((c) => ttc(c) > TTC_WARN_MS);
  const failCount = slow.length;
  // Attribute the slow connects to the dominant phase.
  const assocHeavy = slow.filter((c) => num(c.association_duration) >= num(c.authentication_response_time) && num(c.association_duration) >= num(c.dhcp_ip_assignation_time));
  const authHeavy = slow.filter((c) => num(c.authentication_response_time) > num(c.association_duration) && num(c.authentication_response_time) >= num(c.dhcp_ip_assignation_time));
  const dhcpHeavy = slow.filter((c) => num(c.dhcp_ip_assignation_time) > num(c.association_duration) && num(c.dhcp_ip_assignation_time) > num(c.authentication_response_time));
  return metric(
    'time_to_connect',
    'Time to Connect',
    'seconds',
    total,
    failCount,
    [
      {
        id: 'association',
        name: 'Association',
        impactPercent: failCount > 0 ? pct(assocHeavy.length, failCount) : 0,
        affectedClients: assocHeavy.length,
      },
      {
        id: 'authorization',
        name: 'Authorization',
        impactPercent: failCount > 0 ? pct(authHeavy.length, failCount) : 0,
        affectedClients: authHeavy.length,
      },
      {
        id: 'dhcp',
        name: 'DHCP',
        impactPercent: failCount > 0 ? pct(dhcpHeavy.length, failCount) : 0,
        affectedClients: dhcpHeavy.length,
      },
    ],
    'Percentage of clients connecting within the time threshold'
  );
}

// ── Successful Connects ──────────────────────────────────────────────────────
function computeSuccessfulConnects(clients: any[]): SLEMetric {
  const total = clients.length;
  const authFail = clients.filter((c) => bool(c.has_authentication_issues));
  const assocFail = clients.filter((c) => bool(c.has_association_issues));
  const dhcpFail = clients.filter((c) => bool(c.has_ip_address_issues));
  const failed = new Set<string>([
    ...authFail.map((c) => String(c.client_mac)),
    ...assocFail.map((c) => String(c.client_mac)),
    ...dhcpFail.map((c) => String(c.client_mac)),
  ]);
  const failCount = failed.size;
  return metric(
    'successful_connects',
    'Successful Connects',
    'percent',
    total,
    failCount,
    [
      {
        id: 'authorization',
        name: 'Authorization',
        impactPercent: failCount > 0 ? pct(authFail.length, failCount) : 0,
        affectedClients: authFail.length,
      },
      {
        id: 'association',
        name: 'Association',
        impactPercent: failCount > 0 ? pct(assocFail.length, failCount) : 0,
        affectedClients: assocFail.length,
      },
      {
        id: 'dhcp',
        name: 'DHCP',
        impactPercent: failCount > 0 ? pct(dhcpFail.length, failCount) : 0,
        affectedClients: dhcpFail.length,
      },
    ],
    'Percentage of connection attempts that succeed (auth / association / DHCP)'
  );
}

// ── Roaming ──────────────────────────────────────────────────────────────────
function computeRoaming(clients: any[]): SLEMetric {
  const total = clients.length;
  const issueFlag = clients.filter((c) => bool(c.has_roaming_issues));
  const slowRoam = clients.filter((c) => num(c.roaming_time) > ROAM_BAD_MS);
  const failed = new Set<string>([
    ...issueFlag.map((c) => String(c.client_mac)),
    ...slowRoam.map((c) => String(c.client_mac)),
  ]);
  const failCount = failed.size;
  return metric(
    'roaming',
    'Roaming',
    'percent',
    total,
    failCount,
    [
      {
        id: 'signal_quality',
        name: 'Signal Quality',
        impactPercent: failCount > 0 ? pct(issueFlag.length, failCount) : 0,
        affectedClients: issueFlag.length,
      },
      {
        id: 'latency',
        name: 'Latency',
        impactPercent: failCount > 0 ? pct(slowRoam.length, failCount) : 0,
        affectedClients: slowRoam.length,
      },
    ],
    'Percentage of successful and timely AP transitions'
  );
}

// ── Capacity (per AP, usage-capacity grid) ───────────────────────────────────
function computeCapacity(aps: any[]): SLEMetric {
  const total = aps.length;
  const congested = (ap: any) =>
    Math.max(
      num(ap.radio_2dot4g_utilization_score),
      num(ap.radio_5g_utilization_score),
      num(ap.radio_6g_utilization_score)
    ) >= RADIO_UTIL_THRESHOLD;
  const overloaded = aps.filter((ap) => bool(ap.has_usage_capacity_issue) || congested(ap));
  const failCount = overloaded.length;
  const band24 = aps.filter((ap) => num(ap.radio_2dot4g_utilization_score) >= RADIO_UTIL_THRESHOLD);
  const band5 = aps.filter((ap) => num(ap.radio_5g_utilization_score) >= RADIO_UTIL_THRESHOLD);
  const interference = aps.filter((ap) => num(ap.wifi0_interference_score) >= RADIO_UTIL_THRESHOLD);
  return metric(
    'capacity',
    'Capacity',
    'percent',
    total,
    failCount,
    [
      {
        id: 'utilization_24',
        name: '2.4 GHz Utilization',
        impactPercent: failCount > 0 ? pct(band24.length, failCount) : 0,
        affectedClients: band24.length,
      },
      {
        id: 'utilization_5',
        name: '5 GHz Utilization',
        impactPercent: failCount > 0 ? pct(band5.length, failCount) : 0,
        affectedClients: band5.length,
      },
      {
        id: 'interference',
        name: 'Interference',
        impactPercent: failCount > 0 ? pct(interference.length, failCount) : 0,
        affectedClients: interference.length,
      },
    ],
    'Percentage of APs operating within capacity limits'
  );
}

// ── AP Health (per AP, device-health grid) ───────────────────────────────────
function computeAPHealth(aps: any[]): SLEMetric {
  const total = aps.length;
  const flagged = aps.filter((ap) => bool(ap.has_device_health_issue));
  const highCpu = aps.filter((ap) => num(ap.cpu_usage_percentage) >= AP_CPU_THRESHOLD);
  const highMem = aps.filter((ap) => num(ap.memory_usage_percentage) >= AP_MEMORY_THRESHOLD);
  const reboots = aps.filter((ap) => num(ap.wifi_reboots_count) >= 1);
  const channelChanges = aps.filter((ap) => num(ap.channel_change_count) >= 3);
  const unhealthy = new Set<string>([
    ...flagged.map((ap) => String(ap.device_id ?? ap.hostname)),
    ...highCpu.map((ap) => String(ap.device_id ?? ap.hostname)),
    ...highMem.map((ap) => String(ap.device_id ?? ap.hostname)),
    ...reboots.map((ap) => String(ap.device_id ?? ap.hostname)),
    ...channelChanges.map((ap) => String(ap.device_id ?? ap.hostname)),
  ]);
  const failCount = unhealthy.size;
  return metric(
    'ap_health',
    'AP Health',
    'percent',
    total,
    failCount,
    [
      {
        id: 'cpu',
        name: 'High CPU',
        impactPercent: failCount > 0 ? pct(highCpu.length, failCount) : 0,
        affectedClients: highCpu.length,
      },
      {
        id: 'memory',
        name: 'High Memory',
        impactPercent: failCount > 0 ? pct(highMem.length, failCount) : 0,
        affectedClients: highMem.length,
      },
      {
        id: 'reboots',
        name: 'Reboots',
        impactPercent: failCount > 0 ? pct(reboots.length, failCount) : 0,
        affectedClients: reboots.length,
      },
      {
        id: 'channel_changes',
        name: 'Channel Changes',
        impactPercent: failCount > 0 ? pct(channelChanges.length, failCount) : 0,
        affectedClients: channelChanges.length,
      },
    ],
    'Percentage of access points operating in a healthy state'
  );
}

/**
 * Compute all 7 wireless SLEs from XIQ grid data. Order matches the OS-ONE
 * engine so the honeycomb lays out identically.
 */
export function computeXiqWirelessSLEs(
  clientRows: any[],
  deviceRows: any[],
  capacityRows: any[]
): SLEMetric[] {
  return [
    computeTimeToConnect(clientRows),
    computeSuccessfulConnects(clientRows),
    computeCoverage(clientRows),
    computeRoaming(clientRows),
    computeThroughput(clientRows),
    computeCapacity(capacityRows),
    computeAPHealth(deviceRows),
  ];
}
