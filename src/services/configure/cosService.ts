/** Classes of Service (`/v1/cos`) — typed CRUD + /default seeder + nametoidmap. */
import { createResourceClient } from './resourceClient';
import type { Cos } from '../../types/configure';

export const cosService = createResourceClient<Cos>({
  resource: 'cos',
  basePaths: ['/v1/cos'],
  supportsNameToIdMap: true,
});
