/**
 * Topology / VLAN (`/v1/topologies`, `/v3/topologies`) — derived from live
 * records (api/topologies.json) and the /default template.
 */
import type { FeatureTag, ProxiedScope, ResourceBase } from './common';

export interface Topology extends ResourceBase {
  custId: string | null;
  name: string;
  vlanid: number;
  tagged: boolean;
  mgmtTrafficAcl?: unknown[];
  multicastFilters: unknown[];
  multicastBridging: boolean;
  mode: string; // 'BridgedAtAp' | 'BridgedAtAc' | 'FabricAttach' | ...
  group?: number;
  members?: unknown[];
  mtu: number;
  enableMgmtTraffic: boolean;
  dhcpServers: string;
  l3Presence: boolean;
  ipAddress: string;
  cidr: number;
  gateway: string;
  dhcpStartIpRange: string;
  dhcpEndIpRange: string;
  dhcpMode: string; // 'DHCPNone' | 'DHCPLocalServer' | 'DHCPRelay' | ...
  dhcpDomain: string;
  dhcpDefaultLease: number;
  dhcpMaxLease: number;
  dhcpDnsServers: string;
  wins: string;
  cert: number;
  certCa: number;
  portName: string;
  vlanMapToEsa: number;
  dhcpExclusions: unknown[];
  foreignIpAddress: string;
  apRegistration: boolean;
  fqdn: string;
  isid: number;
  pool: unknown;
  proxied: ProxiedScope;
  features: FeatureTag[];
  vni: number;
  remoteVtepIp: string;
  remoteVtepIntVni: number;
  remoteVtepIntIp: string;
  remoteVtepIntCidr: number;
  /** Profile IDs referencing this topology. */
  profiles: string[] | unknown[];
  blockNonEssentialBroadcast: boolean;
  concentrators: unknown[];
  concentratorsSelection: string; // 'failover' | ...
}
