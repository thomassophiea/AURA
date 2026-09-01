/**
 * IPv6 display normalization.
 *
 * The controller's `/v1/stations` reports `ipv6Address` as an ARRAY — a station
 * routinely holds a link-local plus one or more global addresses — while most
 * of the UI grew up assuming a string. A raw array handed to React renders the
 * addresses concatenated with no separator and no truncation, which is exactly
 * the overflow this module exists to prevent. Every render site goes through
 * these two helpers instead of touching the field directly.
 */

/** All addresses as a clean string list, whatever shape the field arrived in. */
export function ipv6List(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return [value];
  }
  return [];
}

/**
 * The one address worth a single-line cell: the first global-scope address,
 * falling back to link-local only when that is all the station has.
 */
export function primaryIpv6(value: unknown): string | null {
  const list = ipv6List(value);
  if (list.length === 0) return null;
  return list.find((addr) => !addr.toLowerCase().startsWith('fe80')) ?? list[0];
}
