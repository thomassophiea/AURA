/**
 * The safety boundary for every configuration-changing operation in the Energy
 * Treatment-vs-Control experiment.
 *
 * This module is pure and has no I/O on purpose: the decision to touch a piece
 * of customer hardware must be reviewable and testable in isolation, and it
 * must not be possible to "fix" a failing check by making a network call.
 *
 * The rule it enforces: an experiment may only write to an AP that is, at this
 * instant, on the treatment side of its own device allowlist AND still a member
 * of the Treatment site on the live controller. A UI-supplied site name is never
 * evidence — the live AP record is.
 */

import { supportsVerifiedRadioDisable } from '../apCapabilities.js';

/** Why a target was refused. Stable strings; the UI and the audit trail use them. */
export const REFUSAL = Object.freeze({
  NO_EXPERIMENT: 'no_experiment',
  EXPERIMENT_STATE: 'experiment_state',
  SOURCE_MISMATCH: 'source_mismatch',
  NOT_ALLOWLISTED: 'not_allowlisted',
  WRONG_SIDE: 'wrong_side',
  AP_UNKNOWN_TO_CONTROLLER: 'ap_unknown_to_controller',
  SITE_MOVED: 'site_moved',
  SITE_NAME_MISMATCH: 'site_name_mismatch',
  AP_OFFLINE: 'ap_offline',
  ACTION_NOT_PERMITTED: 'action_not_permitted',
  MODEL_NOT_VERIFIED: 'model_not_verified_for_action',
});

/** States in which a controller write is legitimate. */
const WRITE_STATES = new Set([
  'baseline_established',
  'darkness_detected',
  'optimization_active',
  'recovering',
]);

/** Controller AP states that are safe to reconfigure. */
const WRITABLE_AP_STATUS = new Set(['InService', 'inservice', 'IN_SERVICE']);

function deny(reason, detail) {
  return { allowed: false, reason, detail };
}

/**
 * Decide whether one AP may be written to by one experiment.
 *
 * @param {object} args
 * @param {object|null} args.experiment    row from energy_experiments
 * @param {Array<{apSerial:string, side:string, siteId:string, siteName?:string}>} args.allowlist
 *        rows from energy_experiment_devices for this experiment
 * @param {string} args.serial             the AP about to be written
 * @param {object|null} args.liveAp        the AP as the controller reports it RIGHT NOW
 *        ({ serialNumber, hostSite, status, hardwareType })
 * @param {string} args.sourceId           monitored source the caller is acting for
 * @param {string} [args.intent]           'apply' | 'restore'
 * @returns {{allowed: boolean, reason?: string, detail?: string, device?: object}}
 */
