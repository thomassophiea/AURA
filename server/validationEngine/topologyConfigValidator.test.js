import { describe, it, expect, vi } from 'vitest';
import { validateTopologyIntent, canonicalizeTopologyIntent } from './topologyConfigValidator.js';
import { verifyValidationToken } from '../cortex/validationToken.js';

const TOPOLOGIES = [
  { id: 'topo-1', name: 'Bridged at AP untagged', vlanid: 1 },
  { id: 'topo-2', name: 'v2', vlanid: 2 },
];

const opts = { authToken: 'tok', controllerUrl: 'https://ctrl.local' };

function urlFetch(routes) {
  return vi.fn((url) => {
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) return Promise.resolve({ ok: false, status: 404, statusText: 'not stubbed', text: async () => 'not stubbed' });
    return Promise.resolve({ ok: true, json: async () => match[1] });
  });
}

const baseIntent = { action: 'create_vlan', vlanId: 40, topologyName: 'Voice', mode: 'BridgedAtAp', tagged: true };

describe('validateTopologyIntent', () => {
  it('produces a HIGH-confidence report with a signed token when the VLAN id is free', async () => {
    const fetchFn = urlFetch({ '/v1/topologies': TOPOLOGIES });
    const report = await validateTopologyIntent(baseIntent, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toEqual([]);
    expect(report.validationToken).not.toBeNull();
    const verified = verifyValidationToken(report.validationToken);
    expect(verified.planHash).toBe(report.planHash);
  });

  it('blocks and issues no token when the vlanid is already in use — the Gateway itself will not stop this', async () => {
    const fetchFn = urlFetch({ '/v1/topologies': TOPOLOGIES });
    const report = await validateTopologyIntent({ ...baseIntent, vlanId: 1 }, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('vlan_conflict');
    expect(report.validationToken).toBeNull();
    expect(report.checks.find((c) => c.name === 'vlan_conflict').evidence).toMatch(/already in use/);
  });

  it('blocks on an out-of-range VLAN id', async () => {
    const fetchFn = urlFetch({ '/v1/topologies': TOPOLOGIES });
    const report = await validateTopologyIntent({ ...baseIntent, vlanId: 5000 }, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('vlan_id_range');
    expect(report.validationToken).toBeNull();
  });

  it('blocks on a duplicate topology name even with a free VLAN id', async () => {
    const fetchFn = urlFetch({ '/v1/topologies': TOPOLOGIES });
    const report = await validateTopologyIntent({ ...baseIntent, vlanId: 41, topologyName: 'v2' }, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('vlan_conflict');
  });

  it('blocks (rather than throws) when the controller is unreachable', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const report = await validateTopologyIntent(baseIntent, { ...opts, fetchFn });
    expect(report.confidence.blockingIssues).toContain('vlan_conflict');
    expect(report.validationToken).toBeNull();
  });
});

describe('canonicalizeTopologyIntent', () => {
  it('is stable regardless of key order / extra fields', () => {
    const a = canonicalizeTopologyIntent({ vlanId: 40, topologyName: 'Voice', mode: 'BridgedAtAp', tagged: true, extra: 'ignored' });
    const b = canonicalizeTopologyIntent({ tagged: true, mode: 'BridgedAtAp', topologyName: 'Voice', vlanId: 40 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
