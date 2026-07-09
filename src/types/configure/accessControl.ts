/**
 * Station access control / MAC allow-deny list (`/v1/accesscontrol`,
 * singleton) — derived from the live record (api/accesscontrol.json).
 */

export interface AccessControlSettings {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  macMode: number;
  mode: string; // 'Allow' | 'Deny'
  macList: string[] | null;
}
