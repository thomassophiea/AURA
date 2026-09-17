/**
 * Plan a WLAN deployment across one site, before anything is written.
 *
 * Pure: it takes the estate as it currently reads and returns what would
 * change. No I/O, so every rule below is testable without a Gateway — which
 * matters, because these rules are the difference between lighting up an SSID
 * at one building and lighting it up at two.
 *
 * ── THE SHARED-PROFILE LEAK ──────────────────────────────────────────────────
 *
 * A WLAN is not bound to an AP. It is bound to a device PROFILE, and a profile
 * can serve APs at more than one site. Measured on the lab estate 2026-09-16:
 *
 *     AP5020-INDOOR     [PrimarySite]
 *     AP4020X-OUTDOOR   [PrimarySite]
 *     AP5010U-default   [AFC LAB]
 *     AP5022FX-default  [EAL]
 *     5022-N            [EAL-PT-N, EAL-PT-S]   <-- shared
 *
 * So "deploy this to EAL-PT-N" by binding `5022-N` also deploys it to
 * EAL-PT-S. The operator asked for one site and would have got two, with no
 * error and nothing in the response to say so — the configuration equivalent of
 * reporting an estate-wide number as one site's own.
 *
 * A profile whose AP membership is entirely inside the target site is bound in
 * place. A profile that reaches outside it is FORKED: cloned to a site-specific
 * profile, this site's APs moved onto the clone, and the clone bound. The
 * original is never touched, so the other site keeps exactly what it had.
 *
 * ── THE 6 GHz DROP ───────────────────────────────────────────────────────────
 *
 * Wi-Fi 6E requires WPA3-SAE or OWE. A WPA2-PSK service bound to a 6 GHz radio
 * is accepted by the Gateway and silently discarded. Rather than let that
 * happen and report success, the plan excludes the radio and says why, so the
 * exclusion is a visible decision instead of an invisible failure.
 *
 * The band is not a field — it is encoded in the radio's `mode`: `gnxbe` is
 * 2.4 GHz, `ancxbe` is 5 GHz, `ax6be` is 6 GHz.
 */

export const BAND = { GHZ_24: '2.4', GHZ_5: '5', GHZ_6: '6' };

/** Privacy elements that Wi-Fi 6E will carry. Anything else — WPA2-PSK, or an
 *  empty privacy block, which is an Open/captive-portal service — must not be
 *  bound to a 6 GHz radio. */
const SIX_GHZ_ELEMENTS = new Set(['WpaSaeElement', 'OweElement', 'Wpa3Enterprise192bElement']);

/**
 * Which band a radio is on, read from its `mode`.
 *
 * Checked for a `6` first: only the 6 GHz modes carry the digit (`ax6be`),
 * while 2.4 GHz modes start with `g` (`gnxbe`) and 5 GHz begins with `a`
 * (`ancxbe`). Guessing 5 GHz as the default is the safe fallback — an unknown
 * mode treated as 6 GHz would let a WPA2 service reach a band that silently
 * drops it.
 */
export function bandForRadio(radio) {
  const mode = String(radio?.mode ?? '');
  if (mode.includes('6')) return BAND.GHZ_6;
  if (mode.startsWith('g')) return BAND.GHZ_24;
  return BAND.GHZ_5;
}

