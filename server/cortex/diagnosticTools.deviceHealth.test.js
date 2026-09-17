/**
 * The device-health tools against a stubbed Gateway.
 *
 * The fixtures are the LIVE lab fleet as read on 2026-09-17 — eight APs, four
 * models, four sites, one firmware build, `wired: []` on ifstats, `ovr` set on
 * half of them, PoE reporting normal / low / high. Inventing a tidier fleet
 * would have hidden three of the behaviours these tests exist to pin down.
 */
import { describe, it, expect, vi } from 'vitest';
import zlib from 'node:zlib';
import { createDiagnosticTools } from './diagnosticTools.js';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { HEALTH, RMA } from './deviceHealth.js';

const frame = (obj) => [{ frame: zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString('base64') }];

const ap = (over) => ({
  status: 'InService',
  adoptedBy: 'PRIMARY',
  softwareVersion: '10.19.1.0-031R',
  ethMode: 'fullDuplex',
  ethSpeed: 'speedAuto',
  ethPowerStatus: 'normal',
  pwrSource: 'Bt',
  pwrUsage: 13.6,
  sysUptime: 271327,
  ovr: false,
  profileName: 'AP5020-INDOOR',
  ethPorts: [{ name: 'eth0', speed: 'speed5Gbps', mode: 'fullDuplex', power: 'Bt' }],
  radios: [
    { radioIndex: 1, opChannel: '11', txPower: 17, clients: 0 },
    { radioIndex: 2, opChannel: '36', txPower: 17, clients: 0 },
  ],
  ...over,
});

/** Four AP5020s at PrimarySite — a real cohort — plus four others. */
const APS = [
  ap({ serialNumber: 'S1', apName: 'AP5020-PVT-01', platformName: 'AP5020', hostSite: 'PrimarySite', ovr: true }),
  ap({ serialNumber: 'S2', apName: 'AP5020-PVT-02', platformName: 'AP5020', hostSite: 'PrimarySite', ovr: true }),
  ap({ serialNumber: 'S3', apName: 'AP5020-PVT-03', platformName: 'AP5020', hostSite: 'PrimarySite', ovr: true }),
  ap({ serialNumber: 'S4', apName: 'AP5020-PVT-04', platformName: 'AP5020', hostSite: 'PrimarySite', ovr: true }),
  ap({ serialNumber: 'S5', apName: 'AP4020-PVT-05', platformName: 'AP4020X', hostSite: 'PrimarySite', profileName: 'AP4020X-OUTDOOR' }),
  ap({ serialNumber: 'S6', apName: 'AP5010-TEST', platformName: 'AP5010U', hostSite: 'AFC LAB', ethPowerStatus: 'high', profileName: 'AP5010U-default' }),
  ap({ serialNumber: 'S7', apName: 'EAL-PT-N-5th-Floor', platformName: 'AP5022', hostSite: 'EAL-PT-N', ethPowerStatus: 'low', profileName: '5022-N' }),
  ap({ serialNumber: 'S8', apName: 'EAL-PT-S-5th-Floor', platformName: 'AP5022', hostSite: 'EAL-PT-S', ethPowerStatus: 'low', profileName: '5022-N' }),
];

const STATE_OK = {
  entityStatus: { operationalStatus: 'InService', troubles: [] },
  controllerApTunnelStatus: [
    { addr: '192.168.100.12', status: 'Normal', tunnel: 'Active', configMtu: 1500, configMtuTunnelStatus: 'Normal' },
  ],
  apVlanStatus: [],
};

// Exactly what the lab AP5020 returns: wired empty, wireless populated.
const IFSTATS = {
  serialNumber: 'S1',
  wired: [],
  wireless: [{ id: '1', inErrors: 8, outErrors: 0, inDiscards: 0, outDiscards: 0, inUPackets: 56021, outUPackets: 590936, adminStatus: true, operStatus: true }],
  wirelessRf: null,
};

const LLDP = [{ switchPort: '46', portDescrition: '', systemName: 'Thomas-4220-01', systemDescription: 'Extreme 4220', switchSerial: '', managementAddress: '' }];

