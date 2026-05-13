function r(path, resolved) {
  return path
    .replace('{macaddress}', encodeURIComponent(resolved.mac ?? ''))
    .replace('{stationId}', encodeURIComponent(resolved.stationId ?? resolved.mac ?? ''))
    .replace('{apSerialNumber}', encodeURIComponent(resolved.apSerialNumber ?? ''))
    .replace('{apserialnum}', encodeURIComponent(resolved.apSerialNumber ?? ''))
    .replace('{siteId}', encodeURIComponent(resolved.siteId ?? ''))
    .replace('{siteid}', encodeURIComponent(resolved.siteId ?? ''))
    .replace('{serviceId}', encodeURIComponent(resolved.serviceId ?? ''))
    .replace('{serviceid}', encodeURIComponent(resolved.serviceId ?? ''))
    .replace('{floorId}', encodeURIComponent(resolved.floorId ?? ''));
}

function q(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

function call(method, pathTpl, resolved, extra = {}) {
  const path = q(r(pathTpl, resolved), extra);
  return { method, path, disruptive: false, description: `${method} ${pathTpl}`, label: pathTpl };
}

function disruptiveCall(method, pathTpl, resolved, description) {
  const path = r(pathTpl, resolved);
  return { method, path, disruptive: true, description, label: pathTpl };
}

const FOLLOW_UP_CHIPS_BY_INTENT = {
  'client-poor-wifi': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history', 'Check WLAN config', 'Compare previous 24 hours'],
  'client-disconnect': ['Show client timeline', 'Show AP RF stats', 'Check WLAN config', 'Check AAA policy', 'Compare previous 24 hours'],
  'client-roaming': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history', 'Check WLAN config'],
  'client-slow': ['Show client timeline', 'Show AP RF stats', 'Show impacted clients', 'Compare previous 24 hours'],
  'client-band-stuck': ['Show AP RF stats', 'Check WLAN config', 'Show client timeline'],
  'client-auth-fail': ['Show client timeline', 'Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'client-dhcp-fail': ['Show client timeline', 'Check WLAN config', 'Show impacted clients'],
  'client-ppsk-fail': ['Show client timeline', 'Check WLAN config', 'Check AAA policy'],
  'client-captive-fail': ['Show client timeline', 'Check WLAN config'],
  'clients-low-rssi': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'clients-high-retry': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'clients-auth-failed': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'clients-sticky': ['Show client timeline', 'Show AP RF stats', 'Show Smart RF history'],
  'ap-overloaded': ['Show AP RF stats', 'Show impacted clients', 'Locate AP', 'Compare previous 24 hours'],
  'ap-high-utilization': ['Show AP RF stats', 'Show Smart RF history', 'Show impacted clients'],
  'ap-cci': ['Show AP RF stats', 'Show Smart RF history'],
  'ap-channel-power-change': ['Show Smart RF history', 'Show AP RF stats'],
  'ap-dfs': ['Show Smart RF history', 'Show AP RF stats'],
  'ap-offline': ['Locate AP', 'Reboot AP', 'Show AP RF stats'],
  'ap-bad-uplink': ['Locate AP', 'Show AP RF stats'],
  'ap-underpowered': ['Locate AP', 'Show AP RF stats'],
  'ap-client-history': ['Show impacted clients', 'Show AP RF stats'],
  'ap-radio-stats': ['Show Smart RF history', 'Show impacted clients'],
  'ap-rf-context': ['Show Smart RF history', 'Show AP RF stats'],
  'wlan-most-failures': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'wlan-client-count': ['Show impacted clients', 'Check WLAN config'],
  'wlan-auth-issues': ['Check WLAN config', 'Check AAA policy', 'Show impacted clients'],
  'wlan-deployed-where': ['Check WLAN config'],
  'wlan-compare': ['Check WLAN config', 'Show impacted clients'],
  'site-health': ['Show AP RF stats', 'Show Smart RF history', 'Show impacted clients', 'Compare previous 24 hours'],
  'sites-poor': ['Show AP RF stats', 'Show Smart RF history'],
  'site-ap-impact': ['Show AP RF stats', 'Locate AP', 'Reboot AP'],
  'config-change-before-issue': ['Compare previous 24 hours', 'Show AP RF stats'],
  'what-to-fix': ['Show AP RF stats', 'Show impacted clients', 'Show Smart RF history'],
  'action-packet-capture': ['Download logs'],
  'action-download-logs': ['Run packet capture'],
  'action-reboot-ap': ['Locate AP', 'Show AP RF stats'],
};

const PLANS = {
  'client-poor-wifi': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'client-disconnect': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'client-roaming': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/services/{serviceId}', resolved),
  ],
  'client-slow': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/stations/{stationId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'client-band-stuck': (resolved) => [
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'client-auth-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'client-dhcp-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/stations/{macaddress}', resolved),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
  ],
  'client-ppsk-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'client-captive-fail': (resolved) => [
    call('GET', '/v1/stations/events/{macaddress}', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/services/{serviceId}', resolved),
    call('GET', '/v1/eguest', resolved),
  ],
  'clients-low-rssi': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/state/aps', resolved),
  ],
  'clients-high-retry': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'clients-auth-failed': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/services', resolved),
  ],
  'clients-sticky': (resolved) => [
    call('GET', '/v1/stations/query', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-overloaded': (resolved) => [
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/state/aps', resolved),
    call('GET', '/v1/aps/{apserialnum}/stations', resolved),
  ],
  'ap-high-utilization': (resolved) => [
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-cci': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
  ],
  'ap-channel-power-change': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'ap-dfs': (resolved) => [
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
  ],
  'ap-offline': (resolved) => [
    call('GET', '/v1/state/aps', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'ap-bad-uplink': (resolved) => [
    call('GET', '/v1/aps/{apserialnum}/lldp', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
  ],
  'ap-underpowered': (resolved) => [
    call('GET', '/v1/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/state/aps/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved),
    call('GET', '/v1/aps/{apserialnum}/lldp', resolved),
  ],
  'ap-client-history': (resolved) => [
    call('GET', '/v1/report/aps/{apSerialNumber}', resolved, { duration: '24h' }),
  ],
  'ap-radio-stats': (resolved) => [
    call('GET', '/v1/aps/ifstats/{apSerialNumber}', resolved, { rfStats: 'true' }),
  ],
  'ap-rf-context': (resolved) => [
    call('GET', '/v1/report/aps/{apSerialNumber}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
  ],
  'wlan-most-failures': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
  ],
  'wlan-client-count': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
  ],
  'wlan-auth-issues': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/stations', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
    call('GET', '/v1/aaapolicy', resolved),
  ],
  'wlan-deployed-where': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/siteids', resolved),
    call('GET', '/v1/services/{serviceId}/deviceids', resolved),
  ],
  'wlan-compare': (resolved) => [
    call('GET', '/v1/services', resolved),
    call('GET', '/v1/services/{serviceId}/report', resolved, { duration: '24h' }),
  ],
  'site-health': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}', resolved),
    call('GET', '/v1/state/sites/{siteId}/aps', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v3/sites/{siteid}/stations', resolved),
  ],
  'sites-poor': (resolved) => [
    call('GET', '/v1/state/sites', resolved),
    call('GET', '/v1/report/sites', resolved, { duration: '24h' }),
  ],
  'site-ap-impact': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}/aps', resolved),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
  ],
  'config-change-before-issue': (resolved) => [
    call('GET', '/v1/auditlogs', resolved, { startTime: resolved.startTime, endTime: resolved.endTime }),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
  ],
  'what-to-fix': (resolved) => [
    call('GET', '/v1/state/sites/{siteId}', resolved),
    call('GET', '/v1/report/sites/{siteId}', resolved, { duration: '24h' }),
    call('GET', '/v1/report/sites/{siteId}/smartrf', resolved, { duration: '24h' }),
    call('GET', '/v1/aps/ifstats', resolved, { rfStats: 'true' }),
    call('GET', '/v1/stations/query', resolved),
  ],
  'action-packet-capture': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/realcapture', resolved, 'Start real-time AP packet capture'),
    call('GET', '/v1/aps/{apSerialNumber}/traceurls', resolved),
  ],
  'action-download-logs': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/logs', resolved, 'Enable AP log download'),
    call('GET', '/v1/aps/{apSerialNumber}/traceurls', resolved),
  ],
  'action-reboot-ap': (resolved) => [
    disruptiveCall('PUT', '/v1/aps/{apSerialNumber}/reboot', resolved, 'Reboot AP'),
  ],
};

export function planApiCalls(intent, resolved) {
  const planFn = PLANS[intent];
  if (!planFn) return [];
  return planFn(resolved).filter(c => {
    if (c.path.includes('undefined') || c.path.includes('%3A%3A')) return false;
    return true;
  });
}

export function getFollowUpChips(intent) {
  return FOLLOW_UP_CHIPS_BY_INTENT[intent] ?? ['Show AP RF stats', 'Show impacted clients', 'Compare previous 24 hours'];
}
