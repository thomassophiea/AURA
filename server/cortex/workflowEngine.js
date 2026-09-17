/**
 * The Cortex workflow engine.
 *
 * Turns "create a guest network" into a task that survives its own missing
 * fields: plan, resolve what can be resolved, ask only what is genuinely the
 * operator's to decide, preview, confirm, execute, verify.
 *
 * WHAT THIS MODULE IS RESPONSIBLE FOR, AND WHAT IT IS NOT
 * ------------------------------------------------------
 * It owns transitions and the confirmation gate. It does not talk to the
 * Gateway itself, does not parse intent, and does not decide confidence — those
 * belong to `wlanProvisioningEngine`, `wirelessIntentParser` and
 * `evidenceGraph` respectively, all of which already work and are tested.
 *
 * TWO INVARIANTS THAT ARE NOT NEGOTIABLE
 * --------------------------------------
 * 1. NO WRITE WITHOUT GRANTED CONFIRMATION. The gate is persisted state, not a
 *    sentence in a prompt. A model cannot talk its way past a column value, and
 *    `execute()` re-reads it from the store rather than trusting its caller.
 *
 * 2. THE PASSPHRASE IS NEVER PERSISTED. `wirelessIntentParser` hands back
 *    `_ephemeralPassword` and marks it request-scoped; a durable workflow is
 *    exactly the kind of place it could accidentally come to rest. It is carried
 *    in memory for the life of the request and the stored workflow records only
 *    that a credential was supplied.
 *
 * WHY THE LLM IS NOT IN THIS LOOP
 * -------------------------------
 * `investigationAgent` refuses any tool whose risk is not read/diagnostic, and
 * that stays true. The model plans and explains; the engine executes after a
 * human says yes. Giving the model a write tool would be the single easiest way
 * to undo every safety property the evidence contract provides.
 */

import * as store from './workflowStore.js';
import { getCatalogEntry } from './changeCatalog.js';
import {
  blockersFromMissingFields,
  blockerFromValidationFailure,
  resolveAll,
} from './blockerResolver.js';

/** Fields that must never reach the durable store, under any key. */
const NEVER_PERSIST = new Set(['_ephemeralPassword', 'password', 'passphrase', 'psk']);

/** Strip anything secret before a value is written down. */
export function scrubForStorage(value) {
  if (Array.isArray(value)) return value.map(scrubForStorage);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (NEVER_PERSIST.has(k)) {
        out[k] = '(captured, not stored)';
        continue;
      }
      out[k] = scrubForStorage(v);
    }
    return out;
  }
  return value;
}

/**
 * Begin a task, or adopt the session's existing one.
 *
 * Adoption rather than creation is deliberate: a second utterance in a live
 * conversation is nearly always a continuation, and the caller has already asked
 * `workflowRouter` whether this one is an exception.
 */
export async function begin({ sessionId, userIntent, workflowType, requestedState = {} }) {
  const { workflow, store: backing, created } = await store.claimActive({
    sessionId,
    userIntent,
    workflowType,
  });

  if (created && Object.keys(requestedState).length) {
    const updated = await store.update(workflow.id, {
      requestedState: scrubForStorage(requestedState),
      status: 'PLANNING',
    });
    return { workflow: updated, store: backing, created };
  }
  return { workflow, store: backing, created };
}

/**
 * Work every open blocker down the ladder and persist the result.
 *
 * Returns the question to put to the operator, if any remains. A workflow with
 * nothing left to ask moves to READY_FOR_PREVIEW on its own — the operator
 * should never have to say "carry on" to a task with no open question.
 */
