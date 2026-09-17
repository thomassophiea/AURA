import { describe, it, expect } from 'vitest';
import {
  HEALTH, RMA, CHECK, CHECK_STATE, UNMEASURED_REASON, LAYER,
  MIN_PEER_COHORT, REBOOT_FAULT_24H,
  checkOperational, checkFirmware, checkUptime, checkRadios, checkEthernet,
  checkInterfaceErrors, checkUplink, checkPoe, checkTunnels, checkEvents, checkConfiguration,
  checkPeers, checkImpact,
  classifyDeviceHealth, isolate, assessRma, summariseFleet, reconstructReboots,
  platformGapChecks, humanDuration, pass, fault, concern, unmeasured,
} from './deviceHealth.js';

// A live row from the lab Gateway (AP5020-PVT-01, 2026-09-17), trimmed.
const HEALTHY_AP = {
  serialNumber: 'CV012408S-C0102',
  apName: 'AP5020-PVT-01',
  hostSite: 'PrimarySite',
  platformName: 'AP5020',
  hardwareType: 'AP5020-WW',
  softwareVersion: '10.19.1.0-031R',
  status: 'InService',
  adoptedBy: 'PRIMARY',
  ipAddress: '192.168.100.141',
  sysUptime: 271327,
  ethMode: 'fullDuplex',
  ethSpeed: 'speedAuto',
  ethPowerStatus: 'normal',
  pwrSource: 'Bt',
  pwrUsage: 13.6,
  profileName: 'AP5020-INDOOR',
  rfMgmtPolicyName: 'HQ Smart RF',
  ovr: true,
  switchPorts: ['46:Thomas-4220-01', ''],
  ethPorts: [
    { name: 'eth0', speed: 'speed5Gbps', mode: 'fullDuplex', power: 'Bt' },
    { name: 'eth1', speed: 'speedNA', mode: 'NA', power: 'None' },
  ],
  radios: [
    { radioIndex: 1, opChannel: '11', txPower: 17, clients: 0, adminState: 'on' },
    { radioIndex: 2, opChannel: '36', txPower: 17, clients: 3, adminState: 'on' },
    { radioIndex: 3, opChannel: '69', txPower: 12, clients: 1, adminState: 'on' },
  ],
};

const HEALTHY_STATE = {
  entityStatus: { operationalStatus: 'InService', troubles: [] },
  controllerApTunnelStatus: [
    { addr: '192.168.100.12', status: 'Normal', tunnel: 'Active', configMtu: 1500, configMtuTunnelStatus: 'Normal' },
  ],
};

const peer = (serial, over = {}) => ({
  serialNumber: serial,
  platformName: 'AP5020',
  hostSite: 'PrimarySite',
  softwareVersion: '10.19.1.0-031R',
  ...over,
});

const FOUR_PEERS = [peer('P1'), peer('P2'), peer('P3'), peer('P4')];

