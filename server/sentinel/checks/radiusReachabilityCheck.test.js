import { describe, it, expect, vi } from 'vitest';

// Mock xccClient
vi.mock('../../validationEngine/xccClient.js', () => ({
  fetchXcc: vi.fn(),
}));

// Mock node:net to avoid real TCP connections
vi.mock('node:net', () => {
  const mockSocket = {
    setTimeout: vi.fn(),
    on: vi.fn((event, cb) => {
      // Simulate connection error (unreachable)
      if (event === 'error') {
        setTimeout(() => cb(new Error('ECONNREFUSED')), 5);
      }
      return mockSocket;
    }),
    connect: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    default: { Socket: vi.fn(() => mockSocket) },
    Socket: vi.fn(() => mockSocket),
  };
});

import { fetchXcc } from '../../validationEngine/xccClient.js';
import { runRadiusReachabilityCheck } from './radiusReachabilityCheck.js';

describe('radiusReachabilityCheck', () => {
  it('returns no alerts when no AAA policies exist', async () => {
    fetchXcc.mockResolvedValue({ data: [] });
    const alerts = await runRadiusReachabilityCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('returns no alerts when policies have no radius servers', async () => {
    fetchXcc.mockResolvedValue({ data: [{ name: 'policy1' }] });
    const alerts = await runRadiusReachabilityCheck({ authToken: 'x', controllerUrl: 'http://test' });
    expect(alerts).toEqual([]);
  });

  it('returns alert for unreachable RADIUS server', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        {
          name: 'Corp-AAA',
          radiusServers: [{ host: '192.168.255.254', port: 1812 }],
        },
      ],
    });

    const alerts = await runRadiusReachabilityCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].checkName).toBe('radius_reachability');
    expect(alerts[0].target).toBe('192.168.255.254:1812');
    expect(alerts[0].context.policyNames).toContain('Corp-AAA');
  }, 10000);

  it('deduplicates servers used by multiple policies', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        { name: 'Policy-A', radiusServers: [{ host: '10.0.0.1', port: 1812 }] },
        { name: 'Policy-B', radiusServers: [{ host: '10.0.0.1', port: 1812 }] },
      ],
    });

    const alerts = await runRadiusReachabilityCheck({ authToken: 'x', controllerUrl: 'http://test' });

    expect(alerts.length).toBe(1);
    expect(alerts[0].context.policyNames).toEqual(['Policy-A', 'Policy-B']);
  }, 10000);
});
