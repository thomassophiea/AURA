/**
 * ExtremeGuest integration profile (`/v1/eguest`) — derived from the
 * /v1/eguest/default template (the lab controller's live list was empty).
 */
import type { ResourceBase } from './common';

export interface EGuestRadiusServer extends ResourceBase {
  ipAddress: string;
  sharedSecret: string;
  radiusAuthProtocol: string; // 'PAP' | ...
  preferredMacAddressFormat: string; // e.g. 'UPPERCASE_NO_DELIMITER'
  port: number;
  totalRetries: number;
  timeout: number;
}

export interface EGuestProfile extends ResourceBase {
  name: string;
  cpFqdn: string;
  userName: string;
  password: string;
  authenticationRadiusServer: EGuestRadiusServer;
  accountingRadiusServer: EGuestRadiusServer;
}
