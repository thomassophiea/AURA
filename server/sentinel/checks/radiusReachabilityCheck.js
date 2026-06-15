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
 * XCC API uses `authenticationRadiusServers` (array of RadiusServerElement)
 * with `ipAddress` for the host and `authPort` (default 1812) for the port.
 * Also checks `accountingRadiusServers` for accounting-only servers.
 */
function extractRadiusServers(policies) {
  const servers = new Map(); // "host:port" -> { host, port, policyNames[], type }
  const arr = Array.isArray(policies?.data) ? policies.data : Array.isArray(policies) ? policies : [];

  for (const policy of arr) {
    const policyName = policy.name ?? policy.id ?? 'unknown';

    // Auth servers — XCC field: authenticationRadiusServers
    const authServers = policy.authenticationRadiusServers ?? policy.radiusAuthServers ?? policy.radiusServers ?? [];
    for (const server of authServers) {
      const host = server.ipAddress ?? server.host ?? server.ip;
      if (!host) continue;
      const port = server.authPort ?? server.port ?? DEFAULT_RADIUS_PORT;
      const key = `${host}:${port}`;
      if (servers.has(key)) {
        servers.get(key).policyNames.push(policyName);
      } else {
        servers.set(key, { host, port, policyNames: [policyName], type: 'auth' });
      }
    }

    // Accounting servers — XCC field: accountingRadiusServers
    const acctServers = policy.accountingRadiusServers ?? policy.radiusAcctServers ?? [];
    for (const server of acctServers) {
      const host = server.ipAddress ?? server.host ?? server.ip;
      if (!host) continue;
      const port = server.port ?? 1813;
      const key = `${host}:${port}`;
      if (servers.has(key)) {
        if (!servers.get(key).policyNames.includes(policyName)) {
          servers.get(key).policyNames.push(policyName);
        }
        servers.get(key).type = 'auth+acct';
      } else {
        servers.set(key, { host, port, policyNames: [policyName], type: 'acct' });
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
  const policyArr = Array.isArray(policies?.data) ? policies.data : Array.isArray(policies) ? policies : [];
  const servers = extractRadiusServers(policies);
  const alerts = [];
  const connectResults = [];

  await Promise.all(
    [...servers.entries()].map(async ([key, { host, port, policyNames, type }]) => {
      const reachable = await tcpConnect(host, port);
      connectResults.push({ host, port, policyNames, type, reachable });
      if (!reachable) {
        alerts.push({
          id: `radius_reachability:${key}`,
          severity: 'critical',
          checkName: 'radius_reachability',
          message: `RADIUS server ${host}:${port} unreachable (${type}, policy: ${policyNames.join(', ')})`,
          target: key,
          context: { host, port, policyNames, type },
        });
      }
    }),
  );

  const reachableCount = connectResults.filter((r) => r.reachable).length;
  const evidence = {
    serversFound: servers.size,
    policiesScanned: policyArr.length,
    policiesFound: policyArr.map((p) => ({
      name: p.name ?? p.id,
      authServers: (p.authenticationRadiusServers ?? []).length,
      acctServers: (p.accountingRadiusServers ?? []).length,
    })),
    connectResults: connectResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary: servers.size === 0
      ? `${policyArr.length} AAA policy(s) scanned. No RADIUS servers found. Check that policies have authenticationRadiusServers configured.`
      : `${reachableCount}/${servers.size} RADIUS server(s) reachable via TCP connect.`,
  };

  return { alerts, evidence };
}
