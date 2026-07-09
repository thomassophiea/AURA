/**
 * AAA policy (`/v1/aaapolicy`) — derived from live records (api/aaapolicy.json)
 * and the /v1/aaapolicy/default template.
 */
import type { ResourceBase } from './common';

/** RADIUS server entry inside a AAA policy (auth + accounting lists). */
export interface AaaRadiusServer {
  ipAddress: string;
  sharedSecret: string;
  port: number;
  timeout: number;
  totalRetries: number;
  pollInterval: number;
  peerDiscovery: boolean;
  serverType: string; // 'Standard' | ...
  trustPoint: string | null;
}

export interface AaaPolicyAttributes {
  calledStationId: string; // e.g. 'WiredMacColonSsid'
  nasIpAddress: string;
  nasId: string;
}

export interface AaaPolicy extends ResourceBase {
  name: string;
  policyType: string; // 'Standard' | ...
  healthCheck: number;
  accountingStart: string; // 'NoDelay' | ...
  attributes: AaaPolicyAttributes;
  accountingInterimInterval: number;
  includeFramedIp: boolean;
  includeMsgAuth: boolean;
  accountingType: string; // 'StartInterimStop' | ...
  authenticationType: string; // 'PAP' | 'CHAP' | ...
  reauthTimeoutOvr: number;
  operatorName: string;
  operatorNamespace: string; // 'None' | ...
  denyOnAuthFailure: boolean | null;
  naiRealms: unknown;
  serverPoolingMode: string; // 'failover' | 'loadbalance'
  reportNasLocation: boolean;
  accountingAccessAlg: string; // 'Broadcast' | ...
  naiRouting: boolean;
  eventTimestamp: boolean;
  authenticationRadiusServers: AaaRadiusServer[];
  accountingRadiusServers: AaaRadiusServer[];
}
