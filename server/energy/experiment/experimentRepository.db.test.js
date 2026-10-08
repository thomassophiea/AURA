/**
 * The applying marker and the time bounds, against a real Postgres
 * (skipped without DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import * as repo from './experimentRepository.js';
import { listEnrolledApNames } from '../apNameResolver.js';

const d = isDatabaseConfigured() ? describe : describe.skip;

d('experimentRepository rollback marker and bounded reads', () => {
  let sourceId;
  let experiment;
  const tag = `exp-${Date.now()}`;

  beforeAll(async () => {
    await runMigrations();
    const src = await query(
      `INSERT INTO monitored_sources (base_url, display_name) VALUES ($1, 'exp-test') RETURNING id`,
      [`https://${tag}.local`]
    );
    sourceId = src.rows[0].id;
    experiment = await repo.createExperiment({
      sourceId,
      name: 'marker test',
      treatment: { siteId: 'site-T', siteName: 'Treatment' },
      control: { siteId: 'site-C', siteName: 'Control' },
      treatmentDevices: [{ serial: 'SN1', apName: 'EAL-T-01', model: 'AP5020' }],
      controlDevices: [{ serial: 'SN9', apName: 'EAL-C-01', model: 'AP5020' }],
      action: { kind: 'disableRadios', radioIndexes: [3] },
    });
  });

  afterAll(async () => {
    await query('DELETE FROM monitored_sources WHERE id = $1', [sourceId]);
    await closePool();
  });

  it('a captured-but-unrecorded apply is outstanding until restored', async () => {
    // Capture happens immediately before the PUT; simulate a crash right after it.
    await repo.captureRollback({
      experimentId: experiment.id,
      serial: 'SN1',
      original: { capturedRadios: [{ radioIndex: 3, adminState: true }] },
      intended: [{ radioIndex: 3 }],
    });

    const [row] = await repo.listRollback(experiment.id);
    expect(row.appliedAt).toBeNull();
    expect(row.applyPending).toBe(true);
    expect(row.applyError).toBeNull(); // the marker is not surfaced as an error
    expect(repo.needsRestore(row)).toBe(true);

    const outstanding = await repo.listOutstandingRestores(sourceId);
    expect(outstanding.map((o) => o.apSerial)).toEqual(['SN1']);
    expect(outstanding[0].applyPending).toBe(true);

    await repo.recordRestoreResult({ experimentId: experiment.id, serial: 'SN1', verified: true });
    expect(await repo.listOutstandingRestores(sourceId)).toEqual([]);
  });

  it('recording the apply result clears the marker', async () => {
    await repo.captureRollback({
      experimentId: experiment.id,
      serial: 'SN1',
      original: { capturedRadios: [] },
      intended: [],
    });
    // A fresh capture re-opens a previously restored AP.
    expect((await repo.listOutstandingRestores(sourceId)).map((o) => o.apSerial)).toEqual(['SN1']);
    await repo.recordApplyResult({ experimentId: experiment.id, serial: 'SN1', verified: true, error: null });
    const [row] = await repo.listRollback(experiment.id);
    expect(row.applyPending).toBe(false);
    expect(row.appliedAt).not.toBeNull();
    // The ORIGINAL survives a second capture.
    expect(row.original.capturedRadios).toEqual([{ radioIndex: 3, adminState: true }]);
  });

  it('current state reads only the recent window', async () => {
    for (const [ageSeconds, value] of [
      [60, 11],
      [3600, 99],
    ]) {
      await query(
        `INSERT INTO metric_samples
           (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
            observed_at, numeric_value, expires_at)
         VALUES ($1, 'site-T', 'SN1', 'energy_ap_state', 'ap.power_watts',
                 now() - ($2 * interval '1 second'), $3, now() + interval '7 days')`,
        [sourceId, ageSeconds, value]
      );
    }
    await query(
      `INSERT INTO metric_samples
         (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
          observed_at, numeric_value, expires_at)
       VALUES ($1, 'site-T', 'SN-OLD', 'energy_ap_state', 'ap.power_watts',
               now() - interval '2 hours', 7, now() + interval '7 days')`,
      [sourceId]
    );
    const rows = await repo.fetchApCurrentState({ sourceId, siteIds: ['site-T'] });
    expect(rows.map((r) => r.apSerial)).toEqual(['SN1']);
    expect(rows[0].value).toBe(11);
  });

  it('baseline fallback does not reach past its lookback', async () => {
    const recent = await repo.fetchApBaselineWatts({
      sourceId,
      siteId: 'site-T',
      before: new Date().toISOString(),
      windowSeconds: 30,
      fallbackLookbackSeconds: 3 * 3600,
    });
    expect(recent.map((r) => r.apSerial).sort()).toEqual(['SN-OLD', 'SN1']);
    const bounded = await repo.fetchApBaselineWatts({
      sourceId,
      siteId: 'site-T',
      before: new Date().toISOString(),
      windowSeconds: 30,
      fallbackLookbackSeconds: 30 * 60,
    });
    expect(bounded.map((r) => r.apSerial)).toEqual(['SN1']);
  });

  it('resolves enrolled AP names for the energy tables', async () => {
    const names = await listEnrolledApNames({ sourceIds: [sourceId], serials: ['SN1', 'SN9', 'SNX'] });
    expect(names.get('SN1')).toBe('EAL-T-01');
    expect(names.get('SN9')).toBe('EAL-C-01');
    expect(names.has('SNX')).toBe(false);
  });
});
