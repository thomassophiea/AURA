import net from 'node:net';
import { fetchXcc } from '../../validationEngine/xccClient.js';

const DEFAULT_RADIUS_PORT = 1812;
const TCP_TIMEOUT_MS = 5000;

/**
 * TCP connect test to a host:port. Resolves true if connection succeeds.
 */
function tcpConnect(host, port, timeoutMs = TCP_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Extract unique RADIUS server host:port pairs from AAA policies.
 */
function extractRadiusServers(policies) {
  const servers = new Map(); // "host:port" -> { host, port, policyNames[] }
  const arr = Array.isArray(policies?.data) ? policies.data : Array.isArray(policies) ? policies : [];

  for (const policy of arr) {
    const radiusServers = policy.radiusServers ?? policy.authServers ?? [];
    for (const server of radiusServers) {
      const host = server.host ?? server.ip ?? server.ipAddress;
      if (!host) continue;
      const port = server.port ?? DEFAULT_RADIUS_PORT;
      const key = `${host}:${port}`;
      if (servers.has(key)) {
        servers.get(key).policyNames.push(policy.name ?? policy.id);
      } else {
        servers.set(key, { host, port, policyNames: [policy.name ?? policy.id] });
      }
    }
  }
  return servers;
}

/**
 * Run RADIUS reachability checks. Returns array of alert descriptors.
 */
export async function runRadiusReachabilityCheck(opts) {
  const policies = await fetchXcc('/v1/aaapolicy', opts);
  const servers = extractRadiusServers(policies);
  const alerts = [];
  const connectResults = [];

  await Promise.all(
    [...servers.entries()].map(async ([key, { host, port, policyNames }]) => {
      const reachable = await tcpConnect(host, port);
      connectResults.push({ host, port, policyNames, reachable });
      if (!reachable) {
        alerts.push({
          id: `radius_reachability:${key}`,
          severity: 'critical',
          checkName: 'radius_reachability',
          message: `RADIUS server ${host}:${port} unreachable (used by policy ${policyNames.join(', ')})`,
          target: key,
          context: { host, port, policyNames },
        });
      }
    }),
  );

  const reachableCount = connectResults.filter((r) => r.reachable).length;
  const evidence = {
    serversFound: servers.size,
    policiesScanned: Array.isArray(policies?.data) ? policies.data.length : Array.isArray(policies) ? policies.length : 0,
    connectResults: connectResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary: servers.size === 0
      ? 'No RADIUS servers configured in any AAA policy.'
      : `${reachableCount}/${servers.size} RADIUS server(s) reachable via TCP connect (port ${DEFAULT_RADIUS_PORT}).`,
  };

  return { alerts, evidence };
}
