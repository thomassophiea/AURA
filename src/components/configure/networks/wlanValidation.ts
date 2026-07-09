/**
 * Controller required/pattern/range rules for the WLAN editor
 * (wlan_config.html), applied over the editor form state. Split from
 * wlanForm.ts to keep both modules inside the house 300-line cap;
 * wlanForm re-exports this surface so imports stay stable.
 */
import { hasPresharedKey, isEnterprise, readPrivacyElement } from './wlanModel';
import type { WlanFormState } from './wlanForm';

export type WlanErrors = Partial<
  Record<
    | 'serviceName'
    | 'ssid'
    | 'presharedKey'
    | 'wepKey'
    | 'mobilityDomainId'
    | 'sessionTimeout'
    | 'preAuthenticatedIdleTimeout'
    | 'postAuthenticatedIdleTimeout'
    | 'cpRedirect'
    | 'unauthenticatedRole',
    string
  >
>;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;
const HEX64 = /^[0-9a-fA-F]{64}$/;
const HEX_CHARS = /^[0-9a-fA-F]*$/;

const isNaturalInRange = (value: unknown, min: number, max: number): boolean => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
};

/** Mobility Domain ID is edit-mode only (controller shows it when !createMode). */
export function showMobilityDomainId(form: WlanFormState, isNew: boolean): boolean {
  const auth = form.ui.authType;
  if (!isEnterprise(auth) || isNew) return false;
  return !!readPrivacyElement(form.record.privacy, auth).fastTransitionEnabled;
}

/** WEP key length hint: 10/26 hex or 5/13 ASCII characters per keyLength+method. */
export function wepKeyExpectedLength(fields: {
  keyLength?: string;
  pskInputType?: string;
}): { length: number; hex: boolean } {
  const is128 = fields.keyLength === 'Wep_128bit';
  const hex = (fields.pskInputType ?? 'Hex') === 'Hex';
  return { length: is128 ? (hex ? 26 : 13) : hex ? 10 : 5, hex };
}

/** Controller required/pattern/range rules (wlan_config.html). */
export function validateWlan(form: WlanFormState, isNew: boolean): WlanErrors {
  const errors: WlanErrors = {};
  const { record, ui } = form;
  const auth = ui.authType;
  const fields = readPrivacyElement(record.privacy, auth);

  const name = (record.serviceName ?? '').trim();
  if (!name) errors.serviceName = 'Network Name is required';
  else if (!NAME_PATTERN.test(record.serviceName)) {
    errors.serviceName =
      'Letters, digits, space, dot, dash, underscore only (max 64); must start with a letter or digit';
  }

  const ssid = record.ssid ?? '';
  if (!ssid.trim()) errors.ssid = 'SSID is required';
  else if (ssid.length > 32) errors.ssid = 'SSID must be at most 32 characters';

  if (hasPresharedKey(auth)) {
    const key = fields.presharedKey ?? '';
    if (fields.keyHexEncoded) {
      if (!HEX64.test(key)) {
        errors.presharedKey = 'Hex key must be exactly 64 hexadecimal characters';
      }
    } else if (key.length < 8 || key.length > 63) {
      errors.presharedKey = 'Key must be 8 to 63 characters';
    }
  }

  if (auth === 'WEP') {
    const { length, hex } = wepKeyExpectedLength(fields);
    const key = fields.passPhrase ?? '';
    if (key.length !== length || (hex && !HEX_CHARS.test(key))) {
      errors.wepKey = `Key must be exactly ${length}${hex ? ' hex' : ''} characters`;
    }
  }

  if (
    showMobilityDomainId(form, isNew) &&
    !isNaturalInRange(fields.fastTransitionMdId, 0, 65535)
  ) {
    errors.mobilityDomainId = 'Mobility Domain ID - valid range 0 to 65535';
  }

  for (const key of [
    'sessionTimeout',
    'preAuthenticatedIdleTimeout',
    'postAuthenticatedIdleTimeout',
  ] as const) {
    const value = record[key];
    if (value != null && !isNaturalInRange(value, 0, 999999)) {
      errors[key] = 'Valid range 0 to 999999 (whole seconds)';
    }
  }

  if (
    record.enableCaptivePortal &&
    record.captivePortalType === 'External' &&
    !ui.cpRedirect.trim()
  ) {
    errors.cpRedirect = 'ECP URL is required for an External portal';
  }

  if (
    !record.enableCaptivePortal &&
    record.mbaAuthorization &&
    !record.unAuthenticatedUserDefaultRoleID
  ) {
    errors.unauthenticatedRole =
      'Unauthenticated role is required when MBA is on and captive portal is off';
  }

  return errors;
}
