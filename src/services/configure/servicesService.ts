/** WLAN services (`/v1/services`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { WlanService } from '../../types/configure';

export const servicesService = createResourceClient<WlanService>({
  resource: 'services',
  basePaths: ['/v1/services'],
});
