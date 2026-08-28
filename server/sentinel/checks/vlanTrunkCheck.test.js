import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../validationEngine/xccClient.js', () => ({
  fetchXcc: vi.fn(),
}));

import { fetchXcc } from '../../validationEngine/xccClient.js';
import { runVlanTrunkCheck } from './vlanTrunkCheck.js';

const SERVICES = {
  data: [{ serviceName: 'AURA-CWP', defaultTopology: 'topo-1' }],
};
const TOPOLOGIES = {
  data: [{ id: 'topo-1', name: 'Bridged VLAN 1', vlanid: 1 }],
};
const APS = {
  data: [
    { serialNumber: 'CV012408S-C0102', apName: 'AP5020-PVT-01' },
    { serialNumber: 'CV012408S-C0044', apName: 'AP5020-PVT-02' },
  ],
};

/** Route fetchXcc calls by path. `lldp` maps serial -> neighbors array. */
function routeFetch({ services = SERVICES, topologies = TOPOLOGIES, aps = APS, siteAps, lldp = {} }) {
  fetchXcc.mockImplementation(async (path) => {
    if (path === '/v1/services') return services;
    if (path === '/v1/topologies') return topologies;
    if (path === '/v1/aps') return aps;
    if (path.startsWith('/v1/state/sites/')) {
      if (siteAps) return siteAps;
      throw new Error('404');
    }
    const lldpMatch = path.match(/^\/v1\/aps\/([^/]+)\/lldp$/);
    if (lldpMatch) {
      const serial = decodeURIComponent(lldpMatch[1]);
      if (serial in lldp) return lldp[serial];
      throw new Error(`404 for ${serial}`);
    }
    throw new Error(`unexpected path ${path}`);
  });
}

describe('vlanTrunkCheck', () => {
  beforeEach(() => {
    fetchXcc.mockReset();
  });

  it('names the AP (not "undefined:no-neighbors") when LLDP has no neighbors', async () => {
    routeFetch({ lldp: { 'CV012408S-C0102': [], 'CV012408S-C0044': [] } });

    const { alerts } = await runVlanTrunkCheck({ authToken: 'x', controllerUrl: 'http://t' });

    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.severity).toBe('info');
      expect(alert.message).not.toContain('undefined');
      expect(alert.message).not.toContain(':no-neighbors');
    }
    // The friendly AP name is resolved from the serial
    expect(alerts.map((a) => a.target).sort()).toEqual(['AP5020-PVT-01', 'AP5020-PVT-02']);
  });

  it('scopes to the site AP list even though it only carries apSerialNo', async () => {
    routeFetch({
      siteAps: { data: [{ apSerialNo: 'CV012408S-C0102', entityStatus: {} }] },
      lldp: { 'CV012408S-C0102': [] },
    });

    const { alerts, evidence } = await runVlanTrunkCheck({
      authToken: 'x',
      controllerUrl: 'http://t',
      siteId: 'site-1',
    });

    // Only the site's AP is scanned — and by its friendly name, not a serial
    expect(evidence.lldpResults).toEqual([{ accessPoint: 'AP5020-PVT-01', neighbors: 0 }]);
    expect(alerts.every((a) => a.target === 'AP5020-PVT-01')).toBe(true);
    // The out-of-site AP was never queried for LLDP
    const lldpCalls = fetchXcc.mock.calls.filter(([p]) => p.includes('/lldp'));
    expect(lldpCalls).toHaveLength(1);
    expect(lldpCalls[0][0]).toContain('CV012408S-C0102');
  });

  it('falls back to all APs when the site state list is unavailable', async () => {
    routeFetch({ lldp: { 'CV012408S-C0102': [], 'CV012408S-C0044': [] } });

    const { evidence } = await runVlanTrunkCheck({
      authToken: 'x',
      controllerUrl: 'http://t',
      siteId: 'site-unknown',
    });

    expect(evidence.lldpResults).toHaveLength(2);
  });

  it('never requests /v1/aps/undefined/lldp for APs without a serial', async () => {
    routeFetch({
      aps: { data: [{ apName: 'mystery-ap' }, { serialNumber: 'CV012408S-C0102', apName: 'AP5020-PVT-01' }] },
      lldp: { 'CV012408S-C0102': [] },
    });

    await runVlanTrunkCheck({ authToken: 'x', controllerUrl: 'http://t' });

    const lldpCalls = fetchXcc.mock.calls.filter(([p]) => p.includes('/lldp'));
    expect(lldpCalls).toHaveLength(1);
    expect(lldpCalls[0][0]).not.toContain('undefined');
  });

  it('folds per-WLAN "no LLDP neighbors" repeats into one note per AP', async () => {
    routeFetch({
      services: {
        data: [
          { serviceName: 'AURA-CWP', defaultTopology: 'topo-1' },
          { serviceName: 'GUEST_2026', defaultTopology: 'topo-3' },
        ],
      },
      topologies: {
        data: [
          { id: 'topo-1', name: 'Bridged VLAN 1', vlanid: 1 },
          { id: 'topo-3', name: 'Bridged VLAN 3', vlanid: 3 },
        ],
      },
      aps: { data: [{ serialNumber: 'CV012408S-C0102', apName: 'AP5020-PVT-01' }] },
      lldp: { 'CV012408S-C0102': [] },
    });

    const { alerts } = await runVlanTrunkCheck({ authToken: 'x', controllerUrl: 'http://t' });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].message).toContain('AP5020-PVT-01 has no LLDP neighbors');
    expect(alerts[0].message).toContain('AURA-CWP');
    expect(alerts[0].message).toContain('GUEST_2026');
  });

  it('reports a warning with port detail when the VLAN is missing from the trunk', async () => {
    routeFetch({
      lldp: {
        'CV012408S-C0102': [
          {
            systemName: 'sw-core',
            switchPort: '1/0/23',
            vlanMembership: { tagged: [10], untagged: [20] },
          },
        ],
        'CV012408S-C0044': [
          {
            systemName: 'sw-core',
            switchPort: '1/0/24',
            vlanMembership: { tagged: [1], untagged: [] },
          },
        ],
      },
    });

    const { alerts } = await runVlanTrunkCheck({ authToken: 'x', controllerUrl: 'http://t' });

    const warning = alerts.find((a) => a.severity === 'warning');
    expect(warning).toBeDefined();
    expect(warning.target).toBe('AP5020-PVT-01');
    expect(warning.message).toContain('missing VLAN 1');
    expect(warning.context.port).toBe('1/0/23');
  });
});
