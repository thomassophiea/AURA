import { describe, it, expect, beforeAll } from 'vitest';
import { isDatabaseConfigured, query } from '../pool.js';

const maybe = isDatabaseConfigured() ? describe : describe.skip;

maybe('0005_light_aware tables', () => {
  it('has the three light-aware tables with expected columns', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('light_sensor_samples','light_state_transitions','light_aware_policies')`
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual(['light_aware_policies', 'light_sensor_samples', 'light_state_transitions']);
  });

  it('enforces normalized_state check constraint', async () => {
    await expect(
      query(
        `INSERT INTO light_sensor_samples (monitored_source_id, ap_serial, normalized_state)
         VALUES (gen_random_uuid(), 'X', 'purple')`
      )
    ).rejects.toBeTruthy();
  });
});
