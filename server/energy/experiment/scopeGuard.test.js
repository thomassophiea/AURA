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
    north_site_name: 'EAL-PT-N',
    south_site_name: 'EAL-PT-S',
    ...overrides,
  };
}

const ALLOWLIST = [
  { apSerial: 'N1', side: 'north', siteId: 'north-id', siteName: 'EAL-PT-N' },
  { apSerial: 'N2', side: 'north', siteId: 'north-id', siteName: 'EAL-PT-N' },
  { apSerial: 'S1', side: 'south', siteId: 'south-id', siteName: 'EAL-PT-S' },
];

const liveAp = (overrides = {}) => ({
  serialNumber: 'N1',
  hostSite: 'EAL-PT-N',
  status: 'InService',
  ...overrides,
});

describe('assertTargetAllowed', () => {
  it('allows a north AP that is still in the north site and in service', () => {
    const verdict = assertTargetAllowed({
      experiment: experiment(),
      allowlist: ALLOWLIST,
      serial: 'N1',
      liveAp: liveAp(),
      sourceId: SOURCE,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.device.side).toBe('north');
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
