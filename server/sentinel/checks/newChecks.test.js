import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../validationEngine/xccClient.js', () => ({
  fetchXcc: vi.fn(),
}));
vi.mock('./netProbe.js', () => ({
  probeHost: vi.fn(),
  isLoopback: (h) => /^127\./.test(h) || h === 'localhost',
  tcpConnect: vi.fn(),
  pingHost: vi.fn(),
}));

import { fetchXcc } from '../../validationEngine/xccClient.js';
import { probeHost } from './netProbe.js';
import { runCertExpiryCheck } from './certExpiryCheck.js';
import { runFirmwareConsistencyCheck } from './firmwareConsistencyCheck.js';
import { runDnsReachabilityCheck, parseDnsServers } from './dnsReachabilityCheck.js';
import { runApStatusCheck } from './apStatusCheck.js';
import { SENTINEL_MAX_APS_SCANNED } from './scanLimits.js';

const OPTS = { authToken: 'x', controllerUrl: 'https://controller.example:443' };

beforeEach(() => {
  fetchXcc.mockReset();
  probeHost.mockReset();
});

function certIn(days) {
  const to = new Date(Date.now() + days * 86_400_000);
  return {
    subject: { CN: 'controller.example' },
    issuer: { CN: 'controller.example' },
    valid_from: new Date(Date.now() - 30 * 86_400_000).toUTCString(),
    valid_to: to.toUTCString(),
  };
}

describe('certExpiryCheck', () => {
  it('is clean for a certificate with plenty of runway', async () => {
    const { alerts, evidence } = await runCertExpiryCheck(OPTS, {
      fetchCertFn: async () => certIn(200),
    });
    expect(alerts).toEqual([]);
    expect(evidence.certificate.selfSigned).toBe(true);
    expect(evidence.certificate.daysLeft).toBeGreaterThan(190);
  });

  it('warns inside 30 days and goes critical inside 7', async () => {
    const warn = await runCertExpiryCheck(OPTS, { fetchCertFn: async () => certIn(20) });
    expect(warn.alerts[0].severity).toBe('warning');

    const crit = await runCertExpiryCheck(OPTS, { fetchCertFn: async () => certIn(3) });
    expect(crit.alerts[0].severity).toBe('critical');

    const expired = await runCertExpiryCheck(OPTS, { fetchCertFn: async () => certIn(-10) });
    expect(expired.alerts[0].severity).toBe('critical');
    expect(expired.alerts[0].message).toContain('EXPIRED');
  });
});

describe('firmwareConsistencyCheck', () => {
  it('stays quiet when every hardware type runs one version', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        { apName: 'AP1', hardwareType: 'AP5020', softwareVersion: '10.9.1' },
        { apName: 'AP2', hardwareType: 'AP5020', softwareVersion: '10.9.1' },
        { apName: 'AP3', hardwareType: 'AP4020', softwareVersion: '10.8.4' },
      ],
    });
    const { alerts, evidence } = await runFirmwareConsistencyCheck(OPTS);
    expect(alerts).toEqual([]);
    expect(evidence.distribution).toHaveLength(2);
  });

  it('warns per hardware type running mixed versions, naming the outliers', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        { apName: 'AP1', hardwareType: 'AP5020', softwareVersion: '10.9.1' },
        { apName: 'AP2', hardwareType: 'AP5020', softwareVersion: '10.9.1' },
        { apName: 'AP3', hardwareType: 'AP5020', softwareVersion: '10.7.0' },
      ],
    });
    const { alerts } = await runFirmwareConsistencyCheck(OPTS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].message).toContain('majority on 10.9.1');
    expect(alerts[0].message).toContain('AP3 on 10.7.0');
  });
});

