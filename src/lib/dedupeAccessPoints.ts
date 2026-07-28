/**
 * De-duplicate access points by serialNumber (the canonical physical-AP key).
 *
 * When "All Site Groups" is active the Access Points page fetches APs from every
 * site group's controller and concatenates the results. Two site groups that
 * resolve to the same physical controller (e.g. distinct site groups configured
 * on one box) each return the full fleet, so the concatenated list contains
 * every AP more than once. AG Grid keys rows by serialNumber (getRowId), so
 * duplicate serials collapse to blank phantom rows while the footer still counts
 * the duplicates — producing the "12 of 12 but 6 render" symptom. Keeping the
 * first occurrence of each serial (and dropping any record without one)
 * guarantees every rendered row maps to a real AP and the count matches.
 */
export function dedupeAccessPointsBySerial<T extends { serialNumber?: string }>(aps: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const ap of aps) {
    const serial = ap.serialNumber;
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);
    result.push(ap);
  }
  return result;
}