/** The full clean check set, so tests can vary one thing at a time. */
function healthyChecks(over = []) {
  const base = [
    checkOperational({ apRow: HEALTHY_AP, state: HEALTHY_STATE }),
    checkFirmware({ apRow: HEALTHY_AP, peers: FOUR_PEERS, upgrade: { inProgress: false } }),
    checkUptime({
      apRow: HEALTHY_AP,
      rebootHistory: { available: true, unexpectedLast24h: 0, upgradeCorrelatedLast24h: 0, rebootsLast24h: 0, windowHours: 168, reboots: [] },
    }),
    checkRadios({ apRow: HEALTHY_AP }),
    checkEthernet({ apRow: HEALTHY_AP }),
    checkPoe({ apRow: HEALTHY_AP }),
    checkConfiguration({ apRow: HEALTHY_AP, state: HEALTHY_STATE, vlanGaps: [] }),
    checkTunnels({ state: HEALTHY_STATE }),
    checkEvents({ alarms: [], available: true, activeAlerts: [] }),
    checkPeers({ apRow: HEALTHY_AP, peers: FOUR_PEERS, peerFaults: new Map() }),
    ...platformGapChecks(),
  ];
  const byId = new Map(base.map((c) => [c.id, c]));
  for (const c of over) byId.set(c.id, c);
  return [...byId.values()];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the unmeasured/pass distinction', () => {
  it('never reports an unmeasured check as a pass', () => {
    const c = checkTunnels({ stateReadFailed: true });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.state).not.toBe(CHECK_STATE.PASS);
    expect(c.reason).toBe(UNMEASURED_REASON.READ_FAILED);
    expect(c.summary).not.toMatch(/normal|healthy|clean/i);
  });

  it('distinguishes a permanent platform gap from a failed read', () => {
    const gaps = platformGapChecks();
    expect(gaps.map((g) => g.id).sort()).toEqual([CHECK.CPU, CHECK.MEMORY, CHECK.THERMAL].sort());
    for (const g of gaps) expect(g.reason).toBe(UNMEASURED_REASON.PLATFORM_GAP);

    const failed = checkTunnels({ stateReadFailed: true });
    expect(failed.reason).toBe(UNMEASURED_REASON.READ_FAILED);
  });

  it('a platform gap does not block Healthy, but a failed required read does', () => {
    // CPU/memory/thermal are permanently absent and the AP is still Healthy...
    expect(classifyDeviceHealth(healthyChecks()).health).toBe(HEALTH.HEALTHY);

    // ...while a tunnel read that FAILED makes the verdict Unknown, because
    // another attempt could change it.
    const withHole = classifyDeviceHealth(healthyChecks([checkTunnels({ stateReadFailed: true })]));
    expect(withHole.health).toBe(HEALTH.UNKNOWN);
    expect(withHole.blockedHealthyBy).toContain(CHECK.TUNNEL);
  });

  it('a Healthy verdict still carries the platform gaps as stated limitations', () => {
    const v = classifyDeviceHealth(healthyChecks());
    expect(v.limitations.platformGaps.map((g) => g.check).sort())
      .toEqual([CHECK.CPU, CHECK.MEMORY, CHECK.THERMAL].sort());
    expect(v.instruction).toMatch(/do not imply CPU, memory or temperature were checked/i);
  });
});

describe('operational state is not a health verdict', () => {
  it('passes InService but says so explicitly', () => {
    const c = checkOperational({ apRow: HEALTHY_AP, state: HEALTHY_STATE });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/not a health verdict/i);
  });

  it('InService alone cannot produce Healthy when the radios are silent', () => {
    const silent = { ...HEALTHY_AP, radios: [{ radioIndex: 1, opChannel: 'Off', txPower: 0 }] };
    const v = classifyDeviceHealth(healthyChecks([checkRadios({ apRow: silent })]));
    expect(v.health).toBe(HEALTH.UNHEALTHY);
    expect(v.isolation.attributedTo).toBe(LAYER.HARDWARE);
  });

  it('but the same silence is NOT the device when the switch port is starving it', () => {
    // Measured on three lab APs: every radio off AND ethPowerStatus "low".
    // Insufficient power fully explains a radio that will not come up, and the
    // first version called all three Unhealthy with an RMA Candidate each.
    const silent = { ...HEALTHY_AP, ethPowerStatus: 'low', radios: [{ radioIndex: 1, opChannel: 'Off', txPower: 0 }] };
    const v = classifyDeviceHealth(healthyChecks([
      checkRadios({ apRow: silent }),
      checkPoe({ apRow: silent }),
    ]));
    expect(v.health).toBe(HEALTH.DEGRADED);
    expect(v.rma).toBe(RMA.NONE);
    expect(v.isolation.attributedTo).toBe(LAYER.UPSTREAM);
    expect(v.rmaReasons.join(' ')).toMatch(/Fix that first/i);
  });

  it('marks the trouble array as unreliable rather than treating empty as clean', () => {
    const c = checkOperational({ apRow: HEALTHY_AP, state: HEALTHY_STATE });
    expect(c.evidence.troublesAreUnreliable).toBe(true);
  });
});

