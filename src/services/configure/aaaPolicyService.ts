/** AAA policies (`/v1/aaapolicy`) — typed CRUD + /default seeder + nametoidmap. */
import { createResourceClient } from './resourceClient';
import type { AaaPolicy } from '../../types/configure';

export const aaaPolicyService = createResourceClient<AaaPolicy>({
  resource: 'aaapolicy',
  basePaths: ['/v1/aaapolicy'],
  supportsNameToIdMap: true,
});
