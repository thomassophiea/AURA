/**
 * Standalone escalation timer — sweeps unacknowledged criticals into an
 * escalation dispatch on a fixed cadence, independent of poll() cadence.
 * This matters for poll-on-demand deployments (background polling Off),
 * where poll() may never run and escalation must still happen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./sentinelRepository.js', () => ({
  loadSentinelState: vi.fn().mockResolvedValue(null),
  syncCheckAlerts: vi.fn().mockResolvedValue(undefined),
  clearAllAlerts: vi.fn().mockResolvedValue(undefined),
  recordTrend: vi.fn().mockResolvedValue(undefined),
  saveSchedule: vi.fn().mockResolvedValue(undefined),
  clearSchedule: vi.fn().mockResolvedValue(undefined),
  setAcknowledged: vi.fn().mockResolvedValue(undefined),
  saveWebhookUrl: vi.fn().mockResolvedValue(undefined),
  saveRoutingPolicy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./sentinelWebhook.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, dispatchWebhook: vi.fn().mockResolvedValue({ ok: true, status: 200 }) };
});
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
vi.mock('./checks/dnsReachabilityCheck.js', () => ({
  runDnsReachabilityCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/certExpiryCheck.js', () => ({
  runCertExpiryCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/firmwareConsistencyCheck.js', () => ({
  runFirmwareConsistencyCheck: vi.fn().mockResolvedValue([]),
}));
vi.mock('./checks/apStatusCheck.js', () => ({
  runApStatusCheck: vi.fn().mockResolvedValue([]),
}));

import { SentinelEngine } from './sentinelEngine.js';
import * as repo from './sentinelRepository.js';
import { dispatchWebhook } from './sentinelWebhook.js';
import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';

// Matches the engine's private ESCALATION_SWEEP_MS constant.
const ESCALATION_SWEEP_MS = 60_000;
const NOW = new Date('2026-08-29T12:00:00.000Z');

/**
 * An unacknowledged critical, `minutesAgo` minutes before `NOW`. With the
 * default escalation policy (afterMinutes: 30) used throughout this file,
 * 31 minutes is already past threshold at `NOW`; 29.5 minutes is not yet past
 * threshold at `NOW` but crosses it after one more `ESCALATION_SWEEP_MS` tick.
 */
function overdueCritical(id = 'radius_reachability:10.0.0.9:1812', minutesAgo = 31) {
  return {
    id,
    severity: 'critical',
    checkName: 'radius_reachability',
    message: `RADIUS server unreachable (${id})`,
    target: id,
    context: {},
    firstSeenAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    lastSeenAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    resolvedAt: null,
    occurrences: 4,
  };
}

describe('SentinelEngine standalone escalation timer', () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new SentinelEngine();
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  it('sweeps and dispatches an overdue unacked critical without any poll() call', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [overdueCritical()],
      trends: {},
      config: null,
    });
    await engine.hydrate();

    expect(engine.setWebhookUrl('https://hooks.example.com/aura')).toBe(true);
    expect(engine.setRoutingPolicy({ escalation: { enabled: true, afterMinutes: 30 } })).toBe(true);

    expect(dispatchWebhook).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS);

    expect(dispatchWebhook).toHaveBeenCalledTimes(1);
    const [, payload] = dispatchWebhook.mock.calls[0];
    expect(payload.event).toBe('sentinel.escalation');
    expect(payload.alerts).toHaveLength(1);
    expect(payload.alerts[0].id).toBe('radius_reachability:10.0.0.9:1812');
  });

  it('is a no-op when no webhook is configured', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [overdueCritical()],
      trends: {},
      config: null,
    });
    await engine.hydrate();
    expect(engine.setRoutingPolicy({ escalation: { enabled: true, afterMinutes: 30 } })).toBe(true);
    // Deliberately no setWebhookUrl().

    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS);

    expect(dispatchWebhook).not.toHaveBeenCalled();
  });

  it('is a no-op when escalation policy is disabled', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [overdueCritical()],
      trends: {},
      config: null,
    });
    await engine.hydrate();
    expect(engine.setWebhookUrl('https://hooks.example.com/aura')).toBe(true);
    // Escalation left at the default (disabled).

    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS);

    expect(dispatchWebhook).not.toHaveBeenCalled();
  });

  it('dedupes the poll-escalated alert while the timer alone escalates a second alert that only becomes eligible after it fires', async () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });

    const ALREADY_OVERDUE_ID = 'radius_reachability:10.0.0.1:1812';
    const BECOMES_OVERDUE_ID = 'radius_reachability:10.0.0.2:1812';
    // Past threshold at NOW — poll() escalates this one immediately.
    const alreadyOverdue = overdueCritical(ALREADY_OVERDUE_ID, 31);
    // Not yet past threshold at NOW; crosses it only once fake time advances
    // by ESCALATION_SWEEP_MS — only the standalone timer can escalate this one,
    // since no further poll() call happens in this test.
    const becomesOverdue = overdueCritical(BECOMES_OVERDUE_ID, 29.5);

    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [alreadyOverdue, becomesOverdue],
      trends: {},
      config: null,
    });
    await engine.hydrate();
    expect(engine.setWebhookUrl('https://hooks.example.com/aura')).toBe(true);
    expect(engine.setRoutingPolicy({ escalation: { enabled: true, afterMinutes: 30 } })).toBe(true);

    // Poll-driven sweep escalates only the already-overdue alert. The check
    // must still report both alerts as present, or poll()'s own
    // resolveAbsent() would auto-resolve them before the escalation check runs.
    runRadiusReachabilityCheck.mockResolvedValueOnce([alreadyOverdue, becomesOverdue]);
    await engine.poll();
    expect(dispatchWebhook).toHaveBeenCalledTimes(1);
    expect(dispatchWebhook.mock.calls[0][1].alerts.map((a) => a.id)).toEqual([ALREADY_OVERDUE_ID]);

    // No poll() call from here on — only the standalone timer runs. Advancing
    // one sweep interval crosses the threshold for the second alert, so its
    // escalation can only come from the timer firing. A dead/disabled timer
    // would leave dispatchWebhook at 1 call forever; this assertion is what
    // makes that failure mode observable.
    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS);

    expect(dispatchWebhook).toHaveBeenCalledTimes(2);
    expect(dispatchWebhook.mock.calls[1][1].alerts.map((a) => a.id)).toEqual([BECOMES_OVERDUE_ID]);

    // The already-escalated alert is not re-sent by the timer sweep — dedupe
    // via the shared #escalatedIds set holds across both sweeps.
    const allEscalatedIds = dispatchWebhook.mock.calls.flatMap(([, payload]) =>
      payload.alerts.map((a) => a.id)
    );
    expect(allEscalatedIds.filter((id) => id === ALREADY_OVERDUE_ID)).toHaveLength(1);
  });

  it('destroy() stops the timer — advancing time after destroy dispatches nothing', async () => {
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [overdueCritical()],
      trends: {},
      config: null,
    });
    await engine.hydrate();
    expect(engine.setWebhookUrl('https://hooks.example.com/aura')).toBe(true);
    expect(engine.setRoutingPolicy({ escalation: { enabled: true, afterMinutes: 30 } })).toBe(true);

    engine.destroy();

    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS * 3);

    expect(dispatchWebhook).not.toHaveBeenCalled();
  });
});
