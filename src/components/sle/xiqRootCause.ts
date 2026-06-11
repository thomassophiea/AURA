/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ-aware root-cause builder.
 *
 * Mirrors `buildRootCause` (the OS-ONE one) but filters XIQ dashboard-grid rows
 * by classifier, so clicking a classifier in the sankey lists the actual
 * affected XIQ clients / APs. Same `SLERootCause` shape → same panel UI.
 *
 * `stations` = raw client-health rows; `aps` = raw device-health rows merged
 * with usage-capacity fields (so both AP-health and capacity classifiers resolve).
 */

import type { SLEClassifier, SLEMetric, SLERootCause } from '../../types/sle';

const RECS: Record<string, string[]> = {
  weak_signal: ['Add or reposition APs to improve coverage', 'Raise minimum basic rate to shed far clients'],
  low_snr: ['Investigate co-channel interference and noise sources', 'Tune channel/width and AP placement'],
  client_retries: ['Check RF interference and channel utilization', 'Review client driver / band steering'],
  airtime: ['Balance clients across APs/bands', 'Reduce legacy data-rate airtime usage'],
  slowness: ['Inspect uplink/backhaul and AP load', 'Check application/WAN latency'],
  association: ['Verify capacity and SSID/radio config on serving APs'],
  authorization: ['Check RADIUS/PPSK reachability and credentials', 'Review auth server response times'],
  dhcp: ['Verify DHCP scope/relay and lease availability'],
  signal_quality: ['Enable 802.11k/v/r for faster roaming', 'Improve AP density in roaming areas'],
  latency: ['Enable 802.11r Fast BSS Transition / OKC'],
  utilization_24: ['Steer clients to 5/6 GHz', 'Reduce 2.4 GHz channel width / load'],
  utilization_5: ['Add capacity or rebalance clients across APs'],
  interference: ['Identify non-WiFi interferers; re-plan channels'],
  packet_loss: ['Inspect RF quality and wired uplink errors'],
  cpu: ['Check AP load/firmware; redistribute clients'],
  memory: ['Review AP firmware/memory leaks; reboot if needed'],
  reboots: ['Investigate power (PoE) stability and crash logs'],
  channel_changes: ['Stabilize DFS/auto-channel; review interference'],
  poe: ['Verify PoE budget on the switch port/stack'],
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}
function bool(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === 'true';
}

function clients(
  rows: any[],
  pred: (r: any) => boolean
): SLERootCause['affectedDevices'] {
  return rows
    .filter(pred)
    .slice(0, 100)
    .map((r) => ({
      mac: String(r.client_mac ?? ''),
      name: String(r.client_hostname ?? r.alias ?? r.client_mac ?? ''),
      ap: String(r.connected_device_hostname ?? ''),
      rssi: r.rssi != null ? num(r.rssi) : undefined,
    }));
}

function apsList(rows: any[], pred: (r: any) => boolean): SLERootCause['affectedAPs'] {
  return rows
    .filter(pred)
    .slice(0, 100)
    .map((r) => ({
      serial: String(r.device_id ?? ''),
      name: String(r.hostname ?? r.device_id ?? ''),
      status: bool(r.has_device_health_issue) || bool(r.has_usage_capacity_issue) ? 'issue' : 'ok',
    }));
}

const ttc = (r: any) =>
  num(r.association_duration) + num(r.authentication_response_time) + num(r.dhcp_ip_assignation_time);

export function buildXiqRootCause(
  classifier: SLEClassifier,
  sle: SLEMetric,
  stations: any[],
  aps: any[]
): SLERootCause {
  let affectedDevices: SLERootCause['affectedDevices'] = [];
  let affectedAPs: SLERootCause['affectedAPs'] = [];
  const cid = classifier.id;

  switch (sle.id) {
    case 'coverage':
      if (cid === 'weak_signal') affectedDevices = clients(stations, (r) => r.rssi != null && num(r.rssi) < -70);
      else if (cid === 'low_snr') affectedDevices = clients(stations, (r) => r.snr != null && num(r.snr) < 15);
      break;
    case 'throughput':
      if (cid === 'client_retries')
        affectedDevices = clients(stations, (r) => num(r.tx_client_retries) + num(r.rx_client_retries) >= 0.2);
      else if (cid === 'airtime') affectedDevices = clients(stations, (r) => bool(r.air_time_warning));
      else if (cid === 'slowness') affectedDevices = clients(stations, (r) => num(r.slowness) > 0);
      break;
    case 'time_to_connect':
      if (cid === 'association')
        affectedDevices = clients(stations, (r) => ttc(r) > 5000 && num(r.association_duration) >= num(r.authentication_response_time) && num(r.association_duration) >= num(r.dhcp_ip_assignation_time));
      else if (cid === 'authorization')
        affectedDevices = clients(stations, (r) => ttc(r) > 5000 && num(r.authentication_response_time) > num(r.association_duration) && num(r.authentication_response_time) >= num(r.dhcp_ip_assignation_time));
      else if (cid === 'dhcp')
        affectedDevices = clients(stations, (r) => ttc(r) > 5000 && num(r.dhcp_ip_assignation_time) > num(r.association_duration) && num(r.dhcp_ip_assignation_time) > num(r.authentication_response_time));
      break;
    case 'successful_connects':
      if (cid === 'authorization') affectedDevices = clients(stations, (r) => bool(r.has_authentication_issues));
      else if (cid === 'association') affectedDevices = clients(stations, (r) => bool(r.has_association_issues));
      else if (cid === 'dhcp') affectedDevices = clients(stations, (r) => bool(r.has_ip_address_issues));
      break;
    case 'roaming':
      if (cid === 'signal_quality') affectedDevices = clients(stations, (r) => bool(r.has_roaming_issues));
      else if (cid === 'latency') affectedDevices = clients(stations, (r) => num(r.roaming_time) > 3000);
      break;
    case 'capacity':
      if (cid === 'utilization_24') affectedAPs = apsList(aps, (r) => num(r.radio_2dot4g_utilization_score) >= 70);
      else if (cid === 'utilization_5') affectedAPs = apsList(aps, (r) => num(r.radio_5g_utilization_score) >= 70);
      else if (cid === 'interference') affectedAPs = apsList(aps, (r) => num(r.wifi0_interference_score) >= 50);
      else if (cid === 'packet_loss') affectedAPs = apsList(aps, (r) => num(r.packet_loss) >= 5);
      break;
    case 'ap_health':
      if (cid === 'cpu') affectedAPs = apsList(aps, (r) => num(r.cpu_usage_percentage) >= 85);
      else if (cid === 'memory') affectedAPs = apsList(aps, (r) => num(r.memory_usage_percentage) >= 90);
      else if (cid === 'reboots') affectedAPs = apsList(aps, (r) => num(r.wifi_reboots_count) >= 1);
      else if (cid === 'channel_changes') affectedAPs = apsList(aps, (r) => num(r.channel_change_count) >= 3);
      else if (cid === 'poe') affectedAPs = apsList(aps, (r) => bool(r.poe_usage_indicator));
      break;
  }

  return {
    classifierId: cid,
    classifierName: classifier.name,
    description: `${classifier.affectedClients} affected — ${sle.name}`,
    affectedDevices,
    affectedAPs,
    recommendations: RECS[cid] || ['Review the affected clients/APs in XIQ for this classifier.'],
  };
}
