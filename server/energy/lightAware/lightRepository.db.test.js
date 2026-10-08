// server/energy/lightAware/lightRepository.db.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../../db/pool.js';
import { runMigrations } from '../../db/migrate.js';
import * as repo from './lightRepository.js';

const maybe = isDatabaseConfigured() ? describe : describe.skip;

maybe('lightRepository', () => {
  // Self-contained: its own migrated schema and its own source, so the suite
  // does not depend on another file having created one first.
  let sourceId;
  const tag = `light-${Date.now()}`;

  beforeAll(async () => {
    await runMigrations();
    const { rows } = await query(
      `INSERT INTO monitored_sources (base_url, display_name) VALUES ($1, 'light-test') RETURNING id`,
      [`https://${tag}.local`]
    );
    sourceId = rows[0].id;
  });

  afterAll(async () => {
    await query('DELETE FROM monitored_sources WHERE id = $1', [sourceId]);
    await closePool();
  });

  async function sample({ family, name, serial, value, ageSeconds, dims = {} }) {
    await query(
      `INSERT INTO metric_samples
         (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
          observed_at, numeric_value, dimensions, expires_at)
       VALUES ($1, 'site-1', $2, $3, $4, now() - ($5 * interval '1 second'), $6, $7::jsonb,
               now() + interval '30 days')`,
      [sourceId, serial, family, name, ageSeconds, value, JSON.stringify(dims)]
    );
  }

  it('upserts and reads back a policy scoped to source default', async () => {
    const saved = await repo.upsertPolicy({ sourceId, siteId: null, enabled: true, policy: { dark: { actions: [] } } });
    expect(saved.enabled).toBe(true);
    const got = await repo.getPolicy({ sourceId, siteId: null });
    expect(got.enabled).toBe(true);
  });

  it('closes an open transition and opens a new one with dwell filled', async () => {
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: null, toState: 'bright', enteredAt: '2026-08-19T00:00:00Z' });
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: 'bright', toState: 'dark', enteredAt: '2026-08-19T01:00:00Z' });
    const open = await repo.getOpenTransition({ sourceId, apSerial: 'T1' });
    expect(open.to_state).toBe('dark');
    expect(open.dwell_seconds).toBeNull();
  });

  it('falls back to a recent ap_report sample when no measured power exists', async () => {
    await sample({
      family: 'ap_report',
      name: 'apPowerConsumptionTimeseries.power_consumption',
      serial: 'AP-LIST-1',
      value: 12000,
      ageSeconds: 60,
    });
    const list = await repo.listApLightStates({ sourceId, siteId: null });
    const row = list.find((r) => r.serial === 'AP-LIST-1');
    expect(row).toBeDefined();
    expect(row.watts).toBeCloseTo(12); // 12000 mW / 1000
    expect(row.source).toBe('ap_report');
    expect(row.siteId).toBe('site-1');
    expect(row.apName).toBe('AP-LIST-1');
    expect(row.openTransition).toBeNull();
  });

  it('prefers measured watts (and its model) over the report series', async () => {
    await sample({
      family: 'ap_report',
      name: 'apPowerConsumptionTimeseries.power_consumption',
      serial: 'AP-LIST-2',
      value: 99000,
      ageSeconds: 30,
    });
    await sample({
      family: 'energy_ap_state',
      name: 'ap.power_watts',
      serial: 'AP-LIST-2',
      value: 11.5,
      ageSeconds: 60,
      dims: { model: 'AP5020', siteName: 'North Wing' },
    });
    const row = (await repo.listApLightStates({ sourceId, siteId: null })).find(
      (r) => r.serial === 'AP-LIST-2'
    );
    expect(row.watts).toBeCloseTo(11.5);
    expect(row.model).toBe('AP5020');
    expect(row.siteName).toBe('North Wing');
    expect(row.source).toBe('measured_ap_state');
  });

  it('leaves out APs whose latest reading is older than the bound', async () => {
    await sample({
      family: 'energy_ap_state',
      name: 'ap.power_watts',
      serial: 'AP-STALE',
      value: 9,
      ageSeconds: 3 * 3600,
    });
    const list = await repo.listApLightStates({ sourceId, siteId: null });
    expect(list.find((r) => r.serial === 'AP-STALE')).toBeUndefined();
  });
});
