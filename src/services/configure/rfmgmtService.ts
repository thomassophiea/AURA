/** RF management policies (`/v3/rfmgmt`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { RfMgmtPolicy } from '../../types/configure';

export const rfmgmtService = createResourceClient<RfMgmtPolicy>({
  resource: 'rfmgmt',
  basePaths: ['/v3/rfmgmt'],
});
