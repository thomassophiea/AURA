/**
 * Shared validation primitives for the six Service Profile editors
 * (EPB-125 · specialized-profiles-parity.md). Regexes and the common
 * name rule (required + unique + optional invalid-chars) are lifted 1:1
 * from the controller's shipping JS bundles (see config-svc-profiles.js).
 */

/** IPv4 dotted-quad. */
export const RE_IPV4 =
  /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
/** Canonical UUID. */
export const RE_UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** Colon-separated MAC. */
export const RE_MAC = /^([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})$/;
/** Controller hostNamePattern (extracted from the shipping bundles). */
export const RE_HOST =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
/** Controller invalidCharsPattern: whole name must be printable ASCII. */
export const RE_BADCHARS = /[^ -~]/;
/** Generic-scan vendor name (template regex). */
export const RE_VENDOR_NAME = /^[0-9a-zA-Z.,() ]+$/;
export const RE_HEX4 = /^[0-9A-Fa-f]{4}$/;
export const RE_HEX16 = /^[0-9A-Fa-f]{16}$/;
export const RE_HEX32 = /^[0-9A-Fa-f]{32}$/;
/** Eddystone URL — controller validates server-side; http(s) prefix enforced here. */
export const RE_URL = /^https?:\/\/.+/;

export const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;

export const intIn = (v: unknown, lo: number, hi: number): boolean =>
  isInt(v) && v >= lo && v <= hi;

/** True when every value in the error map is falsy. */
export const noErrors = (errs: Record<string, string | null | undefined>): boolean =>
  Object.values(errs).every((e) => !e);

export interface NamedRecord {
  id?: string | null;
  name?: string | null;
}

/**
 * Common name validation across all six areas: required + unique
 * (profile_name_exists). RTLS / Analytics / ADSP additionally reject any
 * non-printable-ASCII character (invalidCharsPattern) via `checkChars`.
 */
export function nameError(
  rows: NamedRecord[],
  form: NamedRecord,
  checkChars = false
): string | null {
  const name = String(form.name ?? '').trim();
  if (!name) return 'Profile Name is required';
  if (checkChars && RE_BADCHARS.test(String(form.name))) {
    return 'Profile Name contains invalid characters';
  }
  const dup = rows.some((r) => r.name === form.name && r.id !== form.id);
  return dup ? 'A profile with this name already exists' : null;
}
