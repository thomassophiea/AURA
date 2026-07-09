/** Positioning profiles (`/v3/positioning`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { PositioningProfile } from '../../types/configure';

export const positioningService = createResourceClient<PositioningProfile>({
  resource: 'positioning',
  basePaths: ['/v3/positioning'],
});