describe('firmware consistency', () => {
  it('passes an AP that matches its comparable cohort', () => {
    expect(checkFirmware({ apRow: HEALTHY_AP, peers: FOUR_PEERS }).state).toBe(CHECK_STATE.PASS);
  });

  it('flags an unexplained outlier', () => {
    const c = checkFirmware({
      apRow: { ...HEALTHY_AP, softwareVersion: '10.18.0.0-001R' },
      peers: FOUR_PEERS,
      upgrade: { inProgress: false },
    });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/not mid-upgrade/i);
  });

  it('does NOT flag an outlier that is mid-upgrade', () => {
    const c = checkFirmware({
      apRow: { ...HEALTHY_AP, softwareVersion: '10.18.0.0-001R' },
      peers: FOUR_PEERS,
      upgrade: { inProgress: true },
    });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/planned change in progress/i);
  });

  it('refuses to judge against fewer than three comparable APs', () => {
    const c = checkFirmware({ apRow: HEALTHY_AP, peers: [peer('P1', { softwareVersion: '9.0' })] });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.reason).toBe(UNMEASURED_REASON.NOT_APPLICABLE);
  });

  it('labels the expected version as inferred, never as a published target', () => {
    const c = checkFirmware({ apRow: HEALTHY_AP, peers: FOUR_PEERS });
    expect(c.evidence.expectedVersionIsInferred).toBe(true);
  });
});

describe('uptime and reboot reconstruction', () => {
  it('reconstructs a reboot from a decrease in uptime', () => {
    const t = Date.now();
    const r = reconstructReboots([
      { at: t - 3 * 3600_000, uptimeSeconds: 100000, firmware: 'A' },
      { at: t - 2 * 3600_000, uptimeSeconds: 103600, firmware: 'A' },
      { at: t - 1 * 3600_000, uptimeSeconds: 120, firmware: 'A' },
    ], { now: t });
    expect(r.available).toBe(true);
    expect(r.reboots).toHaveLength(1);
    expect(r.unexpectedLast24h).toBe(1);
    expect(r.reboots[0].reason).toBeNull();
  });

  it('does not invent a reboot from a collection gap where uptime kept rising', () => {
    const t = Date.now();
    const r = reconstructReboots([
      { at: t - 10 * 3600_000, uptimeSeconds: 1000 },
      { at: t - 1 * 3600_000, uptimeSeconds: 33400 },
    ], { now: t });
    expect(r.reboots).toHaveLength(0);
    expect(r.unexpectedLast24h).toBe(0);
  });

  it('classifies a reboot across a firmware change as an upgrade, not a fault', () => {
    const t = Date.now();
    const r = reconstructReboots([
      { at: t - 2 * 3600_000, uptimeSeconds: 100000, firmware: '10.18.0' },
      { at: t - 1 * 3600_000, uptimeSeconds: 200, firmware: '10.19.1' },
    ], { now: t });
    expect(r.unexpectedLast24h).toBe(0);
    expect(r.upgradeCorrelatedLast24h).toBe(1);
  });

  it('never turns an absent series into "no reboots"', () => {
    const r = reconstructReboots([]);
    expect(r.available).toBe(false);

    // The claim it may make is bounded by the CURRENT uptime and nothing more:
    // "not in that period", never "no restarts".
    const c = checkUptime({ apRow: HEALTHY_AP, rebootHistory: r });
    expect(c.summary).toMatch(/has not restarted in that period/i);
    expect(c.summary).toMatch(/longer-term restart pattern could not be checked/i);
    expect(c.summary).not.toMatch(/no unexpected restarts|has been stable/i);
    expect(c.evidence.rebootHistoryAvailable).toBe(false);
  });

  it('treats repeated unexpected restarts as a device-specific fault', () => {
    const c = checkUptime({
      apRow: { ...HEALTHY_AP, sysUptime: 400 },
      rebootHistory: { available: true, unexpectedLast24h: REBOOT_FAULT_24H, upgradeCorrelatedLast24h: 0, rebootsLast24h: 4, windowHours: 168, reboots: [] },
    });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.deviceSpecific).toBe(true);
    expect(c.summary).toMatch(/no restart reason code/i);
  });

  it('does not call a single restart a failure pattern', () => {
    const c = checkUptime({
      apRow: { ...HEALTHY_AP, sysUptime: 400 },
      rebootHistory: { available: true, unexpectedLast24h: 1, upgradeCorrelatedLast24h: 0, rebootsLast24h: 1, windowHours: 168, reboots: [] },
    });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/not a failure pattern/i);
  });
});

