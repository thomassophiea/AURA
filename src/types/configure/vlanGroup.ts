/**
 * VLAN Group (`/v1/vlangroups` with `/v3/vlangroups` fallback).
 *
 * TODO(EPB-125): the lab controller 404s BOTH candidate endpoints, so no real
 * record has been captured. This shape is speculative (name + member topology
 * IDs, mirroring the reference gateway UI); the service layer degrades
 * gracefully (list() -> [] on 404) and the UI must treat the feature as
 * unavailable until a controller that supports VLAN groups pins the shape.
 */
import type { ResourceBase } from './common';

export interface VlanGroup extends ResourceBase {
  name: string;
  /** Member topology (VLAN) IDs. */
  members?: string[];
  [key: string]: unknown;
}
