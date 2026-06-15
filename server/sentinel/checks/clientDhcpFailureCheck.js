import { fetchXcc } from '../../validationEngine/xccClient.js';

const WARNING_THRESHOLD = 0.05;  // 5%
const CRITICAL_THRESHOLD = 0.15; // 15%

/**
 * Check for clients with no IP address (DHCP failure indicator).
 * Groups by SSID and calculates failure rate.
 */
export async function runClientDhcpFailureCheck(opts) {
  const stations = await fetchXcc('/v1/stations', opts);
  const arr = Array.isArray(stations?.data) ? stations.data : Array.isArray(stations) ? stations : [];

  // Group clients by SSID
  const bySsid = new Map(); // ssid -> { total, noIp }
  for (const client of arr) {
    const ssid = client.ssid ?? client.serviceName ?? 'unknown';
    if (!bySsid.has(ssid)) bySsid.set(ssid, { total: 0, noIp: 0 });
    const bucket = bySsid.get(ssid);
    bucket.total += 1;

    const ip = client.ipAddress ?? client.ip ?? client.clientIp;
    if (!ip || ip === '0.0.0.0' || ip === '::' || ip === 'N/A') {
      bucket.noIp += 1;
    }
  }

  const alerts = [];
  const ssidBreakdown = [];

  for (const [ssid, { total, noIp }] of bySsid) {
    const rate = total > 0 ? noIp / total : 0;
    const pct = (rate * 100).toFixed(1);
    const status = total < 2 ? 'skipped' : rate >= CRITICAL_THRESHOLD ? 'critical' : rate >= WARNING_THRESHOLD ? 'warning' : 'ok';

    ssidBreakdown.push({ ssid, total, noIp, rate: parseFloat(pct), status });

    if (total < 2) continue;
    if (rate < WARNING_THRESHOLD) continue;

    const severity = rate >= CRITICAL_THRESHOLD ? 'critical' : 'warning';

    alerts.push({
      id: `client_dhcp_failure:${ssid}`,
      severity,
      checkName: 'client_dhcp_failure',
      message: `${pct}% of clients on SSID ${ssid} have no IP address (${noIp}/${total})`,
      target: ssid,
      context: { ssid, noIp, total, rate: parseFloat(pct) },
    });
  }

  const evidence = {
    totalClients: arr.length,
    ssidsFound: bySsid.size,
    ssidBreakdown: ssidBreakdown.sort((a, b) => b.rate - a.rate),
    thresholds: { warning: `${WARNING_THRESHOLD * 100}%`, critical: `${CRITICAL_THRESHOLD * 100}%` },
    summary: arr.length === 0
      ? 'No connected clients found.'
      : `${arr.length} client(s) across ${bySsid.size} SSID(s). ${alerts.length} SSID(s) above failure threshold.`,
  };

  return { alerts, evidence };
}