describe('radios', () => {
  it('flags an AP that is InService with every radio off the air', () => {
    const c = checkRadios({ apRow: { ...HEALTHY_AP, radios: [{ radioIndex: 1, opChannel: 'Off', txPower: 0 }] } });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.deviceSpecific).toBe(true);
  });

  it('reads the literal string "Off" as off the air', () => {
    // It is not null. A truthiness test on the channel read a disabled radio as
    // tuned, which is what the Gateway actually sends on four lab APs.
    const c = checkRadios({ apRow: { ...HEALTHY_AP, radios: [{ radioIndex: 1, opChannel: 'Off', txPower: 0 }] } });
    expect(c.evidence.radios[0].onAir).toBe(false);
  });

  it('does not claim a subset of off-air radios is a hardware fault', () => {
    // Measured: adminState is true even on radios reporting "Off" at 0 dBm, so
    // the platform cannot separate "disabled" from "failed" and neither can we.
    const c = checkRadios({
      apRow: {
        ...HEALTHY_AP,
        radios: [
          { radioIndex: 1, opChannel: 'Off', txPower: 0, adminState: true },
          { radioIndex: 2, opChannel: '36', txPower: 17, adminState: true },
        ],
      },
    });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.deviceSpecific).toBe(false);
    expect(c.summary).toMatch(/four possible causes/i);
    expect(c.evidence.adminStateDiscriminates).toBe(false);
  });

  it('treats a 6 GHz radio awaiting AFC as a regulatory wait, not a fault', () => {
    // Measured on EAL-AP01: opChannel "AFC-PENDING" at 0 dBm.
    const c = checkRadios({
      apRow: {
        ...HEALTHY_AP,
        radios: [
          { radioIndex: 1, opChannel: '11', txPower: 17 },
          { radioIndex: 3, opChannel: 'AFC-PENDING', txPower: 0 },
        ],
      },
    });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/regulatory wait/i);
  });
});

describe('the upstream layer', () => {
  it('treats half duplex as an upstream fault, never a device fault', () => {
    const c = checkEthernet({
      apRow: { ...HEALTHY_AP, ethPorts: [{ name: 'eth0', speed: 'speed100Mbps', mode: 'halfDuplex' }] },
    });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.layer).toBe(LAYER.UPSTREAM);
    expect(c.deviceSpecific).toBe(false);
  });

  it('classifies an AP with a bad uplink as Degraded, not Unhealthy', () => {
    const v = classifyDeviceHealth(healthyChecks([
      checkEthernet({ apRow: { ...HEALTHY_AP, ethPorts: [{ name: 'eth0', speed: 'speed100Mbps', mode: 'halfDuplex' }] } }),
    ]));
    expect(v.health).toBe(HEALTH.DEGRADED);
    expect(v.isolation.attributedTo).toBe(LAYER.UPSTREAM);
    expect(v.rma).toBe(RMA.NONE);
  });

  it('flags abnormal PoE as upstream', () => {
    const c = checkPoe({ apRow: { ...HEALTHY_AP, ethPowerStatus: 'lowPower' } });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.layer).toBe(LAYER.UPSTREAM);
    expect(c.deviceSpecific).toBe(false);
  });

  it('says the switch power budget is not exposed rather than implying headroom', () => {
    expect(checkPoe({ apRow: HEALTHY_AP }).evidence.switchBudgetAvailable).toBe(false);
  });

  it('names the upstream switch and port from LLDP', () => {
    const c = checkUplink({ lldp: [{ switchPort: '46', systemName: 'Thomas-4220-01', switchSerial: '' }] });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toContain('Thomas-4220-01');
    expect(c.summary).toContain('46');
  });
});

