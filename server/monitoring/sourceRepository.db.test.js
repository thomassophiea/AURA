/**
 * Database integration tests for source registration, health, credentials,
 * collection runs, and cursors.
 *
 * Requires a real PostgreSQL via TEST_DATABASE_URL. Skips loudly otherwise.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';

import {
  hasTestDatabase,
  SKIP_REASON,
  setupTestDatabase,
  teardownTestDatabase,
  truncateMonitoringTables,
} from './testSupport/dbHarness.js';
import {
  upsertSource,
  listSources,
  getSourceByBaseUrl,
  setSourceEnabled,
  mergeCapabilities,
  recordAttempt,
  recordSuccess,
  recordFailure,
  getSourceById,
  setSourceCredentials,
  getSourceCredentials,
  hasSourceCredentials,
  startRun,
  finishRun,
  recordSkippedRun,
  listRecentRuns,
  getCursor,
  advanceCursor,
  normalizeBaseUrl,
} from './sourceRepository.js';
import { withAdvisoryLock, query } from '../db/pool.js';

const KEY = crypto.randomBytes(32).toString('base64');

if (!hasTestDatabase) {
  // eslint-disable-next-line no-console
  console.warn(`[sourceRepository.db.test] SKIPPED — ${SKIP_REASON}`);
}

describe('normalizeBaseUrl', () => {
  it('strips a trailing slash and management suffix so identity is stable', () => {
    expect(normalizeBaseUrl('https://c.example.com/management/')).toBe('https://c.example.com');
    expect(normalizeBaseUrl('https://c.example.com/api/management')).toBe('https://c.example.com');
    expect(normalizeBaseUrl('https://c.example.com')).toBe('https://c.example.com');
  });

  it('returns null for no input', () => {
    expect(normalizeBaseUrl('')).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)('sourceRepository (PostgreSQL)', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await truncateMonitoringTables();
  });

  describe('upsertSource', () => {
    it('registers a source', async () => {
      const source = await upsertSource({
        baseUrl: 'https://ctrl.example.com',
        displayName: 'Lab',
        orgId: 'org-1',
      });
      expect(source).toMatchObject({
        baseUrl: 'https://ctrl.example.com',
        displayName: 'Lab',
        enabled: true,
        consecutiveFailures: 0,
      });
    });

    it('is idempotent across redeploys that re-seed the same controller', async () => {
      await upsertSource({ baseUrl: 'https://ctrl.example.com', displayName: 'Lab' });
      await upsertSource({ baseUrl: 'https://ctrl.example.com/management/', displayName: 'Lab' });
      expect(await listSources()).toHaveLength(1);
    });

    it('does not erase an existing display name with a null', async () => {
      await upsertSource({ baseUrl: 'https://ctrl.example.com', displayName: 'Lab' });
      const updated = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
      expect(updated.displayName).toBe('Lab');
    });

    it('requires a base URL', async () => {
      await expect(upsertSource({})).rejects.toThrow(/baseUrl/);
    });
  });

  describe('enable / disable', () => {
    it('disabling stops collection without deleting the source or its history', async () => {
      const source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
      await setSourceEnabled(source.id, false);

      expect(await listSources({ enabledOnly: true })).toHaveLength(0);
      expect(await listSources()).toHaveLength(1);
      expect((await getSourceById(source.id)).enabled).toBe(false);
    });

    it('re-enabling resumes collection', async () => {
      const source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
      await setSourceEnabled(source.id, false);
      await setSourceEnabled(source.id, true);
      expect(await listSources({ enabledOnly: true })).toHaveLength(1);
    });
  });

  describe('health tracking', () => {
    let source;
    beforeEach(async () => {
      source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
    });

    it('records an attempt', async () => {
      await recordAttempt(source.id, new Date('2026-08-05T12:00:00Z'));
      const updated = await getSourceById(source.id);
      expect(updated.lastAttemptAt.toISOString()).toBe('2026-08-05T12:00:00.000Z');
    });

    it('counts consecutive failures', async () => {
      await recordFailure(source.id, { errorCode: 'network', summary: 'unreachable' });
      await recordFailure(source.id, { errorCode: 'network', summary: 'unreachable' });
      expect((await getSourceById(source.id)).consecutiveFailures).toBe(2);
    });

    it('clears the failure streak and the error on recovery', async () => {
      await recordFailure(source.id, { errorCode: 'network', summary: 'unreachable' });
      await recordSuccess(source.id, new Date('2026-08-05T12:30:00Z'));

      const updated = await getSourceById(source.id);
      expect(updated.consecutiveFailures).toBe(0);
      expect(updated.lastErrorCode).toBeNull();
      expect(updated.lastErrorSummary).toBeNull();
      expect(updated.lastSuccessAt.toISOString()).toBe('2026-08-05T12:30:00.000Z');
    });

    it('keeps the last success timestamp through a later failure', async () => {
      await recordSuccess(source.id, new Date('2026-08-05T12:00:00Z'));
      await recordFailure(source.id, { errorCode: 'timeout', summary: 'no response' });

      const updated = await getSourceById(source.id);
      expect(updated.lastSuccessAt.toISOString()).toBe('2026-08-05T12:00:00.000Z');
      expect(updated.lastErrorCode).toBe('timeout');
    });

    it('merges probed capabilities without clobbering earlier ones', async () => {
      await mergeCapabilities(source.id, { durations: { '3H': true } });
      await mergeCapabilities(source.id, { apReports: false });

      const updated = await getSourceById(source.id);
      expect(updated.capabilities).toMatchObject({
        durations: { '3H': true },
        apReports: false,
      });
    });
  });

  describe('credentials', () => {
    let source;
    beforeEach(async () => {
      source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
    });

    it('round-trips an encrypted credential for the collector', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      expect(await getSourceCredentials(source.id, KEY)).toEqual({
        username: 'admin',
        password: 'hunter2',
      });
    });

    it('stores the password encrypted, never as plaintext', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      const { rows } = await query(
        'SELECT secret_ciphertext, secret_nonce FROM monitored_source_credentials'
      );
      expect(rows[0].secret_ciphertext.toString('utf8')).not.toContain('hunter2');
      expect(rows[0].secret_nonce).toBeTruthy();
    });

    it('reports credential presence without decrypting', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      expect(await hasSourceCredentials(source.id)).toEqual({
        configured: true,
        username: 'admin',
      });
    });

    it('reports no credentials before any are set', async () => {
      expect(await hasSourceCredentials(source.id)).toEqual({ configured: false, username: null });
      expect(await getSourceCredentials(source.id, KEY)).toBeNull();
    });

    it('updates the username without discarding the stored secret', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      await setSourceCredentials(source.id, { username: 'operator' }, KEY);

      expect(await getSourceCredentials(source.id, KEY)).toEqual({
        username: 'operator',
        password: 'hunter2',
      });
    });

    it('fails loudly when the key changes rather than serving a corrupt secret', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      const otherKey = crypto.randomBytes(32).toString('base64');
      await expect(getSourceCredentials(source.id, otherKey)).rejects.toThrow();
    });

    it('removes credentials when the source is deleted', async () => {
      await setSourceCredentials(source.id, { username: 'admin', password: 'hunter2' }, KEY);
      await query('DELETE FROM monitored_sources WHERE id = $1', [source.id]);
      const { rows } = await query('SELECT 1 FROM monitored_source_credentials');
      expect(rows).toHaveLength(0);
    });
  });

  describe('collection runs', () => {
    let source;
    beforeEach(async () => {
      source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
    });

    it('records a successful run with its counts', async () => {
      const run = await startRun({ sourceId: source.id, collectorName: 'sle' });
      await finishRun(run.id, {
        status: 'succeeded',
        responseStatus: 200,
        recordsReceived: 10,
        recordsInserted: 8,
        recordsUpdated: 2,
        durationMs: 431,
      });

      const [recorded] = await listRecentRuns(source.id);
      expect(recorded).toMatchObject({
        status: 'succeeded',
        recordsReceived: 10,
        recordsInserted: 8,
        recordsUpdated: 2,
        durationMs: 431,
      });
    });

    it('records a failed run with a sanitized message only', async () => {
      const run = await startRun({ sourceId: source.id, collectorName: 'sle' });
      await finishRun(run.id, {
        status: 'failed',
        errorClass: 'network',
        sanitizedErrorMessage: 'connect ECONNREFUSED',
      });

      const [recorded] = await listRecentRuns(source.id);
      expect(recorded.status).toBe('failed');
      expect(recorded.errorClass).toBe('network');
    });

    it('records a run skipped because another instance held the lock', async () => {
      await recordSkippedRun({ sourceId: source.id, collectorName: 'sle' });
      const [recorded] = await listRecentRuns(source.id);
      expect(recorded.status).toBe('skipped_due_to_lock');
    });

    it('rejects an unknown status rather than storing it', async () => {
      const run = await startRun({ sourceId: source.id, collectorName: 'sle' });
      await expect(finishRun(run.id, { status: 'weird' })).rejects.toThrow();
    });

    it('returns runs newest first', async () => {
      const first = await startRun({ sourceId: source.id, collectorName: 'a' });
      await finishRun(first.id, { status: 'succeeded' });
      const second = await startRun({ sourceId: source.id, collectorName: 'b' });
      await finishRun(second.id, { status: 'succeeded' });

      const runs = await listRecentRuns(source.id);
      expect(runs[0].collectorName).toBe('b');
    });
  });

  describe('cursors', () => {
    let source;
    beforeEach(async () => {
      source = await upsertSource({ baseUrl: 'https://ctrl.example.com' });
    });

    it('starts with no cursor', async () => {
      expect(await getCursor(source.id, 'ap_report', 'AP-1')).toBeNull();
    });

    it('persists a high-water mark per family and scope', async () => {
      await advanceCursor(source.id, 'ap_report', 'AP-1', new Date('2026-08-05T12:00:00Z'));
      await advanceCursor(source.id, 'ap_report', 'AP-2', new Date('2026-08-05T11:00:00Z'));

      expect((await getCursor(source.id, 'ap_report', 'AP-1')).lastObservedAt.toISOString()).toBe(
        '2026-08-05T12:00:00.000Z'
      );
      expect((await getCursor(source.id, 'ap_report', 'AP-2')).lastObservedAt.toISOString()).toBe(
        '2026-08-05T11:00:00.000Z'
      );
    });

    it('never moves a cursor backwards', async () => {
      await advanceCursor(source.id, 'ap_report', '', new Date('2026-08-05T12:00:00Z'));
      await advanceCursor(source.id, 'ap_report', '', new Date('2026-08-05T09:00:00Z'));

      expect((await getCursor(source.id, 'ap_report', '')).lastObservedAt.toISOString()).toBe(
        '2026-08-05T12:00:00.000Z'
      );
    });

    it('survives a process restart because it lives in the database', async () => {
      await advanceCursor(source.id, 'sle', '', new Date('2026-08-05T12:00:00Z'));
      // A "restart" is just a fresh read — nothing is held in module state.
      expect((await getCursor(source.id, 'sle', '')).lastObservedAt).toBeTruthy();
    });
  });

  describe('advisory locking', () => {
    it('grants the lock to one holder and refuses the second', async () => {
      let innerAcquired = null;
      const outer = await withAdvisoryLock('aura:test:lock', async () => {
        const inner = await withAdvisoryLock('aura:test:lock', async () => 'should not run');
        innerAcquired = inner.acquired;
        return 'ran';
      });

      expect(outer).toEqual({ acquired: true, result: 'ran' });
      expect(innerAcquired).toBe(false);
    });

    it('releases the lock so a later run can acquire it', async () => {
      await withAdvisoryLock('aura:test:lock', async () => 'first');
      const second = await withAdvisoryLock('aura:test:lock', async () => 'second');
      expect(second).toEqual({ acquired: true, result: 'second' });
    });

    it('releases the lock even when the body throws', async () => {
      await expect(
        withAdvisoryLock('aura:test:lock', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      const after = await withAdvisoryLock('aura:test:lock', async () => 'ok');
      expect(after.acquired).toBe(true);
    });

    it('lets different keys run concurrently', async () => {
      const [a, b] = await Promise.all([
        withAdvisoryLock('aura:test:a', async () => 'a'),
        withAdvisoryLock('aura:test:b', async () => 'b'),
      ]);
      expect([a.acquired, b.acquired]).toEqual([true, true]);
    });
  });
});