function stubSession(overrides = {}, { onGet } = {}) {
  return {
    baseUrl: 'https://192.168.100.12:5825',
    get: async (path) => {
      onGet?.(path);
      for (const [key, value] of Object.entries(overrides)) {
        if (path === key || path.startsWith(key)) return value;
      }
      if (path === '/v1/aps/query') return { ok: true, status: 200, data: APS };
      if (path.startsWith('/v1/state/aps/')) return { ok: true, status: 200, data: STATE_OK };
      if (path.startsWith('/v1/aps/ifstats/')) return { ok: true, status: 200, data: IFSTATS };
      if (/\/v1\/aps\/[^/]+\/lldp$/.test(path)) return { ok: true, status: 200, data: LLDP };
      if (path.includes('/alarms')) return { ok: true, status: 200, data: [] };
      if (path.includes('/report?duration')) return { ok: true, status: 200, data: { activeAlerts: [] } };
      if (path === '/v2/report/upgrade/devices') return { ok: true, status: 200, data: { upgradeGroups: [] } };
      if (path === '/v3/sites') return { ok: true, status: 200, data: [{ siteName: 'PrimarySite' }, { siteName: 'AFC LAB' }] };
      if (path === '/v1/services') return { ok: true, status: 200, data: [] };
      if (path === '/v1/topologies') return { ok: true, status: 200, data: [] };
      if (path === '/v3/profiles') return { ok: true, status: 200, data: [] };
      if (path.startsWith('/v1/report/flex')) return { ok: true, status: 200, data: frame([]) };
      if (path === '/v1/stations') return { ok: true, status: 200, data: [] };
      return { ok: false, status: 404, data: null, errorSummary: 'not found' };
    },
  };
}

const make = (scope = {}, overrides, opts) =>
  createDiagnosticTools({
    session: stubSession(overrides, opts),
    scope,
    capabilities: new CapabilityRegistry(),
  });

// ─────────────────────────────────────────────────────────────────────────────

describe('getDeviceHealth — fleet', () => {
  it('returns counts with unknown as its own bucket', async () => {
    const r = await make().getDeviceHealth.handler({});
    expect(r.basis).toBe('observed');
    expect(r.apCount).toBe(8);
    expect(r.healthy + r.degraded + r.unhealthy + r.unknown).toBe(8);
    expect(r.instruction).toMatch(/MUST NOT be reported as healthy/);
  });

  it('classifies the two low-power APs as Degraded, not Unhealthy, and indicates no RMA', async () => {
    // Measured on the real fleet: three APs report ethPowerStatus "low".
    // Power is upstream, so it must never produce a device verdict.
    const r = await make().getDeviceHealth.handler({});
    const low = r.exceptions.filter((e) => /EAL-PT-[NS]/.test(e.ap?.value ?? ''));
    expect(low).toHaveLength(2);
    for (const e of low) {
      expect(e.health).toBe(HEALTH.DEGRADED);
      expect(e.rma).toBe(RMA.NONE);
      expect(e.attributedTo).toBe('network/upstream');
    }
  });

  it('does not treat "high" PoE as a problem', async () => {
    const r = await make().getDeviceHealth.handler({});
    const high = r.exceptions.find((e) => (e.ap?.value ?? '') === 'AP5010-TEST');
    // It may be Unknown for cohort reasons, but it must not be faulted on power.
    expect((high?.faults ?? []).join(' ')).not.toMatch(/power/i);
  });

  it('reports the firmware spread so consistency needs no second call', async () => {
    const r = await make().getDeviceHealth.handler({});
    expect(r.firmwareSpread.every((f) => f.build.includes('10.19.1.0-031R'))).toBe(true);
  });

  it('always names the three platform gaps', async () => {
    const r = await make().getDeviceHealth.handler({});
    expect(r.platformGaps.map((g) => g.field).sort()).toEqual(['cpu', 'memory', 'thermal']);
  });

  it('honours the bound site rather than answering fleet-wide', async () => {
    const r = await make({ siteNames: ['PrimarySite'] }).getDeviceHealth.handler({});
    expect(r.apCount).toBe(5);
    expect(r.scopeApplied).toMatchObject({ level: 'site', siteNames: ['PrimarySite'] });
  });

  it('refuses to report a clean fleet when the site filter matched nothing', async () => {
    const r = await make({ siteNames: ['NoSuchSite'] }).getDeviceHealth.handler({});
    expect(r.status).toBe('scope_matched_nothing');
    expect(r.instruction).toMatch(/not good news/i);
  });

  it('carries the inventory caveat, because a clean list is not a clean fleet', async () => {
    const r = await make().getDeviceHealth.handler({});
    expect(r.inventoryCaveat).toMatch(/DISAPPEARS from inventory/);
  });

  it('reports a failed inventory read as a failure, never as an empty fleet', async () => {
    const r = await make({}, { '/v1/aps/query': { ok: false, status: 500, data: null, errorSummary: 'HTTP 500' } })
      .getDeviceHealth.handler({});
    expect(r.status).toBe('fetch_failed');
    expect(r.instruction).toMatch(/Do not report zero, none, or healthy/);
  });
});

