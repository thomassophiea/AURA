import { describe, it, expect } from 'vitest';
import {
  buildRmaBundle, renderBundleSummary, assertsUnauthorisedOutcome,
  LOG_COLLECTION_SEQUENCE, FORBIDDEN_RMA_LANGUAGE,
} from './rmaBundle.js';
import {
  HEALTH, RMA, CHECK, LAYER,
  checkOperational, checkFirmware, checkUptime, checkRadios, checkEthernet,
  checkPoe, checkTunnels, checkConfiguration, checkEvents, checkPeers,
  classifyDeviceHealth, platformGapChecks, reconstructReboots, fault,
} from './deviceHealth.js';

const AP = {
  serialNumber: 'CV012408S-C0102',
  apName: 'AP5020-PVT-03',
  hostSite: 'PrimarySite',
  platformName: 'AP5020',
  hardwareType: 'AP5020-WW',
  macAddress: '18:49:F8:6C:22:00',
  ipAddress: '192.168.100.141',
  softwareVersion: '10.19.1.0-031R',
  status: 'InService',
  adoptedBy: 'PRIMARY',
  profileName: 'AP5020-INDOOR',
  sysUptime: 300,
  ethMode: 'fullDuplex',
  ethSpeed: 'speedAuto',
  ethPowerStatus: 'normal',
  pwrSource: 'Bt',
  pwrUsage: 13.6,
  ovr: true,
  ethPorts: [{ name: 'eth0', speed: 'speed5Gbps', mode: 'fullDuplex', power: 'Bt' }],
  radios: [{ radioIndex: 1, opChannel: '11', txPower: 17, adminState: 'on' }],
};

const STATE = {
  entityStatus: { operationalStatus: 'InService', troubles: [] },
  controllerApTunnelStatus: [{ addr: '192.168.100.12', status: 'Normal', tunnel: 'Active', configMtu: 1500, configMtuTunnelStatus: 'Normal' }],
};

const peers = ['P1', 'P2', 'P3', 'P4'].map((s) => ({
  serialNumber: s, apName: s, platformName: 'AP5020', hostSite: 'PrimarySite',
  softwareVersion: '10.19.1.0-031R', status: 'InService', sysUptime: 271327,
}));

const REBOOTS = {
  available: true, windowHours: 168, rebootsLast24h: 4,
  unexpectedLast24h: 4, upgradeCorrelatedLast24h: 0,
  reboots: [{ at: Date.now() - 3600_000, previousUptimeSeconds: 8000, upgradeCorrelated: false, reason: null }],
  note: 'Reconstructed from stored uptime.',
};

function rmaCase({ reboots = REBOOTS, remediation = { attempted: ['a controlled restart'], resolved: false } } = {}) {
  const checks = [
    checkOperational({ apRow: AP, state: STATE }),
    checkFirmware({ apRow: AP, peers, upgrade: { inProgress: false } }),
    checkUptime({ apRow: AP, rebootHistory: reboots }),
    fault(CHECK.RADIO, 'Radio 1 repeatedly fails initialisation.', {}, LAYER.HARDWARE, true),
    checkEthernet({ apRow: AP }),
    checkPoe({ apRow: AP }),
    checkConfiguration({ apRow: AP, state: STATE, vlanGaps: [] }),
    checkTunnels({ state: STATE }),
    checkEvents({ alarms: [], available: true, activeAlerts: [] }),
    checkPeers({ apRow: AP, peers, peerFaults: new Map() }),
    ...platformGapChecks(),
  ];
  const assessment = classifyDeviceHealth(checks, { remediation });
  return { checks, assessment, remediation };
}

describe('the bundle only exists for a real RMA case', () => {
  it('the fixture actually reaches RMA Recommended', () => {
    expect(rmaCase().assessment.rma).toBe(RMA.RECOMMENDED);
  });
});

describe('language discipline', () => {
  it('never asserts an outcome only Extreme support can assert', () => {
    const { assessment, checks } = rmaCase();
    const bundle = buildRmaBundle({ assessment, checks, apRow: AP, state: STATE, rebootHistory: REBOOTS, peers });
    const text = JSON.stringify(bundle) + '\n' + renderBundleSummary(bundle);
    expect(assertsUnauthorisedOutcome(text)).toBe(false);
  });

  it('the guard itself catches the phrasings it exists for', () => {
    expect(assertsUnauthorisedOutcome('Your RMA has been approved.')).toBe(true);
    expect(assertsUnauthorisedOutcome('A case has been raised with Extreme.')).toBe(true);
    expect(assertsUnauthorisedOutcome('The RMA was authorised this morning.')).toBe(true);
    expect(FORBIDDEN_RMA_LANGUAGE.length).toBeGreaterThan(0);
  });

  it('does NOT fire on a denial, which is the wording this module uses', () => {
    // The first version of this guard flagged the bundle's own disclaimer.
    expect(assertsUnauthorisedOutcome(
      'It is not an RMA, and no RMA has been raised, approved or authorised by producing it.'
    )).toBe(false);
    expect(assertsUnauthorisedOutcome('RMA Recommended.')).toBe(false);
    expect(assertsUnauthorisedOutcome('RMA evidence package ready.')).toBe(false);
  });

  it('a denial in one sentence does not launder an assertion in another', () => {
    expect(assertsUnauthorisedOutcome(
      'This is not an RMA. Your RMA has been approved and ships tomorrow.'
    )).toBe(true);
  });

  it('leads with a disclaimer that this is not an RMA', () => {
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP });
    expect(b.disclaimer).toMatch(/not an RMA/i);
  });
});