describe('interface counters', () => {
  it('reports the empty wired array on this build as a platform gap, not a 0% error rate', () => {
    // Exactly what the lab AP5020 returns.
    const c = checkInterfaceErrors({ ifstats: { wired: [], wireless: [{ id: '1', inErrors: 8, outErrors: 0, inUPackets: 56021, outUPackets: 590936, adminStatus: true, operStatus: true }] } });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.reason).toBe(UNMEASURED_REASON.PLATFORM_GAP);
    expect(c.summary).not.toMatch(/Ethernet error rate is 0/);
  });

  it('treats a failed read as a hole, not as clean counters', () => {
    const c = checkInterfaceErrors({ readFailed: true, error: 'HTTP 500' });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.reason).toBe(UNMEASURED_REASON.READ_FAILED);
  });

  it('catches a radio that is admin up but operationally down', () => {
    const c = checkInterfaceErrors({
      ifstats: { wired: [], wireless: [{ id: '2', adminStatus: true, operStatus: false, inErrors: 0, outErrors: 0 }] },
    });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.deviceSpecific).toBe(true);
  });

  it('scores a real wired error rate against its denominator', () => {
    const c = checkInterfaceErrors({
      ifstats: { wired: [{ inErrors: 5000, outErrors: 0, inUPackets: 100000, outUPackets: 0 }], wireless: [] },
    });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.layer).toBe(LAYER.UPSTREAM);
    expect(c.deviceSpecific).toBe(false);
  });
});

describe('events', () => {
  it('separates "the endpoint is not there" from "there were no events"', () => {
    const missing = checkEvents({ available: false });
    expect(missing.state).toBe(CHECK_STATE.UNMEASURED);
    expect(missing.reason).toBe(UNMEASURED_REASON.PLATFORM_GAP);

    const empty = checkEvents({ alarms: [], available: true, activeAlerts: [] });
    expect(empty.state).toBe(CHECK_STATE.PASS);
  });
});

describe('peer comparison', () => {
  it('refuses a verdict on a cohort under three', () => {
    const c = checkPeers({ apRow: HEALTHY_AP, peers: [peer('P1'), peer('P2')] });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.summary).toContain(String(MIN_PEER_COHORT));
  });

  it('calls a condition shared when most comparable APs have it', () => {
    const c = checkPeers({
      apRow: HEALTHY_AP,
      peers: FOUR_PEERS,
      peerFaults: new Map([['P1', 1], ['P2', 1], ['P3', 1]]),
    });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.layer).toBe(LAYER.UPSTREAM);
    expect(c.summary).toMatch(/shared cause/i);
  });
});

describe('service impact', () => {
  it('does not treat one affected client out of many as evidence about the AP', () => {
    const c = checkImpact({ clientCount: 12, clientsWithFindings: 1 });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/not about the AP/i);
  });

  it('does not treat an idle AP as a healthy one', () => {
    const c = checkImpact({ clientCount: 0 });
    expect(c.state).toBe(CHECK_STATE.UNMEASURED);
    expect(c.summary).toMatch(/not evidence of a healthy one/i);
  });
});

describe('the isolation ladder', () => {
  it('separates eliminated from unexamined', () => {
    const iso = isolate([
      pass(CHECK.ETHERNET, 'ok', {}, LAYER.UPSTREAM),
      unmeasured(CHECK.FIRMWARE, UNMEASURED_REASON.READ_FAILED, 'no'),
    ]);
    expect(iso.eliminated).toContain(LAYER.UPSTREAM);
    expect(iso.unexamined).toContain(LAYER.FIRMWARE);
    expect(iso.unexamined).toContain(LAYER.HARDWARE);
  });

  it('attributes to the LOWEST implicated layer, so a bad uplink outranks a radio symptom', () => {
    const iso = isolate([
      fault(CHECK.ETHERNET, 'half duplex', {}, LAYER.UPSTREAM, false),
      fault(CHECK.RADIO, 'radio silent', {}, LAYER.HARDWARE, true),
    ]);
    expect(iso.attributedTo).toBe(LAYER.UPSTREAM);
    expect(iso.hardwareReachable).toBe(false);
  });
});

