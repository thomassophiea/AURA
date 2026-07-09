/**
 * Pure model helpers for the ExtremeGuest feature (EPB-125 §16).
 *
 * Field truth: api/defaults/eguest.json + parity gaps B1-B8. The ExtremeGuest
 * appliance is a SINGLE host: one IP / shared secret / timeout / retries is
 * mirrored into BOTH the authentication and accounting server objects (B1);
 * only the two UDP ports differ (auth 1812 / acct 1813 defaults, B4).
 *
 * IMPORTANT: this feature talks ONLY to the real /v1/eguest resource via
 * eguestService — never the /v1/guests in-memory stubs in server.js.
 */
import type { EGuestProfile, EGuestRadiusServer } from '../../../types/configure';

/** Transitional numeric input state ('' while the field is cleared). */
export type Numeric = number | '';

export interface GuestServerForm {
  id?: string;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
  ipAddress: string;
  sharedSecret: string;
  radiusAuthProtocol: string;
  preferredMacAddressFormat: string;
  port: Numeric;
  totalRetries: Numeric;
  timeout: Numeric;
}

export interface GuestForm {
  id?: string;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
  name: string;
  cpFqdn: string;
  userName: string;
  password: string;
  authenticationRadiusServer: GuestServerForm;
  accountingRadiusServer: GuestServerForm;
}

export const GUEST_IP_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function inRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Fields shared by the single appliance — mirrored into both server objects (B1). */
export type SharedServerKey = 'ipAddress' | 'sharedSecret' | 'timeout' | 'totalRetries';

/** Write a shared field into BOTH the auth and acct server objects (B1). */
export function updateShared<K extends SharedServerKey>(
  form: GuestForm,
  key: K,
  value: GuestServerForm[K]
): GuestForm {
  return {
    ...form,
    authenticationRadiusServer: { ...form.authenticationRadiusServer, [key]: value },
    accountingRadiusServer: { ...form.accountingRadiusServer, [key]: value },
  };
}

/** Write a per-object field (the two UDP ports stay independent, B1). */
export function updatePort(
  form: GuestForm,
  which: 'authenticationRadiusServer' | 'accountingRadiusServer',
  port: Numeric
): GuestForm {
  return { ...form, [which]: { ...form[which], port } };
}

/**
 * Controller validation set (B2): Name required, IP pattern, timeout 2-60,
 * retries >= 0, both ports 0-65535, shared secret required minlength 6,
 * callback password minlength 6 when set.
 */
export function validateGuest(form: GuestForm): Record<string, string> {
  const errs: Record<string, string> = {};
  const auth = form.authenticationRadiusServer;
  if (!form.name.trim()) errs.name = 'Name is required';
  if (!GUEST_IP_RE.test(auth.ipAddress)) errs.ip = 'A valid IPv4 address is required';
  if (!inRange(auth.timeout, 2, 60)) errs.timeout = 'Valid range 2 to 60';
  if (!inRange(auth.totalRetries, 0, 32)) errs.retries = 'Retry count must be 0 or greater';
  if (!inRange(auth.port, 0, 65535)) errs.authPort = 'Valid range 0 to 65535';
  if (!inRange(form.accountingRadiusServer.port, 0, 65535)) {
    errs.acctPort = 'Valid range 0 to 65535';
  }
  if (!auth.sharedSecret || auth.sharedSecret.length < 6) {
    errs.secret = 'Shared secret is required (minimum 6 characters)';
  }
  if (form.password && form.password.length < 6) {
    errs.password = 'Password must be at least 6 characters';
  }
  return errs;
}

/** Build the editable form from an API record (or the /default seed, B4). */
export function fromGuestRecord(record: EGuestProfile): GuestForm {
  return structuredClone(record) as unknown as GuestForm;
}

/**
 * Convert a validated form back to the API payload, re-asserting the mirror
 * invariant on save (B1): shared fields are copied from the auth object into
 * the acct object so the two can never drift.
 */
export function toGuestPayload(form: GuestForm): Partial<EGuestProfile> {
  const payload = structuredClone(form);
  const auth = payload.authenticationRadiusServer;
  payload.accountingRadiusServer = {
    ...payload.accountingRadiusServer,
    ipAddress: auth.ipAddress,
    sharedSecret: auth.sharedSecret,
    timeout: auth.timeout,
    totalRetries: auth.totalRetries,
  };
  return payload as unknown as Partial<EGuestProfile>;
}

/** Typed helper for grid cells. */
export function guestServerIp(record: EGuestProfile): string {
  return (record.authenticationRadiusServer as EGuestRadiusServer | undefined)?.ipAddress ?? '';
}