describe('getDeviceHealth — one AP', () => {
  it('assesses a clean AP as Healthy with an explicit no-RMA verdict', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'S1' });
    expect(r.health).toBe(HEALTH.HEALTHY);
    expect(r.rma).toBe(RMA.NONE);
    expect(r.instruction).toMatch(/do not imply CPU, memory or temperature were checked/i);
  });

  it('names the upstream switch port from LLDP', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'S1' });
    const uplink = r.checks.find((c) => c.check === 'uplink');
    expect(uplink.summary).toContain('Thomas-4220-01');
  });

  it('reports the empty wired ifstats array as a gap, not as a clean error rate', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'S1' });
    const ifc = r.checks.find((c) => c.check === 'interface_errors');
    expect(ifc.state).toBe('unmeasured');
    expect(ifc.reason).toBe('platform_gap');
  });

  it('does not report an AP that is absent from inventory as healthy', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'NOPE' });
    expect(r.status).toBe('ap_not_in_inventory');
    expect(r.instruction).toMatch(/Do NOT report this AP as healthy/);
  });

  it('flags an AP that is InService with every radio off the air', async () => {
    const dark = APS.map((a) => (a.serialNumber === 'S1'
      ? { ...a, radios: [{ radioIndex: 1, opChannel: null, txPower: 0 }, { radioIndex: 2, opChannel: null, txPower: 0 }] }
      : a));
    const r = await make({}, { '/v1/aps/query': { ok: true, status: 200, data: dark } })
      .getDeviceHealth.handler({ apSerial: 'S1' });
    expect(r.health).toBe(HEALTH.UNHEALTHY);
    expect(r.faults.map((f) => f.summary).join(' ')).toMatch(/off the air/);
  });
});

describe('resilience: a failed read narrows the assessment, it does not end it', () => {
  it('still assesses when ifstats, LLDP and alarms are all unavailable', async () => {
    const r = await make({}, {
      '/v1/aps/ifstats/': { ok: false, status: 500, data: null, errorSummary: 'HTTP 500' },
      '/v1/aps/S1/lldp': { ok: false, status: 500, data: null, errorSummary: 'HTTP 500' },
    }).getDeviceHealth.handler({ apSerial: 'S1' });

    // The verdict still lands, and the holes are named rather than assumed away.
    expect([HEALTH.HEALTHY, HEALTH.DEGRADED, HEALTH.UNHEALTHY]).toContain(r.health);
    expect(r.limitations.failedReads.map((l) => l.check)).toContain('interface_errors');
  });

  it('is entirely unaffected by the flex report service being down', async () => {
    // The measured fault mode: every flex table 500s as a unit after 31 s. RF
    // tooling dies; device health touches none of it.
    const seen = [];
    const r = await make({}, {
      '/v1/report/flex': { ok: false, status: 500, data: null, errorSummary: 'Exception: null' },
    }, { onGet: (p) => seen.push(p) }).getDeviceHealth.handler({ apSerial: 'S1' });

    expect(r.health).toBe(HEALTH.HEALTHY);
    // Client impact becomes unmeasured — correctly — rather than "nobody affected".
    const impact = r.checks.find((c) => c.check === 'impact');
    expect(impact.state).toBe('unmeasured');
  });

  it('treats a 404 on the undocumented alarms endpoint as a capability gap', async () => {
    const r = await make({}, { '/v1/aps/S1/alarms': { ok: false, status: 404, data: null, errorSummary: 'not found' } })
      .getDeviceHealth.handler({ apSerial: 'S1' });
    const events = r.checks.find((c) => c.check === 'events');
    expect(events.state).toBe('unmeasured');
    expect(events.reason).toBe('platform_gap');
  });

  it('makes a Healthy verdict impossible when the per-AP state read fails', async () => {
    const r = await make({}, { '/v1/state/aps/': { ok: false, status: 500, data: null, errorSummary: 'HTTP 500' } })
      .getDeviceHealth.handler({ apSerial: 'S1' });
    expect(r.health).toBe(HEALTH.UNKNOWN);
    expect(r.blockedHealthyBy).toContain('tunnel');
  });
});

