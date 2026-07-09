/** ESL profiles (`/v3/eslprofile`) — typed CRUD + /default seeder (new resource, absent from api.ts). */
import { createResourceClient } from './resourceClient';
import type { EslProfile } from '../../types/configure';

export const eslProfileService = createResourceClient<EslProfile>({
  resource: 'eslprofile',
  basePaths: ['/v3/eslprofile'],
});
