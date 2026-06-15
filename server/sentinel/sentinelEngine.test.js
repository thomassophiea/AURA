import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SentinelEngine } from './sentinelEngine.js';

// Mock all check modules
vi.mock('./checks/radiusReachabilityCheck.js', () => ({
  runRadiusReachabilityCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/dhcpReachabilityCheck.js', () => ({
  runDhcpReachabilityCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/clientDhcpFailureCheck.js', () => ({
  runClientDhcpFailureCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/vlanTrunkCheck.js', () => ({
  runVlanTrunkCheck: vi.fn().mockResolvedValue([]),
}));

import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';
import { runClientDhcpFailureCheck } from './checks/clientDhcpFailureCheck.js';

describe('SentinelEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new SentinelEngine();
    engine.configure({ authToken: 'Bearer test', controllerUrl: 'https://controller.local' });
  });

  afterEach(() => {
    engine.destroy();
  });

  it('returns not_configured error when no controllerUrl', async () => {
    const e = new SentinelEngine();
    const result = await e.poll();
    expect(result.error).toBe('not_configured');
    e.destroy();
  });

  it('runs all checks and reports status', async () => {
    const result = await engine.poll();
    expect(result.radius_reachability).toEqual({ ok: true, alerts: 0 });
    expect(result.dhcp_reachability).toEqual({ ok: true, alerts: 0 });
    expect(result.client_dhcp_failure).toEqual({ ok: true, alerts: 0 });
    expect(result.vlan_trunk).toEqual({ ok: true, alerts: 0 });

    const status = engine.getStatus();
    expect(status.configured).toBe(true);
    expect(status.lastPollAt).not.toBeNull();
    expect(status.activeAlerts).toBe(0);
  });

  it('stores alerts from checks', async () => {
    runRadiusReachabilityCheck.mockResolvedValueOnce([
      {
        id: 'radius_reachability:10.0.0.1:1812',
        severity: 'critical',
        checkName: 'radius_reachability',
        message: 'RADIUS server 10.0.0.1:1812 unreachable',
        target: '10.0.0.1:1812',
        context: {},
      },
    ]);

    await engine.poll();
    const alerts = engine.getAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  });

  it('auto-resolves alerts that clear', async () => {
    runClientDhcpFailureCheck.mockResolvedValueOnce([
      {
        id: 'client_dhcp_failure:Guest',
        severity: 'warning',
        checkName: 'client_dhcp_failure',
        message: '10% failure',
        target: 'Guest',
        context: {},
      },
    ]);

    await engine.poll();
    expect(engine.getAlerts()).toHaveLength(1);

    // Next poll: check returns no alerts
    runClientDhcpFailureCheck.mockResolvedValueOnce([]);
    await engine.poll();
    expect(engine.getAlerts()).toHaveLength(0);
    expect(engine.getAllAlerts()).toHaveLength(1); // still in store as resolved
  });

  it('handles auth failure and stops polling', async () => {
    runRadiusReachabilityCheck.mockRejectedValueOnce(new Error('401 Unauthorized'));

    engine.startPolling(60000);
    // Wait for initial poll
    await new Promise((r) => setTimeout(r, 50));

    const status = engine.getStatus();
    expect(status.authExpired).toBe(true);
    expect(status.polling).toBe(false);
  });

  it('filters alerts by severity and check', async () => {
    runRadiusReachabilityCheck.mockResolvedValueOnce([
      { id: 'r:1', severity: 'critical', checkName: 'radius_reachability', message: 'm', target: 't', context: {} },
    ]);
    runClientDhcpFailureCheck.mockResolvedValueOnce([
      { id: 'c:1', severity: 'warning', checkName: 'client_dhcp_failure', message: 'm', target: 't', context: {} },
    ]);

    await engine.poll();

    expect(engine.getAlerts({ severity: 'critical' })).toHaveLength(1);
    expect(engine.getAlerts({ severity: 'warning' })).toHaveLength(1);
    expect(engine.getAlerts({ check: 'radius_reachability' })).toHaveLength(1);
  });
});
