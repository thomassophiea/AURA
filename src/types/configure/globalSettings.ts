/**
 * Controller global settings (`/v1/globalsettings`, singleton) — derived from
 * the live record (api/globalsettings.json).
 */

export interface CloudVisibilitySettings {
  reportingInterval: number;
  address: string;
}

export interface DasSettings {
  port: number;
  replayInterval: number;
}

export interface SecurityStandardSettings {
  standard: string; // 'DISABLED' | ...
  imageName: string | null;
}

export interface GlobalSettings {
  cpAutoLogin: string; // 'Redirect' | ...
  accountsPasswordValidity: number;
  extNatAddr: string;
  txPowerRepresentation: string; // 'PerChain' | ...
  trafficShaping: boolean;
  cloudVisibility: CloudVisibilitySettings;
  webProxy: unknown;
  das: DasSettings;
  securityStandard: SecurityStandardSettings;
}
