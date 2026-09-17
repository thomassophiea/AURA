import { describe, it, expect, vi } from 'vitest';
import { deployWlanToSite } from './siteDeploymentEngine.js';

const SERVICE_ID = 'svc-1';

const bindPlan = (over = {}) => ({
  status: 'ok',
  site: 'PrimarySite',
  serviceId: SERVICE_ID,
  serviceName: 'Skynet',
  targets: [
    {
      profileName: 'AP5020-INDOOR',
      profileId: 'p1',
      action: 'bind',
      forkName: null,
      protectedSites: [],
      apNames: ['AP-01'],
      apSerials: ['S1'],
      radios: [{ index: 1, band: '2.4' }, { index: 2, band: '5' }],
      alreadyBound: [],
      excluded: [],
    },
  ],
  ...over,
});

const forkPlan = () => ({
  status: 'ok',
  site: 'EAL-PT-N',
  serviceId: SERVICE_ID,
  serviceName: 'Skynet',
  targets: [
    {
      profileName: '5022-N',
      profileId: 'p3',
      action: 'fork',
      forkName: '5022-N-EAL-PT-N',
      protectedSites: ['EAL-PT-S'],
      apNames: ['EAL-PT-N-5th'],
      apSerials: ['S9'],
      radios: [{ index: 1, band: '2.4' }],
      alreadyBound: [],
      excluded: [],
    },
  ],
});

/**
 * A Gateway double. `requestXcc` always sends an explicit method, so matching
 * on `init.method` is required — a stub keyed on `undefined` never fires.
 */
function gateway({ bindLands = true, apOverride = false, moveLands = true, cloneId = 'clone-1' } = {}) {
  const state = {
    p1: { id: 'p1', name: 'AP5020-INDOOR', radios: [], radioIfList: [], dscp: { codePoints: [1] } },
    p3: { id: 'p3', name: '5022-N', radios: [], radioIfList: [] },
    [cloneId]: null,
  };
  const aps = { S1: { serialNumber: 'S1', profileId: 'p1' }, S9: { serialNumber: 'S9', profileId: 'p3', radioIfListOvr: apOverride } };
  const calls = [];

  const fetchFn = vi.fn(async (url, init) => {
    const path = url.replace(/^.*\/management/, '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, body });
    const json = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });

    if (init.method === 'POST' && path === '/v3/profiles') {
      state[cloneId] = { ...body, id: cloneId, radioIfList: [] };
      return json({ id: cloneId });
    }
    if (init.method === 'PUT' && path.startsWith('/v3/profiles/')) {
      const id = path.split('/').pop();
      state[id] = bindLands ? body : { ...state[id], radioIfList: [] };
      return { ok: true, status: 200, text: async () => '' };
    }
    if (init.method === 'GET' && path.startsWith('/v3/profiles/')) {
      const id = path.split('/').pop();
      return state[id] ? json(state[id]) : { ok: false, status: 404, text: async () => 'not found' };
    }
    if (init.method === 'PUT' && path.startsWith('/v1/aps/')) {
      const s = path.split('/').pop();
      if (moveLands) aps[s] = body;
      return { ok: true, status: 200, text: async () => '' };
    }
    if (init.method === 'GET' && path.startsWith('/v1/aps/')) {
      return json(aps[path.split('/').pop()]);
    }
    return { ok: false, status: 404, text: async () => 'unexpected ' + init.method + ' ' + path };
  });

  return { fetchFn, calls, state, aps };
}

const run = (plan, gw) =>
  deployWlanToSite({ plan, authToken: 'Bearer x', controllerUrl: 'https://gw', fetchFn: gw.fetchFn });

