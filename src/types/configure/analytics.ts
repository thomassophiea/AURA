/**
 * Analytics profile (`/v3/analytics`) — derived from the /default template.
 */
import type { ResourceBase } from './common';

export interface AnalyticsProfile extends ResourceBase {
  name: string;
  destAddr: string;
  reportFreq: number;
}
