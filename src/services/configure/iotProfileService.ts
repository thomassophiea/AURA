/** IoT profiles (`/v3/iotprofile`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { IotProfile } from '../../types/configure';

export const iotProfileService = createResourceClient<IotProfile>({
  resource: 'iotprofile',
  basePaths: ['/v3/iotprofile'],
});
