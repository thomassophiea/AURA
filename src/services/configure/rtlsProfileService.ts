/** RTLS profiles (`/v1/rtlsprofile`) — typed CRUD + /default seeder. */
import { createResourceClient } from './resourceClient';
import type { RtlsProfile } from '../../types/configure';

export const rtlsProfileService = createResourceClient<RtlsProfile>({
  resource: 'rtlsprofile',
  basePaths: ['/v1/rtlsprofile'],
});
