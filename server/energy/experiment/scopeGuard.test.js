import { describe, it, expect } from 'vitest';
import {
  assertTargetAllowed,
  partitionTargets,
  assertActionPermitted,
  REFUSAL,
} from './scopeGuard.js';

const SOURCE = 'src-1';

function experiment(overrides = {}) {
  return {
    id: 'exp-1',
    monitored_source_id: SOURCE,
    state: 'baseline_established',
    treatment_site_name: 'EAL-PT-N',
    control_site_name: 'EAL-PT-S',
    ...overrides,
  };
}

const ALLOWLIST = [
  { apSerial: 'N1', side: 'treatment', siteId: 'treatment-id', siteName: 'EAL-PT-N' },
  { apSerial: 'N2', side: 'treatment', siteId: 'treatment-id', siteName: 'EAL-PT-N' },
  { apSerial: 'S1', side: 'control', siteId: 'control-id', siteName: 'EAL-PT-S' },
];

const liveAp = (overrides = {}) => ({
  serialNumber: 'N1',
  hostSite: 'EAL-PT-N',
  status: 'InService',
  platformName: 'AP5020',
  hardwareType: 'AP5020-WW',
  ...overrides,
});

describe('assertTargetAllowed', () => {
  it('allows a treatment AP that is still in the treatment site and in service', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp(),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.device.side).toBe('treatment');
  });

  it('refuses the control side outright', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'S1',
      liveAp: liveAp({ serialNumber: 'S1', hostSite: 'EAL-PT-S' }),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(REFUSAL.WRONG_SIDE);
  });

  it('refuses an AP that was never enrolled', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'PROD-AP-99',
      liveAp: liveAp({ serialNumber: 'PROD-AP-99' }),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(REFUSAL.NOT_ALLOWLISTED);
  });

  it('refuses when the AP has been moved to another site since enrollment', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ hostSite: 'PrimarySite' }),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(REFUSAL.SITE_MOVED);
  });

  it('refuses when the AP is absent from the live controller inventory', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: null,
      sourceId: SOURCE,
    });
    expect(verdict.reason).toBe(REFUSAL.AP_UNKNOWN_TO_CONTROLLER);
  });

  it('refuses a model whose behaviour under this action has not been verified', () => {
    // The AP4020X reported the radio disabled while still transmitting, then
    // went critical and left the network.
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ platformName: 'AP4020X', hardwareType: 'AP4020X-WW' }),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(REFUSAL.MODEL_NOT_VERIFIED);
  });

  it('refuses an unknown model rather than assuming it is safe', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ platformName: 'AP9999', hardwareType: 'AP9999-WW' }),
      sourceId: SOURCE,
    });
    expect(verdict.reason).toBe(REFUSAL.MODEL_NOT_VERIFIED);
  });

  it('still permits a RESTORE on an unverified model — it may already be changed', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment({ state: 'error' }),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ platformName: 'AP4020X', status: 'critical' }),
      sourceId: SOURCE,
      intent: 'restore',
    });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses a write to an offline AP because it could not be verified', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ status: 'Unknown' }),
      sourceId: SOURCE,
    });
    expect(verdict.reason).toBe(REFUSAL.AP_OFFLINE);
  });

  it('still permits a RESTORE to an offline AP', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment({ state: 'error' }),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ status: 'Unknown' }),
      sourceId: SOURCE,
      intent: 'restore',
    });
    expect(verdict.allowed).toBe(true);
  });

  it('refuses an apply from a state where no change is legitimate', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment({ state: 'complete' }),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp(),
      sourceId: SOURCE,
    });
    expect(verdict.reason).toBe(REFUSAL.EXPERIMENT_STATE);
  });

  it('refuses when the caller is acting for a different controller', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp(),
      sourceId: 'some-other-source',
    });
    expect(verdict.reason).toBe(REFUSAL.SOURCE_MISMATCH);
  });

  it('does not trust a site name the AP does not report', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp({ hostSite: null }),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(false);
  });
});

describe('partitionTargets', () => {
  it('separates writable targets from refusals without shrinking silently', () => {
    const { allowed, refused } = partitionTargets({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serials: ['N1', 'N2', 'S1'],
      liveAps: [
        liveAp({ serialNumber: 'N1' }),
        liveAp({ serialNumber: 'N2', hostSite: 'PrimarySite' }),
        liveAp({ serialNumber: 'S1', hostSite: 'EAL-PT-S' }),
      ],
      sourceId: SOURCE,
      intent: 'apply',
    });
    expect(allowed.map((a) => a.serial)).toEqual(['N1']);
    expect(refused).toHaveLength(2);
    expect(refused.map((r) => r.reason).sort()).toEqual(
      [REFUSAL.SITE_MOVED, REFUSAL.WRONG_SIDE].sort()
    );
  });
});

describe('assertActionPermitted', () => {
  it('permits disableRadios with valid indexes', () => {
    expect(assertActionPermitted({ kind: 'disableRadios', radioIndexes: [3] }).allowed).toBe(true);
  });

  it('refuses reduceTxPower because this controller silently ignores it', () => {
    const verdict = assertActionPermitted({ kind: 'reduceTxPower', reducePercent: 20 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe(REFUSAL.ACTION_NOT_PERMITTED);
  });

  it('refuses an empty or malformed radio list', () => {
    expect(assertActionPermitted({ kind: 'disableRadios', radioIndexes: [] }).allowed).toBe(false);
    expect(assertActionPermitted({ kind: 'disableRadios', radioIndexes: [0] }).allowed).toBe(false);
    expect(assertActionPermitted({ kind: 'disableRadios', radioIndexes: ['3'] }).allowed).toBe(false);
    expect(assertActionPermitted(null).allowed).toBe(false);
  });
});
