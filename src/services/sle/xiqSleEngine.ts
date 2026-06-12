/**
 * XIQ-native SLE engine.
 *
 * Computes the same 7 wireless SLE metrics the OS-ONE page shows, but from XIQ
 * dashboard grid data instead of controller stations/APs. Output is the shared
 * `SLEMetric` shape so the existing honeycomb / classifier / scoring UI renders
 * identically — only the data source and calculations differ.
 *
 * Inputs are normalized rows (see types/xiqGrid) from three XIQ grids:
 *   client-health   -> rssi, snr, auth/assoc/dhcp issues + timings, roaming, retries
 *   device-health   -> cpu, memory, reboots, channel changes, PoE
 *   usage-capacity   -> radio utilization, interference, packet loss
 *
 * Thresholds/weights follow the anomaly-detection reference implementation.
 */

import type { SLEMetric, SLEClassifier } from '../../types/sle';
import { getSLEStatus, markSLEDataPresence } from '../../types/sle';
import type {
  XiqClientHealthRow,
  XiqDeviceHealthRow,
  XiqCapacityRow,
} from '../../types/xiqGrid';

// ── Thresholds (from the anomaly-detection reference) ──────────────────────
const COVERAGE_WARNING_RSSI = -70; // dBm; below this is weak
const COVERAGE_WARNING_SNR = 15; // dB; below this is poor
const TTC_WARN_MS = 5000; // time-to-connect above this is slow
const ROAM_BAD_MS = 3000; // roam duration above this is bad
const RADIO_UTIL_THRESHOLD = 70; // % radio utilization considered congested
const INTERFERENCE_THRESHOLD = 50; // interference score considered high
const PACKET_LOSS_THRESHOLD = 5; // % packet loss considered impacting
const AP_CPU_THRESHOLD = 85;
const AP_MEMORY_THRESHOLD = 90;
const RETRY_FRACTION_THRESHOLD = 0.2; // tx+rx client retry fraction considered high