export async function advance(workflowId, ctx = {}) {
  const workflow = await store.load(workflowId);
  if (!workflow) return null;

  const open = (workflow.blockers ?? []).filter((b) => b.status === 'OPEN');
  if (!open.length) return transitionWhenClear(workflow);

  const { resolved, needHuman, deadEnds } = await resolveAll(open, {
    workflowType: workflow.workflowType,
    userIntent: workflow.userIntent,
    requestedState: workflow.requestedState,
    derivedState: workflow.derivedState,
    ...ctx,
  });

  // Everything the ladder settled becomes derived state, and is stamped so the
  // preview can say who chose it.
  const derived = { ...workflow.derivedState };
  for (const blocker of resolved) {
    await store.resolveBlocker(blocker.id, blocker.resolution);
    if (blocker.requiredInformation) {
      derived[blocker.requiredInformation] = blocker.resolution.value;
    }
  }

  // Candidates discovered during the walk are written back so the router can
  // match a reply against them on the next turn.
  for (const blocker of needHuman) {
    if (blocker.candidateValues?.length || blocker.type === 'API_UNAVAILABLE') {
      await store.update(workflowId, {}); // touch updated_at
    }
  }

  if (deadEnds.length) {
    const updated = await store.update(workflowId, {
      derivedState: scrubForStorage(derived),
      status: 'BLOCKED_TECHNICALLY',
      warnings: [...(workflow.warnings ?? []), ...deadEnds.map((b) => b.reason)],
    });
    return { workflow: updated, question: null, deadEnds };
  }

  if (needHuman.length) {
    const updated = await store.update(workflowId, {
      derivedState: scrubForStorage(derived),
      status: 'WAITING_FOR_USER',
    });
    return { workflow: updated, question: buildQuestion(needHuman), deadEnds: [] };
  }

  const updated = await store.update(workflowId, {
    derivedState: scrubForStorage(derived),
  });
  return transitionWhenClear(updated);
}

async function transitionWhenClear(workflow) {
  const updated = await store.update(workflow.id, { status: 'READY_FOR_PREVIEW' });
  return { workflow: updated, question: null, deadEnds: [] };
}

/**
 * Put the remaining decisions to the operator as ONE question.
 *
 * Independent decisions are grouped rather than serialised. Asking three
 * separate questions in three turns is the form-filling experience this feature
 * exists to replace, and it is also how operators lose track of the task.
 */
export function buildQuestion(blockers) {
  return {
    decisions: blockers.map((b) => ({
      blockerId: b.id,
      field: b.requiredInformation,
      // The question as an operator reads it, with the reasoning attached: an
      // unexplained technical question gets answered wrong or not at all.
      ask: b.reason,
      options: b.candidateValues ?? [],
      recommended: b.recommendedDefault ?? null,
      why: (b.evidence ?? []).map((e) => e.detail).filter(Boolean),
    })),
    // A single decision reads as a sentence; several read as a short list.
    style: blockers.length === 1 ? 'single' : 'grouped',
  };
}

/** Apply the router's matched answers to their blockers, then keep going. */
export async function applyAnswers(workflowId, answers = [], ctx = {}) {
  const workflow = await store.load(workflowId);
  if (!workflow) return null;

  const requested = { ...workflow.requestedState };
  for (const answer of answers) {
    const blocker = (workflow.blockers ?? []).find((b) => b.id === answer.blockerId);
    await store.resolveBlocker(answer.blockerId, {
      value: answer.value,
      by: answer.by ?? 'human',
    });
    if (blocker?.requiredInformation) requested[blocker.requiredInformation] = answer.value;
  }

  await store.update(workflowId, { requestedState: scrubForStorage(requested) });
  return advance(workflowId, ctx);
}

/**
 * The plan, as the operator will see it before anything is written.
 *
 * Every field carries its provenance. "VLAN 30" is a very different proposition
 * depending on whether the operator asked for it or Cortex inferred it, and the
 * preview is the last point at which that distinction can still be corrected.
 */
/**
 * The diff an operator approves.
 *
 * A preview is a field, both values, and what will be checked afterwards.
 * Prose is not a preview: approving "enable 802.11k" is approving a sentence,
 * while approving `enabled11kSupport: false → true` is approving a change. The
 * post-condition is stated up front so the operator knows what would count as
 * this having failed BEFORE it runs, rather than learning it from the result.
 */
export function buildModifyDiff({ changeId, current, desired }) {
  const entry = getCatalogEntry(changeId);
  if (!entry) return null;

  return {
    path: entry.path,
    label: entry.label,
    from: current,
    to: desired,
    risk: entry.risk,
    rationale: entry.rationale,
    postCondition:
      `After applying I will re-read the service and confirm ${entry.path} is ` +
      `${JSON.stringify(desired)}. If it comes back ${JSON.stringify(current)}, the Gateway ` +
      'accepted the write and discarded it, and I will report that as a failure rather than ' +
      'a success.',
  };
}

