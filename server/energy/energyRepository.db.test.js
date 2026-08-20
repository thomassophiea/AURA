import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import {
  fetchOverviewAggregate,
  fetchSiteAggregates,
  upsertRatePreferences,
  getRatePreferences,
} from './energyRepository.js';

const dbAvailable = isDatabaseConfigured();
const d = dbAvailable ? describe : describe.skip;

d('0004_energy migration', () => {
  beforeAll(async () => {
    await runMigrations();
  });
  afterAll(async () => {
    await closePool();
  });

  it('creates the Energy and Environmental Reporting tables', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN (
         'energy_rate_preferences',
         'energy_scenarios',
         'energy_scenario_results',
         'energy_environmental_reports'
       )`
    );
    const names = rows.map((r) => r.table_name).sort();
    // JS string sort: '_' (95) < 's' (115), so scenario_results precedes scenarios.
    expect(names).toEqual([
      'energy_environmental_reports',
      'energy_rate_preferences',
      'energy_scenario_results',
      'energy_scenarios',
    ]);
  });

  it('defaults rate preferences to USD @ 0.14', async () => {
    const { rows } = await query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'energy_rate_preferences' AND column_name = 'rate_per_kwh'`
    );
    expect(rows[0].column_default).toContain('0.14');
  });
});

d('energyRepository power integration', () => {
  let sourceId;
  const start = '2026-08-10T00:00:00Z';
  const end = '2026-08-10T02:00:00Z';

  beforeAll(async () => {
    await runMigrations();
    const src = await query(
      `INSERT INTO monitored_sources (base_url, display_name)
       VALUES ('https://energy-test.local', 'energy-test')
       ON CONFLICT (base_url) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`
    );
    sourceId = src.rows[0].id;
    // Two samples one hour apart at 2000 mW = 2 W. First integrates over 3600s.
    for (const [ts, mw] of [
      ['2026-08-10T00:00:00Z', 2000],
      ['2026-08-10T01:00:00Z', 2000],
    ]) {
      await query(
        `INSERT INTO metric_samples
           (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
            observed_at, numeric_value, unit, metric_kind, expires_at)
         VALUES ($1,'site-A','AP-1','ap_report','apPowerConsumptionTimeseries.power_consumption',$2,$3,'mW','gauge', now() + interval '7 days')
         ON CONFLICT DO NOTHING`,
        [sourceId, ts, mw]
      );
    }
  });

  it('integrates 2W held for 3600s into 0.002 kWh', async () => {
    const agg = await fetchOverviewAggregate({
      sourceIds: [sourceId],
      siteId: null,
      siteGroupId: null,
      start,
      end,
      maxGapSeconds: 7200,
    });
    expect(agg.apWithDataCount).toBe(1);
    expect(agg.periodKwh).toBeCloseTo(0.002, 6);
    expect(agg.avgWatts).toBeCloseTo(2, 6);
  });

  it('round-trips rate preferences', async () => {
    await upsertRatePreferences({
      sourceId,
      currencyCode: 'EUR',
      currencySymbol: '€',
      ratePerKwh: 0.31,
    });
    const prefs = await getRatePreferences(sourceId);
    expect(prefs).toEqual({
      currencyCode: 'EUR',
      currencySymbol: '€',
      ratePerKwh: 0.31,
      emissionsFactorKgPerKwh: null,
      emissionsFactorSource: null,
      emissionsFactorRegion: null,
      emissionsFactorYear: null,
    });
  });

  it('weights irregular intervals, projects observed run-rate, and excludes stale current draw', async () => {
    const weightedSite = `site-weighted-${Date.now()}`;
    const serial = `AP-WEIGHTED-${Date.now()}`;
    for (const [ts, mw] of [
      ['2026-08-11T00:00:00Z', 10000],
      ['2026-08-11T01:00:00Z', 20000],
      ['2026-08-11T03:00:00Z', 20000],
    ]) {
      await query(
        `INSERT INTO metric_samples
           (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
            observed_at, numeric_value, unit, metric_kind, expires_at)
         VALUES ($1,$2,$3,'ap_report','apPowerConsumptionTimeseries.power_consumption',$4,$5,'mW','gauge', now() + interval '7 days')`,
        [sourceId, weightedSite, serial, ts, mw]
      );
    }

    const aggregate = await fetchOverviewAggregate({
      sourceIds: [sourceId],
      siteId: weightedSite,
      start: '2026-08-11T00:00:00Z',
      end: '2026-08-11T06:00:00Z',
      maxGapSeconds: 7200,
    });
    expect(aggregate.periodKwh).toBeCloseTo(0.05, 6);
    expect(aggregate.avgWatts).toBeCloseTo(50 / 3, 6);
    expect(aggregate.dailyKwhProjected).toBeCloseTo(0.4, 6);
    expect(aggregate.currentWatts).toBe(0);
    expect(aggregate.peakWatts).toBe(20);

    const sites = await fetchSiteAggregates({
      sourceIds: [sourceId],
      start: '2026-08-11T00:00:00Z',
      end: '2026-08-11T06:00:00Z',
      maxGapSeconds: 7200,
    });
    const site = sites.find((row) => row.siteId === weightedSite);
    expect(site.dailyKwhProjected).toBeCloseTo(0.4, 6);
    expect(site.avgWattsPerAp).toBeCloseTo(50 / 3, 6);
  });
});
