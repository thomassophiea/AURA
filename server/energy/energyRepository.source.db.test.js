/**
 * Power-source selection against a real Postgres (skipped without DATABASE_URL).
 *
 * Fixture fleet, window 00:00–02:00:
 *   AP-M — measured only (energy_ap_state, W), with a 40-minute collector outage
 *   AP-R — ap_report only (mW), the fallback the measured collector never saw
 *   AP-B — both: one ap_report sample is covered by measured data and must be
 *          dropped; two later ones are not and must be used
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import {
  fetchOverviewAggregate,
  fetchSiteAggregates,
  fetchApAggregates,
  fetchPowerSamples,
  fetchTelemetryCoverage,
  fetchLightAwareEvidence,
  getEarliestPowerSampleAt,
} from './energyRepository.js';

const d = isDatabaseConfigured() ? describe : describe.skip;

const START = '2026-09-01T00:00:00Z';
const END = '2026-09-01T02:00:00Z';
const at = (minute) => new Date(Date.parse(START) + minute * 60_000).toISOString();

d('energyRepository power-source selection', () => {
  let sourceId;
  const tag = `src-${Date.now()}`;
  const AP_M = `${tag}-M`;
  const AP_R = `${tag}-R`;
  const AP_B = `${tag}-B`;

  async function insert({ family, name, device, site, minute, value, dims = {}, radio = null }) {
    await query(
      `INSERT INTO metric_samples
         (monitored_source_id, site_id, device_external_id, radio_external_id, metric_family,
          metric_name, observed_at, numeric_value, dimensions, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, now() + interval '30 days')`,
      [sourceId, site, device, radio, family, name, at(minute), value, JSON.stringify(dims)]
    );
  }
  const measured = (device, site, minute, watts, dims = {}) =>
    insert({
      family: 'energy_ap_state',
      name: 'ap.power_watts',
      device,
      site,
      minute,
      value: watts,
      dims: { model: 'AP5020', siteName: 'North Wing', source: 'measured', ...dims },
    });
  const report = (device, site, minute, milliwatts) =>
    insert({
      family: 'ap_report',
      name: 'apPowerConsumptionTimeseries.power_consumption',
      device,
      site,
      minute,
      value: milliwatts,
      dims: { band: 'all', reportType: 'Timeseries' },
    });

  beforeAll(async () => {
    await runMigrations();
    const src = await query(
      `INSERT INTO monitored_sources (base_url, display_name)
       VALUES ($1, 'energy-source-test') RETURNING id`,
      [`https://${tag}.local`]
    );
    sourceId = src.rows[0].id;

    // AP-M: 10 W every 60s for minutes 0..10, outage, then 50..55.
    for (let m = 0; m <= 10; m += 1) await measured(AP_M, 'site-N', m, 10);
    for (let m = 50; m <= 55; m += 1) await measured(AP_M, 'site-N', m, 10);
    // Its 6 GHz radio occupancy at minute 0, same tick as the power sample.
    await insert({
      family: 'energy_ap_state',
      name: 'radio.channel_occupancy',
      device: AP_M,
      site: 'site-N',
      minute: 0,
      value: 2,
      radio: '3',
      dims: { model: 'AP5020', band: '6' },
    });

    // AP-R: 4000 mW at 00:00 and 01:00.
    await report(AP_R, 'site-S', 0, 4000);
    await report(AP_R, 'site-S', 60, 4000);

    // AP-B: measured 8 W minutes 0..5; ap_report at 2 (covered), 60 and 90.
    for (let m = 0; m <= 5; m += 1) await measured(AP_B, 'site-N', m, 8);
    await report(AP_B, 'site-N', 2, 99000);
    await report(AP_B, 'site-N', 60, 6000);
    await report(AP_B, 'site-N', 90, 6000);
  });

  afterAll(async () => {
    await query('DELETE FROM monitored_sources WHERE id = $1', [sourceId]);
    await closePool();
  });

  const base = () => ({ sourceIds: [sourceId], start: START, end: END, maxGapSeconds: 7200 });

  it('uses measured W as primary, labels each AP with its source, and never flat-lines a gap', async () => {
    const aps = await fetchApAggregates({ ...base(), siteId: null });
    const bySerial = new Map(aps.map((a) => [a.serial, a]));

    const m = bySerial.get(AP_M);
    expect(m.source).toBe('measured_ap_state');
    expect(m.mixed).toBe(false);
    expect(m.model).toBe('AP5020');
    expect(m.siteName).toBe('North Wing');
    // 10 + 5 one-minute intervals; the 40-minute outage is excluded, not bridged.
    expect(m.observedSeconds).toBe(900);
    expect(m.totalKwh).toBeCloseTo((10 * 900) / 3_600_000, 9);
    expect(m.avgWatts).toBeCloseTo(10, 9);

    const r = bySerial.get(AP_R);
    expect(r.source).toBe('ap_report');
    expect(r.totalKwh).toBeCloseTo((4 * 3600) / 3_600_000, 9); // mW -> W
    expect(r.peakWatts).toBeCloseTo(4, 9);

    const b = bySerial.get(AP_B);
    expect(b.source).toBe('measured_ap_state');
    expect(b.mixed).toBe(true);
    // The 99 W report sample at minute 2 is covered by measured data and dropped.
    expect(b.apReportSampleCount).toBe(2);
    expect(b.peakWatts).toBeCloseTo(8, 9);
    // 8 W x 300s measured + 6 W x 1800s fallback; the 55-minute hand-over gap is excluded.
    expect(b.totalKwh).toBeCloseTo((8 * 300 + 6 * 1800) / 3_600_000, 9);
  });

  it('reports overview provenance across the merged fleet', async () => {
    const agg = await fetchOverviewAggregate({ ...base(), siteId: null });
    expect(agg.apWithDataCount).toBe(3);
    expect(agg.source).toBe('measured_ap_state');
    expect(agg.mixed).toBe(true);
    expect(agg.measuredApCount).toBe(2);
    expect(agg.apReportOnlyApCount).toBe(1);
    expect(agg.periodKwh).toBeCloseTo(
      (10 * 900 + 4 * 3600 + 8 * 300 + 6 * 1800) / 3_600_000,
      9
    );
  });

  it('is labelled ap_report when only the fallback exists in scope', async () => {
    const agg = await fetchOverviewAggregate({ ...base(), siteId: 'site-S' });
    expect(agg.source).toBe('ap_report');
    expect(agg.mixed).toBe(false);
  });

  it('carries the measured site name on site rows', async () => {
    const sites = await fetchSiteAggregates(base());
    const north = sites.find((s) => s.siteId === 'site-N');
    expect(north.siteName).toBe('North Wing');
    expect(north.source).toBe('measured_ap_state');
    expect(sites.find((s) => s.siteId === 'site-S').source).toBe('ap_report');
  });

  it('returns null source and zero totals for an empty window', async () => {
    const agg = await fetchOverviewAggregate({
      ...base(),
      start: '2020-01-01T00:00:00Z',
      end: '2020-01-02T00:00:00Z',
      siteId: null,
    });
    expect(agg.apWithDataCount).toBe(0);
    expect(agg.source).toBeNull();
    expect(agg.periodKwh).toBe(0);
  });

  it('tags measured samples with real 6 GHz occupancy and leaves the rest unknown', async () => {
    const samples = await fetchPowerSamples({ ...base(), siteId: null });
    const first = samples.find((s) => s.deviceExternalId === AP_M && s.observedAt === at(0));
    expect(first.band).toBe('6');
    expect(first.channelUtilization).toBe(2);
    const later = samples.find((s) => s.deviceExternalId === AP_M && s.observedAt === at(1));
    expect(later.channelUtilization).toBeNull();
    expect(samples.filter((s) => s.deviceExternalId === AP_B && s.source === 'ap_report')).toHaveLength(2);
  });

  it('reads the model for light-aware evidence from the measured series', async () => {
    const rows = await fetchLightAwareEvidence({ ...base(), siteId: null });
    expect(rows.find((r) => r.apSerial === AP_M).model).toBe('AP5020');
    expect(rows.find((r) => r.apSerial === AP_R).model).toBeNull();
  });

  it('reports coverage and the earliest sample across both sources', async () => {
    const coverage = await fetchTelemetryCoverage({ ...base(), siteId: null });
    expect(coverage.reportingApCount).toBe(3);
    expect(coverage.source).toBe('measured_ap_state');
    expect(await getEarliestPowerSampleAt({ sourceIds: [sourceId], siteId: null })).toBe(at(0));
  });
});
