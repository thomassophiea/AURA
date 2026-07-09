/** Meshpoints (`/v3/meshpoints`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { Meshpoint } from '../../types/configure';

export const meshpointsService = createResourceClient<Meshpoint>({
  resource: 'meshpoints',
  basePaths: ['/v3/meshpoints'],
});
