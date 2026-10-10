import { describe, it, expect, vi } from 'vitest';
import { createChangeProposals, wlanBlastRadius } from './changeProposals.js';

const gateway = {
  get: async (path) => {
    if (path === '/v3/profiles') {
      return {
        ok: true,
        data: [
          { name: 'P1', radioIfList: [{ serviceId: 'svc-1' }] },
          { name: 'P2', radioIfList: [] },
        ],
      };
    }
    if (path === '/v1/aps/query') {
      return {
        ok: true,
        data: [
          { profileName: 'P1', hostSite: 'A' },
          { profileName: 'P1', hostSite: 'B' },
          { profileName: 'P2', hostSite: 'C' },
        ],
      };
    }
    return { ok: false, status: 404 };
  },
};

function tools(surface) {
  return { listAvailableChanges: { handler: vi.fn(async () => surface) } };
}

const SURFACE = {
  basis: 'observed',
  serviceId: 'svc-1',
  available: [{ id: 'wlan.11k', label: '802.11k neighbour reports', current: false }],
  unavailable: [{ id: 'wlan.11r', label: '802.11r', reason: 'not exposed on this Gateway' }],
};

function make() {
  const engine = {
    begin: vi.fn(async () => ({ workflow: { id: 'wf-1' }, store: 'memory' })),
    advance: vi.fn(async () => ({})),
    requestConfirmation: vi.fn(async () => ({})),
    buildPreview: vi.fn(async () => ({
      diff: { path: 'enabled11kSupport', from: false, to: true },
    })),
  };
  const store = { load: vi.fn(), listPending: vi.fn(async () => []) };
  const audit = vi.fn();
  return { p: createChangeProposals({ engine, store, audit }), engine, store, audit };
}

describe('wlanBlastRadius', () => {
  it('finds the profiles, sites and APs that broadcast the WLAN', async () => {
    const r = await wlanBlastRadius(gateway, 'svc-1');
    expect(r).toMatchObject({ known: true, profiles: ['P1'], sites: ['A', 'B'], accessPoints: 2 });
  });
});

describe('change proposals', () => {
  it('drafts a catalogued change as a workflow awaiting approval, and never executes', async () => {
    const { p, engine, audit } = make();
    const out = await p.propose({
      tools: tools(SURFACE),
      session: gateway,
      controllerUrl: 'https://gw',
      wlanName: 'Skynet',
      changeId: 'wlan.11k',
      desired: true,
    });
    expect(out.status).toBe('awaiting_approval');
    expect(out.workflowId).toBe('wf-1');
    expect(out.blastRadius.accessPoints).toBe(2);
    const begun = engine.begin.mock.calls[0][0];
    expect(begun.workflowType).toBe('modify_wlan');
    expect(begun.sessionId).toMatch(/^mcp:/);
    expect(begun.requestedState).toMatchObject({
      origin: 'mcp',
      serviceId: 'svc-1',
      currentValue: false,
      desired: true,
      controllerUrl: 'https://gw',
    });
    expect(engine.requestConfirmation).toHaveBeenCalledWith('wf-1');
    expect(engine).not.toHaveProperty('execute');
    expect(audit).toHaveBeenCalledWith(
      'mcp.change.proposed',
      expect.objectContaining({ actor: 'mcp-token' })
    );
  });

  it('refuses a change outside the catalogue for this Gateway', async () => {
    const { p, engine } = make();
    const out = await p.propose({
      tools: tools(SURFACE),
      session: gateway,
      controllerUrl: 'x',
      wlanName: 'Skynet',
      changeId: 'wlan.11r',
      desired: true,
    });
    expect(out.status).toBe('refused');
    expect(out.notExposedByThisGateway).toContain('wlan.11r');
    expect(engine.begin).not.toHaveBeenCalled();
  });

  it('refuses a no-op and an invalid value', async () => {
    const { p, engine } = make();
    const noop = await p.propose({
      tools: tools(SURFACE),
      session: gateway,
      controllerUrl: 'x',
      wlanName: 'Skynet',
      changeId: 'wlan.11k',
      desired: false,
    });
    expect(noop.status).toBe('refused');
    const bad = await p.propose({
      tools: tools(SURFACE),
      session: gateway,
      controllerUrl: 'x',
      wlanName: 'Skynet',
      changeId: 'wlan.11k',
      desired: 'banana',
    });
    expect(bad.status).toBe('refused');
    expect(engine.begin).not.toHaveBeenCalled();
  });

  it('refuses an unknown WLAN with the names that exist', async () => {
    const { p } = make();
    const out = await p.propose({
      tools: tools({
        unavailable: true,
        status: 'scope_matched_nothing',
        reason: 'No WLAN called "X"',
      }),
      session: gateway,
      controllerUrl: 'x',
      wlanName: 'X',
      changeId: 'wlan.11k',
      desired: true,
    });
    expect(out.status).toBe('refused');
    expect(out.reason).toMatch(/No WLAN/);
  });

  it('maps workflow states to plain outcomes', async () => {
    const { p, store } = make();
    store.load.mockResolvedValueOnce({
      status: 'COMPLETED',
      requestedState: { wlanName: 'Skynet' },
      validation: { after: true },
    });
    expect((await p.status('wf-1')).state).toBe('applied_and_verified');
    store.load.mockResolvedValueOnce({
      status: 'CANCELLED',
      confirmationState: 'declined',
      requestedState: {},
    });
    expect((await p.status('wf-1')).state).toBe('declined');
    store.load.mockResolvedValueOnce(null);
    expect((await p.status('nope')).unavailable).toBe(true);
  });
});
