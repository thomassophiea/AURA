/**
 * Unit tests for the Policy suite's pure helpers: controller-matching
 * validation ranges/patterns, ToS/DSCP byte math, rule derivation, and the
 * VLAN-group member-pool filter.
 */
import { describe, expect, it } from 'vitest';
import type { Topology, VlanGroup } from '../../../types/configure';
import {
  availableGroupMembers,
  cosErrors,
  dscpHex,
  fmtMode,
  fmtPriority,
  getIn,
  hasRedirectRule,
  inRange,
  isInternalMode,
  newRuleDraft,
  rateLimiterErrors,
  roleErrors,
  ruleActionLabel,
  ruleDisplayName,
  ruleErrors,
  ruleMatchText,
  setIn,
  topologyErrors,
  tosFromBits,
  tosFromDscp,
  tosHex,
  vlanGroupErrors,
  vlanOptionLabel,
} from './policyUtils';

describe('inRange', () => {
  it('accepts bounds inclusively and rejects blanks', () => {
    expect(inRange(128, 128, 500000)).toBe(true);
    expect(inRange(500000, 128, 500000)).toBe(true);
    expect(inRange(127, 128, 500000)).toBe(false);
    expect(inRange('', 128, 500000)).toBe(false);
    expect(inRange(null, 128, 500000)).toBe(false);
    expect(inRange('4094', 1, 4094)).toBe(true);
  });
});

describe('setIn / getIn', () => {
  it('writes nested dot-paths immutably', () => {
    const obj = { cosQos: { priority: 'notApplicable', tosDscp: null } };
    const next = setIn(obj, 'cosQos.priority', 'priority3');
    expect(next.cosQos.priority).toBe('priority3');
    expect(obj.cosQos.priority).toBe('notApplicable');
    expect(getIn(next, 'cosQos.priority')).toBe('priority3');
  });

  it('creates intermediate objects for missing segments', () => {
    const next = setIn({} as Record<string, unknown>, 'source.port.low', 1024);
    expect(getIn(next, 'source.port.low')).toBe(1024);
  });
});

describe('ToS/DSCP math', () => {
  it('round-trips DSCP through the ToS byte', () => {
    expect(tosFromDscp(46)).toBe(184); // EF = 0xB8
    expect(dscpHex(184)).toBe('0x2E');
    expect(tosHex(184)).toBe('0xB8');
  });

  it('composes ToS from precedence and flag bits', () => {
    expect(tosFromBits(5, { delay: true })).toBe((5 << 5) | 16);
    expect(tosFromBits(0, {})).toBe(0);
  });

  it('clamps DSCP to 0-63', () => {
    expect(tosFromDscp(99)).toBe(63 << 2);
    expect(tosFromDscp(-1)).toBe(0);
  });
});

describe('display formatting', () => {
  it('labels the 5 user modes and passes internal modes through', () => {
    expect(fmtMode('BridgedAtAp')).toBe('Bridged@AP');
    expect(fmtMode('Gre')).toBe('GRE');
    expect(fmtMode('Routed')).toBe('Routed');
    expect(isInternalMode('Routed')).toBe(true);
    expect(isInternalMode('Vxlan')).toBe(false);
  });

  it('formats priorities per the controller enum', () => {
    expect(fmtPriority('notApplicable')).toBe('Any');
    expect(fmtPriority('priority7')).toBe('7');
  });

  it('labels topology options "name (vlanid)"', () => {
    expect(vlanOptionLabel({ name: 'Bridged at AP untagged', vlanid: 1 })).toBe(
      'Bridged at AP untagged (1)'
    );
  });
});

describe('newRuleDraft', () => {
  it('seeds L3 rules on the REAL flat keys (port/portLow/portHigh)', () => {
    const draft = newRuleDraft('l3Filters');
    expect(draft.action).toBe('FILTERACTION_DENY');
    expect(draft.intoNetwork).toBe('destAddr');
    expect(draft.outFromNetwork).toBe('sourceAddr');
    expect(draft.port).toBe('any');
    expect(draft.portLow).toBe(0);
    expect(draft.ipAddressRange).toBe('0.0.0.0/0');
  });

  it('seeds src-dest rules with the UNPREFIXED action and nested endpoints', () => {
    const draft = newRuleDraft('l3SrcDestFilters');
    expect(draft.action).toBe('DENY');
    expect(draft.source?.subnetType).toBe('anyIpAddress');
    expect(draft.destination?.port?.known).toBe('any');
  });
});

