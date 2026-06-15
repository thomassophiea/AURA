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
 * XCC API: topology.dhcpServers is a comma-separated string (not an array).
 * Also checks foreignIpAddress as a fallback relay target.
 */
function extractDhcpRelayServers(topologies) {
  const servers = new Map(); // ip -> { host, vlanNames[] }
  const arr = Array.isArray(topologies?.data) ? topologies.data : Array.isArray(topologies) ? topologies : [];

  for (const topo of arr) {
    if (topo.dhcpMode !== 'DHCPRelay' && topo.dhcpMode !== 'DHCP Relay') continue;
    const vlanLabel = topo.name ?? `VLAN ${topo.vlanid}`;

    // dhcpServers can be a comma-separated string or an array
    const raw = topo.dhcpRelayServers ?? topo.dhcpServers;
    let hosts = [];
    if (typeof raw === 'string' && raw.trim()) {
      hosts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(raw)) {
      hosts = raw.map((r) => (typeof r === 'string' ? r : r.ip ?? r.host ?? r.address)).filter(Boolean);
    }

    // Fallback: foreignIpAddress (relay target on some topologies)
    if (!hosts.length && topo.foreignIpAddress && topo.foreignIpAddress !== '0.0.0.0') {
      hosts.push(topo.foreignIpAddress);
    }

    for (const host of hosts) {
      if (servers.has(host)) {
        servers.get(host).vlanNames.push(vlanLabel);
      } else {
        servers.set(host, { host, vlanNames: [vlanLabel] });
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
  const topoArr = Array.isArray(topologies?.data) ? topologies.data : Array.isArray(topologies) ? topologies : [];
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
    topologiesScanned: topoArr.length,
    topologiesFound: topoArr.map((t) => ({
      name: t.name,
      vlanid: t.vlanid,
      dhcpMode: t.dhcpMode ?? 'unknown',
      dhcpServers: t.dhcpServers ?? null,
      foreignIpAddress: t.foreignIpAddress ?? null,
    })),
    pingResults: pingResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary: servers.size === 0
      ? `${topoArr.length} topology(s) scanned. No DHCP relay servers found. ${topoArr.filter((t) => t.dhcpMode === 'DHCPRelay').length} topology(s) in relay mode.`
      : `${reachableCount}/${servers.size} DHCP relay server(s) reachable via ICMP ping.`,
  };

  return { alerts, evidence };
}
