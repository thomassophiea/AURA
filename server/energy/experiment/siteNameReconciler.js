/**
 * Keep the configured pair's site NAMES in step with the controller.
 *
 * The pair is stored by site id AND name. The id is the identity; the name is
 * what the scope guard compares live AP membership against (`hostSite` is a
 * name — there is no id on an AP row). When a site is renamed on the Gateway
 * the id survives but the stored name goes stale, and from then on every write
 * is refused as "not the experiment's Treatment site" while the page labels the
 * pair with names that no longer exist. Measured 2026-10-08: EAL-PT-N/S were
 * renamed to EAL-PT-B/A on 10-06 and the Energy page still showed N/S.
 *
 * So the names are re-read by id. Only names change here — never which site is
 * Treatment and which is Control, and never an experiment already running (its
 * guard keeps refusing a renamed site, which is the safe direction).
 */

import { rows } from './siteDiscovery.js';

const CACHE_MS = 5 * 60 * 1000;
const lastChecked = new Map();

/** Live id -> name map from a /v3/sites payload. */
export function siteNamesById(payload) {
  const map = new Map();
  for (const site of rows(payload, ['sites', 'data'])) {
    const id = site?.id ?? site?.siteId ?? null;
    const name = site?.siteName ?? site?.name ?? null;
    if (id && name) map.set(id, name);
  }
  return map;
}

/** The rename to apply, or null when the stored names already match (or a site is gone). */
export function planRename(config, namesById) {
  if (!config) return null;
  const treatment = config.treatment_site_id ? namesById.get(config.treatment_site_id) : null;
  const control = config.control_site_id ? namesById.get(config.control_site_id) : null;
  const next = {
    treatmentSiteName: treatment ?? config.treatment_site_name ?? null,
    controlSiteName: control ?? config.control_site_name ?? null,
  };
  if (
    next.treatmentSiteName === (config.treatment_site_name ?? null) &&
    next.controlSiteName === (config.control_site_name ?? null)
  ) {
    return null;
  }
  return next;
}

/**
 * Reconcile and return the (possibly updated) config. Never throws: a failed
 * read leaves the stored config exactly as it was.
 */
export async function reconcileConfigSiteNames({
  source,
  config,
  sessionFor,
  updateNames,
  force = false,
  now = Date.now(),
  namesById = null,
}) {
  if (!config || !source) return config;
  const checkedAt = lastChecked.get(source.id);
  if (!force && !namesById && checkedAt !== undefined && now - checkedAt < CACHE_MS) return config;
  try {
    let map = namesById;
    if (!map) {
      const session = await sessionFor(source);
      const response = await session.get('/v3/sites');
      if (!response?.ok) return config;
      map = siteNamesById(response.data);
    }
    lastChecked.set(source.id, now);
    const rename = planRename(config, map);
    if (!rename) return config;
    const updated = await updateNames(source.id, rename);
    return updated ?? { ...config, treatment_site_name: rename.treatmentSiteName, control_site_name: rename.controlSiteName };
  } catch {
    return config;
  }
}

export function __resetReconcilerCache() {
  lastChecked.clear();
}
