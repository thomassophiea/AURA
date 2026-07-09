/**
 * Administrator editor model: role/scope enums, a new-record seed, validation
 * and payload assembly for /v1/administrators. Keyed by userId (there is no
 * separate id field). The controller never returns a stored password, so the
 * password is sent only when the operator explicitly (re)sets it.
 *
 * DEFERRED (documented open questions in the audit — not built here):
 *  - C3 custom-role scopes/presets dialog: on create we seed all-RW scopes and
 *    on edit we preserve the record's scopes verbatim; per-scope RW/RO/None
 *    editing + preset selection is not surfaced.
 *  - C5 RADIUS administrator-authentication tab (template was never captured).
 *  - C4 API-key management section.
 */
import type { Administrator, AdminScopes } from '../../../types/configure';

/** Built-in super-user whose role row the controller hides and cannot delete. */
export const BUILTIN_ADMIN = 'admin';

/** userNamePattern analogue — alphanumerics plus . _ - , up to 32 chars. */
export const USERNAME_RE = /^[A-Za-z0-9._-]{1,32}$/;

const MIN_PASSWORD_LEN = 6;

export const ROLE_OPTIONS = [
  { id: 'FULL', label: 'Full' },
  { id: 'READ_ONLY', label: 'Read-Only' },
  { id: 'GuestManagement', label: 'Guest Management' },
  { id: 'CUSTOM', label: 'Custom' },
] as const;

export const ACCOUNT_STATE_OPTIONS = [
  { id: 'ENABLED', label: 'Enabled' },
  { id: 'DISABLED', label: 'Disabled' },
] as const;

export const SCOPE_KEYS: ReadonlyArray<keyof AdminScopes> = [
  'site',
  'network',
  'deviceAp',
  'deviceSwitch',
  'eGuest',
  'adoption',
  'troubleshoot',
  'onboardAaa',
  'onboardCp',
  'onboardGroupsAndRules',
  'onboardGuestCp',
  'platform',
  'account',
  'application',
  'license',
  'cliSupport',
];

/** Build a uniform scope map (used when seeding a new FULL account). */
export function buildScopes(access: string): AdminScopes {
  return SCOPE_KEYS.reduce((acc, key) => {
    acc[key] = access;
    return acc;
  }, {} as AdminScopes);
}

export function buildNewAdmin(): Administrator {
  return {
    userId: '',
    adminRole: 'FULL',
    enabled: true,
    password: null,
    passwordExpiry: null,
    securityQuestion: null,
    securityAnswer: null,
    accountState: 'ENABLED',
    properties: {},
    idleTimeout: 3600,
    scopes: buildScopes('RW'),
  };
}

export interface AdminFormErrors {
  userId?: string;
  password?: string;
  confirmPassword?: string;
  idleTimeout?: string;
}

export interface ValidateArgs {
  isNew: boolean;
  changePassword: boolean;
  confirmPassword: string;
  existingIds: string[];
}

export function validateAdmin(
  form: Administrator,
  { isNew, changePassword, confirmPassword, existingIds }: ValidateArgs
): AdminFormErrors {
  const errors: AdminFormErrors = {};

  if (isNew) {
    const id = form.userId.trim();
    if (!id) errors.userId = 'Username is required';
    else if (!USERNAME_RE.test(id))
      errors.userId = 'Use letters, numbers, dot, underscore or hyphen (max 32)';
    else if (existingIds.some((e) => e.toLowerCase() === id.toLowerCase()))
      errors.userId = 'An account with this username already exists';
  }

  // New accounts always set a password; edits only when Change Password is on.
  if (isNew || changePassword) {
    const pw = form.password ?? '';
    if (!pw) errors.password = 'Password is required';
    else if (pw.length < MIN_PASSWORD_LEN)
      errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters`;
    if (pw && confirmPassword !== pw) errors.confirmPassword = 'Passwords do not match';
  }

  if (form.idleTimeout !== undefined && form.idleTimeout !== null) {
    if (Number.isNaN(form.idleTimeout) || form.idleTimeout < 0)
      errors.idleTimeout = 'Enter a non-negative number of seconds';
  }

  return errors;
}

/**
 * Assemble the PUT/POST body. Drops the confirm-only field and clears the
 * write-only password on edits where it was not changed (sent as null so the
 * controller keeps the existing secret).
 */
export function toAdminPayload(
  form: Administrator,
  { isNew, changePassword }: { isNew: boolean; changePassword: boolean }
): Administrator {
  const payload: Administrator = { ...form, userId: form.userId.trim() };
  if (!isNew && !changePassword) payload.password = null;
  return payload;
}