describe('what the bundle carries', () => {
  const { assessment, checks, remediation } = rmaCase();
  const bundle = buildRmaBundle({
    assessment, checks, apRow: AP, state: STATE,
    lldp: [{ switchPort: '46', systemName: 'Thomas-4220-01', switchSerial: '', systemDescription: 'Extreme 4220' }],
    rebootHistory: REBOOTS, peers, remediation,
    impact: { clientsOnAp: 12, clientsWithFindings: 9 },
    alarms: [], gatewayUrl: 'https://192.168.100.12:5825',
  });

  it('identifies the device the way a support case needs', () => {
    expect(bundle.device).toMatchObject({
      hostname: 'AP5020-PVT-03',
      model: 'AP5020',
      serialNumber: 'CV012408S-C0102',
      macAddress: '18:49:F8:6C:22:00',
      site: 'PrimarySite',
      gateway: 'https://192.168.100.12:5825',
    });
  });

  it('records what was ELIMINATED, not only what was found', () => {
    const layers = bundle.alternativeCausesEliminated.map((l) => l.layer);
    expect(layers).toContain(LAYER.UPSTREAM);
    expect(layers).toContain(LAYER.CONFIG);
    expect(layers).toContain(LAYER.FIRMWARE);
    // and each carries the evidence sentence, not just the layer name
    expect(bundle.alternativeCausesEliminated.find((l) => l.layer === LAYER.UPSTREAM).evidence.length)
      .toBeGreaterThan(0);
  });

  it('names the upstream switch and port so the reviewer can check it', () => {
    expect(bundle.upstream).toMatchObject({ switchName: 'Thomas-4220-01', switchPort: '46' });
  });

  it('carries the restart evidence with no invented reason codes', () => {
    expect(bundle.uptimeAndRestarts.unexpectedLast24h).toBe(4);
    for (const e of bundle.uptimeAndRestarts.events) expect(e.reasonCode).toBeNull();
  });

  it('names CPU, memory and temperature as platform gaps rather than omitting them', () => {
    const fields = bundle.notCollectedBecauseThePlatformDoesNotExposeIt.map((g) => g.field).sort();
    expect(fields).toEqual([CHECK.CPU, CHECK.MEMORY, CHECK.THERMAL].sort());
  });

  it('records the remediation that was attempted and that it did not work', () => {
    expect(bundle.troubleshootingPerformed.remediationAttempted).toEqual(['a controlled restart']);
    expect(bundle.troubleshootingPerformed.remediationOutcome).toMatch(/did not resolve/);
  });

  it('lists every check that ran, including the unmeasured ones', () => {
    const ids = bundle.troubleshootingPerformed.checksRun.map((c) => c.check);
    expect(ids).toContain(CHECK.CPU);
    expect(bundle.troubleshootingPerformed.checksRun.find((c) => c.check === CHECK.CPU).outcome)
      .toBe('unmeasured');
  });
});

describe('device logs', () => {
  it('does not include them and does not trigger collection', () => {
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP });
    expect(b.deviceLogs.included).toBe(false);
    expect(b.deviceLogs.why).toMatch(/read-only/i);
  });

  it('hands over the exact platform sequence with the serial filled in', () => {
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP });
    expect(b.deviceLogs.sequence).toHaveLength(LOG_COLLECTION_SEQUENCE.length);
    expect(b.deviceLogs.sequence[0]).toMatchObject({ method: 'PUT', classification: 'disruptive' });
    expect(b.deviceLogs.sequence[0].path).toContain('CV012408S-C0102');
    // The measured 404 on this build is carried, not hidden.
    expect(b.deviceLogs.sequence[1].note).toMatch(/404/);
  });
});

describe('absent sections', () => {
  it('says WHY a section is missing instead of dropping it silently', () => {
    const { assessment, checks } = rmaCase({ reboots: reconstructReboots([]) });
    const b = buildRmaBundle({
      assessment, checks, apRow: AP, state: STATE,
      rebootHistory: reconstructReboots([]), peers: [],
    });
    const reasons = Object.fromEntries(b.missingSections.map((m) => [m.section, m.reason]));
    expect(reasons.uptimeAndRestarts).toMatch(/no stored uptime samples/i);
    expect(reasons.peerComparison).toMatch(/No comparable APs/i);
    expect(reasons.upstream).toMatch(/LLDP/i);
    expect(b.instruction).toMatch(/do not present them as clean/i);
  });

  it('the summary renders the missing sections too', () => {
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP, peers: [] });
    expect(renderBundleSummary(b)).toMatch(/Not collected:/);
  });
});

describe('an empty result is not a missing section', () => {
  it('files an empty-but-successful alarm read as COLLECTED', () => {
    // Measured live: "No device events recorded in the window" was appearing
    // under missingSections beside things that genuinely failed — the exact
    // observed/unknown conflation this feature exists to correct.
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP, state: STATE, alarms: [] });
    expect(b.collectedSections).toContain('events');
    expect(b.missingSections.map((m) => m.section)).not.toContain('events');
  });

  it('still files an alarm read that did not happen as MISSING', () => {
    const { assessment, checks } = rmaCase();
    const b = buildRmaBundle({ assessment, checks, apRow: AP, state: STATE, alarms: null });
    expect(b.missingSections.map((m) => m.section)).toContain('events');
  });
});
