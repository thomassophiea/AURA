/**
 * ExtremeLocation profiles (`/v3/xlocation`) — typed CRUD + /default seeder.
 * Live default record: { name, svrAddr, minRss: -70, reportFreq: 10, tenantId }.
 * The one documented constraint is the spec's own field description:
 * "Report Frequency 1~60 seconds and default is 10 seconds".
 */
import { createResourceClient } from './resourceClient';
import type { ResourceBase } from '../../types/configure';

export interface XLocationProfile extends ResourceBase {
  custId?: string | null;
  name: string;
  /** ExtremeLocation server address, e.g. feeds1.extremelocation.com. */
  svrAddr: string | null;
  /** Minimum RSS threshold in dBm (negative). */
  minRss: number;
  /** Report frequency in seconds (1–60, default 10). */
  reportFreq: number;
  tenantId: string | null;
}

export const xlocationService = createResourceClient<XLocationProfile>({
  resource: 'xlocation',
  basePaths: ['/v3/xlocation'],
});
