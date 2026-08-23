import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SentinelInfraTab } from './SentinelInfraTab';

// The Infrastructure tab must show data as soon as it opens. The Sentinel engine
// is idle until something triggers it, so the tab auto-runs one poll the first
// time it opens with no prior results — but never when the engine has already
// run or is mid-poll.

const pollingData = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../hooks/useRealtimePolling', () => ({
  useRealtimePolling: () => ({ data: pollingData.current, loading: false }),
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

  it('does NOT auto-run when the engine already has results', async () => {
    pollingData.current = statusWith({ lastPollAt: '2026-08-23T22:21:17.010Z' }).data;
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
