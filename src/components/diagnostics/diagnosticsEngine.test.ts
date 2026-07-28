import { describe, it, expect } from 'vitest';
import type { AaaPolicy, ApDetail, ApProfile } from '../../types/configure';
import {
  buildNetworkHealth,
  checkAfcPowerReduction,
  checkConfigOverrides,
  checkEnforcePki,
  checkFallbackChannel,
  checkRecommendedVersion,
  collectRadiusServers,
  overallSeverity,
  runDiagnostics,
} from './diagnosticsEngine';

/** Minimal 6 GHz radio, overridable per test. */
function radio6(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    radioIndex: 3,
    mode: 'ax6be',
    pwrMode6: 'SP_WITH_LPI_FALLBACK',
    txMaxPower: 30,
    txPower: 30,
    fallbackChannels: [],
    useSmartRf: false,
    afc: true,
    ...overrides,
  };
}

/** Minimal AP with a single 6 GHz radio, overridable per test. */
function makeAp(
  name: string,
  radioOverrides: Record<string, unknown> = {},
  apOverrides: Record<string, unknown> = {}
): ApDetail {
  return {
    serialNumber: `SN-${name}`,
    apName: name,
    hardwareType: 'AP5010',
    softwareVersion: '10.18.02',
    radios: [radio6(radioOverrides)],
    meshpoints: [],
    pollTimeout: 120,
    ...apOverrides,
  } as unknown as ApDetail;
}

describe('checkAfcPowerReduction', () => {
  it('fires alert for SP 6 GHz radios capped 3–6 dBm below max', () => {
    const aps = [
      makeAp('capped', { txMaxPower: 30, txPower: 26 }), // gap 4 -> fires
      makeAp('uncapped', { txMaxPower: 30, txPower: 30 }), // gap 0 -> no
      makeAp('overcapped', { txMaxPower: 30, txPower: 20 }), // gap 10 -> no
    ];
    const check = checkAfcPowerReduction(aps);
    expect(check.severity).toBe('alert');
    expect(check.affected).toEqual(['capped']);
  });

  it('is ok when no SP radio is power-reduced, and ignores LPI radios', () => {
    const aps = [
      makeAp('lpiCapped', { pwrMode6: 'LPI', txMaxPower: 30, txPower: 26 }), // LPI -> ignored
      makeAp('spFull', { txMaxPower: 30, txPower: 30 }),
    ];
    const check = checkAfcPowerReduction(aps);
    expect(check.severity).toBe('ok');
    expect(check.affected).toHaveLength(0);
  });
});

describe('checkConfigOverrides', () => {
  it('flags APs with an AP-level or radio-level *Ovr flag set', () => {
    const aps = [
      makeAp('apOvr', {}, { mtuOvr: true }), // AP-level override
      makeAp('radioOvr', { pwrMode6Ovr: true }), // radio-level override
      makeAp('clean', {}, { mtuOvr: false }), // none
    ];
    const check = checkConfigOverrides(aps);
    expect(check.severity).toBe('warn');
    expect(check.affected.sort()).toEqual(['apOvr', 'radioOvr']);
  });
});

describe('checkFallbackChannel', () => {
  it('warns when an SP 6 GHz radio has a fixed fallback channel', () => {
    const aps = [
      makeAp('fixedFb', { fallbackChannels: ['49e'] }),
      makeAp('noFb', { fallbackChannels: [] }),
    ];
    const check = checkFallbackChannel(aps);
    expect(check.severity).toBe('warn');
    expect(check.affected).toEqual(['fixedFb']);
  });
});

describe('checkRecommendedVersion', () => {
  it('flags APs off the fleet-modal software version', () => {
    const aps = [
      makeAp('a', {}, { softwareVersion: '10.18.02' }),
      makeAp('b', {}, { softwareVersion: '10.18.02' }),
      makeAp('c', {}, { softwareVersion: '10.17.01' }),
    ];
    const check = checkRecommendedVersion(aps);
    expect(check.severity).toBe('warn');
    expect(check.affected).toEqual(['c']);
  });
});

describe('checkEnforcePki', () => {
  it('warns for profiles with enforcePkiAuth === false', () => {
    const profiles = [
      { id: 'p1', name: 'Corp', enforcePkiAuth: false },
      { id: 'p2', name: 'Guest', enforcePkiAuth: true },
    ] as unknown as ApProfile[];
    const check = checkEnforcePki(profiles);
    expect(check.severity).toBe('warn');
    expect(check.affected).toEqual(['Corp']);
  });
});

describe('buildNetworkHealth', () => {
  it('counts InService APs as active and the rest as inactive', () => {
    const health = buildNetworkHealth(
      [
        { status: 'InService' },
        { status: 'InService' },
        { status: 'Critical' },
        { status: undefined },
      ],
      []
    );
    expect(health.totalAps).toBe(4);
    expect(health.activeAps).toBe(2);
    expect(health.inactiveAps).toBe(2);
    expect(health.apStatusBreakdown.InService).toBe(2);
    expect(health.totalSwitches).toBe(0);
  });
});

describe('collectRadiusServers', () => {
  it('flattens auth + accounting servers across policies', () => {
    const policies = [
      {
        id: 'a1',
        name: 'Default',
        authenticationRadiusServers: [{ ipAddress: '10.0.0.1', port: 1812, serverType: 'Standard', timeout: 5, totalRetries: 3 }],
        accountingRadiusServers: [{ ipAddress: '10.0.0.2', port: 1813, serverType: 'Standard', timeout: 5, totalRetries: 3 }],
      },
    ] as unknown as AaaPolicy[];
    const rows = collectRadiusServers(policies);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.role)).toEqual(['Authentication', 'Accounting']);
  });
});

describe('runDiagnostics', () => {
  it('produces both categories and rolls up worst severity', () => {
    const aps = [makeAp('capped', { txMaxPower: 30, txPower: 26 })];
    const result = runDiagnostics({ aps, apStatus: [{ status: 'InService' }], switches: [], profiles: [], aaaPolicies: [] });
    expect(result.checks.some((c) => c.category === 'configuration')).toBe(true);
    expect(result.checks.some((c) => c.category === 'operational')).toBe(true);
    expect(overallSeverity(result.checks)).toBe('alert');
    // Runtime rows never count toward the severity rollup.
    const runtime = result.checks.filter((c) => c.runtime);
    expect(runtime.length).toBeGreaterThan(0);
  });
});
