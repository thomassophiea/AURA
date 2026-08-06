import { describe, it, expect, vi } from 'vitest';

import { runRetentionCleanup, CLEANUP_LOCK_KEY } from './retention.js';
import { loadMonitoringConfig } from './config.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const CONFIG = loadMonitoringConfig({ DATABASE_URL: 'postgres://localhost/aura' });

function makeDeps(overrides = {}) {
  return {
    withLockFn: async (_key, fn) => ({ acquired: true, result: await fn() }),
    deleteExpiredSamplesFn: vi.fn(async () => ({ deleted: 42, batches: 1 })),
    deleteOldCollectionRunsFn: vi.fn(async () => ({ deleted: 3 })),
    deleteOrphanedCurrentStateFn: vi.fn(async () => ({ deleted: 0 })),
    ...overrides,
  };
}

describe('runRetentionCleanup', () => {
  it('deletes expired samples and reports the count', async () => {
    const result = await runRetentionCleanup({ config: CONFIG, now: NOW, deps: makeDeps() });
    expect(result).toMatchObject({ ran: true, samplesDeleted: 42, runsDeleted: 3 });
  });

  it('does nothing when cleanup is disabled, without deleting anything', async () => {
    const deps = makeDeps();
    const config = loadMonitoringConfig({
      DATABASE_URL: 'postgres://localhost/aura',
      MONITORING_CLEANUP_ENABLED: 'false',
    });
    const result = await runRetentionCleanup({ config, now: NOW, deps });

    expect(result).toEqual({ ran: false, reason: 'disabled' });
    expect(deps.deleteExpiredSamplesFn).not.toHaveBeenCalled();
  });

  it('serializes behind an advisory lock so two cleanups cannot overlap', async () => {
    const withLockFn = vi.fn(async (_key, fn) => ({ acquired: true, result: await fn() }));
    await runRetentionCleanup({ config: CONFIG, now: NOW, deps: makeDeps({ withLockFn }) });
    expect(withLockFn.mock.calls[0][0]).toBe(CLEANUP_LOCK_KEY);
  });

  it('exits cleanly when another instance already holds the lock', async () => {
    const deps = makeDeps({ withLockFn: async () => ({ acquired: false, result: undefined }) });
    const result = await runRetentionCleanup({ config: CONFIG, now: NOW, deps });

    expect(result).toEqual({ ran: false, reason: 'locked' });
    expect(deps.deleteExpiredSamplesFn).not.toHaveBeenCalled();
  });

  it('is idempotent — a second pass finding nothing is a success, not an error', async () => {
    const deps = makeDeps({ deleteExpiredSamplesFn: vi.fn(async () => ({ deleted: 0, batches: 1 })) });
    const result = await runRetentionCleanup({ config: CONFIG, now: NOW, deps });
    expect(result).toMatchObject({ ran: true, samplesDeleted: 0 });
  });

  it('passes the configured batch size through', async () => {
    const deps = makeDeps();
    const config = loadMonitoringConfig({
      DATABASE_URL: 'postgres://localhost/aura',
      MONITORING_CLEANUP_BATCH_SIZE: '500',
    });
    await runRetentionCleanup({ config, now: NOW, deps });
    expect(deps.deleteExpiredSamplesFn).toHaveBeenCalledWith({ now: NOW, batchSize: 500 });
  });

  it('keeps run diagnostics longer than samples', async () => {
    const deps = makeDeps();
    await runRetentionCleanup({ config: CONFIG, now: NOW, deps });
    const { olderThan } = deps.deleteOldCollectionRunsFn.mock.calls[0][0];
    const days = (NOW.getTime() - olderThan.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(14); // 7-day retention x2
  });

  it('never prunes current state by expiry — only orphans', async () => {
    const deps = makeDeps();
    await runRetentionCleanup({ config: CONFIG, now: NOW, deps });
    expect(deps.deleteOrphanedCurrentStateFn).toHaveBeenCalledTimes(1);
    expect(deps.deleteOrphanedCurrentStateFn).toHaveBeenCalledWith();
  });

  it('propagates a database failure rather than reporting a clean sweep', async () => {
    const deps = makeDeps({
      deleteExpiredSamplesFn: vi.fn(async () => {
        throw new Error('connection terminated');
      }),
    });
    await expect(runRetentionCleanup({ config: CONFIG, now: NOW, deps })).rejects.toThrow(
      /connection terminated/
    );
  });
});
