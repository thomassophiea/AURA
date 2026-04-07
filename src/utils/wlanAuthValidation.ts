const ENTERPRISE_AUTH_TYPES = new Set([
  // camelCase (API canonical values)
  'wpa2Enterprise',
  'wpa3Enterprise',
  'wpa2wpa3Enterprise',
  'dot1x',
  'ENTERPRISE',
  'WPA2_ENTERPRISE',
  'WPA3_ENTERPRISE',
  'WPA2WPA3_ENTERPRISE',
  // hyphenated (UI select values used by NetworkEditDetail)
  'wpa2-enterprise',
  'wpa3-enterprise',
  'wpa23-enterprise',
]);

export function isEnterpriseAuth(authType: string): boolean {
  return ENTERPRISE_AUTH_TYPES.has(authType);
}

/**
 * Returns an error message if enterprise auth is selected without an AAA policy,
 * or null if validation passes.
 */
export function validateEnterpriseAuthRequirements(
  authType: string,
  aaaPolicyId: string
): string | null {
  if (isEnterpriseAuth(authType) && !aaaPolicyId) {
    return 'AAA policy is required for enterprise authentication modes';
  }
  return null;
}