describe('the RMA ladder', () => {
  const deviceFault = fault(CHECK.RADIO, 'Two radios off the air without being disabled.', {}, LAYER.HARDWARE, true);

  it('indicates no RMA when nothing isolates to the hardware', () => {
    const v = classifyDeviceHealth(healthyChecks());
    expect(v.rma).toBe(RMA.NONE);
  });

  it('never reaches RMA from missing telemetry alone', () => {
    const v = classifyDeviceHealth(healthyChecks([
      checkTunnels({ stateReadFailed: true }),
      checkUptime({ apRow: HEALTHY_AP, rebootHistory: null }),
    ]));
    expect(v.health).toBe(HEALTH.UNKNOWN);
    expect(v.rma).toBe(RMA.NONE);
  });

  it('never reaches RMA from a single reboot', () => {
    const v = classifyDeviceHealth(healthyChecks([
      checkUptime({
        apRow: { ...HEALTHY_AP, sysUptime: 300 },
        rebootHistory: { available: true, unexpectedLast24h: 1, upgradeCorrelatedLast24h: 0, rebootsLast24h: 1, windowHours: 168, reboots: [] },
      }),
    ]));
    expect(v.rma).toBe(RMA.NONE);
    expect(v.health).toBe(HEALTH.DEGRADED);
  });

  it('holds at Candidate while the AP is a firmware outlier', () => {
    const v = classifyDeviceHealth(healthyChecks([
      deviceFault,
      checkFirmware({ apRow: { ...HEALTHY_AP, softwareVersion: '10.18.0.0-001R' }, peers: FOUR_PEERS, upgrade: { inProgress: false } }),
    ]));
    expect(v.rma).toBe(RMA.CANDIDATE);
    expect(v.rmaBlockers.join(' ')).toMatch(/firmware outlier/i);
  });

  it('holds at Candidate when upstream was never examined', () => {
    const v = classifyDeviceHealth([
      deviceFault,
      checkFirmware({ apRow: HEALTHY_AP, peers: FOUR_PEERS }),
      checkPeers({ apRow: HEALTHY_AP, peers: FOUR_PEERS, peerFaults: new Map() }),
    ]);
    expect(v.rma).toBe(RMA.CANDIDATE);
    expect(v.rmaBlockers.join(' ')).toMatch(/was not examined/i);
  });

  it('holds at Candidate when the peer cohort is too small', () => {
    const v = classifyDeviceHealth(healthyChecks([
      deviceFault,
      checkPeers({ apRow: HEALTHY_AP, peers: [peer('P1')] }),
    ]));
    expect(v.rma).toBe(RMA.CANDIDATE);
    expect(v.rmaBlockers.join(' ')).toMatch(/cohort was too small/i);
  });

  it('holds at Candidate when no remediation has been attempted', () => {
    const v = classifyDeviceHealth(healthyChecks([
      deviceFault,
      checkUptime({
        apRow: { ...HEALTHY_AP, sysUptime: 300 },
        rebootHistory: { available: true, unexpectedLast24h: 4, upgradeCorrelatedLast24h: 0, rebootsLast24h: 4, windowHours: 168, reboots: [] },
      }),
    ]));
    expect(v.rma).toBe(RMA.CANDIDATE);
    expect(v.rmaBlockers.join(' ')).toMatch(/No remediation has been attempted/i);
  });

  it('reaches Recommended only with recurrence, clean upstream and exhausted remediation', () => {
    const v = classifyDeviceHealth(
      healthyChecks([
        deviceFault,
        checkUptime({
          apRow: { ...HEALTHY_AP, sysUptime: 300 },
          rebootHistory: { available: true, unexpectedLast24h: 4, upgradeCorrelatedLast24h: 0, rebootsLast24h: 4, windowHours: 168, reboots: [] },
        }),
      ]),
      { remediation: { attempted: ['a firmware realignment and a controlled restart'], resolved: false } }
    );
    expect(v.rma).toBe(RMA.RECOMMENDED);
    expect(v.rmaBlockers).toEqual([]);
    expect(v.health).toBe(HEALTH.UNHEALTHY);
  });

  it('withdraws the RMA entirely when remediation resolved it', () => {
    const v = classifyDeviceHealth(
      healthyChecks([
        deviceFault,
        checkUptime({
          apRow: { ...HEALTHY_AP, sysUptime: 300 },
          rebootHistory: { available: true, unexpectedLast24h: 4, upgradeCorrelatedLast24h: 0, rebootsLast24h: 4, windowHours: 168, reboots: [] },
        }),
      ]),
      { remediation: { attempted: ['a firmware realignment'], resolved: true } }
    );
    expect(v.rma).toBe(RMA.NONE);
  });

  it('states an RMA verdict on every assessment, including a healthy one', () => {
    for (const v of [
      classifyDeviceHealth(healthyChecks()),
      classifyDeviceHealth(healthyChecks([deviceFault])),
      classifyDeviceHealth(healthyChecks([checkTunnels({ stateReadFailed: true })])),
    ]) {
      expect(Object.values(RMA)).toContain(v.rma);
    }
  });
});

