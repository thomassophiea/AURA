import { describe, it, expect, vi } from 'vitest';
import { runClientDhcpFailureCheck } from './clientDhcpFailureCheck.js';

vi.mock('../../validationEngine/xccClient.js', () => ({
  fetchXcc: vi.fn(),
}));

import { fetchXcc } from '../../validationEngine/xccClient.js';

describe('clientDhcpFailureCheck', () => {
  it('returns no alerts when all clients have IPs', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        { ssid: 'Corp', ipAddress: '10.0.0.5' },
        { ssid: 'Corp', ipAddress: '10.0.0.6' },
        { ssid: 'Corp', ipAddress: '10.0.0.7' },
      ],
    });

    const alerts = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('returns warning at >5% failure rate', async () => {
    const clients = [];
    for (let i = 0; i < 20; i++) {
      clients.push({ ssid: 'Guest', ipAddress: i < 18 ? `10.0.0.${i + 1}` : null });
    }

    fetchXcc.mockResolvedValue({ data: clients });
    const alerts = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].checkName).toBe('client_dhcp_failure');
    expect(alerts[0].context.noIp).toBe(2);
    expect(alerts[0].context.total).toBe(20);
  });

  it('returns critical at >15% failure rate', async () => {
    const clients = [];
    for (let i = 0; i < 10; i++) {
      clients.push({ ssid: 'IoT', ipAddress: i < 8 ? `10.0.0.${i + 1}` : '0.0.0.0' });
    }

    fetchXcc.mockResolvedValue({ data: clients });
    const alerts = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].target).toBe('IoT');
  });

  it('skips SSIDs with fewer than 2 clients', async () => {
    fetchXcc.mockResolvedValue({
      data: [{ ssid: 'Lonely', ipAddress: null }],
    });

    const alerts = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('handles empty station list', async () => {
    fetchXcc.mockResolvedValue({ data: [] });
    const alerts = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });
});
