/**
 * DNS reachability check.
 *
 * Topologies whose local DHCP server hands out DNS servers (dhcpDnsServers on
 * /v1/topologies) are promising clients a resolver. This check verifies each
 * configured resolver actually answers (TCP 53, ICMP fallback). A network with
 * no local DHCP DNS configuration has nothing to verify and reports clean.
 */

import { fetchXcc } from '../../validationEngine/xccClient.js';
import { probeHost, isLoopback } from './netProbe.js';

const DNS_PORT = 53;

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function isLocalDhcpMode(mode) {
  return mode === 'DHCPServer' || mode === 'Local';
}

/** Parse the controller's comma/space separated server list field. */
export function parseDnsServers(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '0.0.0.0');
}

export async function runDnsReachabilityCheck(opts) {
  const topologies = toArray(await fetchXcc('/v1/topologies', opts));

  // server -> networks that advertise it
  const servers = new Map();
  let scopesWithDns = 0;
  for (const topo of topologies) {
    if (!isLocalDhcpMode(topo.dhcpMode)) continue;
    const list = parseDnsServers(topo.dhcpDnsServers);
    if (list.length > 0) scopesWithDns += 1;
    for (const host of list) {
      if (isLoopback(host)) continue;
      if (!servers.has(host)) servers.set(host, []);
      servers.get(host).push(topo.name ?? `VLAN ${topo.vlanid}`);
    }
  }

  const alerts = [];
  const results = [];

  await Promise.all(
    [...servers.entries()].map(async ([host, networks]) => {
      const { reachable } = await probeHost(host, DNS_PORT);
      results.push({ server: host, usedBy: networks.join(', '), reachable });
      if (!reachable) {
        alerts.push({
          id: `dns_reachability:${host}`,
          severity: 'critical',
          checkName: 'dns_reachability',
          message: `DNS server ${host} unreachable — advertised to clients on ${networks.join(', ')}`,
          target: host,
          context: { host, networks },
        });
      }
    })
  );

  const reachableCount = results.filter((r) => r.reachable).length;
  const evidence = {
    reachabilityResults: results.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary:
      servers.size === 0
        ? `${topologies.length} network(s) scanned — no local DHCP scopes advertise DNS servers, nothing to verify.`
        : `${reachableCount}/${servers.size} DNS server(s) reachable across ${scopesWithDns} DHCP scope(s).`,
  };

  return { alerts, evidence };
}
