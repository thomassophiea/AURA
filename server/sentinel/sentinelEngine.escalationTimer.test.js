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

/** An unacknowledged critical whose firstSeenAt is well past a 30-minute threshold. */
function overdueCritical(id = 'radius_reachability:10.0.0.9:1812') {
  return {
    id,
    severity: 'critical',
    checkName: 'radius_reachability',
    message: 'RADIUS server 10.0.0.9:1812 unreachable',
    target: '10.0.0.9:1812',
    context: {},
    firstSeenAt: new Date(NOW.getTime() - 31 * 60_000).toISOString(),
    lastSeenAt: new Date(NOW.getTime() - 31 * 60_000).toISOString(),
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

  it('dedupes across a poll-driven sweep and a timer sweep — escalates once total', async () => {
    engine.configure({ authToken: 'Bearer t', controllerUrl: 'https://controller.local' });
    repo.loadSentinelState.mockResolvedValueOnce({
      alerts: [overdueCritical()],
      trends: {},
      config: null,
    });
    await engine.hydrate();
    expect(engine.setWebhookUrl('https://hooks.example.com/aura')).toBe(true);
    expect(engine.setRoutingPolicy({ escalation: { enabled: true, afterMinutes: 30 } })).toBe(true);

    // Poll-driven sweep escalates the overdue critical first. The check must
    // still report the alert as present (not []), or poll()'s own
    // resolveAbsent() would auto-resolve it before the escalation check runs.
    runRadiusReachabilityCheck.mockResolvedValueOnce([overdueCritical()]);
    await engine.poll();
    expect(dispatchWebhook).toHaveBeenCalledTimes(1);

    // The independent timer sweep must not re-escalate the same alert —
    // #escalatedIds is shared between poll()'s sweep and the timer's sweep.
    await vi.advanceTimersByTimeAsync(ESCALATION_SWEEP_MS);
    expect(dispatchWebhook).toHaveBeenCalledTimes(1);
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
