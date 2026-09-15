import { describe, it, expect } from 'vitest';
import {
  RECONCILE,
  defaultEquals,
  reconcileAttribute,
  reconcileState,
  configuredWlanState,
  observedWlanState,
  reconcileWlan,
  expectationFromPeer,
  WLAN_SPEC,
} from './stateReconciler.js';

describe('defaultEquals', () => {
  it('treats the same value typed by two layers as equal', () => {
    // VLAN 30 from the config API and "30" from telemetry are one VLAN.
    expect(defaultEquals(30, '30')).toBe(true);
    expect(defaultEquals(true, 'enabled')).toBe(true);
    expect(defaultEquals('WPA3-SAE', 'wpa3-sae')).toBe(true);
  });

  it('does not treat absent as equal to present', () => {
    expect(defaultEquals(null, 0)).toBe(false);
    expect(defaultEquals(undefined, false)).toBe(false);
  });

  it('compares radio index lists order-independently', () => {
    expect(defaultEquals([1, 2], [2, 1])).toBe(true);
    expect(defaultEquals([1, 2], [1])).toBe(false);
  });
});

describe('reconcileAttribute', () => {
  it('aligned when all three agree', () => {
    const r = reconcileAttribute({ attribute: 'vlan', expected: 30, configured: '30', observed: 30 });
    expect(r.verdict).toBe(RECONCILE.ALIGNED);
  });

  it('config_drift when the configuration is not what was expected', () => {
    const r = reconcileAttribute({ attribute: 'vlan', expected: 30, configured: 20, observed: 20 });
    expect(r.verdict).toBe(RECONCILE.CONFIG_DRIFT);
    expect(r.detail).toMatch(/Expected 30.*configured with 20/);
  });

  it('not_applied when the configuration is right and the running state is not', () => {
    // The dominant failure mode: accepted, returned 200, silently discarded.
    const r = reconcileAttribute({ attribute: 'vlan', expected: 30, configured: 30, observed: 20 });
    expect(r.verdict).toBe(RECONCILE.NOT_APPLIED);
    expect(r.detail).toMatch(/silently discarded/);
  });

  it('unexpected_state when config matches expectation but reality does not', () => {
    const r = reconcileAttribute({ attribute: 'enabled', expected: true, configured: null, observed: false });
    expect(r.verdict).toBe(RECONCILE.UNEXPECTED_STATE);
  });

  it('is UNKNOWN, never aligned, when the attribute has no operational reading', () => {
    // Marking an unverifiable attribute as aligned is how a silent drop passes.
    const r = reconcileAttribute({
      attribute: 'security',
      expected: 'WPA3-SAE',
      configured: 'WPA3-SAE',
      observed: undefined,
      observable: false,
    });
    expect(r.verdict).toBe(RECONCILE.UNKNOWN);
    expect(r.detail).toMatch(/cannot be verified/);
  });

  it('still reports drift on an unobservable attribute when config differs from intent', () => {
    const r = reconcileAttribute({
      attribute: 'security',
      expected: 'WPA3-SAE',
      configured: 'WPA2-PSK',
      observed: undefined,
      observable: false,
    });
    expect(r.verdict).toBe(RECONCILE.CONFIG_DRIFT);
  });
});

describe('reconcileState', () => {
  it('ranks not_applied above drift in the summary', () => {
    const r = reconcileState({
      subject: 'WLAN Staff',
      expected: { vlan: 30, enabled: true },
      configured: { vlan: 30, enabled: true },
      observed: { vlan: 20, enabled: true },
    });
    expect(r.verdict).toBe(RECONCILE.NOT_APPLIED);
    expect(r.rows[0].attribute).toBe('vlan');
    expect(r.summary).toMatch(/silently dropped/);
  });

  it('says an aligned configuration is a real result worth acting on', () => {
    const r = reconcileState({
      subject: 'WLAN Staff',
      expected: { vlan: 30 },
      configured: { vlan: 30 },
      observed: { vlan: 30 },
      expectedSource: 'the working site',
    });
    expect(r.verdict).toBe(RECONCILE.ALIGNED);
    expect(r.summary).toMatch(/the cause is not this configuration/);
  });

  it('records that no expectation was supplied rather than inventing one', () => {
    const r = reconcileState({
      subject: 'WLAN Staff',
      configured: { vlan: 30 },
      observed: { vlan: 30 },
    });
    expect(r.hasExpectation).toBe(false);
  });

  it('lists unverifiable attributes so they can become API gap entries', () => {
    const r = reconcileState({
      subject: 'WLAN Staff',
      configured: { vlan: 30, security: 'WPA3-SAE' },
      observed: { vlan: 30 },
      spec: { security: { observable: false } },
    });
    expect(r.unverifiable).toContain('security');
  });
});