/** Whether this service may legally be bound to a 6 GHz radio. */
export function sixGhzEligible(service) {
  const element = Object.keys(service?.privacy ?? {})[0];
  return SIX_GHZ_ELEMENTS.has(element);
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * @param {object} input
 * @param {string} input.siteName      the site to deploy to, as the operator said it
 * @param {object} input.service       the full service object being deployed
 * @param {Array}  input.aps           every AP the Gateway reports, estate-wide
 * @param {Array}  input.profiles      every profile the Gateway reports
 * @param {string} [input.forkSuffix]  overrides the `<profile>-<site>` clone name
 */
export function planSiteDeployment({ siteName, service, aps = [], profiles = [], forkSuffix } = {}) {
  const warnings = [];
  const site = String(siteName ?? '').trim();

  const knownSites = [...new Set(aps.map((a) => a.hostSite).filter(Boolean))];
  const siteAps = aps.filter((a) => norm(a.hostSite) === norm(site));

  // A site name matching no AP is not an empty site — it is very likely a name
  // that does not exist, and deploying "to nothing" must not read as success.
  if (!site || siteAps.length === 0) {
    return {
      status: 'site_matched_nothing',
      site,
      serviceId: service?.id ?? null,
      serviceName: service?.serviceName ?? null,
      targets: [],
      knownSites,
      blastRadius: { sites: 0, aps: 0, profiles: 0, radios: 0 },
      warnings: [
        `No AP reports hostSite "${site}". The sites that exist are: ${knownSites.join(', ') || '(none)'}.`,
      ],
    };
  }

  const eligible6 = sixGhzEligible(service);
  const serviceId = service?.id;

  // Group the target site's APs by the profile they are currently on. The join
  // is by NAME because `profileId` comes back null from /v1/aps/query on this
  // build — matching on the id would silently match nothing.
  const byProfile = new Map();
  for (const ap of siteAps) {
    const name = ap.profileName;
    if (!name) {
      warnings.push(
        `${ap.apName ?? ap.name ?? 'an AP'} reports no profile, so it cannot be deployed to.`
      );
      continue;
    }
    if (!byProfile.has(name)) byProfile.set(name, []);
    byProfile.get(name).push(ap);
  }

  const targets = [];

  for (const [profileName, apsOnProfile] of byProfile) {
    const profile = profiles.find((p) => norm(p.name) === norm(profileName));
    if (!profile) {
      warnings.push(
        `Profile "${profileName}" is referenced by ${apsOnProfile.length} AP(s) at ${site} but was not returned by the Gateway, so it cannot be deployed to.`
      );
      continue;
    }

    // Does this profile reach outside the target site? Computed over the WHOLE
    // estate, not just the site's APs — that is the entire point.
    const otherSites = [
      ...new Set(
        aps
          .filter((a) => norm(a.profileName) === norm(profileName))
          .map((a) => a.hostSite)
          .filter((s) => s && norm(s) !== norm(site))
      ),
    ];

    const radios = [];
    const excluded = [];
    for (const radio of profile.radios ?? []) {
      const band = bandForRadio(radio);
      if (radio.adminState !== true) {
        excluded.push({ index: radio.radioIndex, band, reason: 'the radio is administratively down' });
        continue;
      }
      if (band === BAND.GHZ_6 && !eligible6) {
        excluded.push({
          index: radio.radioIndex,
          band,
          reason:
            'Wi-Fi 6E requires WPA3-SAE or OWE — this WLAN would be accepted here and then ' +
            'silently discarded by the Gateway',
        });
        continue;
      }
      radios.push({ index: radio.radioIndex, band });
    }

    // Idempotent: a radio already carrying this service is not bound twice.
    const bound = new Set(
      (profile.radioIfList ?? [])
        .filter((e) => e.serviceId === serviceId)
        .map((e) => e.index)
    );
    const toBind = radios.filter((r) => !bound.has(r.index));

    targets.push({
      profileName,
      profileId: profile.id,
      action: otherSites.length ? 'fork' : 'bind',
      forkName: otherSites.length ? `${profileName}-${forkSuffix ?? site}` : null,
      protectedSites: otherSites,
      apNames: apsOnProfile.map((a) => a.apName ?? a.name).filter(Boolean),
      apSerials: apsOnProfile.map((a) => a.serialNumber ?? a.serial).filter(Boolean),
      platform: profile.apPlatform ?? null,
      radios: toBind,
      alreadyBound: [...bound],
      excluded,
    });
  }

  if (!eligible6 && targets.some((t) => t.excluded.some((e) => e.band === BAND.GHZ_6))) {
    warnings.push(
      'This WLAN will not be broadcast on 6 GHz. Wi-Fi 6E requires WPA3-SAE or OWE, and a ' +
        'WPA2 or Open service bound to a 6 GHz radio is discarded without an error.'
    );
  }

  // NOTHING LEFT TO DO IS NOT A DEPLOYMENT.
  //
  // Found by running this planner against the live estate: Skynet was already
  // bound on every PrimarySite profile, so every target came back with an empty
  // radio list — and the plan still reported success across four APs, which a
  // preview would have rendered as a change about to be made. An operator who
  // approves that learns nothing and changes nothing.
  //
  // Forking is suppressed as well: re-homing a live AP onto a cloned profile in
  // order to achieve no change at all is blast radius bought for nothing.
  const totalRadios = targets.reduce((n, t) => n + t.radios.length, 0);
  if (targets.length && totalRadios === 0) {
    for (const t of targets) {
      t.action = 'none';
      t.forkName = null;
    }
    warnings.push(
      `${service?.serviceName ?? 'This WLAN'} is already broadcast on every eligible radio at ` +
        `${site}. There is nothing to deploy.`
    );
    return {
      status: 'already_deployed',
      site,
      serviceId: serviceId ?? null,
      serviceName: service?.serviceName ?? null,
      targets,
      knownSites,
      blastRadius: { sites: 1, aps: 0, profiles: 0, forks: 0, radios: 0 },
      warnings,
    };
  }

  return {
    status: 'ok',
    site,
    serviceId: serviceId ?? null,
    serviceName: service?.serviceName ?? null,
    targets,
    knownSites,
    blastRadius: {
      sites: 1,
      aps: targets.reduce((n, t) => n + t.apNames.length, 0),
      profiles: targets.length,
      forks: targets.filter((t) => t.action === 'fork').length,
      radios: targets.reduce((n, t) => n + t.radios.length, 0),
    },
    warnings,
  };
}