describe('ruleErrors', () => {
  it('requires a valid FQDN for hostName subnet type', () => {
    const draft = { ...newRuleDraft('l3Filters'), subnetType: 'hostName', ipAddressRange: 'not a fqdn' };
    expect(ruleErrors('l3Filters', draft).addr).toMatch(/FQDN/);
    draft.ipAddressRange = 'portal.example.com';
    expect(ruleErrors('l3Filters', draft).addr).toBeUndefined();
  });

  it('validates user-defined port ranges 0-65535', () => {
    const draft = { ...newRuleDraft('l3Filters'), port: 'userDefined', portLow: 70000 as number, portHigh: 80 as number };
    expect(ruleErrors('l3Filters', draft).port).toMatch(/65535/);
  });

  it('skips port validation for ICMP protocols', () => {
    const draft = {
      ...newRuleDraft('l3Filters'),
      protocol: 'icmp',
      port: 'userDefined',
      portLow: '' as const,
      portHigh: '' as const,
    };
    expect(ruleErrors('l3Filters', draft).port).toBeUndefined();
  });

  it('requires a hex ethertype for user-defined L2 rules', () => {
    const draft = { ...newRuleDraft('l2Filters'), ethertype: 'userDefined', ethertypeValue: '8100' };
    expect(ruleErrors('l2Filters', draft).ether).toMatch(/Hex/);
    draft.ethertypeValue = '0x8100';
    expect(ruleErrors('l2Filters', draft).ether).toBeUndefined();
  });

  it('requires the containment VLAN with per-group action enums', () => {
    const l3 = { ...newRuleDraft('l3Filters'), action: 'FILTERACTION_CONTAINTOVLAN' };
    expect(ruleErrors('l3Filters', l3).topology).toBeTruthy();
    const sd = { ...newRuleDraft('l3SrcDestFilters'), action: 'CONTAINTOVLAN' };
    expect(ruleErrors('l3SrcDestFilters', sd).topology).toBeTruthy();
    sd.topologyId = 'topo-1';
    expect(ruleErrors('l3SrcDestFilters', sd).topology).toBeUndefined();
  });

  it('validates nested src-dest endpoint ports and FQDNs', () => {
    const draft = newRuleDraft('l3SrcDestFilters');
    draft.source = { subnetType: 'hostName', address: 'bad host', port: { known: 'any', low: 0, high: 0 } };
    expect(ruleErrors('l3SrcDestFilters', draft).sourceAddr).toMatch(/FQDN/);
    draft.destination = { subnetType: 'anyIpAddress', address: '', port: { known: 'userDefined', low: -1, high: 10 } };
    expect(ruleErrors('l3SrcDestFilters', draft).destination).toMatch(/65535/);
  });
});

describe('rule display derivation', () => {
  it('derives a display name from match fields when name is empty (live Allow DNS shape)', () => {
    const rule = {
      name: '',
      action: 'FILTERACTION_ALLOW',
      subnetType: 'anyIpAddress',
      ipAddressRange: '0.0.0.0/0',
      port: 'dns',
      portLow: 53,
      portHigh: 53,
      protocol: 'udp',
    };
    expect(ruleDisplayName(rule, 'l3Filters')).toBe('UDP / dns');
    expect(ruleActionLabel(rule, 'l3Filters')).toBe('Allow');
    expect(ruleMatchText(rule, 'l3Filters')).toBe('udp :53 0.0.0.0/0');
  });

  it('renders NA as None for src-dest rules', () => {
    expect(ruleActionLabel({ action: 'NA' }, 'l3SrcDestFilters')).toBe('None');
  });
});

describe('hasRedirectRule', () => {
  it('detects FILTERACTION_REDIRECT in any group', () => {
    expect(hasRedirectRule({ l3Filters: [{ action: 'FILTERACTION_ALLOW' }] })).toBe(false);
    expect(hasRedirectRule({ l7Filters: [{ action: 'FILTERACTION_REDIRECT' }] })).toBe(true);
  });
});

describe('roleErrors', () => {
  it('requires name, valid CIR in cir mode, and a containment VLAN', () => {
    expect(roleErrors({ name: '' }, { enabled: false, mode: 'cir', cirKbps: '' }).name).toBeTruthy();
    expect(
      roleErrors({ name: 'R' }, { enabled: true, mode: 'cir', cirKbps: 100 }).cir
    ).toMatch(/128 to 500000/);
    expect(
      roleErrors({ name: 'R' }, { enabled: true, mode: 'cir', cirKbps: 1000 }).cir
    ).toBeUndefined();
    expect(
      roleErrors(
        { name: 'R', defaultAction: 'containToVlan', topology: null },
        { enabled: false, mode: 'cir', cirKbps: '' }
      ).topology
    ).toBeTruthy();
  });
});

