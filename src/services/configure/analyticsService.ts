/** Analytics profiles (`/v3/analytics`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { AnalyticsProfile } from '../../types/configure';

export const analyticsService = createResourceClient<AnalyticsProfile>({
  resource: 'analytics',
  basePaths: ['/v3/analytics'],
});
