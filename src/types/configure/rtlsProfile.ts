/**
 * RTLS profile (`/v1/rtlsprofile`) — derived from the /default template.
 * One vendor block per supported RTLS engine; `appId` selects the active one.
 */
import type { ResourceBase } from './common';

export interface RtlsVendorConfig {
  ip: string;
  port: number;
  /** Multicast MAC address, e.g. '01:0C:CC:00:00:00'. */
  mcast: string;
}

export interface RtlsProfile extends ResourceBase {
  name: string;
  appId: string; // 'AeroScout' | 'Ekahau' | 'Centrak' | 'Sonitor'
  aeroScout: RtlsVendorConfig;
  ekahau: RtlsVendorConfig;
  centrak: RtlsVendorConfig;
  sonitor: RtlsVendorConfig;
}
