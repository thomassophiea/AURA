/**
 * Did the change actually work?
 *
 * THE WHOLE POINT
 * ---------------
 * "A status code is evidence the request was RECEIVED, never that it was
 * HONOURED." That rule already exists in the doctrine and is already true of
 * this Gateway, which accepts a write, returns 201, and silently discards the
 * parts of the payload whose shape it did not like.
 *
 * What did not exist was a structure that makes the distinction REPORTABLE. A
 * boolean "success" collapses five genuinely different outcomes into one word,
 * and the one word it picks is always the optimistic one. So verification is a
 * LADDER, and the verdict is the first rung that is not a pass:
 *
 *   1 REQUEST ACCEPTED        the API returned success
 *   2 CONFIGURATION DEPLOYED  reading the config back shows the desired state
 *   3 DEVICE RECEIVED         the AP reports carrying it
 *   4 OPERATIONAL STATE       telemetry shows the new behaviour
 *   5 USER EXPERIENCE         the finding that prompted the change is gone
 *
 * Rung 1 is where most tooling stops and where almost nothing is actually
 * proven. Rung 5 is the only one an operator cares about.
 *
 * UNVERIFIABLE IS NOT A PASS
 * --------------------------
 * Several attributes on this platform have no operational read-back at all —
 * the cipher suite, the radio index a binding was written at. A rung that
 * cannot be evaluated returns `unverifiable`, which stops the ladder and is
 * reported as such. Treating it as a pass is precisely how a silently dropped
 * write gets announced as a fix.
 */

import { RECONCILE } from './stateReconciler.js';

export const STAGE = {
  REQUEST_ACCEPTED: 'request_accepted',
  CONFIGURATION_DEPLOYED: 'configuration_deployed',
  DEVICE_RECEIVED: 'device_received',
  OPERATIONAL_STATE: 'operational_state',
  USER_EXPERIENCE: 'user_experience',
};

export const STAGE_ORDER = [
  STAGE.REQUEST_ACCEPTED,
  STAGE.CONFIGURATION_DEPLOYED,
  STAGE.DEVICE_RECEIVED,
  STAGE.OPERATIONAL_STATE,
  STAGE.USER_EXPERIENCE,
];

export const STAGE_LABEL = {
  [STAGE.REQUEST_ACCEPTED]: 'Request accepted',
  [STAGE.CONFIGURATION_DEPLOYED]: 'Configuration deployed',
  [STAGE.DEVICE_RECEIVED]: 'Device received it',
  [STAGE.OPERATIONAL_STATE]: 'Operational state changed',
  [STAGE.USER_EXPERIENCE]: 'User experience improved',
};

export const RESULT = {
  PASS: 'pass',
  FAIL: 'fail',
  UNVERIFIABLE: 'unverifiable',
  PENDING: 'pending',
  NOT_RUN: 'not_run',
};

/**
 * How long an AP takes to pull configuration after a write.
 *
 * ~30 s, measured, and the reason a verification run that reads back instantly
 * reports a false failure at rung 3.
 */
export const AP_SETTLE_MS = 30_000;

/**
 * Assess the ladder.
 *
 * Pure: every reading is passed in, so this is testable without a Gateway and
 * auditable afterwards.
 *
 * @param {object} args
 * @param {{ok: boolean, status?: number, error?: string}} args.acceptance
 * @param {object} [args.reconciliation]  from reconcileWlan/reconcileState
 * @param {{carrying: boolean|null, apsChecked: number, settled: boolean}} [args.deviceState]
 * @param {object} [args.impactBefore]    {affected, total, unit}
 * @param {object} [args.impactAfter]
 * @param {string} [args.subject]
 */
