/**
 * Correlation — find the failure boundary instead of describing one victim.
 *
 * "One client reports failure" is where an investigation starts and never where
 * it should end. The useful answer is the boundary:
 *
 *   42 clients affected, across 8 APs, all on one WLAN, all on VLAN 72, all at
 *   one site.
 *
 * That sentence names the thing to fix. The original client's RSSI does not.
 *
 * TWO NUMBERS, NOT ONE
 * --------------------
 * A shared attribute is only evidence when it is both COMMON among the
 * affected and RARE among the healthy. Coverage alone is the classic trap: on a
 * Gateway serving one SSID, 100% of affected clients share that SSID, and
 * reporting "all affected clients are on Guest" is true, useless, and reads as a
 * finding. So every candidate carries:
 *
 *   coverage    = share of the AFFECTED that hold this value
 *   specificity = share of everyone holding this value that is affected
 *   lift        = specificity / base rate
 *
 * A value that simply reflects the base rate has lift ≈ 1 and is discarded,
 * however high its coverage.
 *
 * THE COHORT FLOOR IS ENFORCED HERE, NOT SUGGESTED
 * ------------------------------------------------
 * "A cohort smaller than THREE peers returns 'too few peers to judge', never a
 * verdict" — because a coincidence between two clients becomes a work order the
 * moment it is written down as a shared cause.
 */

/** The dimensions a wireless fault can be bounded by, in narrowing order. */
export const DIMENSIONS = [
  { key: 'apName', label: 'access point', field: (r) => r.ApName ?? r.apName ?? null },
  { key: 'apSerial', label: 'access point', field: (r) => r.ApSerial ?? r.apSerial ?? null },
  { key: 'radio', label: 'radio', field: (r) => bandOf(r) },
  { key: 'channel', label: 'channel', field: (r) => nullIfBlank(r.Channel ?? r.channel) },
  { key: 'ssid', label: 'WLAN', field: (r) => r.SSID ?? r.ssid ?? null },
  { key: 'vlan', label: 'VLAN', field: (r) => nullIfBlank(r.Vlan ?? r.VLAN ?? r.vlan) },
  { key: 'role', label: 'role', field: (r) => r.RoleName ?? r.role ?? null },
  { key: 'site', label: 'site', field: (r) => r.SiteName ?? r.siteName ?? null },
  { key: 'manufacturer', label: 'device make', field: (r) => r.Manufacturer ?? r.manufacturer ?? null },
  { key: 'osName', label: 'operating system', field: (r) => r.OsName ?? r.osName ?? null },
  { key: 'protocol', label: '802.11 mode', field: (r) => r['11Protocol'] ?? r.protocol ?? null },
];

/** The cohort floor. Below this, no verdict — only a count. */
export const MIN_COHORT = 3;

/** Lift below this means the attribute just reflects how common it already is. */
export const MIN_LIFT = 1.5;

/** Coverage below this means the attribute does not describe the affected set. */
export const MIN_COVERAGE = 0.7;

function nullIfBlank(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'none' || s === '0') return null;
  return s;
}

/**
 * Band from a channel number. Kept coarse on purpose: the useful correlation is
 * "everyone affected is on 2.4 GHz", not the exact channel width.
 */
export function bandOf(row) {
  const ch = Number(row.Channel ?? row.channel);
  if (!Number.isFinite(ch) || ch <= 0) return null;
  if (ch <= 14) return '2.4 GHz';
  if (ch >= 36 && ch <= 177) return '5 GHz';
  if (ch >= 1 && ch <= 233) return '6 GHz';
  return null;
}

/**
 * Identity for a telemetry row, so affected/healthy sets can be compared
 * without holding whole rows.
 */
export function keyOf(row) {
  return String(row?.MAC ?? row?.mac ?? row?.id ?? '').toUpperCase();
}

/**
 * Find what the affected population shares that the healthy one does not.
 *
 * @param {object} args
 * @param {object[]} args.affected    telemetry rows for clients with findings
 * @param {object[]} args.population  ALL scorable rows in the same scope
 * @param {object} [args.opts]
 * @returns {{
 *   cohort: number, population: number, baseRate: number|null,
 *   verdict: 'boundary_found'|'no_shared_attribute'|'too_few_peers'|'no_population',
 *   boundary: object|null, candidates: object[], note: string
 * }}
 */
