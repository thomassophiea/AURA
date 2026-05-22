function findByKeyPattern(raw, ...patterns) {
  for (const key of Object.keys(raw)) {
    if (patterns.some(p => key.includes(p))) return raw[key];
  }
  return null;
}

function extractClient(raw) {
  const station = findByKeyPattern(raw, '/v1/stations/', '/v1/stations/{');
  if (!station || Array.isArray(station)) return undefined;
  return {
    mac: station.macAddress,
    name: station.hostname ?? station.clientName,
    rssi: station.rssi ?? station.signalStrength,
    snr: station.snr,
    band: station.radioBand ?? station.band,
    apName: station.apName ?? station.accessPointName,
    ssid: station.ssid ?? station.serviceName,
    state: station.stationState ?? station.connectionState,
    retryRate: station.retryPercent ?? station.txRetryPercent,
  };
}

function extractAp(raw) {
  const ifstats = findByKeyPattern(raw, 'ifstats');
  const state = findByKeyPattern(raw, 'state/aps/');
  const ap = {};
  if (ifstats && !Array.isArray(ifstats)) {
    ap.channelUtil2g = ifstats.radio0?.channelUtilization ?? ifstats.channelUtilization2g;
    ap.channelUtil5g = ifstats.radio1?.channelUtilization ?? ifstats.channelUtilization5g;
    ap.noise = ifstats.radio0?.noise ?? ifstats.noise;
    ap.clientCount = ifstats.clientCount ?? ifstats.stationCount;
    ap.txRetryRate = ifstats.txRetryPercent;
    ap.rxBytes = ifstats.rxBytes;
    ap.txBytes = ifstats.txBytes;
  }
  if (state && !Array.isArray(state)) {
    ap.serial = state.serialNumber ?? state.apSerialNumber;
    ap.name = state.apName ?? state.name;
    ap.state = state.operationalState ?? state.connectionState;
    ap.uptimeSeconds = state.uptime;
    ap.rebootCount = state.rebootCount;
  }
  return Object.keys(ap).length ? ap : undefined;
}

function extractEvents(raw) {
  const events = findByKeyPattern(raw, 'events/');
  if (!Array.isArray(events)) return [];
  return events.map(e => ({
    timestamp: e.timestamp ?? e.eventTime,
    type: e.eventType ?? e.type,
    description: e.description ?? e.message,
  }));
}

function extractWlan(raw) {
  const svc = findByKeyPattern(raw, '/v1/services/', '/v1/services/{');
  if (!svc || Array.isArray(svc)) return undefined;
  return {
    id: svc.id ?? svc.serviceId,
    ssid: svc.ssid ?? svc.name,
    security: svc.securityMode ?? svc.security,
    aaaPolicy: svc.aaaPolicyId ?? svc.aaaPolicyName,
  };
}

function extractSite(raw) {
  const state = findByKeyPattern(raw, 'state/sites/');
  if (!state || Array.isArray(state)) return undefined;
  return {
    id: state.siteId ?? state.id,
    name: state.siteName ?? state.name,
    state: state.operationalState ?? state.healthState,
  };
}

function extractSmartRf(raw) {
  const report = findByKeyPattern(raw, 'smartrf');
  if (!report) return undefined;
  const items = Array.isArray(report) ? report : (report.items ?? []);
  return {
    channelChanges: items.filter(e => (e.action ?? e.eventType ?? '').includes('CHANNEL')).length,
    powerChanges: items.filter(e => (e.action ?? e.eventType ?? '').includes('POWER')).length,
    dfsEvents: items.filter(e => (e.action ?? e.eventType ?? e.type ?? '').includes('DFS')).length,
  };
}

function extractAuditLogs(raw) {
  const logs = findByKeyPattern(raw, 'auditlogs');
  if (!Array.isArray(logs)) return [];
  return logs.slice(0, 20).map(l => ({
    timestamp: l.timestamp ?? l.time,
    user: l.user ?? l.operator,
    change: l.description ?? l.action,
  }));
}

export function normalizeEvidence(raw, intent, resolved) {
  const client = extractClient(raw);
  const ap = extractAp(raw);
  const wlan = extractWlan(raw);
  const site = extractSite(raw);
  const events = extractEvents(raw);
  const smartRf = extractSmartRf(raw);
  const auditLogs = extractAuditLogs(raw);

  const dataPoints =
    (client ? 1 : 0) +
    (ap ? 1 : 0) +
    (wlan ? 1 : 0) +
    (site ? 1 : 0) +
    events.length +
    (smartRf ? 1 : 0) +
    auditLogs.length;

  return {
    client,
    ap,
    wlan,
    site,
    events,
    smartRf,
    auditLogs,
    dataPoints,
    missingData: raw.__missingData__ ?? [],
    intent,
    resolved,
  };
}
