/**
 * Trust points — the certificate names a Secure (RadSec) RADIUS server's
 * Trust Point select offers.
 *
 * Endpoint discovered from the gateway's own UI (services/system.js,
 * SystemCertificates.getInterfaceCerts + WlanFunctions.loadCertificates):
 *
 *   GET /platformmanager/v1/interface/certs -> { certdata: [{ use, cert }] }
 *
 * Verified live against 192.168.100.12:5825 (200, `{"certdata":[]}` on a box
 * with no uploaded certs). The gateway derives its trustPoints list by taking
 * every non-Interface `.crt` entry and stripping the extension — replicated
 * in `extractTrustPoints` below.
 *
 * `/platformmanager/` rides the same proxy pathRewrite as `/access-control/`
 * (see accessControlFamilyService.ts).
 */
import { ConfigureApiError, configureRequest } from './resourceClient';
import { logger } from '../logger';

const CERTS_PATH = '/platformmanager/v1/interface/certs';

/** One entry of the interface-certs envelope. */
export interface InterfaceCertEntry {
  /** e.g. "Interface" for the management-interface cert; anything else is a trust anchor. */
  use?: string | null;
  /** Certificate file name, e.g. "radsec-ca.crt". */
  cert?: string | null;
}

interface InterfaceCertsEnvelope {
  certdata?: InterfaceCertEntry[] | null;
}

/**
 * Gateway rule (WlanFunctions.loadCertificates): a trust point is any
 * non-Interface `.crt` file, named by the file name minus its extension,
 * deduplicated.
 */
export function extractTrustPoints(certdata: InterfaceCertEntry[] | null | undefined): string[] {
  if (!Array.isArray(certdata)) return [];
  const names = new Set<string>();
  for (const entry of certdata) {
    const cert = entry?.cert;
    if (!cert || entry.use === 'Interface' || !cert.endsWith('.crt')) continue;
    names.add(cert.split('.').slice(0, -1).join('.'));
  }
  return Array.from(names);
}

export const trustPointsService = {
  /**
   * List the trust point names configured on the controller. A 404 (older
   * firmware without the route) degrades to [] so callers can fall back to
   * free-text entry; other failures propagate.
   */
  async list(): Promise<string[]> {
    try {
      const payload = await configureRequest<InterfaceCertsEnvelope>(CERTS_PATH);
      return extractTrustPoints(payload?.certdata);
    } catch (error) {
      if (error instanceof ConfigureApiError && error.status === 404) {
        logger.warn('[configure/trustpoints] interface certs endpoint not present, returning []');
        return [];
      }
      throw error;
    }
  },
};