export function expandBlastRadius({ affected = [], population = [], dimensions = DIMENSIONS } = {}) {
  const affectedRows = affected.filter(Boolean);
  const popRows = population.filter(Boolean);
  const cohort = affectedRows.length;

  if (!popRows.length) {
    return {
      cohort,
      population: 0,
      baseRate: null,
      verdict: 'no_population',
      boundary: null,
      candidates: [],
      note: 'No comparable population was read, so nothing can be said about how widespread this is.',
    };
  }

  const baseRate = cohort / popRows.length;
  const affectedKeys = new Set(affectedRows.map(keyOf));

  if (cohort < MIN_COHORT) {
    return {
      cohort,
      population: popRows.length,
      baseRate,
      verdict: 'too_few_peers',
      boundary: null,
      candidates: [],
      note:
        `${cohort} affected client(s) is below the ${MIN_COHORT} needed to tell a shared cause ` +
        'from a coincidence. Report the count and the individual findings, not a common cause.',
    };
  }

  const candidates = [];
  for (const dim of dimensions) {
    /** value -> {affected, total} */
    const tally = new Map();
    for (const row of popRows) {
      const value = dim.field(row);
      if (value === null || value === undefined || value === '') continue;
      const v = String(value);
      if (!tally.has(v)) tally.set(v, { affected: 0, total: 0 });
      const t = tally.get(v);
      t.total += 1;
      if (affectedKeys.has(keyOf(row))) t.affected += 1;
    }

    for (const [value, t] of tally) {
      const coverage = t.affected / cohort;
      const specificity = t.affected / t.total;
      const lift = baseRate > 0 ? specificity / baseRate : null;
      if (coverage < MIN_COVERAGE) continue;
      if (lift === null || lift < MIN_LIFT) continue;
      candidates.push({
        dimension: dim.key,
        label: dim.label,
        value,
        affectedWithValue: t.affected,
        totalWithValue: t.total,
        coverage: round(coverage),
        specificity: round(specificity),
        lift: round(lift),
      });
    }
  }

  if (!candidates.length) {
    return {
      cohort,
      population: popRows.length,
      baseRate: round(baseRate),
      verdict: 'no_shared_attribute',
      boundary: null,
      candidates: [],
      note:
        `${cohort} of ${popRows.length} clients have findings, but they share no access point, ` +
        'WLAN, VLAN, band, site or device type beyond what the whole population already shares. ' +
        'That points AWAY from a single shared cause and towards several independent ones.',
    };
  }

  // Rank by how completely the value explains the affected set, then by how
  // exclusively it belongs to them.
  candidates.sort(
    (a, b) => b.coverage - a.coverage || b.specificity - a.specificity || b.lift - a.lift
  );

  const boundary = candidates[0];
  return {
    cohort,
    population: popRows.length,
    baseRate: round(baseRate),
    verdict: 'boundary_found',
    boundary,
    candidates: candidates.slice(0, 8),
    note:
      `${boundary.affectedWithValue} of ${cohort} affected clients share ${boundary.label} ` +
      `"${boundary.value}", and ${boundary.affectedWithValue} of the ${boundary.totalWithValue} ` +
      `clients on it are affected. That is the failure boundary to investigate, not the ` +
      'individual client the complaint arrived about.',
  };
}

/**
 * What differs between a broken population and a working one.
 *
 * The counterfactual question — "what is different about the ones that work?" —
 * is how a hypothesis gets prioritised instead of guessed. Returns attributes
 * held by most of the broken set and almost none of the healthy set, and vice
 * versa.
 */
export function counterfactual({ broken = [], healthy = [], dimensions = DIMENSIONS } = {}) {
  if (!broken.length || !healthy.length) {
    return {
      comparable: false,
      differences: [],
      note:
        'A counterfactual needs both a broken and a working population. ' +
        `Have ${broken.length} broken and ${healthy.length} healthy.`,
    };
  }

  const differences = [];
  for (const dim of dimensions) {
    const brokenVals = counts(broken.map(dim.field));
    const healthyVals = counts(healthy.map(dim.field));

    for (const [value, n] of brokenVals) {
      const brokenShare = n / broken.length;
      const healthyShare = (healthyVals.get(value) ?? 0) / healthy.length;
      if (brokenShare < 0.7) continue;
      if (healthyShare > 0.2) continue;
      differences.push({
        dimension: dim.key,
        label: dim.label,
        value,
        presentInBroken: round(brokenShare),
        presentInHealthy: round(healthyShare),
        direction: 'only-in-broken',
      });
    }
    for (const [value, n] of healthyVals) {
      const healthyShare = n / healthy.length;
      const brokenShare = (brokenVals.get(value) ?? 0) / broken.length;
      if (healthyShare < 0.7) continue;
      if (brokenShare > 0.2) continue;
      differences.push({
        dimension: dim.key,
        label: dim.label,
        value,
        presentInBroken: round(brokenShare),
        presentInHealthy: round(healthyShare),
        direction: 'only-in-healthy',
      });
    }
  }

  differences.sort(
    (a, b) =>
      Math.abs(b.presentInBroken - b.presentInHealthy) -
      Math.abs(a.presentInBroken - a.presentInHealthy)
  );

  return {
    comparable: true,
    differences: differences.slice(0, 8),
    note: differences.length
      ? 'These attributes separate the working population from the broken one. They are where a hypothesis should start, not where it should end.'
      : 'Nothing distinguishes the broken population from the working one on any dimension available here. The cause is not visible in these attributes.',
  };
}

function counts(values) {
  const m = new Map();
  for (const raw of values) {
    if (raw === null || raw === undefined || raw === '') continue;
    const v = String(raw);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

function round(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : n;
}

/**
 * One sentence an operator can act on.
 *
 * Deliberately plain: this is the line that leads the answer, and it must be
 * readable by someone who does not know what RFQI is.
 */
export function describeBlastRadius(result, { unit = 'clients' } = {}) {
  if (!result) return '';
  if (result.verdict === 'no_population') return result.note;
  if (result.verdict === 'too_few_peers') {
    return `${result.cohort} ${unit} affected — too few to identify a shared cause.`;
  }
  if (result.verdict === 'no_shared_attribute') {
    return `${result.cohort} of ${result.population} ${unit} affected, with nothing in common — likely several separate problems rather than one.`;
  }
  const b = result.boundary;
  return `${result.cohort} of ${result.population} ${unit} affected, all on ${b.label} ${b.value} (${b.affectedWithValue} of the ${b.totalWithValue} there).`;
}
