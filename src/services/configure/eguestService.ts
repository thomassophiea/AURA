/**
 * ExtremeGuest integration profiles (`/v1/eguest`) — typed CRUD + /default
 * seeder + nametoidmap. NOTE: this is the REAL controller resource; the
 * `/v1/guests` accounts/vouchers paths are server.js in-memory stubs and must
 * not be used by Configure pages (port brief §3.3).
 */
import { createResourceClient } from './resourceClient';
import type { EGuestProfile } from '../../types/configure';

export const eguestService = createResourceClient<EGuestProfile>({
  resource: 'eguest',
  basePaths: ['/v1/eguest'],
  supportsNameToIdMap: true,
});