describe('getApRebootHistory', () => {
  it('reports an absent series as no-history, never as stability', async () => {
    const r = await make().getApRebootHistory.handler({ apSerial: 'S1' });
    expect(r.unavailable).toBe(true);
    expect(r.status).toBe('no_history');
    expect(r.instruction).toMatch(/not an absence of restarts/i);
    expect(r.instruction).toMatch(/Do not report that the AP has been stable/i);
  });
});

describe('buildRmaEvidence', () => {
  it('refuses for an AP the Gateway does not list', async () => {
    const r = await make().buildRmaEvidence.handler({ apSerial: 'NOPE' });
    expect(r.status).toBe('ap_not_in_inventory');
  });

  it('builds a package for a real AP without claiming an RMA', async () => {
    const r = await make().buildRmaEvidence.handler({ apSerial: 'S1' });
    expect(r.bundle.disclaimer).toMatch(/not an RMA/i);
    expect(r.bundle.deviceLogs.included).toBe(false);
    expect(r.instruction).toMatch(/do not describe it as a raised, approved or authorised RMA/i);
  });

  it('records remediation verbatim and never invents it', async () => {
    const r = await make().buildRmaEvidence.handler({
      apSerial: 'S1',
      remediationAttempted: ['power-cycled the switch port'],
      remediationResolved: false,
    });
    expect(r.bundle.troubleshootingPerformed.remediationAttempted).toEqual(['power-cycled the switch port']);

    const none = await make().buildRmaEvidence.handler({ apSerial: 'S1' });
    expect(none.bundle.troubleshootingPerformed.remediationAttempted).toEqual([]);
    expect(none.bundle.troubleshootingPerformed.remediationOutcome).toBe('none attempted');
  });

  it('does not issue the disruptive log-collection write', async () => {
    const seen = [];
    await make({}, {}, { onGet: (p) => seen.push(p) }).buildRmaEvidence.handler({ apSerial: 'S1' });
    expect(seen.some((p) => /\/logs$/.test(p))).toBe(false);
  });
});

describe('api gap reporting', () => {
  it('reports the three permanent gaps on a SUCCESSFUL assessment', async () => {
    // These are the fields most worth cataloguing precisely because the tool
    // that reaches for them never fails — so a gap recorder that only reads
    // failed tools would never see them.
    const fleet = await make().getDeviceHealth.handler({});
    expect(fleet.capabilityGaps).toEqual(['ap.cpu', 'ap.memory', 'ap.temperature']);

    const one = await make().getDeviceHealth.handler({ apSerial: 'S1' });
    expect(one.capabilityGaps).toContain('ap.cpu');
    // ...plus reboot history, which is absent until the uptime series accrues.
    expect(one.capabilityGaps).toContain('ap.reboot_history');
  });
});

describe('an AP can be named, not just serialised', () => {
  it('resolves the AP by its hostname, which is what an operator actually types', async () => {
    // Measured on the first live end-to-end run: the model passed
    // "AP5020-PVT-01" and the tool answered "not in inventory" for an AP that
    // was sitting right there — an alarming finding rather than a lookup miss.
    const r = await make().getDeviceHealth.handler({ apSerial: 'AP5020-PVT-01' });
    expect(r.status).not.toBe('ap_not_in_inventory');
    expect(r.serial).toBe('S1');
  });

  it('is case-insensitive about the name', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'ap5020-pvt-02' });
    expect(r.serial).toBe('S2');
  });

  it('still resolves by serial', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'S3' });
    expect(r.serial).toBe('S3');
  });

  it('says so when neither a serial nor a name matches', async () => {
    const r = await make().getDeviceHealth.handler({ apSerial: 'AP-THAT-DOES-NOT-EXIST' });
    expect(r.status).toBe('ap_not_in_inventory');
    expect(r.reason).toMatch(/by serial or by name/);
  });

  it('resolves a name to its serial before querying stored history', async () => {
    const r = await make().getApRebootHistory.handler({ apSerial: 'AP5020-PVT-01' });
    // No database in tests, so it reports no-history — but it must not report
    // no-history merely because the name never matched a stored device id.
    expect(r.status).toBe('no_history');
    expect(r.reason).toMatch(/no monitoring source/);
  });

  it('builds an RMA package when given the name', async () => {
    const r = await make().buildRmaEvidence.handler({ apSerial: 'AP5020-PVT-01' });
    expect(r.bundle.device.serialNumber).toBe('S1');
  });
});
