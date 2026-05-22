import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriftMonitor } from './driftMonitor.js';

function makeTopologies(items) {
  return items.map(([id, name, vlanid]) => ({ id, name, vlanid }));
}

function makeAps(items) {
  return { data: items.map(([apSerialNum, apAssignedProfileId]) => ({ apSerialNum, apAssignedProfileId })) };
}

describe('DriftMonitor', () => {
  let monitor;
  beforeEach(() => { monitor = new DriftMonitor(); });

  it('returns empty alerts on first poll (no prior state)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-A']]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: mockFetch });
    await monitor.poll();

    expect(monitor.getAlerts()).toHaveLength(0);
  });

  it('detects topology_removed when a topology disappears', async () => {
    const fetchFirst = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1], ['t2', 'Guest', 120]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchFirst });
    await monitor.poll(); // establish baseline

    const fetchSecond = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) }) // t2 removed
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchSecond });
    await monitor.poll();

    const alerts = monitor.getAlerts();
    expect(alerts.some(a => a.type === 'topology_removed' && a.detail.includes('120'))).toBe(true);
  });

  it('detects ap_profile_changed when an AP switches profile', async () => {
    const fetchFirst = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-A']]) });

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchFirst });
    await monitor.poll();

    const fetchSecond = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeTopologies([['t1', 'Corp', 1]]) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeAps([['AP1', 'profile-B']]) }); // changed

    monitor.configure({ authToken: 'Bearer tok', controllerUrl: 'https://ctrl', fetchFn: fetchSecond });
    await monitor.poll();

    const alerts = monitor.getAlerts();
    expect(alerts.some(a => a.type === 'ap_profile_changed' && a.detail.includes('AP1'))).toBe(true);
  });

  it('clears alerts', async () => {
    monitor.configure({
      authToken: 'Bearer tok', controllerUrl: 'https://ctrl',
      fetchFn: vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => makeAps([]) }),
    });
    await monitor.poll();
    monitor.clearAlerts();
    expect(monitor.getAlerts()).toHaveLength(0);
  });

  it('sets authExpired=true on 401 and stops polling', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => 'Unauthorized', statusText: 'Unauthorized',
    });
    monitor.configure({ authToken: 'Bearer expired', controllerUrl: 'https://ctrl', fetchFn: mockFetch });
    await monitor.poll();
    expect(monitor.getStatus().authExpired).toBe(true);
  });
});
