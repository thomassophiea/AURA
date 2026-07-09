/**
 * Class of Service (`/v1/cos`) — derived from live records (api/cos.json)
 * and the /v1/cos/default template.
 */
import type { ResourceBase } from './common';

export interface CosQos {
  priority: string; // 'notApplicable' | 'priority0'..'priority7'
  tosDscp: number | null;
  mask: number | null;
}

export interface Cos extends ResourceBase {
  cosName: string;
  predefined: boolean;
  cosQos: CosQos;
  inboundRateLimiterId: string | null;
  outboundRateLimiterId: string | null;
}
