import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchXcc } from '../../validationEngine/xccClient.js';

const execAsync = promisify(exec);

async function pingHost(host) {
  try {
    const { stdout } = await execAsync(`ping -c 2 -W 3 ${host}`, { timeout: 10000 });
    return /\d+ received/.test(stdout) && !/ 0 received/.test(stdout) && !/100% packet loss/.test(stdout);
  } catch {
    return false;
  }
}

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

function isValidIp(ip) {
  return typeof ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip !== '0.0.0.0';
}

export async function runDhcpReachabilityCheck(opts) {
  const topologies = await fetchXcc('/v1/topologies', opts);
  const topoArr = toArray(topologies);

  const alerts = [];

  // ── Local DHCP Server topologies ──
  const localServerTopos = topoArr.filter(
    (t) => t.dhcpMode === 'DHCPServer' || t.dhcpMode === 'Local'
  );

  const localResults = await Promise.all(
    localServerTopos.map(async (t) => {
      const label = t.name ?? `VLAN ${t.vlanid}`;
      const hasPool = isValidIp(t.dhcpStartIpRange) && isValidIp(t.dhcpEndIpRange);
      const gateway = t.gateway;
      const hasGateway = isValidIp(gateway);

      let gatewayReachable = null;
      if (hasGateway) {
        gatewayReachable = await pingHost(gateway);
      }

      const issues = [];
      if (!hasPool) issues.push('no IP pool configured');
      if (hasGateway && gatewayReachable === false) issues.push('gateway unreachable');

      return {
        label,
        vlanId: t.vlanid,
        pool: hasPool ? `${t.dhcpStartIpRange} – ${t.dhcpEndIpRange}` : null,
        gateway: gateway ?? null,
        gatewayReachable,
        hasPool,
        issues,
      };
    })
  );

  for (const r of localResults) {
    if (!r.hasPool) {
      alerts.push({
        id: `dhcp_reachability:local:${r.vlanId}:no_pool`,
        severity: 'warning',
        checkName: 'dhcp_reachability',
        message: `${r.label} (VLAN ${r.vlanId}) has DHCPServer mode but no IP pool configured`,
        target: r.label,
        context: { vlanId: r.vlanId, mode: 'local' },
      });
    }
    if (r.gatewayReachable === false) {
      alerts.push({
        id: `dhcp_reachability:local:${r.vlanId}:gw_down`,
        severity: 'critical',
        checkName: 'dhcp_reachability',
        message: `${r.label} (VLAN ${r.vlanId}) gateway ${r.gateway} is unreachable`,
        target: r.gateway,
        context: { vlanId: r.vlanId, gateway: r.gateway, mode: 'local' },
      });
    }
  }

  // ── DHCPRelay topologies ──
  const relayServers = new Map(); // ip -> { host, vlanNames[] }
  for (const t of topoArr) {
    if (t.dhcpMode !== 'DHCPRelay' && t.dhcpMode !== 'DHCP Relay') continue;
    const vlanLabel = t.name ?? `VLAN ${t.vlanid}`;
    const raw = t.dhcpRelayServers ?? t.dhcpServers;
    let hosts = [];
    if (typeof raw === 'string' && raw.trim()) {
      hosts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(raw)) {
      hosts = raw.map((r) => (typeof r === 'string' ? r : r.ip ?? r.host ?? r.address)).filter(Boolean);
    }
    if (!hosts.length && isValidIp(t.foreignIpAddress)) {
      hosts.push(t.foreignIpAddress);
    }
    for (const host of hosts) {
      if (relayServers.has(host)) {
        relayServers.get(host).vlanNames.push(vlanLabel);
      } else {
        relayServers.set(host, { host, vlanNames: [vlanLabel] });
      }
    }
  }

  const relayResults = await Promise.all(
    [...relayServers.entries()].map(async ([ip, { host, vlanNames }]) => {
      const reachable = await pingHost(host);
      if (!reachable) {
        alerts.push({
          id: `dhcp_reachability:relay:${ip}`,
          severity: 'critical',
          checkName: 'dhcp_reachability',
          message: `DHCP relay server ${host} unreachable (used by ${vlanNames.join(', ')})`,
          target: ip,
          context: { host, vlanNames, mode: 'relay' },
        });
      }
      return { server: host, usedBy: vlanNames.join(', '), reachable };
    })
  );

  // ── Evidence ──
  const localOk = localResults.filter((r) => r.issues.length === 0).length;
  const relayOk = relayResults.filter((r) => r.reachable).length;

  let summary = '';
  if (localServerTopos.length === 0 && relayServers.size === 0) {
    summary = `${topoArr.length} network(s) scanned. No DHCP server or relay configuration found.`;
  } else {
    const parts = [];
    if (localServerTopos.length > 0) {
      parts.push(`${localOk}/${localServerTopos.length} local DHCP server network(s) OK`);
    }
    if (relayServers.size > 0) {
      parts.push(`${relayOk}/${relayServers.size} relay server(s) reachable`);
    }
    summary = parts.join('; ') + '.';
  }

  const evidence = {
    networks: topoArr.map((t) => ({
      name: t.name ?? `VLAN ${t.vlanid}`,
      vlanId: t.vlanid,
      dhcpMode:
        t.dhcpMode === 'DHCPRelay' || t.dhcpMode === 'DHCP Relay' ? 'Relay'
        : t.dhcpMode === 'DHCPServer' || t.dhcpMode === 'Local' ? 'Server'
        : t.dhcpMode ?? 'None',
    })),
    localServers: localResults,
    reachabilityResults: relayResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary,
  };

  return { alerts, evidence };
}