describe('deployWlanToSite — binding in place', () => {
  it('binds the planned radios and proves it by re-reading', async () => {
    const gw = gateway();
    const r = await run(bindPlan(), gw);

    expect(r.status).toBe('applied');
    expect(r.targets[0].boundIndices).toEqual([1, 2]);
  });

  it('PUTs the whole profile, not a fragment', async () => {
    const gw = gateway();
    await run(bindPlan(), gw);

    const put = gw.calls.find((c) => c.method === 'PUT' && c.path === '/v3/profiles/p1');
    expect(put.body.dscp).toEqual({ codePoints: [1] });
    expect(put.body.radioIfList).toEqual([
      { serviceId: SERVICE_ID, index: 1 },
      { serviceId: SERVICE_ID, index: 2 },
    ]);
  });

  it('reports a binding the Gateway accepted and discarded as a failure', async () => {
    const gw = gateway({ bindLands: false });
    const r = await run(bindPlan(), gw);

    expect(r.targets[0].status).toBe('silently_dropped');
    expect(r.status).toBe('failed');
  });

  it('never writes index 0', async () => {
    const gw = gateway();
    await run(bindPlan(), gw);
    const put = gw.calls.find((c) => c.method === 'PUT' && c.path === '/v3/profiles/p1');
    expect(put.body.radioIfList.map((e) => e.index)).not.toContain(0);
  });

  it('skips a target with nothing to bind', async () => {
    const plan = bindPlan();
    plan.targets[0].radios = [];
    const gw = gateway();
    const r = await run(plan, gw);

    expect(r.targets[0].status).toBe('skipped');
    expect(gw.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

describe('deployWlanToSite — forking', () => {
  it('clones, re-homes, then binds — in that order', async () => {
    const gw = gateway();
    const r = await run(forkPlan(), gw);

    expect(r.status).toBe('applied');
    const seq = gw.calls.filter((c) => c.method !== 'GET').map((c) => c.method + ' ' + c.path);
    expect(seq[0]).toBe('POST /v3/profiles');
    expect(seq.indexOf('PUT /v1/aps/S9')).toBeLessThan(seq.indexOf('PUT /v3/profiles/clone-1'));
  });

  it('never touches the shared original profile', async () => {
    // The whole point of forking: EAL-PT-S must keep exactly what it had.
    const gw = gateway();
    await run(forkPlan(), gw);

    expect(gw.calls.some((c) => c.method === 'PUT' && c.path === '/v3/profiles/p3')).toBe(false);
  });

  it('takes the clone id the Gateway returned, not the one it sent', async () => {
    const gw = gateway({ cloneId: 'server-assigned-9' });
    const r = await run(forkPlan(), gw);

    expect(r.targets[0].forkId).toBe('server-assigned-9');
    expect(r.status).toBe('applied');
  });

  it('names the sites the fork protected', async () => {
    const gw = gateway();
    const r = await run(forkPlan(), gw);
    expect(r.targets[0].protectedSites).toEqual(['EAL-PT-S']);
  });

  it('REFUSES to re-home an AP carrying its own service bindings', async () => {
    // radioIfListOvr means per-AP configuration that re-homing would wipe.
    const gw = gateway({ apOverride: true });
    const r = await run(forkPlan(), gw);

    expect(r.targets[0].apsMoved).toBe(0);
    expect(r.targets[0].apsRefused[0].status).toBe('refused');
    expect(r.targets[0].apsRefused[0].error).toMatch(/per-AP service bindings/i);
    // The binding may have worked, but the AP never moved — not a full success.
    expect(r.targets[0].status).toBe('partial');
  });

  it('reports partial when the binding lands but an AP did not move', async () => {
    const gw = gateway({ moveLands: false });
    const r = await run(forkPlan(), gw);

    expect(r.targets[0].status).toBe('partial');
    expect(r.status).toBe('partial');
  });
});

describe('deployWlanToSite — refusals', () => {
  it('will not deploy to a site that does not exist', async () => {
    const gw = gateway();
    const r = await run(
      { status: 'site_matched_nothing', site: 'Warehouse', warnings: ['No AP reports hostSite "Warehouse".'] },
      gw
    );

    expect(r.status).toBe('failed');
    expect(r.summary).toMatch(/Warehouse/);
    expect(gw.fetchFn).not.toHaveBeenCalled();
  });

  it('reports an already-deployed WLAN as a no-op without writing', async () => {
    const gw = gateway();
    const r = await run(
      { status: 'already_deployed', site: 'PrimarySite', serviceName: 'Skynet', targets: [] },
      gw
    );

    expect(r.status).toBe('noop');
    expect(r.summary).toMatch(/already broadcast/i);
    expect(gw.fetchFn).not.toHaveBeenCalled();
  });
});
