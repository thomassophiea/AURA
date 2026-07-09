/**
 * AirDefense (ADSP) profiles — typed CRUD + /default seeder.
 * The lab controller answers `/v3/adsp`; older api.ts code hardcoded
 * `/v4/adsp` (now also fixed there with the same probe order). v3 is tried
 * first, v4 kept as fallback for builds that expose it.
 */
import { createResourceClient } from './resourceClient';
import type { AdspProfile } from '../../types/configure';

export const adspService = createResourceClient<AdspProfile>({
  resource: 'adsp',
  basePaths: ['/v3/adsp', '/v4/adsp'],
});
