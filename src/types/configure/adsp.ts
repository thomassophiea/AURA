/**
 * AirDefense (ADSP) profile (`/v3/adsp`; some builds expose `/v4/adsp`) —
 * derived from the /default template.
 */
import type { ResourceFlags } from './common';

export interface AdspProfile extends ResourceFlags {
  custId?: string | null;
  id: string;
  name: string;
  /** AirDefense server addresses. */
  svrAddr: string[];
}
