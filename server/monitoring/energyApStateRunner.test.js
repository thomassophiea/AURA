import { describe, it, expect, vi } from 'vitest';
import { runEnergyApStateTick } from './energyApStateRunner.js';

const CONFIG = {
  retentionDays: 7,
  requestTimeoutSeconds: 15,
  credentialKey: null,
  energyApStateIntervalSeconds: 60,
};

const SOURCE = { id: 'src-1', baseUrl: 'https://c', orgId: null, siteGroupId: null };

function deps(overrides = {}) {
  return {
    listSourcesFn: vi.fn(async () => [SOURCE]),
    sessionFn: vi.fn(async () => ({ get: vi.fn() })),
    collectFn: vi.fn(async () => ({ samples: [{ a: 1 }, { a: 2 }], notes: [], fatal: null })),
    insertSamplesFn: vi.fn(async () => ({ inserted: 2, updated: 0, received: 2 })),
    upsertCurrentStateFn: vi.fn(async () => undefined),
    startRunFn: vi.fn(async () => ({ id: 'run-1' })),
    finishRunFn: vi.fn(async () => undefined),
    withLockFn: vi.fn(async (_key, fn) => ({ acquired: true, result: await fn() })),
    ...overrides,
  };
}

describe('runEnergyApStateTick', () => {
  it('persists samples and closes the run as succeeded', async () => {
    const d = deps();
    const result = await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(result).toMatchObject({ sources: 1, inserted: 2, failed: 0, skipped: 0 });
    expect(d.insertSamplesFn).toHaveBeenCalledWith([{ a: 1 }, { a: 2 }], { runId: 'run-1' });
    expect(d.finishRunFn.mock.calls[0][1].status).toBe('succeeded');
  });

  it('takes an advisory lock per source so replicas cannot double-ingest', async () => {
    const d = deps();
    await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(d.withLockFn.mock.calls[0][0]).toBe('aura:energy_ap_state:src-1');
  });

  it('records a skip, not a failure, when another instance holds the lock', async () => {
    const d = deps({ withLockFn: vi.fn(async () => ({ acquired: false })) });
    const result = await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(d.insertSamplesFn).not.toHaveBeenCalled();
  });

  it('writes nothing when the controller call fails — a gap, not a zero', async () => {
    const d = deps({
      collectFn: vi.fn(async () => ({
        samples: [],
        notes: [],
        fatal: { errorClass: 'upstream_server_error', summary: 'HTTP 500', status: 500 },
      })),
    });
    const result = await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(result.failed).toBe(1);
    expect(d.insertSamplesFn).not.toHaveBeenCalled();
    expect(d.finishRunFn.mock.calls[0][1].status).toBe('failed');
  });

  it('skips a source with no credentials instead of throwing', async () => {
    const d = deps({ sessionFn: vi.fn(async () => null) });
    const result = await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(result.skipped).toBe(1);
    expect(d.startRunFn).not.toHaveBeenCalled();
  });

  it('survives a collector that throws and records it', async () => {
    const d = deps({
      collectFn: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const result = await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(result.failed).toBe(1);
    expect(d.finishRunFn.mock.calls[0][1].status).toBe('failed');
  });

  it('does not touch current state when a tick produced no samples', async () => {
    const d = deps({ collectFn: vi.fn(async () => ({ samples: [], notes: [], fatal: null })) });
    await runEnergyApStateTick({ config: CONFIG, deps: d });
    expect(d.upsertCurrentStateFn).not.toHaveBeenCalled();
    expect(d.finishRunFn.mock.calls[0][1].status).toBe('succeeded');
  });
});
