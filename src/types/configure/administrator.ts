/**
 * Controller administrator account (`/v1/administrators`) — derived from the
 * live admin record (api/administrators.json). Keyed by userId, not id.
 */

/** Per-area access: 'RW' | 'RO' | 'NONE' (observed 'RW'). */
export type AdminScopeAccess = string;

export interface AdminScopes {
  site: AdminScopeAccess;
  network: AdminScopeAccess;
  deviceAp: AdminScopeAccess;
  deviceSwitch: AdminScopeAccess;
  eGuest: AdminScopeAccess;
  adoption: AdminScopeAccess;
  troubleshoot: AdminScopeAccess;
  onboardAaa: AdminScopeAccess;
  onboardCp: AdminScopeAccess;
  onboardGroupsAndRules: AdminScopeAccess;
  onboardGuestCp: AdminScopeAccess;
  platform: AdminScopeAccess;
  account: AdminScopeAccess;
  application: AdminScopeAccess;
  license: AdminScopeAccess;
  cliSupport: AdminScopeAccess;
}

export interface Administrator {
  userId: string;
  adminRole: string; // 'FULL' | 'READ_ONLY' | 'CUSTOM' | ...
  enabled: boolean;
  /** Write-only: null on reads, set only when creating/changing. */
  password: string | null;
  passwordExpiry: string | number | null;
  securityQuestion: string | null;
  securityAnswer: string | null;
  accountState: string; // 'ENABLED' | ...
  /** UI preference blobs persisted by the stock controller UI. */
  properties: Record<string, string>;
  idleTimeout: number;
  scopes: AdminScopes;
}
