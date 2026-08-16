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

    const { alerts } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('returns warning at >5% failure rate', async () => {
    const clients = [];
    for (let i = 0; i < 20; i++) {
      clients.push({ ssid: 'Guest', ipAddress: i < 18 ? `10.0.0.${i + 1}` : null });
    }

    fetchXcc.mockResolvedValue({ data: clients });
    const { alerts } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

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
    const { alerts } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].target).toBe('IoT');
  });

  it('skips SSIDs with fewer than 2 clients', async () => {
    fetchXcc.mockResolvedValue({
      data: [{ ssid: 'Lonely', ipAddress: null }],
    });

    const { alerts } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('handles empty station list', async () => {
    fetchXcc.mockResolvedValue({ data: [] });
    const { alerts } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  // The engine persists `evidence` alongside the alerts, so a check that stopped
  // reporting it would leave every stored result unexplained without failing
  // anything above — these tests only ever looked at the alerts.
  it('reports evidence describing what was examined, alerts or not', async () => {
    const clients = [];
    for (let i = 0; i < 20; i++) {
      clients.push({ ssid: 'Guest', ipAddress: i < 18 ? `10.0.0.${i + 1}` : null });
    }

    fetchXcc.mockResolvedValue({ data: clients });
    const { evidence } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(evidence.totalClients).toBe(20);
    expect(evidence.ssidsFound).toBe(1);
    expect(evidence.ssidBreakdown).toHaveLength(1);
    expect(evidence.ssidBreakdown[0].ssid).toBe('Guest');
    expect(evidence.thresholds).toEqual({ warning: '5%', critical: '15%' });
    expect(evidence.summary).toContain('20 client(s)');
  });

  it('still reports evidence when there is nothing to examine', async () => {
    fetchXcc.mockResolvedValue({ data: [] });
    const { evidence } = await runClientDhcpFailureCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(evidence.totalClients).toBe(0);
    expect(evidence.ssidBreakdown).toEqual([]);
    expect(evidence.summary).toBe('No connected clients found.');
  });
});