function pct(count: number, total: number): number {
  return total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
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

const classifier = (id: string, name: string, count: number, failCount: number): SLEClassifier => ({
  id,
  name,
  impactPercent: failCount > 0 ? pct(count, failCount) : 0,
  affectedClients: count,
});

// ── Coverage ───────────────────────────────────────────────────────────────
function computeCoverage(clients: XiqClientHealthRow[]): SLEMetric {
  const total = clients.length;
  const weakSignal = clients.filter((c) => c.rssi != null && c.rssi < COVERAGE_WARNING_RSSI);
  const lowSnr = clients.filter((c) => c.snr != null && c.snr < COVERAGE_WARNING_SNR);
  const failed = new Set<string>([
    ...weakSignal.map((c) => c.clientMac),
    ...lowSnr.map((c) => c.clientMac),
  ]);
  return metric(
    'coverage',
    'Coverage',
    'percent',
    total,
    failed.size,
    [
      classifier('weak_signal', 'Weak Signal', weakSignal.length, failed.size),
      classifier('low_snr', 'Low SNR', lowSnr.length, failed.size),
    ],
    'Percentage of clients with adequate signal strength (RSSI/SNR)'
  );
}

// ── Throughput (client experience proxy: retries / airtime / slowness) ──────
function computeThroughput(clients: XiqClientHealthRow[]): SLEMetric {
  const total = clients.length;
  const highRetries = clients.filter((c) => c.txRetries + c.rxRetries >= RETRY_FRACTION_THRESHOLD);
  const airtime = clients.filter((c) => c.airtimeWarning);
  const slow = clients.filter((c) => c.slowness > 0);
  const failed = new Set<string>([
    ...highRetries.map((c) => c.clientMac),
    ...airtime.map((c) => c.clientMac),
    ...slow.map((c) => c.clientMac),
  ]);
  return metric(
    'throughput',
    'Throughput',
    'percent',
    total,
    failed.size,
    [
      classifier('client_retries', 'Client Retries', highRetries.length, failed.size),
      classifier('airtime', 'Airtime Saturation', airtime.length, failed.size),
      classifier('slowness', 'Slowness', slow.length, failed.size),
    ],
    'Percentage of clients without retry/airtime/slowness degradation'
  );
}

// ── Time to Connect ─────────────────────────────────────────────────────────
function computeTimeToConnect(clients: XiqClientHealthRow[]): SLEMetric {
  const total = clients.length;
  const ttc = (c: XiqClientHealthRow) => c.associationDuration + c.authResponseTime + c.dhcpAssignTime;
  const slow = clients.filter((c) => ttc(c) > TTC_WARN_MS);
  const failCount = slow.length;
  // Attribute each slow connect to its dominant phase.
  const assoc = slow.filter((c) => c.associationDuration >= c.authResponseTime && c.associationDuration >= c.dhcpAssignTime);
  const auth = slow.filter((c) => c.authResponseTime > c.associationDuration && c.authResponseTime >= c.dhcpAssignTime);
  const dhcp = slow.filter((c) => c.dhcpAssignTime > c.associationDuration && c.dhcpAssignTime > c.authResponseTime);
  return metric(
    'time_to_connect',
    'Time to Connect',
    'seconds',
    total,
    failCount,
    [
      classifier('association', 'Association', assoc.length, failCount),
      classifier('authorization', 'Authorization', auth.length, failCount),
      classifier('dhcp', 'DHCP', dhcp.length, failCount),
    ],
    'Percentage of clients connecting within the time threshold'
  );
}

// ── Successful Connects ──────────────────────────────────────────────────────
function computeSuccessfulConnects(clients: XiqClientHealthRow[]): SLEMetric {
  const total = clients.length;
  const authFail = clients.filter((c) => c.hasAuthIssues);
  const assocFail = clients.filter((c) => c.hasAssocIssues);
  const dhcpFail = clients.filter((c) => c.hasIpIssues);
  const failed = new Set<string>([
    ...authFail.map((c) => c.clientMac),
    ...assocFail.map((c) => c.clientMac),
    ...dhcpFail.map((c) => c.clientMac),
  ]);
  return metric(
    'successful_connects',
    'Successful Connects',
    'percent',
    total,
    failed.size,
    [
      classifier('authorization', 'Authorization', authFail.length, failed.size),
      classifier('association', 'Association', assocFail.length, failed.size),
      classifier('dhcp', 'DHCP', dhcpFail.length, failed.size),
    ],
    'Percentage of connection attempts that succeed (auth / association / DHCP)'
  );
}

// ── Roaming ──────────────────────────────────────────────────────────────────
function computeRoaming(clients: XiqClientHealthRow[]): SLEMetric {
  const total = clients.length;
  const issueFlag = clients.filter((c) => c.hasRoamingIssues);
  const slowRoam = clients.filter((c) => c.roamingTime > ROAM_BAD_MS);
  const failed = new Set<string>([
    ...issueFlag.map((c) => c.clientMac),
    ...slowRoam.map((c) => c.clientMac),
  ]);
  return metric(
    'roaming',
    'Roaming',
    'percent',
    total,
    failed.size,
    [
      classifier('signal_quality', 'Signal Quality', issueFlag.length, failed.size),
      classifier('latency', 'Latency', slowRoam.length, failed.size),
    ],
    'Percentage of successful and timely AP transitions'
  );
}

// ── Capacity (per AP, usage-capacity grid) ───────────────────────────────────
function computeCapacity(aps: XiqCapacityRow[]): SLEMetric {
  const total = aps.length;
  const congested = aps.filter(
    (ap) =>
      ap.hasCapacityIssue ||
      Math.max(ap.util24, ap.util5, ap.util6) >= RADIO_UTIL_THRESHOLD ||
      ap.interference >= INTERFERENCE_THRESHOLD ||
      ap.packetLoss >= PACKET_LOSS_THRESHOLD
  );
  const failCount = congested.length;
  const band24 = aps.filter((ap) => ap.util24 >= RADIO_UTIL_THRESHOLD);
  const band5 = aps.filter((ap) => ap.util5 >= RADIO_UTIL_THRESHOLD);
  const interference = aps.filter((ap) => ap.interference >= INTERFERENCE_THRESHOLD);
  const loss = aps.filter((ap) => ap.packetLoss >= PACKET_LOSS_THRESHOLD);
  return metric(
    'capacity',
    'Capacity',
    'percent',
    total,
    failCount,
    [
      classifier('utilization_24', '2.4 GHz Utilization', band24.length, failCount),
      classifier('utilization_5', '5 GHz Utilization', band5.length, failCount),
      classifier('interference', 'Interference', interference.length, failCount),
      classifier('packet_loss', 'Packet Loss', loss.length, failCount),
    ],
    'Percentage of APs operating within capacity limits'
  );
}

// ── AP Health (per AP, device-health grid) ───────────────────────────────────
function computeAPHealth(aps: XiqDeviceHealthRow[]): SLEMetric {
  const total = aps.length;
  const highCpu = aps.filter((ap) => ap.cpu >= AP_CPU_THRESHOLD);
  const highMem = aps.filter((ap) => ap.memory >= AP_MEMORY_THRESHOLD);
  const reboots = aps.filter((ap) => ap.reboots >= 1);
  const channelChanges = aps.filter((ap) => ap.channelChanges >= 3);
  const poe = aps.filter((ap) => ap.poeStrained);
  const unhealthy = new Set<string>(
    aps
      .filter(
        (ap) =>
          ap.hasHealthIssue ||
          ap.cpu >= AP_CPU_THRESHOLD ||
          ap.memory >= AP_MEMORY_THRESHOLD ||
          ap.reboots >= 1 ||
          ap.channelChanges >= 3 ||
          ap.poeStrained
      )
      .map((ap) => ap.deviceId)
  );
  const failCount = unhealthy.size;
  return metric(
    'ap_health',
    'AP Health',
    'percent',
    total,
    failCount,
    [
      classifier('cpu', 'High CPU', highCpu.length, failCount),
      classifier('memory', 'High Memory', highMem.length, failCount),
      classifier('reboots', 'Reboots', reboots.length, failCount),
      classifier('channel_changes', 'Channel Changes', channelChanges.length, failCount),
      classifier('poe', 'PoE Strain', poe.length, failCount),
    ],
    'Percentage of access points operating in a healthy state'
  );
}

/**
 * Compute all 7 wireless SLEs from normalized XIQ grid rows. Order matches the
 * OS-ONE engine so the honeycomb lays out identically.
 */
export function computeXiqWirelessSLEs(
  clientRows: XiqClientHealthRow[],
  deviceRows: XiqDeviceHealthRow[],
  capacityRows: XiqCapacityRow[]
): SLEMetric[] {
  return markSLEDataPresence([
    computeTimeToConnect(clientRows),
    computeSuccessfulConnects(clientRows),
    computeCoverage(clientRows),
    computeRoaming(clientRows),
    computeThroughput(clientRows),
    computeCapacity(capacityRows),
    computeAPHealth(deviceRows),
  ]);
}
