import { fetchXcc } from '../../validationEngine/xccClient.js';
// Shared, injection-safe probes: hosts come from controller config (free
// text), so they are validated and never passed through a shell.
import { probeHost, isLoopback } from './netProbe.js';

const DEFAULT_RADIUS_PORT = 1812;

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
  const [policies, services] = await Promise.all([
    fetchXcc('/v1/aaapolicy', opts),
    fetchXcc('/v1/services', opts),
  ]);
  const policyArr = Array.isArray(policies?.data) ? policies.data : Array.isArray(policies) ? policies : [];
  const svcArr = Array.isArray(services?.data) ? services.data : Array.isArray(services) ? services : [];

  // Map policy ID/name -> WLANs that reference it
  const wlansByPolicy = new Map();
  for (const svc of svcArr) {
    const svcName = svc.serviceName ?? svc.name ?? svc.ssid;
    const policyRef = svc.aaaPolicyId ?? svc.aaaPolicy ?? svc.aaaProfileId;
    if (policyRef) {
      const key = String(policyRef);
      if (!wlansByPolicy.has(key)) wlansByPolicy.set(key, []);
      wlansByPolicy.get(key).push(svcName);
    }
  }
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
    skippedLoopback: skippedCount,
    policies: policyArr.map((p) => {
      const pName = p.name ?? p.id;
      const wlans = wlansByPolicy.get(String(p.id)) ?? wlansByPolicy.get(pName) ?? [];
      return {
        name: pName,
        authServers: (p.authenticationRadiusServers ?? []).length,
        acctServers: (p.accountingRadiusServers ?? []).length,
        usedByWlans: wlans.length > 0 ? wlans.join(', ') : 'Not assigned',
      };
    }),
    reachabilityResults: probeResults.sort((a, b) => Number(a.reachable) - Number(b.reachable)).map((r) => ({
      server: r.host,
      port: r.port,
      role: r.role,
      policy: r.policyNames.join(', '),
      reachable: r.reachable,
    })),
    summary: servers.size === 0
      ? `${policyArr.length} AAA policy(s) scanned.${skippedCount ? ` ${skippedCount} loopback server(s) excluded.` : ''} No external RADIUS servers to verify.`
      : `${reachableCount}/${servers.size} RADIUS server(s) verified reachable.${skippedCount ? ` ${skippedCount} loopback excluded.` : ''}`,
  };

  return { alerts, evidence };
}
