/**
 * Electronic Shelf Label profile (`/v3/eslprofile`) — derived from the
 * /default template (live list was empty on the lab controller).
 */
import type { ResourceFlags } from './common';

export interface EslProfile extends ResourceFlags {
  custId?: string | null;
  id: string;
  name: string;
  port: number;
  fqdn: string;
}
