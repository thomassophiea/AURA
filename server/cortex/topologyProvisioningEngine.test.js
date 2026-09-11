import { describe, it, expect, vi } from 'vitest';
import { provisionTopology, rollbackTopology, pickTopologyTemplate, buildTopologyPayload } from './topologyProvisioningEngine.js';
import { signValidationToken, computePlanHash } from './validationToken.js';
import { canonicalizeTopologyIntent } from '../validationEngine/topologyConfigValidator.js';

const intent = { action: 'create_vlan', vlanId: 40, topologyName: 'Voice', mode: 'BridgedAtAp', tagged: true };

function validToken(forIntent = intent) {
  const planHash = computePlanHash(canonicalizeTopologyIntent(forIntent));
  const { token } = signValidationToken(planHash);
  return { planHash, token };
}

const EXISTING_TOPOLOGIES = [{ id: 'topo-1', name: 'v2', vlanid: 2, mode: 'BridgedAtAp', tagged: true, mtu: 1500 }];

const opts = { authToken: 'tok', controllerUrl: 'https://ctrl.local' };

describe('pickTopologyTemplate', () => {
  it('prefers a topology already in the requested mode', () => {
    const topos = [{ mode: 'RoutedAtAc' }, { mode: 'BridgedAtAp', name: 'match' }];
    expect(pickTopologyTemplate(topos, 'BridgedAtAp').name).toBe('match');
  });
  it('falls back to the first topology when no mode match exists', () => {
    const topos = [{ mode: 'RoutedAtAc', name: 'first' }];
    expect(pickTopologyTemplate(topos, 'BridgedAtAp').name).toBe('first');
  });
});

describe('buildTopologyPayload', () => {
  it('strips server-identity fields and overrides only what the intent specifies', () => {
    const template = { id: 'old-id', canDelete: true, canEdit: true, custId: 'x', profiles: [1], members: [1], mode: 'BridgedAtAp', mtu: 1500 };
    const payload = buildTopologyPayload(intent, template);
    expect(payload.id).toBeUndefined();
    expect(payload.canDelete).toBeUndefined();
    expect(payload.name).toBe('Voice');
    expect(payload.vlanid).toBe(40);
    expect(payload.tagged).toBe(true);
    expect(payload.mtu).toBe(1500); // inherited, not invented
  });

  it('defaults the name to VLAN-<id> when the intent gave none', () => {
    const payload = buildTopologyPayload({ vlanId: 99 }, null);
    expect(payload.name).toBe('VLAN-99');
    expect(payload.mode).toBe('BridgedAtAp'); // scaffold default when no template exists
  });
});

describe('provisionTopology', () => {
  it('fails closed on an invalid/stale validation token', async () => {
    const result = await provisionTopology({ intent, planHash: 'bogus', validationToken: 'bogus.sig', ...opts });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('authorization');
  });

  it('creates a topology, reads back by the SERVER-ASSIGNED id (not the one implied by the request)', async () => {
    const { planHash, token } = validToken();
    const created = { id: 'server-assigned-id', name: 'Voice', vlanid: 40, tagged: true, mode: 'BridgedAtAp' };
    const fetchFn = vi.fn((url, init) => {
      // Most-specific route first: the id-suffixed read-back GET is also a
      // substring match for the plain list GET below, so it must win the race.
      if (url.includes('/v1/topologies/server-assigned-id')) {
        return Promise.resolve({ ok: true, json: async () => created });
      }
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => created, text: async () => JSON.stringify(created) });
      }
      if (url.includes('/v1/topologies')) {
        return Promise.resolve({ ok: true, json: async () => EXISTING_TOPOLOGIES });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'unstubbed' });
    });

    const result = await provisionTopology({ intent, planHash, validationToken: token, ...opts, fetchFn });
    expect(result.status).toBe('completed');
    expect(result.topologyId).toBe('server-assigned-id');
    expect(result.readBack.vlanMismatch).toBe(false);
  });

  it('re-checks for a vlanid conflict immediately before writing (the token can be up to 30 min old)', async () => {
    const { planHash, token } = validToken();
    const fetchFn = vi.fn((_url) =>
      Promise.resolve({ ok: true, json: async () => [{ id: 'topo-x', name: 'Someone else', vlanid: 40 }] })
    );
    const result = await provisionTopology({ intent, planHash, validationToken: token, ...opts, fetchFn });
    expect(result.status).toBe('failed');
    expect(result.stage).toBe('conflict_recheck');
  });

  it('reports degraded when the create response carries no id (response shape changed)', async () => {
    const { planHash, token } = validToken();
    const fetchFn = vi.fn((url, init) => {
      if (init?.method === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({}), text: async () => '{}' });
      return Promise.resolve({ ok: true, json: async () => EXISTING_TOPOLOGIES });
    });
    const result = await provisionTopology({ intent, planHash, validationToken: token, ...opts, fetchFn });
    expect(result.status).toBe('degraded');
    expect(result.stage).toBe('create_topology');
  });
});

describe('rollbackTopology', () => {
  it('blocks deletion when a service still references the topology', async () => {
    const fetchFn = vi.fn((_url) =>
      Promise.resolve({ ok: true, json: async () => [{ id: 'svc-1', serviceName: 'Guest', defaultTopology: 'topo-1' }] })
    );
    const result = await rollbackTopology({ topologyId: 'topo-1', ...opts, fetchFn });
    expect(result.status).toBe('blocked');
    expect(result.dependents).toHaveLength(1);
  });

  it('deletes cleanly when nothing references the topology', async () => {
    const fetchFn = vi.fn((_url, init) => {
      if (init?.method === 'DELETE') return Promise.resolve({ ok: true, status: 200, json: async () => null, text: async () => '' });
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    const result = await rollbackTopology({ topologyId: 'topo-1', ...opts, fetchFn });
    expect(result.status).toBe('completed');
  });
});