describe('fleet rollup', () => {
  it('never folds unknown into healthy', () => {
    const s = summariseFleet([
      { health: HEALTH.HEALTHY, rma: RMA.NONE },
      { health: HEALTH.UNKNOWN, rma: RMA.NONE },
      { health: HEALTH.UNKNOWN, rma: RMA.NONE },
      { health: HEALTH.UNHEALTHY, rma: RMA.CANDIDATE },
    ]);
    expect(s.healthy).toBe(1);
    expect(s.unknown).toBe(2);
    expect(s.unhealthy).toBe(1);
    expect(s.rmaCandidates).toBe(1);
    // The defect this guards: three APs assessed, one measurable, reported as
    // "all healthy". Unknown must survive as its own number.
    expect(s.apCount).toBe(4);
    expect(s.healthy).not.toBe(s.apCount - s.unhealthy);
    expect(s.instruction).toMatch(/MUST NOT be reported as healthy/);
  });
});

describe('suspect telemetry', () => {
  it('treats an implausible power reading as suspect rather than as a fault', () => {
    const c = checkPoe({ apRow: { ...HEALTHY_AP, pwrUsage: 0 } });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.evidence.suspectReading).toBe(true);
    const v = classifyDeviceHealth(healthyChecks([c]));
    expect(v.suspectTelemetry).toHaveLength(1);
    expect(v.rma).toBe(RMA.NONE);
  });
});

describe('humanDuration', () => {
  it('formats the live lab uptime', () => {
    expect(humanDuration(271327)).toBe('3d 3h');
    expect(humanDuration(400)).toBe('6m');
  });
});

describe('configuration as an isolation rung', () => {
  it('can be eliminated, which is what makes the RMA ladder reachable', () => {
    const c = checkConfiguration({ apRow: HEALTHY_AP, state: HEALTHY_STATE, vlanGaps: [] });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.layer).toBe(LAYER.CONFIG);
  });

  it('does not flag a routine AP-level override as a problem', () => {
    // Measured: four of the eight lab APs carry ovr=true as their normal state,
    // which is why the live fixture above has it set.
    const c = checkConfiguration({ apRow: HEALTHY_AP, state: HEALTHY_STATE, vlanGaps: [] });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.evidence.apLevelOverride).toBe(true);
  });

  it('faults an AP with no profile at all', () => {
    const { profileName, ...noProfile } = HEALTHY_AP;
    const c = checkConfiguration({ apRow: noProfile, state: HEALTHY_STATE, vlanGaps: [] });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.summary).toMatch(/not assigned to a configuration profile/i);
  });

  it('faults an AP missing the VLANs its own profile needs', () => {
    const c = checkConfiguration({ apRow: HEALTHY_AP, state: HEALTHY_STATE, vlanGaps: ['Guest'] });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.layer).toBe(LAYER.CONFIG);
    expect(c.deviceSpecific).toBe(false);
  });
});