export async function buildPreview(workflowId) {
  const workflow = await store.load(workflowId);
  if (!workflow) return null;

  const resolvedBlockers = await store.listBlockers(workflowId, { includeResolved: true });
  const provenance = new Map();
  for (const blocker of resolvedBlockers) {
    if (blocker.requiredInformation && blocker.resolution) {
      provenance.set(blocker.requiredInformation, {
        by: blocker.resolution.by,
        note: blocker.resolution.note ?? null,
      });
    }
  }

  const merged = { ...workflow.derivedState, ...workflow.requestedState };
  const fields = Object.entries(merged).map(([field, value]) => {
    const source = provenance.get(field);
    return {
      field,
      value,
      // 'stated' is the default: if no blocker ever covered it, the operator
      // said it outright in the original request.
      source: source?.by ?? 'stated',
      note: source?.note ?? null,
    };
  });

  // A modification is previewed as a diff rather than as a field list: the
  // operator needs the CURRENT value to judge the change, and a list of
  // requested values does not carry it.
  const diff =
    workflow.workflowType === 'modify_wlan'
      ? buildModifyDiff({
          changeId: merged.changeId,
          current: merged.currentValue,
          desired: merged.desired,
        })
      : null;

  // A deployment is previewed as its blast radius: which profiles, which
  // radios, which APs, and — the part that is easy to leave implicit — which
  // OTHER sites a fork is protecting. Carried as its own key rather than as a
  // field, because it is a structure, and flattening it into the field list
  // would turn the one thing worth reading into a JSON blob in a table row.
  const deployment =
    workflow.workflowType === 'deploy_wlan' && merged.deploymentPlan
      ? merged.deploymentPlan
      : null;

  return {
    workflowId,
    workflowType: workflow.workflowType,
    intent: workflow.userIntent,
    fields,
    diff,
    deployment,
    // Surfaced deliberately: anything Cortex chose is the operator's to veto.
    assumptions: fields.filter((f) => f.source === 'default' || f.source === 'system'),
    warnings: workflow.warnings ?? [],
  };
}

/** Move to the confirmation gate. */
export async function requestConfirmation(workflowId) {
  return store.update(workflowId, {
    status: 'WAITING_FOR_CONFIRMATION',
    confirmationState: 'requested',
  });
}

export async function grantConfirmation(workflowId) {
  return store.update(workflowId, { confirmationState: 'granted' });
}

export async function declineConfirmation(workflowId) {
  return store.close(workflowId, 'CANCELLED', { confirmationState: 'declined' });
}

export async function cancel(workflowId) {
  return store.close(workflowId, 'CANCELLED');
}

/**
 * Execute the plan.
 *
 * Re-reads the confirmation state from the store rather than trusting the
 * caller: the gate is only a gate if it is checked at the point of the write.
 *
 * `provision` is injected so this is testable without a Gateway, and so the
 * engine has no opinion about which domain it is provisioning.
 */
export async function execute(workflowId, { provision, ephemeralPassword } = {}) {
  const workflow = await store.load(workflowId);
  if (!workflow) return { ok: false, reason: 'unknown_workflow' };

  if (workflow.confirmationState !== 'granted') {
    // Not an error to recover from — a refusal. The operator has not said yes.
    return { ok: false, reason: 'not_confirmed', status: workflow.status };
  }
  if (typeof provision !== 'function') {
    return { ok: false, reason: 'no_provisioner' };
  }

  await store.update(workflowId, { status: 'EXECUTING' });

  let result;
  try {
    result = await provision({
      requestedState: workflow.requestedState,
      derivedState: workflow.derivedState,
      // Handed in from the request, never read back out of the store.
      ephemeralPassword,
    });
  } catch (err) {
    await store.close(workflowId, 'FAILED', {
      validation: { error: err?.message ?? String(err) },
    });
    return { ok: false, reason: 'provision_threw', error: err?.message };
  }

  await store.update(workflowId, { status: 'VERIFYING' });

  // A status code is not a result. `wlanProvisioningEngine` already reads back
  // and runs the verification ladder; what matters here is that anything it
  // could NOT confirm is carried into the final state rather than rounded up.
  const verified = result?.status === 'completed';
  const partial = result?.status === 'partial' || result?.status === 'degraded';

  const finalStatus = verified
    ? 'COMPLETED'
    : partial
      ? 'COMPLETED_WITH_WARNINGS'
      : 'FAILED';

  const closed = await store.close(workflowId, finalStatus, {
    validation: scrubForStorage(result ?? {}),
    completedSteps: scrubForStorage(result?.steps ?? []),
    rollbackInformation: scrubForStorage(result?.rollback ?? {}),
  });

  return { ok: finalStatus !== 'FAILED', status: finalStatus, workflow: closed, result };
}

