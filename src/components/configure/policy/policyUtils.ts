/**
 * Pure helpers for the Policy suite: validation (controller-matching patterns
 * and ranges), rule display derivation (ExolUtils.getRuleName parity), ToS/DSCP
 * byte math, and VLAN-group pool filtering. Kept free of React so they are
 * directly unit-testable.
 */
import type { Cos, Topology, VlanGroup } from '../../../types/configure';
import {
  CIR_MAX,
  CIR_MIN,
  RULE_ACTIONS,
  RULE_PORT,
  SRC_DEST_ACTIONS,
  TOPOLOGY_MODES,
} from './constants';
import type { RoleRuleDraft, RoleRuleGroupKey, TopologyDraft } from './localTypes';

export const IP_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
export const FQDN_RE =
  /^(?=.{1,64}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
export const HEX_RE = /^0x[0-9a-fA-F]{1,4}$/;

export function inRange(v: unknown, min: number, max: number): boolean {
  return v !== '' && v != null && !Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max;
}

/* ── dot-path helpers for draft objects ── */

export function getIn(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function setIn<T extends object>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    cur[keys[i]] = next && typeof next === 'object' ? { ...(next as object) } : {};
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

/* ── display formatting ── */

const MODE_LABELS: Record<string, string> = Object.fromEntries(
  TOPOLOGY_MODES.map((m) => [m.id, m.label])
);

/** Internal modes (Routed/Physical/Management) fall through as raw text. */
export function fmtMode(mode: string | undefined | null): string {
  if (!mode) return '';
  return MODE_LABELS[mode] ?? mode;
}

export function isInternalMode(mode: string | undefined | null): boolean {
  return !!mode && !MODE_LABELS[mode];
}

export function fmtPriority(priority: string | undefined | null): string {
  if (!priority || priority === 'notApplicable') return 'Any';
  return String(priority).replace('priority', '');
}

export function tosHex(tosDscp: number | null | undefined): string {
  if (tosDscp == null) return '';
  return '0x' + (Number(tosDscp) || 0).toString(16).toUpperCase().padStart(2, '0');
}

/** DSCP is the top 6 bits of the ToS byte. */
export function dscpHex(tosDscp: number | null | undefined): string {
  return '0x' + (((Number(tosDscp) || 0) >> 2) & 0x3f).toString(16).toUpperCase();
}

/** Compose a ToS byte from precedence + flag bits (tosDscpEditor semantics). */
export function tosFromBits(
  precedence: number,
  bits: { delay?: boolean; throughput?: boolean; reliability?: boolean; ecn?: boolean }
): number {
  return (
    ((precedence & 7) << 5) |
    (bits.delay ? 16 : 0) |
    (bits.throughput ? 8 : 0) |
    (bits.reliability ? 4 : 0) |
    (bits.ecn ? 1 : 0)
  );
}

export function tosFromDscp(dscp: number): number {
  return (Math.max(0, Math.min(63, Number(dscp) || 0)) << 2) & 0xff;
}

/* ── role rule helpers ── */

export function isSrcDest(key: RoleRuleGroupKey): boolean {
  return key === 'l3SrcDestFilters';
}

export function containActionId(key: RoleRuleGroupKey): string {
  return isSrcDest(key) ? 'CONTAINTOVLAN' : 'FILTERACTION_CONTAINTOVLAN';
}

export function ruleProtocolName(rule: RoleRuleDraft, key: RoleRuleGroupKey): string {
  if (isSrcDest(key)) return String(getIn(rule, 'protocol.name') ?? 'any');
  const p = rule.protocol;
  return typeof p === 'string' ? p : 'any';
}

/** Sensible per-group new-rule seeds (defaults mirror live rule shapes). */
export function newRuleDraft(key: RoleRuleGroupKey): RoleRuleDraft {
  if (key === 'l3SrcDestFilters') {
    return {
      name: '',
      action: 'DENY',
      direction: 'OUTBOUND',
      topologyId: null,
      cosId: null,
      protocol: { name: 'any' },
      tosDscp: 0,
      mask: 0,
      source: { subnetType: 'anyIpAddress', address: '', port: { known: 'any', low: 0, high: 0 } },
      destination: {
        subnetType: 'anyIpAddress',
        address: '',
        port: { known: 'any', low: 0, high: 0 },
      },
    };
  }
  if (key === 'l3Filters') {
    return {
      name: '',
      intoNetwork: 'destAddr',
      outFromNetwork: 'sourceAddr',
      action: 'FILTERACTION_DENY',
      topologyId: null,
      cosId: null,
      subnetType: 'anyIpAddress',
      ipAddressRange: '0.0.0.0/0',
      port: 'any',
      portLow: 0,
      portHigh: 0,
      protocol: 'any',
      tosDscp: 0,
      mask: 0,
    };
  }
  if (key === 'l2Filters') {
    return {
      name: '',
      intoNetwork: 'destAddr',
      outFromNetwork: 'sourceAddr',
      action: 'FILTERACTION_DENY',
      topologyId: null,
      cosId: null,
      macAddrType: 'any',
      macAddress: '',
      ethertype: 'ipv4',
    };
  }
  return {
    name: '',
    intoNetwork: 'destAddr',
    outFromNetwork: 'sourceAddr',
    action: 'FILTERACTION_DENY',
    topologyId: null,
    cosId: null,
    appGroup: '',
    application: '',
  };
}

/** Field-level validation for the rule popovers (controller messages). */
export function ruleErrors(key: RoleRuleGroupKey, draft: RoleRuleDraft): Record<string, string> {
  const d = draft || {};
  const e: Record<string, string> = {};
  if (String(d.name || '').length > 64) e.name = 'Maximum 64 characters';
  if (key === 'l3Filters') {
    if (d.subnetType === 'hostName' && !FQDN_RE.test(String(d.ipAddressRange || ''))) {
      e.addr = 'A valid FQDN is required (max 64 characters)';
    }
    const proto = ruleProtocolName(d, key);
    const icmp = proto === 'icmp' || proto === 'icmpv6';
    if (d.port === 'userDefined' && !icmp && (!inRange(d.portLow, 0, 65535) || !inRange(d.portHigh, 0, 65535))) {
      e.port = 'Valid port range 0 to 65535';
    }
  }
  if (key === 'l2Filters' && d.ethertype === 'userDefined' && !HEX_RE.test(String(d.ethertypeValue || ''))) {
    e.ether = 'Hex value required, e.g. 0x8100';
  }
  if (key === 'l3SrcDestFilters') {
    for (const b of ['source', 'destination'] as const) {
      const p = (getIn(d, `${b}.port`) || {}) as { known?: string; low?: unknown; high?: unknown };
      if (p.known === 'userDefined' && (!inRange(p.low, 0, 65535) || !inRange(p.high, 0, 65535))) {
        e[b] = 'Valid port range 0 to 65535';
      }
      if (
        getIn(d, `${b}.subnetType`) === 'hostName' &&
        !FQDN_RE.test(String(getIn(d, `${b}.address`) || ''))
      ) {
        e[`${b}Addr`] = 'A valid FQDN is required';
      }
    }
  }
  const contain = d.action === containActionId(key);
  if (contain && !d.topologyId) e.topology = 'Containment VLAN is required';
  return e;
}

/** Derived display name when a rule has no explicit name (getRuleName parity). */
export function ruleDisplayName(rule: RoleRuleDraft, key: RoleRuleGroupKey): string {
  if (rule.name) return String(rule.name);
  if (key === 'l2Filters') return String(rule.macAddress || 'Any MAC');
  if (key === 'l7Filters') {
    return [rule.appGroup, rule.application].filter(Boolean).join(' / ') || 'Any application';
  }
  if (key === 'l3SrcDestFilters') {
    return `${String(getIn(rule, 'source.address') || 'any')} > ${String(getIn(rule, 'destination.address') || 'any')}`;
  }
  const proto = ruleProtocolName(rule, key);
  return (
    [
      proto !== 'any' ? proto.toUpperCase() : null,
      rule.port && rule.port !== 'any' ? String(rule.port) : null,
      rule.subnetType !== 'anyIpAddress' ? rule.ipAddressRange : null,
    ]
      .filter(Boolean)
      .join(' / ') || 'Any traffic'
  );
}

export function ruleActionLabel(rule: RoleRuleDraft, key: RoleRuleGroupKey): string {
  const list = isSrcDest(key) ? SRC_DEST_ACTIONS : RULE_ACTIONS;
  return list.find((a) => a.id === rule.action)?.label ?? String(rule.action ?? '');
}

export function ruleMatchText(rule: RoleRuleDraft, key: RoleRuleGroupKey): string {
  if (key === 'l2Filters') {
    return rule.macAddrType === 'user_defined' ? String(rule.macAddress || '') : 'Any MAC';
  }
  if (key === 'l7Filters') return String(rule.application || rule.appGroup || 'Any');
  if (key === 'l3SrcDestFilters') {
    return `${String(getIn(rule, 'protocol.name') || 'any')} ${String(getIn(rule, 'source.address') || 'any')} > ${String(getIn(rule, 'destination.address') || 'any')}`;
  }
  const port =
    rule.port && rule.port !== 'any' ? ` :${rule.portLow != null && rule.portLow !== '' ? rule.portLow : rule.port}` : '';
  return `${ruleProtocolName(rule, key)}${port} ${String(rule.ipAddressRange || 'any')}`;
}

export function wellKnownPortLabel(portId: string | undefined): string {
  return RULE_PORT.find((p) => p.id === portId)?.label ?? '';
}

/** True when any rule in any group is a Redirect rule (gates the CP panel). */
export function hasRedirectRule(form: Record<string, unknown>): boolean {
  return (['l2Filters', 'l3Filters', 'l3SrcDestFilters', 'l7Filters'] as const).some((k) =>
    ((form[k] as RoleRuleDraft[] | undefined) || []).some(
      (r) => r.action === 'FILTERACTION_REDIRECT'
    )
  );
}

/* ── role-level validation ── */

export interface RoleBandwidthState {
  enabled: boolean;
  /** 'existing' → keep defaultCos; 'cir' → synthesize role CoS + rate limiter. */
  mode: 'existing' | 'cir';
  cirKbps: number | '';
}

export function roleErrors(
  form: Record<string, unknown>,
  bw: RoleBandwidthState
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(form.name || '').trim()) e.name = 'Name is required';
  if (bw.enabled && bw.mode === 'cir' && !inRange(bw.cirKbps, CIR_MIN, CIR_MAX)) {
    e.cir = `Valid range ${CIR_MIN} to ${CIR_MAX}`;
  }
  if (form.defaultAction === 'containToVlan' && !form.topology) {
    e.topology = 'Select the containment VLAN';
  }
  return e;
}

/* ── topology validation (validate-vlan-id / validate-isid / VNI / IP) ── */

export function topologyErrors(form: TopologyDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const mode = String(form.mode || 'BridgedAtAp');
  if (!String(form.name || '').trim()) e.name = 'Name is required';
  else if (String(form.name).length > 32) e.name = 'Maximum 32 characters';
  if (!inRange(form.vlanid, 1, 4094)) e.vlanid = 'Valid range 1 to 4094';
  if (mode === 'FabricAttach' && !inRange(form.isid, 1, 16777215)) {
    e.isid = 'Valid range 1 to 16777215';
  }
  if (mode === 'Vxlan') {
    if (!inRange(form.vni, 1, 16777215)) e.vni = 'Valid range 1 to 16777215';
    if (!IP_RE.test(String(form.remoteVtepIp || '')) || form.remoteVtepIp === '0.0.0.0') {
      e.vtep = 'A valid non-zero IPv4 address is required';
    }
  }
  // Layer 3 exists ONLY on Bridged@AC (topology.html:291)
  if (mode === 'BridgedAtAc' && form.l3Presence) {
    if (!IP_RE.test(String(form.ipAddress || '')) || form.ipAddress === '0.0.0.0') {
      e.ip = 'A valid non-zero IPv4 address is required';
    }
    if (!inRange(form.cidr, 1, 32)) e.cidr = 'Valid range 1 to 32';
  }
  return e;
}

/* ── VLAN group helpers ── */

export function vlanGroupErrors(form: Partial<VlanGroup>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(form.name || '').trim()) e.name = 'Name is required';
  const vlanid = (form as Record<string, unknown>).vlanid;
  if (!inRange(vlanid, 1, 4094)) e.vlanid = 'VLAN ID is required (1–4094)';
  return e;
}

