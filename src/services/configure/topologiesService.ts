/**
 * Topologies / VLANs (`/v3/topologies`, `/v1/topologies` fallback) — typed
 * CRUD + /default seeder + nametoidmap.
 */
import { createResourceClient } from './resourceClient';
import type { Topology } from '../../types/configure';

export const topologiesService = createResourceClient<Topology>({
  resource: 'topologies',
  basePaths: ['/v3/topologies', '/v1/topologies'],
  supportsNameToIdMap: true,
});
