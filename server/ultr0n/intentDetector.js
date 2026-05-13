const WIRELESS_TERMS = [
  'client', 'station', 'ap', 'access point', 'ssid', 'wlan', 'rf',
  'roam', 'disconnect', 'authenticate', 'authentication', 'dhcp',
  'signal', 'snr', 'rssi', 'channel', 'retry', 'throughput',
  'wifi', 'wi-fi', 'wireless', 'poe', 'uplink', 'band', 'dfs',
  'smart rf', 'captive', 'portal', 'radius', 'eap', '802.1x',
  'ppsk', 'wpa', 'overload', 'utilization', 'interference', 'noise',
  'lldp', 'ethernet', 'reboot', 'reset', 'upgrade', 'packet capture',
  'logs', 'sticky', 'roaming',
];

const INTENT_PATTERNS = [
  { re: /poor wi.?fi|bad wi.?fi|slow wi.?fi|poor wireless|bad wireless|wi.?fi suck|wi.?fi.*slow|wi.?fi.*bad|wi.?fi.*poor/i, intent: 'client-poor-wifi' },
  { re: /disconnect|dropped|lost connection|kicked off|why.*left/i, intent: 'client-disconnect' },
  { re: /roam(ing)?\s*(too much|a lot|constantly|frequently)|excessive roam|sticky/i, intent: 'client-roaming' },
  { re: /slow|low throughput|poor speed|low speed|low rate/i, intent: 'client-slow' },
  { re: /2\.4\s*g?hz|stuck on 2\.4|not on 5|band stuck|5 ?ghz/i, intent: 'client-band-stuck' },
  { re: /auth(entication)?\s*fail|can.?t connect|cannot connect|802\.1x fail|eap fail|radius fail/i, intent: 'client-auth-fail' },
  { re: /dhcp fail|no ip|ip address fail|dhcp problem/i, intent: 'client-dhcp-fail' },
  { re: /ppsk fail|wpa3 fail|personal psk|pre.?shared key fail/i, intent: 'client-ppsk-fail' },
  { re: /captive portal|guest portal|splash page|portal fail/i, intent: 'client-captive-fail' },
  { re: /low rssi|low signal|weak signal|poor rssi|signal strength/i, intent: 'clients-low-rssi' },
  { re: /high retry|retry rate|retries/i, intent: 'clients-high-retry' },
  { re: /failed auth|authentication failures|auth failed clients/i, intent: 'clients-auth-failed' },
  { re: /sticky client|not roaming|client stuck on ap/i, intent: 'clients-sticky' },
  { re: /ap.*(overload|too many client)|overloaded ap/i, intent: 'ap-overloaded' },
  { re: /channel util|high utilization|congested channel/i, intent: 'ap-high-utilization' },
  { re: /interference|co.?channel|cci/i, intent: 'ap-cci' },
  { re: /channel change|power change|smart rf change|rrm change/i, intent: 'ap-channel-power-change' },
  { re: /dfs|radar/i, intent: 'ap-dfs' },
  { re: /ap.*(offline|down|reboot)|rebooting ap|offline ap/i, intent: 'ap-offline' },
  { re: /uplink|bad uplink|lldp|ethernet error|crc/i, intent: 'ap-bad-uplink' },
  { re: /poe|underpowered|power issue|low power/i, intent: 'ap-underpowered' },
  { re: /ap client history|client count history/i, intent: 'ap-client-history' },
  { re: /radio stats|rf stats|ap radio stats|ifstats/i, intent: 'ap-radio-stats' },
  { re: /neighbor(ing)? ap|rf context|nearby ap/i, intent: 'ap-rf-context' },
  { re: /wlan.*fail|ssid.*fail|worst wlan|most failures/i, intent: 'wlan-most-failures' },
  { re: /client count|how many client|most client|highest client|client load/i, intent: 'wlan-client-count' },
  { re: /wlan.*auth|ssid.*auth|wlan.*authentication problem/i, intent: 'wlan-auth-issues' },
  { re: /where.*wlan|where.*ssid|deployed|which site.*wlan/i, intent: 'wlan-deployed-where' },
  { re: /compare.*ssid|compare.*wlan|ssid performance|wlan performance/i, intent: 'wlan-compare' },
  { re: /site.*health|wireless health|how.*site.*doing/i, intent: 'site-health' },
  { re: /worst site|poor site|bad site|sites.*issue|which site.*problem/i, intent: 'sites-poor' },
  { re: /ap.*impact.*site|impacting site|which ap.*site/i, intent: 'site-ap-impact' },
  { re: /what changed|config change|before.*issue|audit|recent change/i, intent: 'config-change-before-issue' },
  { re: /fix first|prioritize|what should.*fix|top issue|where.*start/i, intent: 'what-to-fix' },
  { re: /packet capture|capture packet|packet trace/i, intent: 'action-packet-capture' },
  { re: /download log|ap log|get log/i, intent: 'action-download-logs' },
  { re: /reboot.*ap|restart.*ap|cycle.*ap/i, intent: 'action-reboot-ap' },
];

export function isWirelessQuestion(question) {
  const q = question.toLowerCase();
  return WIRELESS_TERMS.some(t => q.includes(t));
}

export function detectIntent(question, pageContext = {}) {
  const resolved = {
    mac: pageContext.clientMac,
    stationId: pageContext.stationId,
    apSerialNumber: pageContext.apSerialNumber,
    apName: pageContext.apName,
    siteId: pageContext.siteId,
    siteName: pageContext.siteName,
    serviceId: pageContext.serviceId,
    ssid: pageContext.ssid,
    floorId: pageContext.floorId,
  };

  if (pageContext.selectedTimeWindow) {
    resolved.startTime = pageContext.selectedTimeWindow.startTime;
    resolved.endTime = pageContext.selectedTimeWindow.endTime;
  } else {
    const now = new Date();
    resolved.endTime = now.toISOString();
    resolved.startTime = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }

  for (const { re, intent } of INTENT_PATTERNS) {
    if (re.test(question)) {
      return { intent, resolved };
    }
  }

  return { intent: 'unknown', resolved };
}
