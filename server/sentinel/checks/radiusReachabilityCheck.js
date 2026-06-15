import net from 'node:net';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchXcc } from '../../validationEngine/xccClient.js';

const execAsync = promisify(exec);
const DEFAULT_RADIUS_PORT = 1812;
const TCP_TIMEOUT_MS = 5000;

/**
 * Skip loopback / link-local addresses — not meaningful external servers.
 */
function isLoopback(host) {
  return /^127\.\d+\.\d+\.\d+$/.test(host) || host === '::1' || host === 'localhost';
}

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
 * Multi-method reachability probe: try TCP first (port-specific), fall back to ICMP.
 */
async function probeHost(host, port) {
  const tcp = await tcpConnect(host, port);
  if (tcp) return { reachable: true };
  const icmp = await pingHost(host);
  return { reachable: icmp };
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
      if (!host || isLoopback(host)) continue;
      const port = server.authPort ?? server.port ?? DEFAULT_RADIUS_PORT;
      const key = `${host}:${port}`;
      if (servers.has(key)) {
        servers.get(key).policyNames.push(policyName);
      } else {
        servers.set(key, { host, port, policyNames: [policyName], type: 'Authentication' });
      }
    }

    // Accounting servers — XCC field: accountingRadiusServers
    const acctServers = policy.accountingRadiusServers ?? policy.radiusAcctServers ?? [];
    for (const server of acctServers) {
      const host = server.ipAddress ?? server.host ?? server.ip;
      if (!host || isLoopback(host)) continue;
      const port = server.port ?? 1813;
      const key = `${host}:${port}`;
      if (servers.has(key)) {
        if (!servers.get(key).policyNames.includes(policyName)) {
          servers.get(key).policyNames.push(policyName);
        }
        servers.get(key).type = 'Auth + Accounting';
      } else {
        servers.set(key, { host, port, policyNames: [policyName], type: 'Accounting' });
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
  const probeResults = [];

  await Promise.all(
    [...servers.entries()].map(async ([key, { host, port, policyNames, type }]) => {
      const { reachable } = await probeHost(host, port);
      probeResults.push({ host, port, policyNames, role: type, reachable });
      if (!reachable) {
        alerts.push({
          id: `radius_reachability:${key}`,
          severity: 'critical',
          checkName: 'radius_reachability',
          message: `RADIUS server ${host} unreachable (${type}, policy: ${policyNames.join(', ')})`,
          target: host,
          context: { host, port, policyNames, type },
        });
      }
    }),
  );

  const reachableCount = probeResults.filter((r) => r.reachable).length;
  const skippedCount = policyArr.reduce((n, p) => {
    const auth = (p.authenticationRadiusServers ?? []).filter((s) => isLoopback(s.ipAddress ?? s.host ?? ''));
    const acct = (p.accountingRadiusServers ?? []).filter((s) => isLoopback(s.ipAddress ?? s.host ?? ''));
    return n + auth.length + acct.length;
  }, 0);

  const evidence = {
    serversFound: servers.size,
    policiesScanned: policyArr.length,
    skippedLoopback: skippedCount,
    policiesFound: policyArr.map((p) => ({
      name: p.name ?? p.id,
      authServers: (p.authenticationRadiusServers ?? []).length,
      acctServers: (p.accountingRadiusServers ?? []).length,
    })),
    probeResults: probeResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)),
    summary: servers.size === 0
      ? `${policyArr.length} AAA policy(s) scanned.${skippedCount ? ` ${skippedCount} loopback server(s) excluded.` : ''} No external RADIUS servers to verify.`
      : `${reachableCount}/${servers.size} RADIUS server(s) verified reachable.${skippedCount ? ` ${skippedCount} loopback excluded.` : ''}`,
  };

  return { alerts, evidence };
}
