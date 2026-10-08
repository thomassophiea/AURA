import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  siteNamesById,
  planRename,
  reconcileConfigSiteNames,
  __resetReconcilerCache,
} from './siteNameReconciler.js';

// The real rename, from the Gateway audit log 2026-10-06.
const CONFIG = {
  monitored_source_id: 'src',
  treatment_site_id: '7d4b39b9',
  treatment_site_name: 'EAL-PT-N',
  control_site_id: '4007b7c5',
  control_site_name: 'EAL-PT-S',
};
const LIVE = [
  { id: '7d4b39b9', siteName: 'EAL-PT-B' },
  { id: '4007b7c5', siteName: 'EAL-PT-A' },
  { id: 'other', siteName: 'PrimarySite' },
];
const SOURCE = { id: 'src' };

beforeEach(() => __resetReconcilerCache());

describe('planRename', () => {
  it('follows a rename by id, keeping Treatment and Control on the same sites', () => {
    expect(planRename(CONFIG, siteNamesById(LIVE))).toEqual({
      treatmentSiteName: 'EAL-PT-B',
      controlSiteName: 'EAL-PT-A',
    });
  });

  it('proposes nothing when the names already match', () => {
    const current = { ...CONFIG, treatment_site_name: 'EAL-PT-B', control_site_name: 'EAL-PT-A' };
    expect(planRename(current, siteNamesById(LIVE))).toBeNull();
  });

  it('keeps the stored name for a site that no longer exists rather than blanking it', () => {
    const plan = planRename(CONFIG, siteNamesById([{ id: '7d4b39b9', siteName: 'EAL-PT-B' }]));
    expect(plan).toEqual({ treatmentSiteName: 'EAL-PT-B', controlSiteName: 'EAL-PT-S' });
  });
});

describe('reconcileConfigSiteNames', () => {
  const session = (response) => ({ get: vi.fn(async () => response) });

  it('writes the live names and returns the updated config', async () => {
    const updateNames = vi.fn(async (_id, names) => ({
      ...CONFIG,
      treatment_site_name: names.treatmentSiteName,
      control_site_name: names.controlSiteName,
    }));
    const s = session({ ok: true, data: LIVE });
    const out = await reconcileConfigSiteNames({ source: SOURCE, config: CONFIG, sessionFor: async () => s, updateNames });
    expect(updateNames).toHaveBeenCalledWith('src', { treatmentSiteName: 'EAL-PT-B', controlSiteName: 'EAL-PT-A' });
    expect(out.treatment_site_name).toBe('EAL-PT-B');
  });

  it('asks the Gateway at most once per cache window unless forced', async () => {
    const s = session({ ok: true, data: LIVE });
    const args = { source: SOURCE, config: CONFIG, sessionFor: async () => s, updateNames: async () => null };
    await reconcileConfigSiteNames({ ...args, now: 0 });
    await reconcileConfigSiteNames({ ...args, now: 60_000 });
    expect(s.get).toHaveBeenCalledTimes(1);
    await reconcileConfigSiteNames({ ...args, now: 60_000, force: true });
    expect(s.get).toHaveBeenCalledTimes(2);
  });

  it('leaves the config untouched when the Gateway cannot be read', async () => {
    const updateNames = vi.fn();
    const out = await reconcileConfigSiteNames({
      source: SOURCE,
      config: CONFIG,
      sessionFor: async () => session({ ok: false, status: 500 }),
      updateNames,
    });
    expect(out).toBe(CONFIG);
    expect(updateNames).not.toHaveBeenCalled();
  });

  it('never throws, even when the session cannot be minted', async () => {
    const out = await reconcileConfigSiteNames({
      source: SOURCE,
      config: CONFIG,
      sessionFor: async () => {
        throw new Error('auth');
      },
      updateNames: vi.fn(),
    });
    expect(out).toBe(CONFIG);
  });

  it('uses a supplied live site map without calling the Gateway', async () => {
    const sessionFor = vi.fn();
    await reconcileConfigSiteNames({
      source: SOURCE,
      config: CONFIG,
      sessionFor,
      updateNames: async () => null,
      namesById: siteNamesById(LIVE),
    });
    expect(sessionFor).not.toHaveBeenCalled();
  });
});
