/**
 * Policy-suite local editor types (NOT part of src/types/configure — those stay
 * wire-faithful). These widen the wire shapes with editor-only conveniences:
 * dot-path drafts for rule popovers, DHCP exclusion entries, multicast filter
 * rows, GRE concentrator rows, management-ACL rules. All keys that persist are
 * the controller's own (api/roles.json, api/topologies.json).
 */
import type { Topology } from '../../../types/configure';

export type RoleRuleGroupKey = 'l2Filters' | 'l3Filters' | 'l3SrcDestFilters' | 'l7Filters';

/** Nested endpoint kept exactly in the controller's l3SrcDestFilters shape. */
export interface SrcDestEndpoint {
  subnetType?: string;
  address?: string;
  port?: { known?: string; low?: number | ''; high?: number | '' };
}

/** Permissive union draft covering all four rule popover variants. */
export interface RoleRuleDraft {
  name?: string;
  action?: string;
  topologyId?: string | null;
  cosId?: string | null;
  /* L2/L3/L7 direction pair (RuleTypes.filters) */
  intoNetwork?: string;
  outFromNetwork?: string;
  /* l3SrcDest single direction (RuleTypes.directions: OUTBOUND/INBOUND) */
  direction?: string;
  /* L2 */
  macAddrType?: string;
  macAddress?: string;
  ethertype?: string;
  ethertypeValue?: string;
  /* L3 flat (REAL keys: port/portLow/portHigh — not port.known) */
  subnetType?: string;
  ipAddressRange?: string;
  port?: string;
  portLow?: number | '';
  portHigh?: number | '';
  protocol?: string | { name?: string };
  protocolNumber?: number;
  tosDscp?: number;
  mask?: number;
  /* L7 */
  appGroup?: string;
  application?: string;
  /* src-dest nested endpoints */
  source?: SrcDestEndpoint;
  destination?: SrcDestEndpoint;
  icmpType?: number | '';
  icmpCode?: number | '';
  [key: string]: unknown;
}

/** Topology editor draft — wire record plus loose index for editor writes. */
export type TopologyDraft = Partial<Topology> & { [key: string]: unknown };

export interface DhcpExclusion {
  mode: 'range' | 'single';
  rangeFrom: string;
  rangeTo: string;
  comment?: string;
}

export interface MulticastFilterRow {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  ip: string;
  ipCidr: number | '';
  repl: boolean;
}

export interface MgmtAclRule {
  action: string;
  protocol: string;
  ipAddressRange: string;
  port: string;
  portLow?: number | '';
  portHigh?: number | '';
}

export interface GreConcentratorRow {
  id?: string;
  name: string;
  ipAddress: string;
  managed?: boolean;
  secure?: boolean;
}