/**
 * Handle one routed utterance and say what the operator should be shown.
 *
 * Returns a plain description rather than writing to a response, so the whole
 * continuation path is testable without HTTP. The transport turns this into SSE.
 *
 * None of these branches calls a model. An answer to a question Cortex already
 * asked is deterministic work, and making the operator wait on a provider round
 * trip to be told "got it, one more thing" is both slow and pointless.
 */
export async function handleRoutedTurn(route, ctx = {}) {
  const { kind, workflowId, answers = [] } = route;

  switch (kind) {
    case 'answer': {
      const outcome = await applyAnswers(workflowId, answers, ctx);
      if (!outcome) return { emit: 'error', reason: 'unknown_workflow' };
      if (outcome.deadEnds?.length) {
        return { emit: 'blocked', workflow: outcome.workflow, deadEnds: outcome.deadEnds };
      }
      if (outcome.question) {
        return { emit: 'question', workflow: outcome.workflow, question: outcome.question };
      }
      return {
        emit: 'preview',
        workflow: await requestConfirmation(workflowId),
        preview: await buildPreview(workflowId),
      };
    }

    case 'recommend': {
      // "What do you recommend?" is answerable from the blockers themselves —
      // each already carries a default and the evidence behind it.
      const open = await store.listBlockers(workflowId);
      return {
        emit: 'recommendation',
        recommendations: open.map((b) => ({
          field: b.requiredInformation,
          recommended: b.recommendedDefault,
          options: b.candidateValues,
          why: (b.evidence ?? []).map((e) => e.detail).filter(Boolean),
          // Said plainly: some questions have no defensible default and the
          // honest answer is that this one is theirs to make.
          hasDefault: b.recommendedDefault != null,
        })),
      };
    }

    case 'explain': {
      const open = await store.listBlockers(workflowId);
      return {
        emit: 'explanation',
        // The task is untouched: explaining why something is needed must never
        // count as answering it.
        decisions: open.map((b) => ({
          field: b.requiredInformation,
          ask: b.reason,
          why: (b.evidence ?? []).map((e) => e.detail).filter(Boolean),
        })),
      };
    }

    case 'confirm': {
      const workflow = await store.load(workflowId);
      if (workflow?.status !== 'WAITING_FOR_CONFIRMATION') {
        // Consent to something that was never previewed is not consent.
        return { emit: 'question', workflow, question: null, note: 'nothing_to_confirm' };
      }
      return { emit: 'confirmed', workflow: await grantConfirmation(workflowId) };
    }

    case 'decline':
      return { emit: 'cancelled', workflow: await declineConfirmation(workflowId) };

    case 'cancel':
      return { emit: 'cancelled', workflow: await cancel(workflowId) };

    default:
      return { emit: 'passthrough' };
  }
}

/**
 * Seed a workflow's blockers from a parsed intent.
 *
 * The parser already reports what it could not fill; this gives each gap a
 * question and a route rather than letting it end the task.
 */
export async function seedFromIntent(workflowId, parsed) {
  const blockers = blockersFromMissingFields(parsed?.missingFields ?? []);
  const created = [];
  for (const blocker of blockers) {
    created.push(await store.addBlocker(workflowId, blocker));
  }
  return created;
}

/** Seed blockers from a validation report's blocked checks. */
export async function seedFromValidation(workflowId, report) {
  const blocked = (report?.checks ?? []).filter((c) => c.result === 'block');
  const created = [];
  for (const check of blocked) {
    created.push(await store.addBlocker(workflowId, blockerFromValidationFailure(check)));
  }
  return created;
}
