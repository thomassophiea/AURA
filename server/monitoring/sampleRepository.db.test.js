/**
 * Database integration tests for the sample repository.
 *
 * Requires a real PostgreSQL via TEST_DATABASE_URL. Skips loudly otherwise —
 * see testSupport/dbHarness.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  hasTestDatabase,
  SKIP_REASON,
  setupTestDatabase,
  teardownTestDatabase,
  truncateMonitoringTables,
  seedSource,
  makeSample,
} from './testSupport/dbHarness.js';
import {
  insertSamples,
  upsertCurrentState,
  queryHistory,
  queryLatest,
  deleteExpiredSamples,
  deleteOldCollectionRuns,
  countSamples,
  getEarliestObservedAt,
  queryDailyCoverage,
} from './sampleRepository.js';
import { query } from '../db/pool.js';

if (!hasTestDatabase) {
  // eslint-disable-next-line no-console
  console.warn(`[sampleRepository.db.test] SKIPPED — ${SKIP_REASON}`);
}

describe.skipIf(!hasTestDatabase)('sampleRepository (PostgreSQL)', () => {
  let source;
  let otherSource;

  beforeAll(async () => {
    await setupTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await truncateMonitoringTables();
    source = await seedSource({ baseUrl: 'https://ctrl-a.example.com', orgId: 'org-a' });
    otherSource = await seedSource({ baseUrl: 'https://ctrl-b.example.com', orgId: 'org-b' });
  });

  describe('insertSamples', () => {
    it('inserts a sample and reports it as inserted', async () => {
      const result = await insertSamples([makeSample({ monitoredSourceId: source.id })]);
      expect(result).toMatchObject({ inserted: 1, updated: 0, received: 1 });
      expect(await countSamples([source.id])).toBe(1);
    });

    it('is idempotent: re-ingesting the same window updates instead of duplicating', async () => {
      const sample = makeSample({ monitoredSourceId: source.id });
      await insertSamples([sample]);
      const second = await insertSamples([sample]);

      expect(second).toMatchObject({ inserted: 0, updated: 1 });
      expect(await countSamples([source.id])).toBe(1);
    });

    it('lets a retry correct a value rather than adding a second row', async () => {
      const sample = makeSample({ monitoredSourceId: source.id, numericValue: 90 });
      await insertSamples([sample]);
      await insertSamples([{ ...sample, numericValue: 95 }]);

      const { rows } = await query('SELECT numeric_value FROM metric_samples');
      expect(rows).toHaveLength(1);
      expect(rows[0].numeric_value).toBe(95);
    });

    it('treats two workers ingesting the same batch as one set of rows', async () => {
      const batch = [
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-05T12:00:00Z') }),
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-05T12:05:00Z') }),
      ];
      const [a, b] = await Promise.all([insertSamples(batch), insertSamples(batch)]);

      expect(await countSamples([source.id])).toBe(2);
      expect(a.inserted + b.inserted).toBe(2);
    });

    it('keeps samples distinct when only the timestamp differs', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-05T12:00:00Z') }),
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-05T12:05:00Z') }),
      ]);
      expect(await countSamples([source.id])).toBe(2);
    });

    it('keeps samples distinct when only the dimensions differ', async () => {
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          metricFamily: 'ap_report',
          metricName: 'channelUtilization.total',
          dimensions: { band: '5' },
        }),
        makeSample({
          monitoredSourceId: source.id,
          metricFamily: 'ap_report',
          metricName: 'channelUtilization.total',
          dimensions: { band: '2_4' },
        }),
      ]);
      expect(await countSamples([source.id])).toBe(2);
    });

    it('treats dimension objects with reordered keys as the same series', async () => {
      const base = {
        monitoredSourceId: source.id,
        metricFamily: 'ap_report',
        metricName: 'x.total',
      };
      await insertSamples([makeSample({ ...base, dimensions: { band: '5', reportType: 'T' } })]);
      await insertSamples([makeSample({ ...base, dimensions: { reportType: 'T', band: '5' } })]);
      expect(await countSamples([source.id])).toBe(1);
    });

    it('keeps samples distinct when only the device differs', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, deviceExternalId: 'AP-1' }),
        makeSample({ monitoredSourceId: source.id, deviceExternalId: 'AP-2' }),
        makeSample({ monitoredSourceId: source.id, deviceExternalId: null }),
      ]);
      expect(await countSamples([source.id])).toBe(3);
    });

    it('keeps two sources apart even for identical metrics', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id }),
        makeSample({ monitoredSourceId: otherSource.id }),
      ]);
      expect(await countSamples([source.id])).toBe(1);
      expect(await countSamples([otherSource.id])).toBe(1);
    });

    it('handles a batch larger than the chunk size', async () => {
      const samples = Array.from({ length: 1200 }, (_, i) =>
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date(Date.UTC(2026, 7, 5, 0, 0, i)),
        })
      );
      const result = await insertSamples(samples, { batchSize: 500 });
      expect(result.inserted).toBe(1200);
      expect(await countSamples([source.id])).toBe(1200);
    });

    it('rolls the whole batch back when one row is invalid', async () => {
      const good = makeSample({ monitoredSourceId: source.id });
      const bad = makeSample({ monitoredSourceId: source.id, qualityState: 'not_a_state' });
      await expect(insertSamples([good, bad])).rejects.toThrow();
      expect(await countSamples([source.id])).toBe(0);
    });

    it('persists numerator and denominator so percentages can be re-aggregated', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, numerator: 19, denominator: 20 }),
      ]);
      const { rows } = await query('SELECT numerator, denominator FROM metric_samples');
      expect(rows[0]).toMatchObject({ numerator: 19, denominator: 20 });
    });

    it('does nothing for an empty batch', async () => {
      expect(await insertSamples([])).toMatchObject({ inserted: 0, updated: 0, received: 0 });
    });
  });

  describe('upsertCurrentState', () => {
    it('records the latest known value', async () => {
      await upsertCurrentState([makeSample({ monitoredSourceId: source.id, numericValue: 91 })]);
      const [latest] = await queryLatest({ sourceIds: [source.id] });
      expect(latest.numericValue).toBe(91);
    });

    it('advances to a newer observation', async () => {
      await upsertCurrentState([
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 91,
          observedAt: new Date('2026-08-05T12:00:00Z'),
        }),
      ]);
      await upsertCurrentState([
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 80,
          observedAt: new Date('2026-08-05T12:05:00Z'),
        }),
      ]);
      const [latest] = await queryLatest({ sourceIds: [source.id] });
      expect(latest.numericValue).toBe(80);
    });

    it('does not let a backfill of older data overwrite a newer reading', async () => {
      await upsertCurrentState([
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 80,
          observedAt: new Date('2026-08-05T12:05:00Z'),
        }),
      ]);
      await upsertCurrentState([
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 10,
          observedAt: new Date('2026-08-05T11:00:00Z'),
        }),
      ]);
      const [latest] = await queryLatest({ sourceIds: [source.id] });
      expect(latest.numericValue).toBe(80);
    });

    it('keeps only the newest point when a single batch contains several', async () => {
      await upsertCurrentState([
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 10,
          observedAt: new Date('2026-08-05T12:00:00Z'),
        }),
        makeSample({
          monitoredSourceId: source.id,
          numericValue: 20,
          observedAt: new Date('2026-08-05T12:10:00Z'),
        }),
      ]);
      const latest = await queryLatest({ sourceIds: [source.id] });
      expect(latest).toHaveLength(1);
      expect(latest[0].numericValue).toBe(20);
    });

    it('survives retention: the last known state outlives its expired samples', async () => {
      const collectedAt = new Date('2026-07-01T00:00:00Z');
      const sample = makeSample({
        monitoredSourceId: source.id,
        collectedAt,
        expiresAt: new Date('2026-07-08T00:00:00Z'),
      });
      await insertSamples([sample]);
      await upsertCurrentState([sample]);

      await deleteExpiredSamples({ now: new Date('2026-08-05T00:00:00Z') });

      expect(await countSamples([source.id])).toBe(0);
      // "Offline since X" is only possible because this row is still here.
      expect(await queryLatest({ sourceIds: [source.id] })).toHaveLength(1);
    });
  });

  describe('queryHistory', () => {
    beforeEach(async () => {
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-08-01T00:00:00Z'),
          numericValue: 1,
        }),
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-08-03T00:00:00Z'),
          numericValue: 2,
        }),
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-08-05T00:00:00Z'),
          numericValue: 3,
        }),
        makeSample({ monitoredSourceId: otherSource.id, numericValue: 99 }),
      ]);
    });

    it('returns points inside the range in ascending time order', async () => {
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-08-01T00:00:00Z'),
        end: new Date('2026-08-06T00:00:00Z'),
      });
      expect(points.map((p) => p.numericValue)).toEqual([1, 2, 3]);
    });

    it('excludes points outside the range', async () => {
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-08-02T00:00:00Z'),
        end: new Date('2026-08-04T00:00:00Z'),
      });
      expect(points.map((p) => p.numericValue)).toEqual([2]);
    });

    it('never returns another tenant\'s data even when the range matches', async () => {
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
      });
      expect(points.every((p) => p.monitoredSourceId === source.id)).toBe(true);
      expect(points.map((p) => p.numericValue)).not.toContain(99);
    });

    it('returns nothing for an empty authorized scope', async () => {
      const result = await queryHistory({
        sourceIds: [],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
      });
      expect(result).toEqual({ points: [], truncated: false });
    });

    it('reports truncation instead of silently capping', async () => {
      const { points, truncated } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
        maxPoints: 2,
      });
      expect(points).toHaveLength(2);
      expect(truncated).toBe(true);
    });

    it('keeps the most recent points when truncating, not the oldest', async () => {
      const { points, effectiveStart } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
        maxPoints: 2,
      });
      // Dropping the newest points would read as "nothing happened lately".
      expect(points.map((p) => p.numericValue)).toEqual([2, 3]);
      expect(new Date(effectiveStart).toISOString()).toBe('2026-08-03T00:00:00.000Z');
    });

    it('still returns points in ascending order after truncation', async () => {
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
        maxPoints: 2,
      });
      expect(points[0].observedAt.getTime()).toBeLessThan(points[1].observedAt.getTime());
    });

    it('filters by metric name', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, metricName: 'roaming', numericValue: 7 }),
      ]);
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
        metricNames: ['roaming'],
      });
      expect(points.map((p) => p.numericValue)).toEqual([7]);
    });

    it('filters by device', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, deviceExternalId: 'AP-9', numericValue: 42 }),
      ]);
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2027-01-01T00:00:00Z'),
        deviceExternalId: 'AP-9',
      });
      expect(points.map((p) => p.numericValue)).toEqual([42]);
    });

    it('leaves outage windows absent rather than filling them with zeros', async () => {
      const { points } = await queryHistory({
        sourceIds: [source.id],
        start: new Date('2026-08-01T00:00:00Z'),
        end: new Date('2026-08-06T00:00:00Z'),
      });
      // 08-02 and 08-04 were never collected; nothing stands in for them.
      expect(points).toHaveLength(3);
      expect(points.some((p) => p.numericValue === 0)).toBe(false);
    });
  });

  describe('getEarliestObservedAt', () => {
    it('reports the real start of coverage', async () => {
      await insertSamples([
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-02T00:00:00Z') }),
        makeSample({ monitoredSourceId: source.id, observedAt: new Date('2026-08-05T00:00:00Z') }),
      ]);
      const earliest = await getEarliestObservedAt([source.id]);
      expect(earliest.toISOString()).toBe('2026-08-02T00:00:00.000Z');
    });

    it('returns null when nothing has ever been collected', async () => {
      expect(await getEarliestObservedAt([source.id])).toBeNull();
    });
  });

  describe('deleteExpiredSamples', () => {
    it('removes samples past their expiry and keeps the rest', async () => {
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-07-20T00:00:00Z'),
          expiresAt: new Date('2026-07-27T00:00:00Z'),
        }),
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-08-04T00:00:00Z'),
          expiresAt: new Date('2026-08-11T00:00:00Z'),
        }),
      ]);

      const result = await deleteExpiredSamples({ now: new Date('2026-08-05T00:00:00Z') });

      expect(result.deleted).toBe(1);
      expect(await countSamples([source.id])).toBe(1);
    });

    it('is idempotent — a second sweep deletes nothing', async () => {
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          expiresAt: new Date('2026-07-01T00:00:00Z'),
        }),
      ]);
      const first = await deleteExpiredSamples({ now: new Date('2026-08-05T00:00:00Z') });
      const second = await deleteExpiredSamples({ now: new Date('2026-08-05T00:00:00Z') });
      expect(first.deleted).toBe(1);
      expect(second.deleted).toBe(0);
    });

    it('deletes nothing when nothing has expired', async () => {
      await insertSamples([makeSample({ monitoredSourceId: source.id })]);
      const result = await deleteExpiredSamples({ now: new Date('2026-08-05T00:00:00Z') });
      expect(result.deleted).toBe(0);
    });

    it('honours a shorter retention window', async () => {
      // A sample stamped with a 1-day retention expires a day after collection.
      const collectedAt = new Date('2026-08-01T00:00:00Z');
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          collectedAt,
          expiresAt: new Date(collectedAt.getTime() + 24 * 60 * 60 * 1000),
        }),
      ]);
      expect(
        (await deleteExpiredSamples({ now: new Date('2026-08-03T00:00:00Z') })).deleted
      ).toBe(1);
    });

    it('batches large deletions', async () => {
      const samples = Array.from({ length: 250 }, (_, i) =>
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)),
          expiresAt: new Date('2026-07-08T00:00:00Z'),
        })
      );
      await insertSamples(samples);
      const result = await deleteExpiredSamples({
        now: new Date('2026-08-05T00:00:00Z'),
        batchSize: 100,
      });
      expect(result.deleted).toBe(250);
      expect(result.batches).toBeGreaterThan(1);
    });

    it('does not disturb concurrent ingestion', async () => {
      await insertSamples([
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date('2026-07-01T00:00:00Z'),
          expiresAt: new Date('2026-07-08T00:00:00Z'),
        }),
      ]);

      const fresh = Array.from({ length: 100 }, (_, i) =>
        makeSample({
          monitoredSourceId: source.id,
          observedAt: new Date(Date.UTC(2026, 7, 5, 0, 0, i)),
        })
      );

      const [, cleanup] = await Promise.all([
        insertSamples(fresh),
        deleteExpiredSamples({ now: new Date('2026-08-05T12:00:00Z'), batchSize: 10 }),
      ]);

      expect(cleanup.deleted).toBe(1);
      expect(await countSamples([source.id])).toBe(100);
    });
  });

  describe('deleteOldCollectionRuns', () => {
    it('prunes run diagnostics older than the cutoff', async () => {
      await query(
        `INSERT INTO collection_runs (monitored_source_id, collector_name, started_at, status)
         VALUES ($1, 'test', $2, 'succeeded'), ($1, 'test', $3, 'succeeded')`,
        [source.id, new Date('2026-07-01T00:00:00Z'), new Date('2026-08-05T00:00:00Z')]
      );
      const result = await deleteOldCollectionRuns({ olderThan: new Date('2026-08-01T00:00:00Z') });
      expect(result.deleted).toBe(1);
    });
  });

  describe('queryDailyCoverage', () => {
    const WIDE = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2027-01-01T00:00:00Z'),
    };

    /** One sample at each given UTC instant. */
    const seedAt = (instants, overrides = {}) =>
      insertSamples(
        instants.map((iso) =>
          makeSample({
            monitoredSourceId: source.id,
            observedAt: new Date(iso),
            collectedAt: new Date(iso),
            ...overrides,
          })
        )
      );

    beforeEach(async () => {
      await truncateMonitoringTables();
      source = await seedSource({ baseUrl: 'https://ctrl-a.example.com', orgId: 'org-a' });
      otherSource = await seedSource({ baseUrl: 'https://ctrl-b.example.com', orgId: 'org-b' });
    });

    it('groups samples by local calendar day in the requested zone', async () => {
      // 02:00 UTC on Aug 5 is still Aug 4 at 22:00 in New York. Grouping on UTC
      // would put this in the wrong day — which is the day the user picked.
      await seedAt(['2026-08-05T02:00:00Z']);

      const utc = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });
      const newYork = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'America/New_York',
      });

      expect(utc.map((day) => day.localDate)).toEqual(['2026-08-05']);
      expect(newYork.map((day) => day.localDate)).toEqual(['2026-08-04']);
    });

    it('counts samples and distinct local hours per day', async () => {
      await seedAt([
        '2026-08-04T01:00:00Z',
        '2026-08-04T01:30:00Z', // same hour — one bucket, two samples
        '2026-08-04T05:00:00Z',
        '2026-08-05T09:00:00Z',
      ]);

      const days = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });

      expect(days).toHaveLength(2);
      expect(days[0]).toMatchObject({
        localDate: '2026-08-04',
        sampleCount: 3,
        hoursPresent: 2,
      });
      expect(days[1]).toMatchObject({ localDate: '2026-08-05', sampleCount: 1, hoursPresent: 1 });
    });

    it('reports the first and last observation within each day', async () => {
      await seedAt(['2026-08-04T03:00:00Z', '2026-08-04T21:00:00Z']);
      const [day] = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });
      expect(new Date(day.firstObservedAt).toISOString()).toBe('2026-08-04T03:00:00.000Z');
      expect(new Date(day.lastObservedAt).toISOString()).toBe('2026-08-04T21:00:00.000Z');
    });

    it('omits days with no samples rather than reporting them as zero', async () => {
      // A day absent from the result means "nothing stored", which the UI renders
      // as unselectable. A zero row would read as a measured quiet day.
      await seedAt(['2026-08-02T10:00:00Z', '2026-08-05T10:00:00Z']);
      const days = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });
      expect(days.map((day) => day.localDate)).toEqual(['2026-08-02', '2026-08-05']);
    });

    it('returns days in ascending order', async () => {
      await seedAt(['2026-08-05T10:00:00Z', '2026-08-01T10:00:00Z', '2026-08-03T10:00:00Z']);
      const days = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });
      expect(days.map((day) => day.localDate)).toEqual([
        '2026-08-01',
        '2026-08-03',
        '2026-08-05',
      ]);
    });

    it('honours the requested window bounds', async () => {
      await seedAt(['2026-08-01T10:00:00Z', '2026-08-05T10:00:00Z']);
      const days = await queryDailyCoverage({
        sourceIds: [source.id],
        start: new Date('2026-08-03T00:00:00Z'),
        end: new Date('2026-08-06T00:00:00Z'),
        timeZone: 'UTC',
      });
      expect(days.map((day) => day.localDate)).toEqual(['2026-08-05']);
    });

    it('never reports another source\'s days', async () => {
      await seedAt(['2026-08-04T10:00:00Z']);
      await insertSamples([
        makeSample({
          monitoredSourceId: otherSource.id,
          observedAt: new Date('2026-08-01T10:00:00Z'),
          collectedAt: new Date('2026-08-01T10:00:00Z'),
        }),
      ]);

      const days = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
      });
      expect(days.map((day) => day.localDate)).toEqual(['2026-08-04']);
    });

    it('narrows to a site and a metric family', async () => {
      await seedAt(['2026-08-04T10:00:00Z'], { siteId: 'site-1', metricFamily: 'sle' });
      await seedAt(['2026-08-05T10:00:00Z'], { siteId: 'site-2', metricFamily: 'sle' });
      await seedAt(['2026-08-06T10:00:00Z'], { siteId: 'site-1', metricFamily: 'throughput' });

      const siteOnly = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
        siteId: 'site-1',
      });
      expect(siteOnly.map((day) => day.localDate)).toEqual(['2026-08-04', '2026-08-06']);

      const siteAndFamily = await queryDailyCoverage({
        sourceIds: [source.id],
        ...WIDE,
        timeZone: 'UTC',
        siteId: 'site-1',
        metricFamily: 'sle',
      });
      expect(siteAndFamily.map((day) => day.localDate)).toEqual(['2026-08-04']);
    });

    it('returns nothing for an empty scope instead of querying every source', async () => {
      await seedAt(['2026-08-04T10:00:00Z']);
      expect(
        await queryDailyCoverage({ sourceIds: [], ...WIDE, timeZone: 'UTC' })
      ).toEqual([]);
    });
  });
});
