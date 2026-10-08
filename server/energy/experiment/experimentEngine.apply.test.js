/**
 * activateOptimization must report what it actually did, and must not claim an
 * active optimization when no AP was changed. restoreTreatment must include APs
 * whose apply outcome is unknown.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./experimentRepository.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // Keep the pure helpers real; replace everything that touches Postgres.
    APPLY_PENDING_MARKER: actual.APPLY_PENDING_MARKER,
    needsRestore: actual.needsRestore,
    getExperiment: vi.fn(),
    updateExperiment: vi.fn(),
    insertEvent: vi.fn(async () => ({})),
    listDevices: vi.fn(),
    captureRollback: vi.fn(async () => undefined),
    recordApplyResult: vi.fn(async () => undefined),
    recordRestoreResult: vi.fn(async () => undefined),
    listRollback: vi.fn(),
  };
});

vi.mock('./radioActuator.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    applyRadioChange: vi.fn(),
    restoreRadioState: vi.fn(),
  };
});

const repo = await import('./experimentRepository.js');
const actuator = await import('./radioActuator.js');
const { activateOptimization, restoreTreatment } = await import('./experimentEngine.js');

const SOURCE = { id: 'src-1' };
const EXPERIMENT = {
  id: 'exp-1',
  monitored_source_id: 'src-1',
  state: 'baseline_established',
  trigger_source: null,
  treatment_site_id: 'site-T',
  control_site_id: 'site-C',
  action: { kind: 'disableRadios', radioIndexes: [3], requireZeroClients: true },
};
const DEVICES = [
  { side: 'treatment', apSerial: 'SN1', siteId: 'site-T', model: 'AP5020' },
  { side: 'treatment', apSerial: 'SN2', siteId: 'site-T', model: 'AP5020' },
  { side: 'control', apSerial: 'SN9', siteId: 'site-C', model: 'AP5020' },
];
const liveAp = (serial, clients = 0) => ({
  serialNumber: serial,
  hostSite: 'Treatment',
  siteId: 'site-T',
  platformName: 'AP5020',
  status: 'InService',
  radios: [{ radioIndex: 3, clients, txPower: 20 }],
});

function session(aps) {
  return { get: vi.fn(async () => ({ ok: true, data: aps })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getExperiment.mockResolvedValue({ ...EXPERIMENT });
  repo.updateExperiment.mockImplementation(async (_id, patch) => ({ ...EXPERIMENT, ...patch }));
  repo.listDevices.mockResolvedValue(DEVICES);
});

describe('activateOptimization outcome reporting', () => {
  it('returns ok:false and stays out of optimization_active when zero APs were applied', async () => {
    // Both Treatment radios carry clients, so the guard skips both.
    const result = await activateOptimization({
      source: SOURCE,
      session: session([liveAp('SN1', 2), liveAp('SN2', 1)]),
      experimentId: 'exp-1',
      triggerSource: 'manual',
    });

    expect(result.ok).toBe(false);
    expect(result.appliedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.skipped.map((s) => s.reason)).toEqual(['clients_present', 'clients_present']);
    expect(result.error).toMatch(/0\/2 applied/);
    expect(actuator.applyRadioChange).not.toHaveBeenCalled();

    const states = repo.updateExperiment.mock.calls.map(([, patch]) => patch.state);
    expect(states).not.toContain('optimization_active');
    // Put back exactly where it was.
    expect(states.at(-1)).toBe('baseline_established');
    expect(repo.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'optimization_not_applied' })
    );
  });

  it('counts an already-disabled radio as skipped, not applied', async () => {
    actuator.applyRadioChange.mockResolvedValue({ ok: true, verified: true, noop: true, intended: [] });
    const result = await activateOptimization({
      source: SOURCE,
      session: session([liveAp('SN1'), liveAp('SN2')]),
      experimentId: 'exp-1',
      triggerSource: 'manual',
    });
    expect(result.ok).toBe(false);
    expect(result.skipped.every((s) => s.reason === 'already_in_target_state')).toBe(true);
  });

  it('reports applied, skipped and failed counts with reasons when some APs change', async () => {
    actuator.applyRadioChange
      .mockResolvedValueOnce({ ok: true, verified: true, configVerified: true, effective: true, intended: [] })
      .mockResolvedValueOnce({ ok: false, verified: false, stage: 'write', error: 'HTTP 500' });

    const result = await activateOptimization({
      source: SOURCE,
      session: session([liveAp('SN1'), liveAp('SN2')]),
      experimentId: 'exp-1',
      triggerSource: 'manual',
    });

    expect(result.ok).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.failed[0]).toMatchObject({ serial: 'SN2', reason: 'write_failed', detail: 'HTTP 500' });
    expect(result.targetCount).toBe(2);
    const states = repo.updateExperiment.mock.calls.map(([, patch]) => patch.state);
    expect(states.at(-1)).toBe('optimization_active');
  });

  it('records the rollback (with its applying marker) before the write', async () => {
    actuator.applyRadioChange.mockImplementation(async ({ persistRollback }) => {
      await persistRollback({ serial: 'SN1', original: { capturedRadios: [] }, intended: [] });
      return { ok: true, verified: true, effective: true, intended: [] };
    });
    await activateOptimization({
      source: SOURCE,
      session: session([liveAp('SN1'), liveAp('SN2')]),
      experimentId: 'exp-1',
      triggerSource: 'manual',
    });
    expect(repo.captureRollback).toHaveBeenCalled();
    const captureOrder = repo.captureRollback.mock.invocationCallOrder[0];
    const recordOrder = repo.recordApplyResult.mock.invocationCallOrder[0];
    expect(captureOrder).toBeLessThan(recordOrder);
  });

  it('still activates in simulation mode with no writes', async () => {
    const result = await activateOptimization({
      source: SOURCE,
      session: session([liveAp('SN1'), liveAp('SN2')]),
      experimentId: 'exp-1',
      triggerSource: 'manual',
      applyWrites: false,
    });
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.appliedCount).toBe(0);
  });
});

describe('restoreTreatment includes apply-pending APs', () => {
  it('restores a row whose write was issued but whose result was never recorded', async () => {
    repo.getExperiment.mockResolvedValue({ ...EXPERIMENT, state: 'optimization_active', treatment_start: '2026-10-01T00:00:00Z' });
    repo.listRollback.mockResolvedValue([
      // Process died between PUT and recordApplyResult.
      { apSerial: 'SN1', appliedAt: null, applyPending: true, restoreVerified: false, original: { capturedRadios: [] } },
      // Captured, never written, already restored — nothing to do.
      { apSerial: 'SN2', appliedAt: '2026-10-01T00:00:00Z', applyPending: false, restoreVerified: true, original: {} },
    ]);
    actuator.restoreRadioState.mockResolvedValue({ ok: true, verified: true, noop: true, intended: [] });

    const result = await restoreTreatment({
      source: SOURCE,
      session: session([liveAp('SN1'), liveAp('SN2')]),
      experimentId: 'exp-1',
    });

    expect(actuator.restoreRadioState).toHaveBeenCalledTimes(1);
    expect(actuator.restoreRadioState).toHaveBeenCalledWith(expect.objectContaining({ serial: 'SN1' }));
    expect(result.ok).toBe(true);
    expect(result.restored).toEqual(['SN1']);
  });

  it('is idempotent: a second restore with everything verified writes nothing', async () => {
    repo.getExperiment.mockResolvedValue({ ...EXPERIMENT, state: 'complete', treatment_start: '2026-10-01T00:00:00Z' });
    repo.listRollback.mockResolvedValue([
      { apSerial: 'SN1', appliedAt: null, applyPending: true, restoreVerified: true, original: {} },
    ]);
    const result = await restoreTreatment({
      source: SOURCE,
      session: session([]),
      experimentId: 'exp-1',
    });
    expect(result.ok).toBe(true);
    expect(actuator.restoreRadioState).not.toHaveBeenCalled();
  });
});
