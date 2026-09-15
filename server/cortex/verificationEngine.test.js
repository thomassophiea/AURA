import { describe, it, expect } from 'vitest';
import {
  STAGE,
  RESULT,
  AP_SETTLE_MS,
  assessVerification,
  hasSettled,
  describeVerification,
} from './verificationEngine.js';
import { RECONCILE } from './stateReconciler.js';

const accepted = { ok: true, status: 201 };
const alignedReconciliation = { verdict: RECONCILE.ALIGNED, rows: [], unverifiable: [] };
const carrying = { carrying: true, apsChecked: 3, settled: true };

const at = (stages, name) => stages.find((s) => s.stage === name);

describe('assessVerification', () => {
  it('a 201 alone proves only that the request was received', () => {
    const r = assessVerification({ acceptance: accepted });
    expect(at(r.stages, STAGE.REQUEST_ACCEPTED).result).toBe(RESULT.PASS);
    expect(at(r.stages, STAGE.REQUEST_ACCEPTED).detail).toMatch(/nothing more/);
    // And the overall verdict must not be a success.
    expect(r.verdict).toBe('incomplete');
    expect(r.summary).toMatch(/NOT a success/);
  });

  it('catches the signature failure: config reads back, no AP carries it', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: { carrying: false, apsChecked: 4, settled: true },
    });
    expect(r.verdict).toBe('failed');
    expect(r.stoppedAt).toBe(STAGE.DEVICE_RECEIVED);
    expect(at(r.stages, STAGE.DEVICE_RECEIVED).detail).toMatch(/silently dropped/);
    expect(at(r.stages, STAGE.DEVICE_RECEIVED).detail).toMatch(/index 0/);
    expect(r.rollbackRecommended).toBe(true);
  });

  it('does not call an unsettled AP read a failure', () => {
    // An AP takes ~30 s to pull config; reading back instantly reports a false
    // failure, which is the most common verification mistake.
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: { carrying: false, apsChecked: 4, settled: false },
    });
    expect(at(r.stages, STAGE.DEVICE_RECEIVED).result).toBe(RESULT.PENDING);
    expect(r.verdict).toBe('pending');
    expect(r.rollbackRecommended).toBe(false);
  });

  it('reports unverifiable as unverifiable, never as a pass', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: { verdict: RECONCILE.UNKNOWN, rows: [], unverifiable: ['security'] },
    });
    expect(at(r.stages, STAGE.CONFIGURATION_DEPLOYED).result).toBe(RESULT.UNVERIFIABLE);
    expect(r.verdict).toBe('unverifiable');
    expect(r.summary).toMatch(/must not be reported as working/);
  });

  it('fails at operational state when running differs from configured', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: {
        verdict: RECONCILE.NOT_APPLIED,
        rows: [{ attribute: 'vlan', verdict: RECONCILE.NOT_APPLIED }],
        unverifiable: [],
      },
      deviceState: carrying,
    });
    // Rung 2 already fails? No: NOT_APPLIED means the config is right, so
    // deployment passed and the break is at operational state.
    expect(at(r.stages, STAGE.CONFIGURATION_DEPLOYED).result).toBe(RESULT.PASS);
    expect(at(r.stages, STAGE.OPERATIONAL_STATE).result).toBe(RESULT.FAIL);
    expect(at(r.stages, STAGE.OPERATIONAL_STATE).detail).toMatch(/vlan/);
  });

  it('fails at deployment when the value never changed', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: { verdict: RECONCILE.CONFIG_DRIFT, rows: [], unverifiable: [] },
    });
    expect(at(r.stages, STAGE.CONFIGURATION_DEPLOYED).result).toBe(RESULT.FAIL);
    expect(r.stoppedAt).toBe(STAGE.CONFIGURATION_DEPLOYED);
    // A write that did not land is not a rollback candidate — there is nothing
    // to roll back.
    expect(r.rollbackRecommended).toBe(false);
  });

  it('verifies end to end when users actually improve', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: carrying,
      impactBefore: { affected: 42, total: 60, unit: 'clients' },
      impactAfter: { affected: 0, total: 60, unit: 'clients' },
      subject: 'WLAN Staff on VLAN 30',
    });
    expect(r.verdict).toBe('verified');
    expect(r.stoppedAt).toBeNull();
    expect(r.summary).toMatch(/verified all the way to user experience/);
  });

  it('flags a partial improvement rather than claiming resolution', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: carrying,
      impactBefore: { affected: 42, total: 60, unit: 'clients' },
      impactAfter: { affected: 9, total: 60, unit: 'clients' },
    });
    expect(r.verdict).toBe('verified');
    expect(at(r.stages, STAGE.USER_EXPERIENCE).note).toMatch(/9 still affected/);
  });

  it('recommends rollback when the change made things worse', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: carrying,
      impactBefore: { affected: 10, total: 60, unit: 'clients' },
      impactAfter: { affected: 25, total: 60, unit: 'clients' },
    });
    expect(r.verdict).toBe('failed');
    expect(r.rollbackRecommended).toBe(true);
    expect(at(r.stages, STAGE.USER_EXPERIENCE).detail).toMatch(/ROSE from 10 to 25/);
  });

  it('says the diagnosis is wrong when the change landed and nothing moved', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: alignedReconciliation,
      deviceState: carrying,
      impactBefore: { affected: 12, total: 60, unit: 'clients' },
      impactAfter: { affected: 12, total: 60, unit: 'clients' },
    });
    expect(at(r.stages, STAGE.USER_EXPERIENCE).detail).toMatch(
      /the diagnosis, not the change, is what needs revisiting/
    );
  });

  it('a rejected write stops the ladder at the first rung', () => {
    const r = assessVerification({ acceptance: { ok: false, error: '400 invalid radio index' } });
    expect(r.verdict).toBe('failed');
    expect(r.stoppedAt).toBe(STAGE.REQUEST_ACCEPTED);
    expect(r.reachedStage).toBeNull();
  });

  it('claims nothing below the rung that stopped it', () => {
    const r = assessVerification({
      acceptance: accepted,
      reconciliation: { verdict: RECONCILE.CONFIG_DRIFT, rows: [], unverifiable: [] },
      deviceState: carrying,
      impactBefore: { affected: 10, total: 60, unit: 'clients' },
      impactAfter: { affected: 0, total: 60, unit: 'clients' },
    });
    // Later rungs may look good; the verdict is still the first failure.
    expect(r.verdict).toBe('failed');
    expect(r.stoppedAt).toBe(STAGE.CONFIGURATION_DEPLOYED);
  });
});

describe('hasSettled', () => {
  it('is false immediately after the write', () => {
    const now = Date.now();
    expect(hasSettled(now, now)).toBe(false);
  });

  it('is true once the AP config pull window has elapsed', () => {
    const now = Date.now();
    expect(hasSettled(now - AP_SETTLE_MS - 1, now)).toBe(true);
  });

  it('is false for a missing timestamp rather than assuming settled', () => {
    expect(hasSettled(undefined)).toBe(false);
  });
});

describe('describeVerification', () => {
  it('reports CONTIGUOUS depth, not a count of scattered passes', () => {
    // Rung 4 reads the reconciliation and can pass on its own terms while
    // rung 3 was never run. Counting it would claim the hardware agrees when
    // nothing asked it.
    const r = assessVerification({ acceptance: accepted, reconciliation: alignedReconciliation });
    expect(r.provenDepth).toBe(2);
    expect(r.reachedStage).toBe(STAGE.CONFIGURATION_DEPLOYED);
    expect(describeVerification(r)).toMatch(/Proven through 2 of 5 verification stages/);
  });

  it('is explicit when nothing was executed', () => {
    expect(describeVerification(null)).toMatch(/nothing to verify/);
  });
});