export function assertTargetAllowed({
  experiment,
  allowlist = [],
  serial,
  liveAp,
  sourceId,
  intent = 'apply',
}) {
  if (!experiment) return deny(REFUSAL.NO_EXPERIMENT, 'No experiment is in flight.');

  if (experiment.monitored_source_id !== sourceId) {
    return deny(
      REFUSAL.SOURCE_MISMATCH,
      'The experiment belongs to a different controller than the caller.'
    );
  }

  // Restore must stay possible from terminal and error states — an AP left
  // changed after a failure is exactly when rollback matters most.
  if (intent === 'apply' && !WRITE_STATES.has(experiment.state)) {
    return deny(
      REFUSAL.EXPERIMENT_STATE,
      `Experiment is '${experiment.state}'; configuration changes are not permitted.`
    );
  }

  const device = allowlist.find((d) => d.apSerial === serial);
  if (!device) {
    return deny(
      REFUSAL.NOT_ALLOWLISTED,
      `${serial} is not enrolled in this experiment.`
    );
  }
  if (device.side !== 'treatment') {
    return deny(
      REFUSAL.WRONG_SIDE,
      `${serial} is the control side (${device.side}); the control must never be modified.`
    );
  }

  if (!liveAp) {
    return deny(
      REFUSAL.AP_UNKNOWN_TO_CONTROLLER,
      `${serial} is not present in the controller's current AP inventory.`
    );
  }

  // Site membership is re-read live because an AP can be moved between sites
  // at any time, including between enrollment and the write.
  const liveSiteName = liveAp.hostSite ?? null;
  if (device.siteName && liveSiteName && liveSiteName !== device.siteName) {
    return deny(
      REFUSAL.SITE_MOVED,
      `${serial} now reports site '${liveSiteName}', not '${device.siteName}'.`
    );
  }
  if (!liveSiteName) {
    return deny(
      REFUSAL.SITE_NAME_MISMATCH,
      `${serial} reports no site membership; scope cannot be confirmed.`
    );
  }
  if (experiment.treatment_site_name && liveSiteName !== experiment.treatment_site_name) {
    return deny(
      REFUSAL.SITE_MOVED,
      `${serial} is in '${liveSiteName}', which is not the experiment's Treatment site '${experiment.treatment_site_name}'.`
    );
  }

  // A model whose behaviour under this action has not been observed is refused.
  // The AP4020X is why: it reported the radio disabled while still transmitting,
  // then went critical and left the network. An energy saving is never worth an
  // AP, and "we have not tested this model" is not a reason to try it live.
  if (intent === 'apply' && !supportsVerifiedRadioDisable(liveAp.hardwareType ?? liveAp.platformName ?? device.model)) {
    return deny(
      REFUSAL.MODEL_NOT_VERIFIED,
      `${serial} is a ${liveAp.platformName ?? liveAp.hardwareType ?? device.model ?? 'unknown model'}; ` +
        'radio disable has not been verified safe on this model.'
    );
  }

  // An offline AP cannot confirm a write landed, so applying to one would
  // produce an unverifiable change. Restoring one is still attempted — it may
  // come back — but the caller is told.
  if (intent === 'apply' && liveAp.status && !WRITABLE_AP_STATUS.has(liveAp.status)) {
    return deny(
      REFUSAL.AP_OFFLINE,
      `${serial} is '${liveAp.status}'; a write to it could not be verified.`
    );
  }

  return { allowed: true, device };
}

/**
 * Filter a candidate set down to the APs that may actually be written.
 * Returns both halves so the caller can record refusals rather than silently
 * shrinking the treatment group — a smaller-than-expected treatment group is a
 * result-distorting event, not a detail.
 */
export function partitionTargets({ experiment, allowlist, serials, liveAps, sourceId, intent }) {
  const byserial = new Map((liveAps ?? []).map((a) => [a.serialNumber ?? a.serial, a]));
  const allowed = [];
  const refused = [];
  for (const serial of serials) {
    const verdict = assertTargetAllowed({
      experiment,
      allowlist,
      serial,
      liveAp: byserial.get(serial) ?? null,
      sourceId,
      intent,
    });
    if (verdict.allowed) allowed.push({ serial, liveAp: byserial.get(serial) });
    else refused.push({ serial, reason: verdict.reason, detail: verdict.detail });
  }
  return { allowed, refused };
}

/**
 * Validate the configured action itself. Only radio-admin-state changes are
 * permitted: `txPower` was measured to be a read-only, SmartRF-derived field on
 * this controller (a PUT returns 200 and changes nothing), so accepting it here
 * would let the engine report an action it did not perform.
 */
export function assertActionPermitted(action) {
  if (!action || typeof action !== 'object') {
    return deny(REFUSAL.ACTION_NOT_PERMITTED, 'No action configured.');
  }
  if (action.kind !== 'disableRadios') {
    return deny(
      REFUSAL.ACTION_NOT_PERMITTED,
      `Action '${action.kind}' is not supported by this controller's verified write surface.`
    );
  }
  const indexes = action.radioIndexes;
  if (!Array.isArray(indexes) || indexes.length === 0) {
    return deny(REFUSAL.ACTION_NOT_PERMITTED, 'disableRadios requires at least one radioIndex.');
  }
  if (!indexes.every((i) => Number.isInteger(i) && i >= 1 && i <= 4)) {
    return deny(REFUSAL.ACTION_NOT_PERMITTED, 'radioIndexes must be integers 1-4.');
  }
  return { allowed: true };
}