describe('topologyErrors', () => {
  it('validates name length, vlanid, and per-mode fields', () => {
    expect(topologyErrors({ name: '', vlanid: 10 }).name).toBeTruthy();
    expect(topologyErrors({ name: 'x'.repeat(33), vlanid: 10 }).name).toMatch(/32/);
    expect(topologyErrors({ name: 'v', vlanid: 5000 }).vlanid).toMatch(/4094/);
    expect(topologyErrors({ name: 'v', vlanid: 10, mode: 'FabricAttach', isid: 0 }).isid).toBeTruthy();
    const vx = topologyErrors({ name: 'v', vlanid: 10, mode: 'Vxlan', vni: 0, remoteVtepIp: '0.0.0.0' });
    expect(vx.vni).toBeTruthy();
    expect(vx.vtep).toBeTruthy();
  });

  it('gates Layer 3 validation to Bridged@AC only', () => {
    const bridgedAp = topologyErrors({
      name: 'v',
      vlanid: 10,
      mode: 'BridgedAtAp',
      l3Presence: true,
      ipAddress: '0.0.0.0',
      cidr: 0,
    });
    expect(bridgedAp.ip).toBeUndefined();
    const bridgedAc = topologyErrors({
      name: 'v',
      vlanid: 10,
      mode: 'BridgedAtAc',
      l3Presence: true,
      ipAddress: '0.0.0.0',
      cidr: 0,
    });
    expect(bridgedAc.ip).toBeTruthy();
    expect(bridgedAc.cidr).toBeTruthy();
  });
});

describe('VLAN groups', () => {
  const topo = (id: string, mode: string, extra: Partial<Topology> = {}): Topology =>
    ({ id, name: id, mode, vlanid: 100, canEdit: true, group: 0, ...extra }) as Topology;
  const group = (id: string, members: string[]): VlanGroup =>
    ({ id, name: id, members }) as VlanGroup;

  it('validates name and vlanid range', () => {
    expect(vlanGroupErrors({ name: '' }).name).toBeTruthy();
    expect(vlanGroupErrors({ name: 'g', vlanid: 0 } as Partial<VlanGroup>).vlanid).toBeTruthy();
    expect(
      vlanGroupErrors({ name: 'g', vlanid: 4094 } as Partial<VlanGroup>).vlanid
    ).toBeUndefined();
  });

  it('filters the available pool: same mode, editable, not pooled elsewhere', () => {
    const topologies = [
      topo('a', 'BridgedAtAp'),
      topo('b', 'BridgedAtAc'), // wrong mode
      topo('c', 'BridgedAtAp', { canEdit: false }), // not editable
      topo('d', 'BridgedAtAp'), // pooled by another group
      topo('e', 'BridgedAtAp', { group: 2 }), // itself grouped
      topo('f', 'BridgedAtAp'), // already a member
    ];
    const groups = [group('g1', ['d']), group('g2', ['x'])];
    const available = availableGroupMembers(topologies, groups, 'g2', 'BridgedAtAp', ['f']);
    expect(available.map((t) => t.id)).toEqual(['a']);
  });

  it('does not exclude members pooled by the group being edited', () => {
    const topologies = [topo('a', 'BridgedAtAp')];
    const groups = [group('g1', ['a'])];
    expect(availableGroupMembers(topologies, groups, 'g1', 'BridgedAtAp', []).length).toBe(1);
    expect(availableGroupMembers(topologies, groups, undefined, 'BridgedAtAp', []).length).toBe(0);
  });
});

describe('CoS / rate limiter validation', () => {
  it('requires the CoS name', () => {
    expect(cosErrors({ cosName: '' }).name).toBeTruthy();
    expect(cosErrors({ cosName: 'Voice' }).name).toBeUndefined();
  });

  it('bounds CIR to 128-500000', () => {
    expect(rateLimiterErrors({ name: 'RL', cirKbps: 127 }).cir).toBeTruthy();
    expect(rateLimiterErrors({ name: 'RL', cirKbps: 500001 }).cir).toBeTruthy();
    expect(rateLimiterErrors({ name: 'RL', cirKbps: 128 }).cir).toBeUndefined();
    expect(rateLimiterErrors({ name: '', cirKbps: 128 }).name).toBeTruthy();
  });
});
