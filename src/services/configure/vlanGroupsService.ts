/**
 * VLAN groups (`/v1/vlangroups`, `/v3/vlangroups` fallback).
 *
 * TODO(EPB-125): the lab controller 404s BOTH paths, so this client is marked
 * `optionalFeature` — list() degrades to [] and callers should gate the UI on
 * `vlanGroupsService.isSupported()`. Re-verify the path against a controller
 * build that ships VLAN groups before exposing full CRUD.
 */
import { createResourceClient } from './resourceClient';
import type { VlanGroup } from '../../types/configure';

export const vlanGroupsService = createResourceClient<VlanGroup>({
  resource: 'vlangroups',
  basePaths: ['/v1/vlangroups', '/v3/vlangroups'],
  optionalFeature: true,
});