describe('dnsReachabilityCheck', () => {
  it('parses the controller server-list string', () => {
    expect(parseDnsServers('8.8.8.8, 1.1.1.1')).toEqual(['8.8.8.8', '1.1.1.1']);
    expect(parseDnsServers('0.0.0.0')).toEqual([]);
    expect(parseDnsServers('')).toEqual([]);
    expect(parseDnsServers(undefined)).toEqual([]);
  });

  it('reports clean when no local DHCP scope advertises DNS', async () => {
    fetchXcc.mockResolvedValue({ data: [{ name: 'v1', dhcpMode: 'DHCPNone', dhcpDnsServers: '' }] });
    const { alerts, evidence } = await runDnsReachabilityCheck(OPTS);
    expect(alerts).toEqual([]);
    expect(evidence.summary).toContain('nothing to verify');
    expect(probeHost).not.toHaveBeenCalled();
  });

  it('raises a critical for an unreachable advertised DNS server', async () => {
    fetchXcc.mockResolvedValue({
      data: [
        { name: 'Corp', dhcpMode: 'DHCPServer', dhcpDnsServers: '10.0.0.53' },
        { name: 'Guest', dhcpMode: 'DHCPServer', dhcpDnsServers: '10.0.0.53, 9.9.9.9' },
      ],
    });
    probeHost.mockImplementation(async (host) => ({ reachable: host === '9.9.9.9' }));
    const { alerts, evidence } = await runDnsReachabilityCheck(OPTS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].target).toBe('10.0.0.53');
    expect(alerts[0].message).toContain('Corp, Guest');
    expect(evidence.summary).toContain('1/2');
  });
});

describe('apStatusCheck', () => {
  it('alerts critical for out-of-service APs and warning for troubles, by name', async () => {
    fetchXcc.mockImplementation(async (path) => {
      if (path === '/v1/state/aps') {
        return [
          { apSerialNo: 'S1', entityStatus: { operationalStatus: 'InService', troubles: [] } },
          { apSerialNo: 'S2', entityStatus: { operationalStatus: 'OutOfService', troubles: ['lost contact'] } },
          { apSerialNo: 'S3', entityStatus: { operationalStatus: 'InService', troubles: ['radio overheating'] } },
        ];
      }
      if (path === '/v1/aps') {
        return {
          data: [
            { serialNumber: 'S1', apName: 'AP-One' },
            { serialNumber: 'S2', apName: 'AP-Two' },
            { serialNumber: 'S3', apName: 'AP-Three' },
          ],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    const { alerts, evidence } = await runApStatusCheck(OPTS);
    expect(alerts).toHaveLength(2);
    const critical = alerts.find((a) => a.severity === 'critical');
    expect(critical.message).toContain('AP-Two is not in service (status: OutOfService');
    const warning = alerts.find((a) => a.severity === 'warning');
    expect(warning.message).toContain('AP-Three reports troubles: radio overheating');
    expect(evidence.summary).toContain('2 of 3');
  });

  it('uses the site-scoped state path when a site is selected', async () => {
    fetchXcc.mockImplementation(async (path) => {
      if (path.startsWith('/v1/state/sites/site-1/aps')) return [];
      if (path === '/v1/aps') return { data: [] };
      throw new Error(`unexpected ${path}`);
    });
    await runApStatusCheck({ ...OPTS, siteId: 'site-1' });
    expect(fetchXcc).toHaveBeenCalledWith('/v1/state/sites/site-1/aps', expect.anything());
  });

  describe('fleet-scale scan cap', () => {
    function fleetOf(count) {
      return Array.from({ length: count }, (_, i) => ({
        apSerialNo: `S${i}`,
        entityStatus: { operationalStatus: 'InService', troubles: [] },
      }));
    }

    function routeFleet(stateList) {
      fetchXcc.mockImplementation(async (path) => {
        if (path === '/v1/state/aps') return stateList;
        if (path === '/v1/aps') return { data: [] };
        throw new Error(`unexpected ${path}`);
      });
    }

    it('scans every AP and reports no sampling when the fleet is under the cap', async () => {
      const count = 5;
      routeFleet(fleetOf(count));

      const { evidence } = await runApStatusCheck(OPTS);

      expect(evidence.sampled).toBeFalsy();
      expect(evidence.scannedCount).toBe(count);
      expect(evidence.totalCount).toBe(count);
      expect(evidence.apStatuses).toHaveLength(count);
    });

    it('caps the scan and reports honest sampling when the fleet exceeds the cap', async () => {
      const count = 600;
      routeFleet(fleetOf(count));

      const { evidence } = await runApStatusCheck(OPTS);

      expect(evidence.sampled).toBe(true);
      expect(evidence.scannedCount).toBe(SENTINEL_MAX_APS_SCANNED);
      expect(evidence.totalCount).toBe(count);
      expect(evidence.summary).toContain(`Sampled ${SENTINEL_MAX_APS_SCANNED} of ${count} APs`);
      // Only the capped subset was actually iterated/reported on
      expect(evidence.apStatuses).toHaveLength(SENTINEL_MAX_APS_SCANNED);
    });
  });
});
