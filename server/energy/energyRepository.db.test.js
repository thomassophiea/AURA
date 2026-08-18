import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

const dbAvailable = isDatabaseConfigured();
const d = dbAvailable ? describe : describe.skip;

d('0004_energy migration', () => {
  beforeAll(async () => {
    await runMigrations();
  });
  afterAll(async () => {
    await closePool();
  });

  it('creates the three energy tables', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('energy_rate_preferences','energy_scenarios','energy_scenario_results')`
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual([
      'energy_rate_preferences',
      'energy_scenarios',
      'energy_scenario_results',
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