describe('configuredWlanState', () => {
  const topologies = [{ id: 't-1', name: 'Staff', vlanid: 30 }];

  it('resolves the topology to a VLAN', () => {
    const s = configuredWlanState({ id: 's-1', ssid: 'Staff', defaultTopology: 't-1' }, { topologies });
    expect(s).toMatchObject({ ssid: 'Staff', topologyName: 'Staff', vlan: 30 });
  });

  it('leaves topologyName null when the reference dangles', () => {
    const s = configuredWlanState({ id: 's-1', ssid: 'Staff', defaultTopology: 't-missing' }, { topologies });
    expect(s.topologyId).toBe('t-missing');
    expect(s.topologyName).toBeNull();
  });

  it('collects radio bindings from the profiles', () => {
    const s = configuredWlanState(
      { id: 's-1', ssid: 'Staff' },
      { topologies, profiles: [{ radioIfList: [{ serviceId: 's-1', radioIndex: 1 }, { serviceId: 's-1', radioIndex: 2 }] }] }
    );
    expect(s.radioIndices.sort()).toEqual([1, 2]);
  });
});

describe('observedWlanState', () => {
  it('distinguishes "no AP carries it" from "we did not look"', () => {
    expect(observedWlanState('Staff', { apRows: [], clientRows: [] }).enabled).toBeNull();
    expect(observedWlanState('Staff', { apRows: [{ services: [] }] }).enabled).toBe(false);
  });

  it('reports the VLAN clients are actually on', () => {
    const o = observedWlanState('Staff', {
      apRows: [{ services: [{ ssid: 'Staff' }] }],
      clientRows: [{ SSID: 'Staff', Vlan: 20 }, { SSID: 'Staff', Vlan: 20 }],
    });
    expect(o.vlan).toBe(20);
    expect(o.associatedClients).toBe(2);
  });
});

describe('reconcileWlan — the headline case', () => {
  it('catches a WLAN configured for VLAN 30 whose clients are on VLAN 20', () => {
    const r = reconcileWlan({
      ssid: 'Staff',
      service: { id: 's-1', ssid: 'Staff', enabled: true, defaultTopology: 't-1' },
      topologies: [{ id: 't-1', name: 'Staff', vlanid: 30 }],
      apRows: [{ services: [{ ssid: 'Staff' }] }],
      clientRows: [{ SSID: 'Staff', Vlan: 20 }, { SSID: 'Staff', Vlan: 20 }, { SSID: 'Staff', Vlan: 20 }],
      expected: { vlan: 30 },
      expectedSource: 'the operator intent',
    });
    expect(r.verdict).toBe(RECONCILE.NOT_APPLIED);
    const vlanRow = r.rows.find((x) => x.attribute === 'vlan');
    expect(vlanRow.verdict).toBe(RECONCILE.NOT_APPLIED);
    expect(vlanRow.configured).toBe(30);
    expect(vlanRow.observed).toBe(20);
  });

  it('catches a dangling topology even when everything else looks healthy', () => {
    const r = reconcileWlan({
      ssid: 'Staff',
      service: { id: 's-1', ssid: 'Staff', enabled: true, defaultTopology: 't-gone' },
      topologies: [{ id: 't-1', name: 'Other', vlanid: 10 }],
      apRows: [{ services: [{ ssid: 'Staff' }] }],
      clientRows: [{ SSID: 'Staff' }],
    });
    expect(r.verdict).toBe(RECONCILE.NOT_APPLIED);
    expect(r.rows[0].attribute).toBe('topologyResolves');
    expect(r.rows[0].detail).toMatch(/nowhere to go/);
  });

  it('does not claim the radio binding is verified, because it cannot be', () => {
    const r = reconcileWlan({
      ssid: 'Staff',
      service: { id: 's-1', ssid: 'Staff', enabled: true, defaultTopology: 't-1' },
      topologies: [{ id: 't-1', name: 'Staff', vlanid: 30 }],
      profiles: [{ radioIfList: [{ serviceId: 's-1', radioIndex: 0 }] }],
      apRows: [{ services: [{ ssid: 'Staff' }] }],
      clientRows: [{ SSID: 'Staff', Vlan: 30 }],
    });
    expect(r.unverifiable).toContain('radioIndices');
    expect(WLAN_SPEC.radioIndices.note).toMatch(/index 0 is accepted and silently dropped/);
  });

  it('proves a correct WLAN correct, which is what licenses moving on', () => {
    const r = reconcileWlan({
      ssid: 'Staff',
      service: { id: 's-1', ssid: 'Staff', enabled: true, defaultTopology: 't-1' },
      topologies: [{ id: 't-1', name: 'Staff', vlanid: 30 }],
      apRows: [{ services: [{ ssid: 'Staff' }] }],
      clientRows: [{ SSID: 'Staff', Vlan: 30 }],
      expected: { vlan: 30, enabled: true },
    });
    expect(r.verdict).toBe(RECONCILE.ALIGNED);
    expect(r.summary).toMatch(/the cause is not this configuration/);
  });
});

describe('expectationFromPeer', () => {
  it('uses a working site as the expectation', () => {
    const peer = { ssid: 'Staff', vlan: 30, security: 'WPA3-SAE', topologyId: 't-peer' };
    const { expected, expectedSource } = expectationFromPeer(peer, { peerLabel: 'Staff at SiteA' });
    expect(expected.vlan).toBe(30);
    expect(expectedSource).toBe('Staff at SiteA');
  });

  it('excludes identifiers that are legitimately per-site', () => {
    // Otherwise every site reads as drifted from every other site.
    const { expected } = expectationFromPeer({ vlan: 30, topologyId: 't-peer', topologyName: 'Staff-A' });
    expect(expected.topologyId).toBeUndefined();
    expect(expected.topologyName).toBeUndefined();
  });
});
