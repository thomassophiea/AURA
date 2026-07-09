/**
 * Role (`/v3/roles`) — derived from live records (api/roles.json) and the
 * /v3/roles/default template. Filter field names for the L2/L3SrcDest/L7
 * groups come from the controller's own editor spec (controller-spec-v2.json)
 * because the lab records carried empty arrays for those groups.
 */
import type { FeatureTag, ResourceBase } from './common';

/** Filter actions, e.g. 'FILTERACTION_ALLOW' | 'FILTERACTION_DENY' | 'FILTERACTION_CONTAINTOVLAN'. */
export type RoleFilterAction = string;

interface RoleFilterBase {
  name: string;
  action: RoleFilterAction;
  /** Set when action is contain-to-VLAN. */
  topologyId: string | null;
  cosId: string | null;
}

export interface RoleL2Filter extends RoleFilterBase {
  macAddrType?: string;
  macAddress?: string;
  maccidr?: number | string;
}

/** Observed live: the 'Allow DNS' rule on the Enterprise User role. */
export interface RoleL3Filter extends RoleFilterBase {
  intoNetwork?: string; // 'destAddr' | 'none' | ...
  outFromNetwork?: string; // 'sourceAddr' | 'none' | ...
  subnetType?: string; // 'anyIpAddress' | 'userDefined' | ...
  ipAddressRange?: string; // CIDR
  ethertype?: string;
  port?: string; // named port, e.g. 'dns'
  portLabel?: string;
  portLow?: number;
  portHigh?: number;
  protocol?: string; // 'udp' | 'tcp' | ...
  protocolNumber?: number;
  tosDscp?: number;
  mask?: number;
}

export interface RoleL3SrcDestFilter extends RoleFilterBase {
  protocol?: string;
  ethertype?: string;
  source?: string;
  destination?: string;
  ipAddressRange?: string;
}

export interface RoleL7Filter extends RoleFilterBase {
  appGroupId?: string | number;
}

export interface Role extends ResourceBase {
  name: string;
  predefined: boolean;
  l2Filters: RoleL2Filter[];
  l3Filters: RoleL3Filter[];
  l3SrcDestFilters: RoleL3SrcDestFilter[];
  l7Filters: RoleL7Filter[];
  defaultAction: string; // 'allow' | 'deny' | 'containToVlan'
  topology: string | null;
  defaultCos: string | null;
  /* Captive portal redirection block */
  cpTopologyId: string | null;
  cpRedirect: string;
  cpIdentity: string;
  cpSharedKey: string;
  cpDefaultRedirectUrl: string;
  cpRedirectUrlSelect: string; // 'URLTARGET' | ...
  cpHttp: boolean;
  cpUseFQDN: boolean;
  cpAddIpAndPort: boolean;
  cpAddApNameAndSerial: boolean;
  cpAddBssid: boolean;
  cpAddVnsName: boolean;
  cpAddSsid: boolean;
  cpAddMac: boolean;
  cpAddRole: boolean;
  cpAddVlan: boolean;
  cpAddTime: boolean;
  cpAddSign: boolean;
  cpOauthUseGoogle: boolean;
  cpOauthUseFacebook: boolean;
  cpOauthUseMicrosoft: boolean;
  cpRedirectPorts: number[];
  features: FeatureTag[];
  /** Profile IDs referencing this role. */
  profiles: string[];
}