export function assessVerification({
  acceptance = null,
  reconciliation = null,
  deviceState = null,
  impactBefore = null,
  impactAfter = null,
  subject = 'the change',
} = {}) {
  const stages = [];

  // ── 1. Request accepted ─────────────────────────────────────────────────
  if (!acceptance) {
    stages.push(stage(STAGE.REQUEST_ACCEPTED, RESULT.NOT_RUN, 'No write was attempted.'));
  } else if (acceptance.ok) {
    stages.push(
      stage(
        STAGE.REQUEST_ACCEPTED,
        RESULT.PASS,
        `The Gateway returned ${acceptance.status ?? 'success'}. This proves the request was received and nothing more.`
      )
    );
  } else {
    stages.push(
      stage(STAGE.REQUEST_ACCEPTED, RESULT.FAIL, acceptance.error ?? 'The write was rejected.')
    );
  }

  // ── 2. Configuration deployed ───────────────────────────────────────────
  if (!reconciliation) {
    stages.push(
      stage(STAGE.CONFIGURATION_DEPLOYED, RESULT.NOT_RUN, 'The configuration was not read back.')
    );
  } else if (reconciliation.verdict === RECONCILE.CONFIG_DRIFT) {
    stages.push(
      stage(
        STAGE.CONFIGURATION_DEPLOYED,
        RESULT.FAIL,
        'Read-back does not show the intended configuration. The write was accepted and the value did not change.'
      )
    );
  } else if (reconciliation.verdict === RECONCILE.UNKNOWN) {
    stages.push(
      stage(
        STAGE.CONFIGURATION_DEPLOYED,
        RESULT.UNVERIFIABLE,
        'Nothing about this object could be read back, so the write cannot be confirmed either way.'
      )
    );
  } else {
    stages.push(
      stage(
        STAGE.CONFIGURATION_DEPLOYED,
        RESULT.PASS,
        'Read-back shows the intended configuration.',
        reconciliation.unverifiable?.length
          ? `${reconciliation.unverifiable.length} attribute(s) have no operational read-back on this platform: ${reconciliation.unverifiable.join(', ')}.`
          : null
      )
    );
  }

  // ── 3. Device received it ───────────────────────────────────────────────
  if (!deviceState) {
    stages.push(stage(STAGE.DEVICE_RECEIVED, RESULT.NOT_RUN, 'No AP was checked.'));
  } else if (deviceState.carrying === null || deviceState.apsChecked === 0) {
    stages.push(
      stage(
        STAGE.DEVICE_RECEIVED,
        RESULT.UNVERIFIABLE,
        'No AP reported its service list, so what the hardware is running is unknown.'
      )
    );
  } else if (deviceState.carrying) {
    stages.push(
      stage(
        STAGE.DEVICE_RECEIVED,
        RESULT.PASS,
        `${deviceState.apsChecked} AP(s) report carrying it.`
      )
    );
  } else if (!deviceState.settled) {
    // A false failure here is the most common verification mistake: reading the
    // AP back immediately, before it has pulled config.
    stages.push(
      stage(
        STAGE.DEVICE_RECEIVED,
        RESULT.PENDING,
        `No AP reports it yet, but less than ${Math.round(AP_SETTLE_MS / 1000)} s have passed. An AP takes about that long to pull configuration — this is not yet a failure.`
      )
    );
  } else {
    stages.push(
      stage(
        STAGE.DEVICE_RECEIVED,
        RESULT.FAIL,
        'The configuration reads back correctly but no AP is carrying it. On this Gateway that is the signature of a payload accepted and silently dropped — most often a radio binding written at the invalid index 0, or WPA2 on a 6 GHz radio.'
      )
    );
  }

  // ── 4. Operational state ────────────────────────────────────────────────
  if (!reconciliation) {
    stages.push(stage(STAGE.OPERATIONAL_STATE, RESULT.NOT_RUN, 'No operational reading was taken.'));
  } else if (reconciliation.verdict === RECONCILE.NOT_APPLIED) {
    const rows = (reconciliation.rows ?? [])
      .filter((r) => r.verdict === RECONCILE.NOT_APPLIED)
      .map((r) => r.attribute);
    stages.push(
      stage(
        STAGE.OPERATIONAL_STATE,
        RESULT.FAIL,
        `Running state still differs from the configuration on: ${rows.join(', ') || 'one or more attributes'}.`
      )
    );
  } else if (reconciliation.verdict === RECONCILE.ALIGNED) {
    stages.push(
      stage(STAGE.OPERATIONAL_STATE, RESULT.PASS, 'Configured and running state agree.')
    );
  } else {
    stages.push(
      stage(
        STAGE.OPERATIONAL_STATE,
        RESULT.UNVERIFIABLE,
        'Operational state could not be established for the attributes that changed.'
      )
    );
  }

  // ── 5. User experience ──────────────────────────────────────────────────
  if (!impactBefore || !impactAfter) {
    stages.push(
      stage(
        STAGE.USER_EXPERIENCE,
        RESULT.NOT_RUN,
        'The affected population was not re-measured, so nothing is known about whether users are better off.'
      )
    );
  } else if (impactAfter.affected < impactBefore.affected) {
    stages.push(
      stage(
        STAGE.USER_EXPERIENCE,
        RESULT.PASS,
        `Affected ${impactBefore.unit ?? 'clients'} fell from ${impactBefore.affected} to ${impactAfter.affected}.`,
        impactAfter.affected > 0
          ? `${impactAfter.affected} still affected — the change helped but did not resolve it.`
          : null
      )
    );
  } else if (impactAfter.affected > impactBefore.affected) {
    stages.push(
      stage(
        STAGE.USER_EXPERIENCE,
        RESULT.FAIL,
        `Affected ${impactBefore.unit ?? 'clients'} ROSE from ${impactBefore.affected} to ${impactAfter.affected}. Consider rolling back.`
      )
    );
  } else {
    stages.push(
      stage(
        STAGE.USER_EXPERIENCE,
        RESULT.FAIL,
        `Affected ${impactBefore.unit ?? 'clients'} is unchanged at ${impactAfter.affected}. The configuration landed and the problem did not move — the diagnosis, not the change, is what needs revisiting.`
      )
    );
  }

  // The verdict is the first rung that is not a pass. Nothing below a failed or
  // unverifiable rung can be trusted, so nothing below it is claimed.
  const firstNonPass = stages.find((s) => s.result !== RESULT.PASS);

  // CONTIGUOUS depth, not the highest pass anywhere.
  //
  // A later rung can evaluate to `pass` on its own terms while an earlier one
  // was never run — rung 4 reads the reconciliation, which is available even
  // when no AP was checked at rung 3. Reporting that as "proven as far as
  // operational state" would claim the hardware agrees when nothing asked it,
  // which is the precise optimism this ladder exists to remove.
  let depth = 0;
  for (const s of stages) {
    if (s.result !== RESULT.PASS) break;
    depth += 1;
  }
  const highestPassed = depth > 0 ? stages[depth - 1] : null;

  const verdict = !firstNonPass
    ? 'verified'
    : firstNonPass.result === RESULT.FAIL
      ? 'failed'
      : firstNonPass.result === RESULT.PENDING
        ? 'pending'
        : firstNonPass.result === RESULT.NOT_RUN
          ? 'incomplete'
          : 'unverifiable';

  const rollbackRecommended =
    verdict === 'failed' &&
    [STAGE.DEVICE_RECEIVED, STAGE.OPERATIONAL_STATE, STAGE.USER_EXPERIENCE].includes(
      firstNonPass.stage
    );

  return {
    subject,
    verdict,
    reachedStage: highestPassed?.stage ?? null,
    /** Contiguous rungs proven from rung 1. The only honest depth measure. */
    provenDepth: depth,
    stoppedAt: firstNonPass?.stage ?? null,
    rollbackRecommended,
    stages,
    summary: summarise(subject, verdict, firstNonPass, highestPassed),
  };
}

