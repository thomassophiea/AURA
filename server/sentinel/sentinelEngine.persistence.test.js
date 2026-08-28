/**
 * Engine ↔ repository behavior: boot hydration, schedule resume after a
 * redeploy or auth expiry, and write-through of alerts/trends/schedule.
 * The repository itself is mocked — real SQL is covered by the guarded
 * no-op design (no DATABASE_URL in tests) and exercised in deployment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./sentinelRepository.js', () => ({
  loadSentinelState: vi.fn().mockResolvedValue(null),
  syncCheckAlerts: vi.fn().mockResolvedValue(undefined),
  clearAllAlerts: vi.fn().mockResolvedValue(undefined),
  recordTrend: vi.fn().mockResolvedValue(undefined),
  saveSchedule: vi.fn().mockResolvedValue(undefined),
  clearSchedule: vi.fn().mockResolvedValue(undefined),
}));
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

import { SentinelEngine } from './sentinelEngine.js';
import * as repo from './sentinelRepository.js';
import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';

const PERSISTED_ALERT = {
  id: 'radius_reachability:10.0.0.9:1812',
  severity: 'critical',
  checkName: 'radius_reachability',
  message: 'RADIUS server 10.0.0.9:1812 unreachable',
  target: '10.0.0.9:1812',
  context: {},
  firstSeenAt: '2026-08-28T10:00:00.000Z',
  lastSeenAt: '2026-08-28T10:05:00.000Z',
  resolvedAt: null,
  occurrences: 4,
};

describe('SentinelEngine persistence', () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new SentinelEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  it('hydrates alerts, trends, and a pending schedule from the repository', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [PERSISTED_ALERT],
      trends: { radius_reachability: [{ ts: '2026-08-28T10:05:00.000Z', alertCount: 1, status: 'ok' }] },
      config: { intervalMs: 3_600_000, siteId: null },
    });

    expect(await engine.hydrate()).toBe(true);
    expect(engine.getAlerts()).toHaveLength(1);
    expect(engine.getAlerts()[0].occurrences).toBe(4);
    expect(engine.getTrend('radius_reachability')).toHaveLength(1);
    // Restored schedule is reported but not running until auth arrives
    expect(engine.getStatus().intervalMs).toBe(3_600_000);
    expect(engine.getStatus().polling).toBe(false);
  });

  it('resumes a restored schedule when configure() provides auth', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [],
      trends: {},
      config: { intervalMs: 3_600_000, siteId: null },
    });
    await engine.hydrate();

    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });

    const status = engine.getStatus();
    expect(status.polling).toBe(true);
    expect(status.intervalMs).toBe(3_600_000);
    // Resume must not fire an immediate poll — the request that carried the
    // auth follows with its own.
    expect(status.lastPollAt).toBeNull();
  });

  it('suspends (not forgets) the schedule on auth expiry and resumes on fresh auth', async () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });
    runRadiusReachabilityCheck.mockRejectedValueOnce(new Error('401 Unauthorized'));
    engine.startPolling(3_600_000);
    await new Promise((r) => setTimeout(r, 50));

    let status = engine.getStatus();
    expect(status.authExpired).toBe(true);
    expect(status.polling).toBe(false);
    expect(status.intervalMs).toBe(3_600_000); // suspended, still reported
    expect(repo.clearSchedule).not.toHaveBeenCalled();

    engine.configure({ authToken: 'Bearer fresh', controllerUrl: 'https://controller.local' });
    status = engine.getStatus();
    expect(status.polling).toBe(true);
    expect(status.authExpired).toBe(false);
  });

  it('erases the schedule everywhere on a deliberate stop', () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });
    engine.startPolling(3_600_000, { immediate: false });
    expect(repo.saveSchedule).toHaveBeenCalledWith(3_600_000, null);

    engine.stopPolling();
    expect(repo.clearSchedule).toHaveBeenCalled();
    expect(engine.getStatus().intervalMs).toBeNull();
  });

  it('writes alerts and trends through to the repository on each poll', async () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });
    runRadiusReachabilityCheck.mockResolvedValueOnce([
      { id: 'r:1', severity: 'critical', checkName: 'radius_reachability', message: 'm', target: 't', context: {} },
    ]);

    await engine.poll();

    expect(repo.syncCheckAlerts).toHaveBeenCalledWith(
      'radius_reachability',
      expect.arrayContaining([expect.objectContaining({ id: 'r:1', occurrences: 1 })])
    );
    expect(repo.recordTrend).toHaveBeenCalledWith(
      'radius_reachability',
      expect.objectContaining({ alertCount: 1 })
    );
  });

  it('clears persisted alerts when the user clears the board', () => {
    engine.clearAlerts();
    expect(repo.clearAllAlerts).toHaveBeenCalled();
  });

  it('hydration never clobbers alerts from a poll that already ran', async () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });
    runRadiusReachabilityCheck.mockResolvedValueOnce([
      { ...PERSISTED_ALERT, message: 'live message', context: {} },
    ]);
    await engine.poll();

    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [{ ...PERSISTED_ALERT, message: 'stale persisted message' }],
      trends: {},
      config: null,
    });
    await engine.hydrate();

    expect(engine.getAlerts()).toHaveLength(1);
    expect(engine.getAlerts()[0].message).toBe('live message');
  });
});
