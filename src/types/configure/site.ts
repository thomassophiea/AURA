/**
 * Site (`/v3/sites`) — derived from live records (api/sites.json) and the
 * /v3/sites/default template. Named SiteConfig to avoid colliding with the
 * monitoring-side Site type in src/types.
 */
import type { FeatureTag, ProxiedScope, ResourceBase } from './common';
import type { AaaRadiusServer } from './aaaPolicy';
import type { SnmpSettings } from './snmp';

/**
 * The AAA policy embedded in a site document is a nullable, partial variant
 * of the standalone /v1/aaapolicy record (extra radius* fields, most fields
 * nullable on the default template).
 */
export interface SiteAaaPolicy {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  name: string | null;
  policyType: string;
  healthCheck: number | null;
  accountingStart: string;
  serverPoolingMode: string | null;
  attributes: unknown;
  accountingInterimInterval: number | null;
  accountingType: string | null;
  authenticationType: string;
  radiusAuthProtocol: string;
  radiusAccountingEnabled: boolean;
  includeFramedIp: boolean;
  includeMsgAuth: boolean;
  authenticationRadiusServers: AaaRadiusServer[] | unknown[];
  accountingRadiusServers: AaaRadiusServer[] | unknown[];
  reportNasLocation: boolean;
  operatorNamespace: string;
  operatorName: string | null;
  denyOnAuthFailure: boolean | null;
  accountingAccessAlg: string;
  reauthTimeoutOvr: number;
  naiRouting: boolean;
  eventTimestamp: boolean;
  naiRealms: unknown[] | null;
}

/** Device group nested inside a site (observed live: INDOOR group). */
export interface DeviceGroup {
  custId: string | null;
  id: string;
  canDelete: boolean | null;
  canEdit: boolean | null;
  profileId: string;
  groupName: string;
  loadBalanceBandPreferenceEnabled: boolean;
  roleIDs: string[] | null;
  apSerialNumbers: string[];
  topologyIDs: string[] | null;
  serviceIDs: string[] | null;
  backboneTopologyIDs: string[] | null;
  radioAssignment: unknown;
  wiredInterfaceAssignment: unknown;
  enableDpi: boolean;
  minimumBaseRate2_4: number;
  minimumBaseRate5: number;
  aggregateMpdu2_4: boolean;
  aggregateMpdu5: boolean;
  stbcEnabled2_4: boolean;
  stbcEnabled5: boolean;
  txbfEnabled2_4: string; // 'disabled' | 'muMimo' | ...
  txbfEnabled5: string;
  rfMgmtPolicyId: string;
}

export interface SiteTreeNode {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  country: string;
  region: string;
  campus: string;
  city: string;
  typeOfPlace: string | null;
  mapCoordinates: string;
}

export interface SiteConfig extends ResourceBase {
  custId: string | null;
  siteName: string;
  country: string;
  postalCode: string;
  distributed: boolean;
  stpEnabled: boolean;
  aaaPolicy: SiteAaaPolicy | null;
  aaaPolicyId: string | null;
  deviceGroups: DeviceGroup[];
  timezone: string;
  switchSerialNumbers: string[] | unknown[];
  siteManagerName: string;
  siteManagerEmail: string;
  contact: string;
  treeNode: SiteTreeNode;
  snmpConfig: SnmpSettings | null;
  features: FeatureTag[];
  proxied: ProxiedScope;
  preferredAffinity: string; // 'Any' | ...
  macAcl: unknown;
  protectedAcl: unknown;
  afcUpdate: { hour: number; minute: number } | null;
  apRanging: boolean;
}