/**
 * Available member-VLAN pool (controller getAvailableTopos): same mode,
 * editable, not already a member, not pooled by another group, not itself a
 * grouped topology.
 */
export function availableGroupMembers(
  topologies: Topology[],
  groups: VlanGroup[],
  editingGroupId: string | undefined,
  mode: string,
  memberIds: string[]
): Topology[] {
  const pooledElsewhere = new Set<string>();
  for (const g of groups) {
    if (editingGroupId && g.id === editingGroupId) continue;
    for (const m of g.members || []) pooledElsewhere.add(m);
  }
  const memberSet = new Set(memberIds);
  return topologies.filter(
    (t) =>
      t &&
      t.canEdit !== false &&
      t.mode === mode &&
      !memberSet.has(t.id) &&
      !pooledElsewhere.has(t.id) &&
      !(t.group && t.group !== 0)
  );
}

/* ── CoS / rate limiter validation ── */

export function cosErrors(form: Partial<Cos>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(form.cosName || '').trim()) e.name = 'Name is required';
  return e;
}

export function rateLimiterErrors(form: {
  name?: string;
  cirKbps?: number | '' | null;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!String(form.name || '').trim()) e.name = 'Name is required';
  if (!inRange(form.cirKbps, CIR_MIN, CIR_MAX)) e.cir = `Valid range ${CIR_MIN} to ${CIR_MAX}`;
  return e;
}

/** Label topologies "name (vlanid)" like the controller (getVlanRange). */
export function vlanOptionLabel(t: Pick<Topology, 'name' | 'vlanid'>): string {
  return `${t.name} (${t.vlanid})`;
}
