import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SentinelInfraTab } from './SentinelInfraTab';

// The Infrastructure tab must show data as soon as it opens. The Sentinel engine
// is idle until something triggers it, so the tab auto-runs one poll the first
// time it opens with no prior results — or with results stale enough (>10 min)
// to mislead — but never when results are fresh or a schedule is active.

const pollingData = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../hooks/useRealtimePolling', () => ({
  useRealtimePolling: () => ({
    data: pollingData.current,
    loading: false,
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

const svc = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getAlerts: vi.fn(),
  getEvidence: vi.fn(),
  getAllEvidence: vi.fn(),
  getTrends: vi.fn(),
  triggerPoll: vi.fn().mockResolvedValue({ results: {}, status: {} }),
  configure: vi.fn(),
  stop: vi.fn(),
  clearAlerts: vi.fn(),
}));
vi.mock('../../services/sentinelService', () => svc);

const idleChecks = {
  vlan_trunk: { status: 'idle', lastRunAt: null, error: null },
  dhcp_reachability: { status: 'idle', lastRunAt: null, error: null },
  radius_reachability: { status: 'idle', lastRunAt: null, error: null },
  client_dhcp_failure: { status: 'idle', lastRunAt: null, error: null },
};

function statusWith(overrides: Record<string, unknown>) {
  return {
    data: {
      status: {
        configured: true,
        polling: false,
        siteId: null,
        lastPollAt: null,
        authExpired: false,
        activeAlerts: 0,
        checks: idleChecks,
        ...overrides,
      },
      alerts: [],
      trends: {},
    },
  };
}

describe('SentinelInfraTab — auto-run on first open', () => {
  beforeEach(() => {
    svc.triggerPoll.mockClear();
  });

  it('auto-runs one poll when the engine has never run (no lastPollAt)', async () => {
    pollingData.current = statusWith({ lastPollAt: null }).data;
    render(<SentinelInfraTab />);
    await waitFor(() => expect(svc.triggerPoll).toHaveBeenCalledTimes(1));
  });

  it('does NOT auto-run when the engine has fresh results', async () => {
    pollingData.current = statusWith({
      lastPollAt: new Date(Date.now() - 60_000).toISOString(),
    }).data;
    render(<SentinelInfraTab />);
    await new Promise((r) => setTimeout(r, 30));
    expect(svc.triggerPoll).not.toHaveBeenCalled();
  });

  it('auto-runs one poll when the last results are stale (>10 min old)', async () => {
    pollingData.current = statusWith({
      lastPollAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }).data;
    render(<SentinelInfraTab />);
    await waitFor(() => expect(svc.triggerPoll).toHaveBeenCalledTimes(1));
  });

  it('does NOT auto-run stale results when a schedule is active', async () => {
    pollingData.current = statusWith({
      lastPollAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      polling: true,
      intervalMs: 3_600_000,
    }).data;
    render(<SentinelInfraTab />);
    await new Promise((r) => setTimeout(r, 30));
    expect(svc.triggerPoll).not.toHaveBeenCalled();
  });

  it('does NOT auto-run while a poll is already in progress', async () => {
    pollingData.current = statusWith({ polling: true }).data;
    render(<SentinelInfraTab />);
    await new Promise((r) => setTimeout(r, 30));
    expect(svc.triggerPoll).not.toHaveBeenCalled();
  });
});

// The engine's per-check `status: 'ok'` means "the check ran", not "nothing is
// wrong". The card badge must reflect what the check FOUND, or it announces
// "OK" right beside "3 critical".
describe('SentinelInfraTab — check card badge reflects findings', () => {
  const now = new Date().toISOString();

  function withAlerts(alerts: unknown[]) {
    return {
      status: {
        configured: true,
        polling: false,
        siteId: null,
        lastPollAt: now,
        authExpired: false,
        activeAlerts: alerts.length,
        checks: {
          ...idleChecks,
          radius_reachability: { status: 'ok', lastRunAt: now, error: null },
        },
      },
      alerts,
      trends: {},
    };
  }

  it('shows "Critical" (not "OK") on a check that ran cleanly but found criticals', () => {
    pollingData.current = withAlerts([
      {
        id: 'radius:1',
        severity: 'critical',
        checkName: 'radius_reachability',
        message: 'RADIUS server 192.168.100.1 unreachable',
        target: '192.168.100.1',
        context: {},
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        occurrences: 1,
      },
    ]);
    const { getAllByText, queryAllByText } = render(<SentinelInfraTab />);
    expect(getAllByText('Critical').length).toBeGreaterThan(0);
    // The RADIUS card must not carry an OK badge; other (idle) cards show none.
    expect(queryAllByText('OK')).toHaveLength(0);
  });

  it('keeps "OK" on a clean run with no findings', () => {
    pollingData.current = withAlerts([]);
    const { getAllByText } = render(<SentinelInfraTab />);
    expect(getAllByText('OK')).toHaveLength(1);
  });
});
