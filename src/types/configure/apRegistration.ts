/**
 * AP adoption / registration settings (`/v1/aps/registration`, singleton) —
 * the REAL endpoint behind "Adoption Rules"; derived from the live record
 * (api/aps-registration.json). Replaces the speculative /v1/adoption-rules
 * family, which 404s on every modern controller.
 */

export interface ApRegistrationSettings {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  /** Registration security mode. */
  ruOperationMode: number;
  dnsRetries: number;
  dnsDelay: number;
  /** Write-only secret; the controller redacts it on reads. */
  sshPassword: string;
  sshPasswordExpiry: string | number | null;
}
