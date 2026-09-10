/**
 * Client resolution — turn whatever the operator typed into a specific client,
 * or into a short list of candidates.
 *
 * Design constraints that come from measurement, not preference:
 *
 * 1. `Hostname` and `Username` are frequently EMPTY in MuTable (measured: most
 *    rows on a PSK network carry neither). Resolution therefore cannot depend
 *    on them; MAC, IP and manufacturer/OS carry the load.
 *
 * 2. Modern devices use randomized (locally-administered) MAC addresses, so a
 *    MAC is NOT a durable identity. We detect randomization and say so, rather
 *    than pretending the address identifies a device across sessions. Nothing
 *    here requires randomization to be switched off.
 *
 * 3. When several clients match, we return candidates. Guessing which one the
 *    operator meant produces a confident diagnosis of the wrong device, which
 *    is worse than one extra question.
 */

/** Normalise any MAC-ish string to uppercase colon-separated form. */
export function normaliseMac(input) {
  if (typeof input !== 'string') return null;
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

/** A full MAC, or a partial suffix/fragment the operator might type. */
export function looksLikeMacFragment(input) {
  if (typeof input !== 'string') return false;
  const hex = input.replace(/[^0-9a-fA-F]/g, '');
  return hex.length >= 4 && /^[0-9a-fA-F:.\- ]+$/.test(input.trim());
}

export function isIpv4(input) {
  return typeof input === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(input.trim());
}

/**
 * A locally-administered MAC has bit 1 of the first octet set — the second hex
 * digit is one of 2, 6, A, E. Apple/Android private Wi-Fi addresses all land
 * here. Multicast (bit 0) is not a client address.
 */
export function isRandomizedMac(mac) {
  const norm = normaliseMac(mac);
  if (!norm) return false;
  const firstOctet = parseInt(norm.slice(0, 2), 16);
  if (Number.isNaN(firstOctet)) return false;
  return (firstOctet & 0b10) !== 0;
}

/**
 * What a MAC can and cannot tell us about identity. Cortex uses this to caveat
 * any statement about a device's history.
 */
export function macIdentityNote(mac) {
  if (!normaliseMac(mac)) return null;
  if (!isRandomizedMac(mac)) return null;
  return (
    'This is a randomized (locally-administered) MAC address, so it identifies this ' +
    'session rather than the device. History before the last address rotation belongs ' +
    'to a different MAC and cannot be joined to this one from Gateway telemetry.'
  );
}

/**
 * Build a candidate record from a MuTable row. Keeps only identity-bearing
 * fields — the diagnosis pulls telemetry separately.
 */
function toCandidate(row) {
  const mac = normaliseMac(row.MAC) ?? row.MAC;
  return {
    mac,
    ip: row.IP || null,
    hostname: row.Hostname || null,
    username: row.Username || null,
    manufacturer: row.Manufacturer || null,
    osName: row.OsName || null,
    deviceClass: row.OsClassName || null,
    ssid: row.SSID || null,
    apName: row.ApName || null,
    apSerial: row.ApSerial || null,
    radioId: row.RadioID ?? null,
    siteName: row.SiteName || null,
    role: row.RoleName || null,
    randomizedMac: isRandomizedMac(mac),
    lastSeen: row.LastUpdate ? Number(row.LastUpdate) * 1000 : null,
  };
}

/** Collapse many MuTable samples into one record per MAC, keeping the newest. */
export function dedupeByMac(rows) {
  const byMac = new Map();
  for (const row of rows) {
    if (!row?.MAC) continue;
    const key = normaliseMac(row.MAC) ?? row.MAC;
    const existing = byMac.get(key);
    const ts = Number(row.LastUpdate ?? row.StatsTimestamp ?? 0);
    if (!existing || ts >= existing.__ts) {
      byMac.set(key, { ...row, __ts: ts });
    }
  }
  return [...byMac.values()];
}

/**
 * Resolve an operator-supplied identifier against live client telemetry.
 *
 * @param {string} query      whatever the operator typed
 * @param {object[]} rows     MuTable rows
 * @param {object} [scope]    { siteName, ssid, apSerial } narrowing from UI context
 * @returns {{status: 'resolved'|'ambiguous'|'not_found',
 *            client?: object, candidates?: object[], matchedOn?: string,
 *            identityNote?: string|null, scopeApplied?: object}}
 */
export function resolveClient(query, rows, scope = {}) {
  const unique = dedupeByMac(rows ?? []);

  // Apply UI scope first so "the client on Aura_PSAE" cannot match a Skynet
  // device with a similar address.
  let pool = unique;
  const scopeApplied = {};
  if (scope.siteName) {
    const next = pool.filter((r) => r.SiteName === scope.siteName);
    if (next.length) {
      pool = next;
      scopeApplied.siteName = scope.siteName;
    }
  }
  if (scope.ssid) {
    const next = pool.filter((r) => r.SSID === scope.ssid);
    if (next.length) {
      pool = next;
      scopeApplied.ssid = scope.ssid;
    }
  }
  if (scope.apSerial) {
    const next = pool.filter((r) => r.ApSerial === scope.apSerial);
    if (next.length) {
      pool = next;
      scopeApplied.apSerial = scope.apSerial;
    }
  }

  const raw = String(query ?? '').trim();
  if (!raw) {
    return { status: 'not_found', candidates: [], matchedOn: 'empty query', scopeApplied };
  }

  const finish = (matches, matchedOn) => {
    if (matches.length === 1) {
      const client = toCandidate(matches[0]);
      return {
        status: 'resolved',
        client,
        matchedOn,
        identityNote: macIdentityNote(client.mac),
        scopeApplied,
      };
    }
    if (matches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: matches.slice(0, 10).map(toCandidate),
        totalMatches: matches.length,
        matchedOn,
        scopeApplied,
      };
    }
    return null;
  };

  // 1. IP address FIRST. This ordering is load-bearing, not stylistic: an
  //    address like 192.168.100.122 strips to exactly 12 hex digits, so it
  //    parses as a perfectly valid MAC ("19:21:68:10:01:22") and would be
  //    matched as one. An IPv4-shaped string is always an IP.
  if (isIpv4(raw)) {
    const hit = finish(pool.filter((r) => r.IP === raw), 'IP address');
    if (hit) return hit;
    return { status: 'not_found', candidates: [], matchedOn: 'IP address', scopeApplied };
  }

  // 2. Exact MAC — the least ambiguous thing anyone can give us.
  const exactMac = normaliseMac(raw);
  if (exactMac) {
    const hit = finish(
      pool.filter((r) => (normaliseMac(r.MAC) ?? r.MAC) === exactMac),
      'exact MAC'
    );
    if (hit) return hit;
    return {
      status: 'not_found',
      candidates: [],
      matchedOn: 'exact MAC',
      identityNote: macIdentityNote(exactMac),
      scopeApplied,
      note:
        'No client with that MAC appears in the last 3 hours of Gateway telemetry. ' +
        'It may be disconnected, on another Gateway, or — if this is a randomized ' +
        'address — may have rotated to a different MAC.',
    };
  }

  const lower = raw.toLowerCase();

  // 3. Partial MAC (operators habitually quote the last four hex digits).
  if (looksLikeMacFragment(raw)) {
    const frag = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    const hit = finish(
      pool.filter((r) => {
        const m = (normaliseMac(r.MAC) ?? String(r.MAC ?? '')).replace(/:/g, '');
        return m.includes(frag);
      }),
      `partial MAC "${frag}"`
    );
    if (hit) return hit;
  }

  // 4. Hostname / username — exact first, then contains. Both are often empty,
  //    so a miss here is expected and must not end the search.
  for (const [field, label] of [
    ['Hostname', 'hostname'],
    ['Username', 'username'],
  ]) {
    const exact = pool.filter((r) => (r[field] ?? '').toLowerCase() === lower);
    const hit = finish(exact, `${label} (exact)`);
    if (hit) return hit;
  }
  for (const [field, label] of [
    ['Hostname', 'hostname'],
    ['Username', 'username'],
  ]) {
    const partial = pool.filter((r) => (r[field] ?? '').toLowerCase().includes(lower));
    const hit = finish(partial, `${label} (contains)`);
    if (hit) return hit;
  }

  // 5. Device description — manufacturer / OS / device class. This is how you
  //    find "the Kindle" or "Ainslee's MacBook" when no hostname is published.
  const descriptive = pool.filter((r) =>
    [r.Manufacturer, r.OsName, r.OsClassName]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(lower))
  );
  const hit = finish(descriptive, 'device manufacturer/OS');
  if (hit) return hit;

  return {
    status: 'not_found',
    candidates: [],
    matchedOn: 'no field matched',
    scopeApplied,
    note:
      `Nothing in the last 3 hours of client telemetry matches "${raw}". ` +
      'Gateway telemetry frequently carries no hostname or username, so a device ' +
      'may be present but not findable by name — a MAC, a partial MAC or an IP ' +
      'address will resolve it.',
  };
}

/**
 * Rank clients by how badly they are doing, for "who is worst right now".
 * Deliberately returns the inputs it used so a caller can show the evidence
 * rather than an opaque score.
 */
export function summariseCandidate(row) {
  const c = toCandidate(row);
  return {
    ...c,
    rss: Number.isFinite(Number(row.Rss)) && Number(row.Rss) !== 0 ? Number(row.Rss) : null,
    snr: Number.isFinite(Number(row.SNR)) && Number(row.SNR) !== -10000 ? Number(row.SNR) : null,
    rfqi: Number.isFinite(Number(row.RFQI)) ? Number(row.RFQI) : null,
    channel: row.Channel ?? null,
    protocol: row['11Protocol'] ?? null,
  };
}
