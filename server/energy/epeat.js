/**
 * EPEAT registration of Extreme hardware, as publicly announced.
 *
 * SOURCE: Extreme Networks press release, 2026-03-19, "Extreme Raises the Bar
 * on Sustainable Networking, Achieving Industry's First EPEAT-Registered
 * Solutions for Customers" — registered in the EPEAT "Network Equipment"
 * category: the 5420 Series universal switches and the AP4020 Wi-Fi 7 access
 * points. The release states no tier; the Bronze tier comes from Extreme's EPEAT
 * overview slide (2025) and is attributed to that slide, not the release.
 *
 * MATCHING IS EXACT, ON PURPOSE. A variant such as the AP4020X is not named in
 * either source, so it is NOT counted as registered. Claiming registration for
 * hardware that is not on the registry would be the kind of overstatement an
 * ESG report must never contain. Extend this list only from the EPEAT registry
 * (https://www.epeat.net) or an Extreme announcement.
 */

export const EPEAT_SOURCE = {
  title:
    "Extreme Raises the Bar on Sustainable Networking, Achieving Industry's First EPEAT-Registered Solutions for Customers",
  publisher: 'Extreme Networks',
  date: '2026-03-19',
  url: 'https://investor.extremenetworks.com/news/news-details/2026/Extreme-Raises-the-Bar-on-Sustainable-Networking-Achieving-Industrys-First-EPEAT-Registered-Solutions-for-Customers/default.aspx',
  category: 'Network Equipment',
  tier: 'Bronze',
  tierSource: 'Extreme EPEAT overview slide (2025); not stated in the press release',
};

const REGISTERED_AP_MODELS = new Set(['AP4020']);

/** Normalise a controller model string ("AP4020-WW", "ap4020") to a family id. */
function normalizeModel(model) {
  if (typeof model !== 'string') return null;
  const trimmed = model.trim().toUpperCase();
  if (!trimmed) return null;
  // Regional / SKU suffixes after a hyphen do not change the platform.
  return trimmed.split('-')[0];
}

export function isEpeatRegisteredApModel(model) {
  const family = normalizeModel(model);
  return family ? REGISTERED_AP_MODELS.has(family) : false;
}

/**
 * Summarise a fleet's EPEAT coverage from AP model strings.
 * @param {Array<string|null|undefined>} models one entry per AP
 */
export function summarizeEpeat(models) {
  const byModel = new Map();
  let registered = 0;
  let known = 0;
  for (const model of models ?? []) {
    const family = normalizeModel(model);
    if (!family) continue;
    known += 1;
    const isRegistered = REGISTERED_AP_MODELS.has(family);
    if (isRegistered) registered += 1;
    const entry = byModel.get(family) ?? { model: family, count: 0, registered: isRegistered };
    entry.count += 1;
    byModel.set(family, entry);
  }
  return {
    apCount: known,
    registeredApCount: registered,
    registeredShare: known > 0 ? registered / known : null,
    models: [...byModel.values()].sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)),
    source: EPEAT_SOURCE,
  };
}
