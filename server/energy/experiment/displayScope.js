/**
 * Which experiment the Energy page is currently ABOUT.
 *
 * Not the same question as "which experiments exist". The page has one subject,
 * and getting it wrong is worse than showing nothing: a completed run against a
 * different site pair was being presented as the current pairing, with the old
 * treatment site labelled "Energy optimized site" and the chart drawing two
 * sites nobody had selected.
 *
 * Found on Integration before the EAL demonstration: the configured pair was
 * EAL-PT-N / EAL-PT-S, while a run from three days earlier (PrimarySite / EAL)
 * won because the resolution was `active ?? mostRecent` with no reference to
 * the configuration at all.
 *
 * The rule:
 *
 *   1. An experiment in flight is always the subject. Nothing outranks a run
 *      that is currently happening — least of all configuration, which may have
 *      been edited while it runs.
 *   2. A finished run whose pair still MATCHES the configured pair is the
 *      subject. This is the "here is what your last run measured" case, and it
 *      is why finished runs are shown at all.
 *   3. A finished run whose pair DIFFERS from the configured pair is history.
 *      The pair has been re-pointed since; the page leads with what is set up
 *      now, and the old run stays reachable through /history.
 *
 * Pure, so the rule can be tested without a database or a controller.
 */

/**
 * @param {object} args
 * @param {object|null} args.active   an in-flight experiment, if any
 * @param {object|null} args.latest   the most recent experiment, if any
 * @param {object|null} args.config   the configured pair (energy_experiment_config row)
 * @returns {{experiment: object|null, reason: string}}
 */
export function selectDisplayExperiment({ active = null, latest = null, config = null }) {
  if (active) return { experiment: active, reason: 'active' };
  if (!latest) return { experiment: null, reason: 'no_experiment' };

  const configuredTreatment = config?.treatment_site_id ?? null;
  const configuredControl = config?.control_site_id ?? null;

  // With no pair configured there is nothing to disagree with, so the most
  // recent run is the only subject available.
  if (!configuredTreatment || !configuredControl) {
    return { experiment: latest, reason: 'latest_no_configured_pair' };
  }

  const samePair =
    latest.treatment_site_id === configuredTreatment &&
    latest.control_site_id === configuredControl;

  return samePair
    ? { experiment: latest, reason: 'latest_matches_configured_pair' }
    : // Deliberately null rather than "the latest run for this pair": if the
      // configured pair has never been run, the honest answer is that it has
      // never been run, and the page says so.
      { experiment: null, reason: 'configured_pair_differs_from_last_run' };
}
