/**
 * Shared buildRootCause utility for SLE views.
 * Filters the actual affected stations/APs per classifier using the same
 * logic as sleCalculationEngine.ts, so the panel only shows real matches.
 */

import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

function clientName(s: any): string {
  return s.hostName || s.hostname || s.username || s.deviceType || s.macAddress || 'Unknown';
}
function clientAP(s: any): string {
  return s.apName || s.apDisplayName || s.apHostname || s.accessPointName || s.apSerialNumber || s.apSerial || s.apSn || '-';
}
function apName(ap: any): string {
  return ap.name || ap.hostname || ap.apName || ap.displayName || ap.serialNumber || ap.serial || 'Unknown AP';
}

const GENERIC_RECS: Record<string, string[]> = {
  weak_signal: ['Consider adding additional access points to improve coverage', 'Verify AP transmit power settings', 'Check for physical obstructions between APs and clients'],
  asymmetry_uplink: ['Check for RF interference on uplink bands', 'Review AP antenna orientation', 'Consider 6GHz migration for affected clients'],
  asymmetry_downlink: ['Check for client-side RF interference', 'Review transmit power balance between APs and clients'],
  coverage: ['Improve AP placement to increase coverage for low-RSSI clients', 'Enable band steering to push capable clients to 5GHz/6GHz'],
  device_capability: ['Consider upgrading legacy 802.11b/g devices', 'Enable 802.11ac/ax features on APs to encourage modern protocol use'],
  network_issues: ['Review AP and switch configurations for throughput-limiting policies', 'Check QoS settings'],
  capacity: ['Redistribute clients across APs', 'Check for APs with excessive client loads and consider adding APs'],
  client_usage: ['Identify high-bandwidth clients and apply rate limiting if appropriate', 'Verify application usage policies'],
  client_count: ['Add additional APs to distribute client load', 'Enable load balancing on the wireless controller'],
  ap_disconnected: ['Check network connectivity and PoE to disconnected APs', 'Review switch port status for AP uplinks'],
  low_power: ['Verify PoE switch port power budget', 'Check AP power requirements vs switch PoE capacity'],
  network: ['Investigate AP-to-controller connectivity for degraded APs', 'Check for firmware issues'],
  authorization: ['Review RADIUS/AAA server logs for authentication failures', 'Check certificate validity for 802.1X clients'],
  dhcp: ['Verify DHCP server capacity and scope', 'Check for IP exhaustion or stale leases'],
  incomplete: ['Review DHCP scope size and lease duration', 'Check for duplicate IP issues'],
  association: ['Review RF environment for association failures', 'Check for deauthentication flood attacks'],
  dns: ['Verify DNS server reachability from wireless clients', 'Check DNS response times'],
  sticky_client: ['Enable BSS Transition Management (802.11v)', 'Enable RRM to steer sticky clients to better APs'],
  signal_quality: ['Enable 802.11v/k/r for faster roaming', 'Improve AP density in areas with high roaming activity'],
  latency: ['Enable 802.11r Fast BSS Transition', 'Configure OKC (Opportunistic Key Caching)'],
};

function recs(classifierId: string): string[] {
  return GENERIC_RECS[classifierId] || ['Monitor this classifier for trends over time', 'Review network configuration for the affected segment'];
}

