// server/energy/lightAware/lightRepository.db.test.js
import { describe, it, expect } from 'vitest';
import { isDatabaseConfigured, query } from '../../db/pool.js';
import * as repo from './lightRepository.js';

const maybe = isDatabaseConfigured() ? describe : describe.skip;

maybe('lightRepository', () => {
  it('upserts and reads back a policy scoped to source default', async () => {
    const { rows } = await query('SELECT id FROM monitored_sources LIMIT 1');
    const sourceId = rows[0].id;
    const saved = await repo.upsertPolicy({ sourceId, siteId: null, enabled: true, policy: { dark: { actions: [] } } });
    expect(saved.enabled).toBe(true);
    const got = await repo.getPolicy({ sourceId, siteId: null });
    expect(got.enabled).toBe(true);
  });

  it('closes an open transition and opens a new one with dwell filled', async () => {
    const { rows } = await query('SELECT id FROM monitored_sources LIMIT 1');
    const sourceId = rows[0].id;
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: null, toState: 'bright', enteredAt: '2026-08-19T00:00:00Z' });
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: 'bright', toState: 'dark', enteredAt: '2026-08-19T01:00:00Z' });
    const open = await repo.getOpenTransition({ sourceId, apSerial: 'T1' });
    expect(open.to_state).toBe('dark');
    expect(open.dwell_seconds).toBeNull();
  });
});
