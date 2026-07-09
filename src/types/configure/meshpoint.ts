/**
 * Meshpoint (`/v3/meshpoints`) — derived from live records
 * (api/meshpoints.json) and the /v3/meshpoints/default template.
 */
import type { ResourceBase } from './common';

export interface MeshPskElement {
  presharedKey: string;
  keyHexEncoded: boolean;
}

export interface MeshpointPrivacy {
  PskElement?: MeshPskElement;
  [element: string]: unknown;
}

export interface Meshpoint extends ResourceBase {
  name: string;
  status: string; // 'enabled' | 'disabled'
  meshId: string;
  root: boolean;
  neighborTimeout: number;
  controlVlan: string | number | null;
  privacy: MeshpointPrivacy | null;
}
