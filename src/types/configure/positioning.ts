/**
 * Positioning profile (`/v3/positioning`) — derived from the /default template.
 */
import type { ResourceBase } from './common';

export interface PositioningProfile extends ResourceBase {
  name: string;
  collection: string; // 'Off' | 'ActiveClients' | 'AllClients'
}