describe('PoE status values this platform actually emits', () => {
  it('treats "low" as an upstream fault', () => {
    // Measured on three lab APs.
    const c = checkPoe({ apRow: { ...HEALTHY_AP, ethPowerStatus: 'low' } });
    expect(c.state).toBe(CHECK_STATE.FAULT);
    expect(c.layer).toBe(LAYER.UPSTREAM);
    expect(c.deviceSpecific).toBe(false);
  });

  it('treats "high" as headroom, not a fault', () => {
    // Measured on AP5010-TEST. Flagging this would fault a correctly powered AP.
    const c = checkPoe({ apRow: { ...HEALTHY_AP, ethPowerStatus: 'high' } });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/headroom/i);
  });

  it('reports an unrecognised value without scoring it', () => {
    const c = checkPoe({ apRow: { ...HEALTHY_AP, ethPowerStatus: 'weird' } });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/Reporting it rather than scoring it/);
  });
});

describe('uptime with no stored history — the day-one case', () => {
  it('a long current uptime passes, because it proves no restart in that window', () => {
    // The first version returned `unmeasured` here, which made UPTIME — a
    // required check — unsatisfiable and turned every AP in the estate Unknown.
    const c = checkUptime({ apRow: HEALTHY_AP, rebootHistory: null });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/has not restarted in that period/i);
    expect(c.evidence.rebootHistoryAvailable).toBe(false);
  });

  it('an AP still assesses as Healthy before any uptime series exists', () => {
    const v = classifyDeviceHealth(
      healthyChecks([checkUptime({ apRow: HEALTHY_AP, rebootHistory: null })])
    );
    expect(v.health).toBe(HEALTH.HEALTHY);
    expect(v.rebootHistoryAvailable).toBe(false);
  });

  it('a SHORT uptime with no history is a concern, not a pass', () => {
    const c = checkUptime({ apRow: { ...HEALTHY_AP, sysUptime: 300 }, rebootHistory: null });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/whether this repeats is unknown/i);
  });

  it('no-history never reaches an RMA verdict', () => {
    const v = classifyDeviceHealth(
      healthyChecks([checkUptime({ apRow: { ...HEALTHY_AP, sysUptime: 300 }, rebootHistory: null })])
    );
    expect(v.health).toBe(HEALTH.DEGRADED);
    expect(v.rma).toBe(RMA.NONE);
  });
});

describe('mesh backhaul is not a failed uplink', () => {
  const noWire = { ...HEALTHY_AP, ethPorts: [{ name: 'eth0', speed: 'speedNA', mode: 'NA', power: 'At' }] };

  it('passes an AP with no wired link whose Gateway tunnel is up', () => {
    // Measured: AP4020-PVT-05_MESH_RELAY reports both ports speedNA while
    // adopted, tunnelled and serving clients over a wireless backhaul.
    const c = checkEthernet({ apRow: noWire, tunnelsUp: true });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.evidence.backhaul).toBe('wireless');
  });

  it('still faults an AP with no wired link and no tunnel', () => {
    const c = checkEthernet({ apRow: noWire, tunnelsUp: false });
    expect(c.state).toBe(CHECK_STATE.FAULT);
  });
});

describe('the management tunnel MTU is not the data tunnel MTU', () => {
  const tun = (over) => ({
    controllerApTunnelStatus: [
      { addr: '192.168.100.12', status: 'Normal', tunnel: 'Active', configMtu: 1500, configMtuTunnelStatus: 'Normal', ...over },
    ],
  });

  it('does not degrade an AP for a management-path MTU state alone', () => {
    // Measured on 8 of 8 lab APs. Scoring it put the whole fleet in Degraded.
    const c = checkTunnels({ state: tun({ internalManagementTunnelStatus: 'MtuFailed' }) });
    expect(c.state).toBe(CHECK_STATE.PASS);
    expect(c.summary).toMatch(/data path is unaffected/i);
    expect(c.evidence.managementPathMtuIssues).toBe(1);
  });

  it('does flag a DATA-path MTU disagreement, which is the one clients feel', () => {
    const c = checkTunnels({ state: tun({ configMtuTunnelStatus: 'MtuFailed' }) });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
    expect(c.summary).toMatch(/TLS and large transfers fail/);
  });

  it('flags an AP that learned a smaller MTU than the Gateway configured', () => {
    const c = checkTunnels({ state: tun({ apLearnedMtu: 1400 }) });
    expect(c.state).toBe(CHECK_STATE.CONCERN);
  });
});
