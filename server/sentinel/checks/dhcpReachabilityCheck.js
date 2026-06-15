import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchXcc } from '../../validationEngine/xccClient.js';

const execAsync = promisify(exec);

/**
 * ICMP ping a host. Returns true if at least one reply received.
 */
async function pingHost(host) {
  try {
    const { stdout } = await execAsync(`ping -c 2 -W 3 ${host}`, { timeout: 10000 });
    return /\d+ received/.test(stdout) && !/ 0 received/.test(stdout) && !/100% packet loss/.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Extract unique DHCP relay server IPs from topologies with DHCPRelay mode.
 */
function extractDhcpRelayServers(topologies) {
  const servers = new Map(); // ip -> { host, vlanNames[] }
  const arr = Array.isArray(topologies?.data) ? topologies.data : Array.isArray(topologies) ? topologies : [];

  for (const topo of arr) {
    if (topo.dhcpMode !== 'DHCPRelay' && topo.dhcpMode !== 'DHCP Relay') continue;
    const relays = topo.dhcpRelayServers ?? topo.dhcpServers ?? [];
    for (const relay of relays) {
      const host = typeof relay === 'string' ? relay : relay.ip ?? relay.host ?? relay.address;
      if (!host) continue;
      if (servers.has(host)) {
        servers.get(host).vlanNames.push(topo.name ?? `VLAN ${topo.vlanid}`);
      } else {
        servers.set(host, { host, vlanNames: [topo.name ?? `VLAN ${topo.vlanid}`] });
      }
    }
  }
  return servers;
}

/**
 * Run DHCP reachability checks. Returns array of alert descriptors.
 */
export async function runDhcpReachabilityCheck(opts) {
  const topologies = await fetchXcc('/v1/topologies', opts);
  const servers = extractDhcpRelayServers(topologies);
  const alerts = [];
  const pingResults = [];

  await Promise.all(
    [...servers.entries()].map(async ([ip, { host, vlanNames }]) => {
      const reachable = await pingHost(host);
      pingResults.push({ host, vlanNames, reachable });
      if (!reachable) {
        alerts.push({
          id: `dhcp_reachability:${ip}`,
          severity: 'critical',
          checkName: 'dhcp_reachability',
          message: `DHCP relay server ${host} unreachable (used by VLAN ${vlanNames.join(', ')})`,
          target: ip,
          context: { host, vlanNames },
        });
      }
    }),
  );

  const reachableCount = pingResults.filter((r) => r.reachable).length;
  const evidence = {
    serversFound: servers.size,
    pingResults: pingResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary: servers.size === 0
      ? 'No DHCP relay servers configured in any topology.'
      : `${reachableCount}/${servers.size} DHCP relay server(s) reachable via ICMP ping.`,
  };

  return { alerts, evidence };
}
