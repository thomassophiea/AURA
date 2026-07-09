/** Roles (`/v3/roles`) — typed CRUD + /default seeder + nametoidmap. */
import { createResourceClient } from './resourceClient';
import type { Role } from '../../types/configure';

export const rolesService = createResourceClient<Role>({
  resource: 'roles',
  basePaths: ['/v3/roles'],
  supportsNameToIdMap: true,
});
