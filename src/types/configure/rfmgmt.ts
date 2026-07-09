/**
 * RF management policy (`/v3/rfmgmt`) — derived from live records
 * (api/rfmgmt.json) and the /v3/rfmgmt/default template, which carries both
 * the SmartRF and ACS branches fully populated.
 */
import type { ResourceBase } from './common';

/** 'Band2_4' | 'Band5' | 'Band6' */
export type RfBandId = string;

export interface SmartRfBasic {
  sensitivity: string; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM'
  coverageHoleRecovery: boolean;
  interferenceRecovery: boolean;
  neighborRecovery: boolean;
}

export interface RfPowerChannelBandSetting {
  bandId: RfBandId;
  txMinPower: number;
  txMaxPower: number;
  acsPlan: string; // e.g. 'ChannelPlanAllNonDFS'
  acsList: number[] | unknown[];
  channelWidth: string; // e.g. 'Ch1Width_160MHz' | 'Ch1Width_Auto'
}

export interface SmartRfScanningBandSetting {
  bandId: RfBandId;
  duration: number;
  freq: number;
  extFreq: number;
  sampleCount: number;
  clientAware: boolean;
  clientCount: number;
  powerSaveAware: string; // 'DYNAMIC' | ...
  voiceAware: string;
  txLoadAware: boolean;
  txLoadAwarePercent: number;
}

export interface SmartRfScanning {
  smartMonitoring: boolean;
  ocsMonitoringAwareness: boolean;
  ocsMonitoringAwarenessThreshold: number;
  bandSettings: SmartRfScanningBandSetting[];
}

export interface SmartRfNeighbourRecovery {
  powerHoldTime: number;
  dynamicSample: boolean;
  sampleRetries: number;
  sampleThreshold: number;
  bandSettings: Array<{ bandId: RfBandId; powerThreshold: number }>;
}

export interface SmartRfInterferenceRecovery {
  noiseRecovery: boolean;
  noiseFactor: string; // decimal string, e.g. '1.50'
  clientHoldTime: number;
  clientThreshold: number;
  selectShutdown: boolean;
  selectShutdownHighTh: number;
  selectShutdownLowTh: number;
  selectShutdownFreq: number;
  selectShutdownFreqLimit: number;
  bandSettings: Array<{ bandId: RfBandId; chSwitchDelta: number }>;
}

export interface SmartRfCoverageHoleRecovery {
  bandSettings: Array<{
    bandId: RfBandId;
    clientThreshold: number;
    snrThreshold: number;
    coverageInterval: number;
    recoveryInterval: number;
  }>;
}

export interface SmartRfConfig {
  basic: SmartRfBasic;
  powerAndChannel: { bandSettings: RfPowerChannelBandSetting[] };
  scanning: SmartRfScanning;
  neighbourRecovery: SmartRfNeighbourRecovery;
  interferenceRecovery: SmartRfInterferenceRecovery;
  coverageHoleRecovery: SmartRfCoverageHoleRecovery;
}

export interface AcsInterferenceRecoveryBandSetting {
  bandId: RfBandId;
  noiseThreshold: number;
  channelOccupancyThreshold: number;
  updatePeriod: number;
  waitTime: number;
  detectBluetooth: boolean;
  detectMicrowave: boolean;
  detectCordlessPhone: boolean;
  detectConstantWave: boolean;
  detectVideoBridge: boolean;
}

export interface AcsConfig {
  basic: { interferenceRecovery: boolean; neighborRecovery: boolean };
  powerAndChannel: { bandSettings: RfPowerChannelBandSetting[] };
  neighbourRecovery: { bandSettings: Array<{ bandId: RfBandId }> };
  interferenceRecovery: { bandSettings: AcsInterferenceRecoveryBandSetting[] };
}

export interface RfMgmtPolicy extends ResourceBase {
  name: string;
  type: string; // 'SmartRf' | 'Acs'
  smartRf: SmartRfConfig | null;
  acs: AcsConfig | null;
}