function stage(name, result, detail, note = null) {
  return { stage: name, label: STAGE_LABEL[name], result, detail, note };
}

function summarise(subject, verdict, firstNonPass, highestPassed) {
  if (verdict === 'verified') {
    return `${subject} is verified all the way to user experience: configured, carried by the hardware, running, and the affected population fell.`;
  }
  const reached = highestPassed
    ? `Proven as far as "${STAGE_LABEL[highestPassed.stage]}".`
    : 'Nothing was proven.';
  if (verdict === 'pending') {
    return `${reached} ${firstNonPass.detail} Re-check rather than concluding.`;
  }
  if (verdict === 'incomplete') {
    return `${reached} Verification stopped because "${firstNonPass.label}" was never run — this is NOT a success.`;
  }
  if (verdict === 'unverifiable') {
    return `${reached} "${firstNonPass.label}" cannot be evaluated on this platform, so the change must not be reported as working.`;
  }
  return `${reached} "${firstNonPass.label}" FAILED: ${firstNonPass.detail}`;
}

/**
 * Has enough time passed for an AP to have pulled configuration?
 *
 * Exists so the "pending, not failed" branch at rung 3 is decided by the clock
 * and not by optimism.
 */
export function hasSettled(writeAt, now = Date.now()) {
  if (!Number.isFinite(writeAt)) return false;
  return now - writeAt >= AP_SETTLE_MS;
}

/**
 * One line for the answer.
 *
 * Deliberately blunt about the difference between "accepted" and "working",
 * because that is the sentence an operator will quote in a change record.
 */
export function describeVerification(result) {
  if (!result) return 'No change was executed, so there is nothing to verify.';
  // Contiguous depth, for the same reason `reachedStage` is: a count of passes
  // scattered around a gap reads as more proof than there is.
  return `${result.summary} (Proven through ${result.provenDepth} of ${STAGE_ORDER.length} verification stages.)`;
}
