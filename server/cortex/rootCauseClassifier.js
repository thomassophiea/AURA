const THRESHOLDS = {
  lowRssiDbm: -70,
  criticalRssiDbm: -75,
  lowSnrDb: 20,
  criticalSnrDb: 15,
  highRetryPercent: 20,
  highChannelUtilizationPercent: 70,
  criticalChannelUtilizationPercent: 85,
  highClientCountPerRadio: 40,
  excessiveRoamsPerHour: 6,
};

function hasEventType(events, ...types) {
  return events.some(e => types.some(t => (e.type ?? '').toUpperCase().includes(t.toUpperCase())));
}

function countEventType(events, ...types) {
  return events.filter(e => types.some(t => (e.type ?? '').toUpperCase().includes(t.toUpperCase()))).length;
}

export function classifyRootCause(evidence, intent) {
  const { client = {}, ap = {}, events = [], missingData = [] } = evidence;

  // AP_INFRASTRUCTURE
  if (ap.state === 'DISCONNECTED' || ap.state === 'OFFLINE' || (ap.rebootCount ?? 0) > 1) {
    return { category: 'AP_INFRASTRUCTURE', explanation: 'AP is offline, disconnected, or has rebooted recently.' };
  }

  // AUTHENTICATION
  if (
    intent === 'client-auth-fail' || intent === 'client-ppsk-fail' ||
    hasEventType(events, 'AUTH_FAIL', 'EAP_FAIL', 'RADIUS', '802.1X', 'PPSK', 'WPA_FAIL')
  ) {
    return { category: 'AUTHENTICATION', explanation: 'Authentication failure events detected — check AAA policy and RADIUS config.' };
  }

  // DHCP_OR_VLAN
  if (
    intent === 'client-dhcp-fail' ||
    hasEventType(events, 'DHCP_FAIL', 'DHCP_TIMEOUT', 'DHCP_ERROR', 'NO_IP')
  ) {
    return { category: 'DHCP_OR_VLAN', explanation: 'DHCP failure after successful association — likely VLAN or DHCP scope issue.' };
  }

  // COVERAGE
  const lowRssi = (client.rssi ?? 0) !== 0 && client.rssi < THRESHOLDS.lowRssiDbm;
  const lowSnr = (client.snr ?? 99) < THRESHOLDS.lowSnrDb;
  if (lowRssi || lowSnr) {
    const critical = (client.rssi ?? 0) < THRESHOLDS.criticalRssiDbm || (client.snr ?? 99) < THRESHOLDS.criticalSnrDb;
    return {
      category: 'COVERAGE',
      explanation: `${critical ? 'Critical' : 'Low'} signal: RSSI ${client.rssi ?? 'N/A'} dBm, SNR ${client.snr ?? 'N/A'} dB. Coverage gap likely.`,
    };
  }

  // RF_CONGESTION
  const highUtil = Math.max(ap.channelUtil2g ?? 0, ap.channelUtil5g ?? 0) > THRESHOLDS.highChannelUtilizationPercent;
  const highClients = (ap.clientCount ?? 0) > THRESHOLDS.highClientCountPerRadio;
  const highRetry = (client.retryRate ?? 0) > THRESHOLDS.highRetryPercent;
  if (highUtil || (highClients && highRetry)) {
    return {
      category: 'RF_CONGESTION',
      explanation: `High RF load: channel utilization ${Math.max(ap.channelUtil2g ?? 0, ap.channelUtil5g ?? 0)}%, ${ap.clientCount ?? 'N/A'} clients, retry rate ${client.retryRate ?? 'N/A'}%.`,
    };
  }

  // ROAMING
  const roamCount = countEventType(events, 'ROAM', 'REASSOC');
  if (roamCount > THRESHOLDS.excessiveRoamsPerHour || intent === 'client-roaming') {
    return { category: 'ROAMING', explanation: `${roamCount} roaming events detected — possible sticky client or RF overlap.` };
  }

  // INTERFERENCE (DFS)
  if ((evidence.smartRf?.dfsEvents ?? 0) > 0) {
    return { category: 'INTERFERENCE', explanation: `${evidence.smartRf.dfsEvents} DFS events detected — radar interference causing channel changes.` };
  }

  // WLAN_CONFIG
  if (['wlan-most-failures', 'wlan-auth-issues', 'client-captive-fail'].includes(intent)) {
    return { category: 'WLAN_CONFIG', explanation: 'Failures correlated with WLAN/SSID configuration — check security, AAA, and captive portal settings.' };
  }

  // SITE_SYSTEMIC
  if (['site-health', 'sites-poor', 'site-ap-impact'].includes(intent)) {
    return { category: 'SITE_SYSTEMIC', explanation: 'Site-wide wireless degradation detected across multiple APs or WLANs.' };
  }

  // CLIENT_SPECIFIC (good RF, healthy infra)
  if (client.rssi && client.rssi > THRESHOLDS.lowRssiDbm && !highUtil) {
    return { category: 'CLIENT_SPECIFIC', explanation: 'Infrastructure appears healthy. Issue may be client-specific — device driver, supplicant, or OS.' };
  }

  return { category: 'UNKNOWN', explanation: 'Insufficient evidence to determine root cause. Missing data: ' + (missingData.join(', ') || 'none identified') };
}