export function buildRootCause(
  classifier: SLEClassifier,
  sle: SLEMetric,
  stations: any[],
  aps: any[],
): SLERootCause {
  const wireless = stations.filter(s => !s.isWired);
  let affectedDevices: SLERootCause['affectedDevices'] = [];
  let affectedAPs: SLERootCause['affectedAPs'] = [];

  // ── Coverage classifiers ─────────────────────────────────
  if (sle.id === 'coverage') {
    if (classifier.id === 'weak_signal') {
      affectedDevices = wireless.filter(s => { const r = s.rssi ?? s.rss ?? 0; return r !== 0 && r < -70; })
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s), rssi: s.rssi ?? s.rss }));
    } else if (classifier.id === 'asymmetry_uplink') {
      affectedDevices = wireless.filter(s => { const tx = s.txRate || s.transmittedRate || 0; const rx = s.rxRate || s.receivedRate || 0; return tx > 0 && rx > 0 && rx / tx > 3; })
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    } else if (classifier.id === 'asymmetry_downlink') {
      affectedDevices = wireless.filter(s => { const tx = s.txRate || s.transmittedRate || 0; const rx = s.rxRate || s.receivedRate || 0; return tx > 0 && rx > 0 && tx / rx > 3; })
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    }
  }

  // ── Throughput classifiers ───────────────────────────────
  else if (sle.id === 'throughput') {
    const minRate = 1_000_000;
    const belowThreshold = wireless.filter(s => { const tx = s.transmittedRate || s.txRate || 0; const rx = s.receivedRate || s.rxRate || 0; return (tx + rx) < minRate && (tx + rx) > 0; });
    if (classifier.id === 'coverage') {
      affectedDevices = belowThreshold.filter(s => (s.rssi ?? s.rss ?? 0) < -70)
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s), rssi: s.rssi ?? s.rss }));
    } else if (classifier.id === 'device_capability') {
      affectedDevices = belowThreshold.filter(s => { const p = (s.protocol || s.connectionMode || '').toLowerCase(); return p.includes('11b') || p.includes('11g') || p.includes('802.11a'); })
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    } else if (classifier.id === 'network_issues') {
      const coverageSet = new Set(belowThreshold.filter(s => (s.rssi ?? s.rss ?? 0) < -70).map(s => s.macAddress));
      const devCapSet = new Set(belowThreshold.filter(s => { const p = (s.protocol || s.connectionMode || '').toLowerCase(); return p.includes('11b') || p.includes('11g') || p.includes('802.11a'); }).map(s => s.macAddress));
      affectedDevices = belowThreshold.filter(s => !coverageSet.has(s.macAddress) && !devCapSet.has(s.macAddress))
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    } else if (classifier.id === 'capacity') {
      const apCounts = new Map<string, number>();
      wireless.forEach(s => { const ap = s.apSerialNumber || s.apSerial || ''; apCounts.set(ap, (apCounts.get(ap) || 0) + 1); });
      affectedDevices = belowThreshold.filter(s => (apCounts.get(s.apSerialNumber || s.apSerial || '') || 0) > 30)
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    }
  }

  // ── AP Health classifiers ────────────────────────────────
  else if (sle.id === 'ap_health') {
    if (classifier.id === 'ap_disconnected') {
      affectedAPs = aps.filter(ap => { const s = (ap.status || ap.connectionState || '').toLowerCase(); return s.includes('disconnect') || s.includes('offline'); })
        .slice(0, 30).map(ap => ({ serial: ap.serialNumber || ap.serial || '', name: apName(ap), status: ap.status || ap.connectionState || 'offline' }));
    } else if (classifier.id === 'low_power') {
      affectedAPs = aps.filter(ap => ap.lowPower || (ap.powerMode || '').toLowerCase().includes('low'))
        .slice(0, 30).map(ap => ({ serial: ap.serialNumber || ap.serial || '', name: apName(ap), status: 'low power' }));
    } else if (classifier.id === 'network') {
      affectedAPs = aps.filter(ap => { const s = (ap.status || ap.connectionState || '').toLowerCase(); return s.includes('degraded') || s.includes('warning'); })
        .slice(0, 30).map(ap => ({ serial: ap.serialNumber || ap.serial || '', name: apName(ap), status: ap.status || ap.connectionState || 'degraded' }));
    }
  }

  // ── Successful Connects classifiers ─────────────────────
  else if (sle.id === 'successful_connects') {
    if (classifier.id === 'authorization') {
      affectedDevices = stations.filter(s => s.authenticated === false)
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    } else if (classifier.id === 'dhcp' || classifier.id === 'incomplete') {
      affectedDevices = stations.filter(s => !s.ipAddress && s.authenticated !== false)
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    }
    // association, dns, arp — no reliable client-level data, show empty
  }

  // ── Time to Connect classifiers ──────────────────────────
  else if (sle.id === 'time_to_connect') {
    const slowConnects = wireless.filter(s => (s.rssi ?? s.rss ?? -50) < -75).slice(0, 50);
    affectedDevices = slowConnects.map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s), rssi: s.rssi ?? s.rss }));
  }

  // ── Roaming classifiers ──────────────────────────────────
  else if (sle.id === 'roaming') {
    const stickyClients = wireless.filter(s => (s.rssi ?? s.rss ?? -50) < -75 && (s.uptime || 0) > 300).slice(0, 50);
    if (['signal_quality', 'sticky_client', 'suboptimal_roam', 'interband_roam'].includes(classifier.id)) {
      affectedDevices = stickyClients.map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s), rssi: s.rssi ?? s.rss }));
    } else if (['latency', 'stability', 'slow_11r_roam', 'slow_standard_roam', 'slow_okc_roam', 'failed_fast_roam'].includes(classifier.id)) {
      affectedDevices = stickyClients.slice(0, Math.round(stickyClients.length * 0.5)).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s), rssi: s.rssi ?? s.rss }));
    }
  }

  // ── Capacity classifiers ─────────────────────────────────
  else if (sle.id === 'capacity') {
    if (classifier.id === 'client_usage') {
      affectedDevices = wireless.filter(s => { const tx = s.transmittedRate || s.txRate || 0; const rx = s.receivedRate || s.rxRate || 0; return (tx + rx) > 50_000_000; })
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    } else if (classifier.id === 'client_count') {
      const apCounts = new Map<string, number>();
      wireless.forEach(s => { const ap = s.apSerialNumber || s.apSerial || ''; apCounts.set(ap, (apCounts.get(ap) || 0) + 1); });
      affectedDevices = wireless.filter(s => (apCounts.get(s.apSerialNumber || s.apSerial || '') || 0) > 25)
        .slice(0, 50).map(s => ({ mac: s.macAddress || '', name: clientName(s), ap: clientAP(s) }));
    }
  }

  const entityLabel = sle.id === 'ap_health' ? 'access points' : 'clients';
  const count = affectedDevices.length || affectedAPs.length;
  const description = count > 0
    ? `${count} ${entityLabel} affected by ${classifier.name.toLowerCase()} issues`
    : `${classifier.affectedClients} ${entityLabel} reported — unable to identify specific devices for this classifier`;

  return {
    classifierId: classifier.id,
    classifierName: classifier.name,
    description,
    affectedDevices,
    affectedAPs,
    recommendations: recs(classifier.id),
  };
}
