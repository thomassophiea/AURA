/**
 * Is this a new question, or an answer to the one Cortex just asked?
 *
 * THE PROBLEM
 * -----------
 * Cortex asks "which site?", the operator types "PrimarySite", and a stateless
 * pipeline parses that as a brand-new request — which it cannot understand, so
 * the half-built task is abandoned and the operator starts again. Every natural
 * reply behaves this way: "yes", "do it", "use the existing one", "the first
 * one". Those are the most common things a person says, and they were the least
 * likely to work.
 *
 * This module runs BEFORE intent parsing and before scope resolution. If a
 * workflow is waiting on an answer, the utterance is offered to that workflow
 * first, and only falls through to new-intent parsing when it plainly is one.
 *
 * WHY IT IS DETERMINISTIC
 * -----------------------
 * Same argument `scopeResolver` makes: this decides what the request IS, and it
 * must be inspectable and testable without spending a token or depending on a
 * model's mood. Every branch reports which rule fired.
 *
 * THE FAILURE MODE TO AVOID
 * -------------------------
 * Over-capture. If an operator abandons a half-finished WLAN to ask "why is AP-12
 * offline?", swallowing that as an answer to "which site?" is worse than the bug
 * this replaces — it makes Cortex look deaf. Anything that reads as a genuine
 * question is therefore released to new-intent parsing even mid-workflow, and
 * the workflow is left intact to be resumed or abandoned deliberately.
 */

const AFFIRMATIVE =
  /^(y|yes|yep|yeah|yup|ok|okay|sure|do it|go|go ahead|proceed|continue|confirm|deploy|apply|send it|ship it|that works|sounds good|please do|make it so)\b[\s.!]*$/i;

const NEGATIVE = /^(n|no|nope|cancel|stop|abort|never ?mind|forget it|don'?t|hold off)\b[\s.!]*$/i;

/** "whatever we normally use", "you pick", "what do you recommend?" */
const DEFER_TO_CORTEX =
  /\b(what('s| is| do you)? ?(you )?recommend|whatever (we|you) (normally|usually) use|you (pick|choose|decide)|your call|the usual|standard|default|best practice)\b/i;

/**
 * "why?", "why do you need that?" — must not resolve or restart anything.
 *
 * Checked against NEW_INTENT before it is honoured: "why is AP-12 offline?"
 * also begins with "why" and is emphatically a new question, not a request to
 * justify the last one.
 */
const WHY = /^(why|what for|how come)\b/i;

/** "use the existing one", "use that", "reuse it" */
const USE_EXISTING = /\b(use|reuse|keep) (the )?(existing|that|it|same|current)( one| vlan| network)?\b/i;

/** "the first one", "option 2", "second" */
const ORDINAL =
  /\b(?:the )?(first|second|third|fourth|1st|2nd|3rd|4th|option\s*(\d+)|number\s*(\d+))\b/i;

const ORDINAL_WORDS = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };

/**
 * Phrases that mean a genuinely new request even mid-workflow.
 *
 * Deliberately narrow. A false positive here throws away a task the operator was
 * part-way through, which is the exact harm this module exists to prevent, so
 * the bar is an explicit interrogative or a fresh imperative — not merely a
 * sentence that happens to be long.
 */
const NEW_INTENT =
  /\b(why (is|are|did|was|were)|what('s| is| are| happened)|how (is|are|many|much)|which (site|ap|client|wlan)|show me|list|is there|are there|anything broken|how'?s my network|troubleshoot|diagnose|create (a|an|the)|delete|remove|disable|enable|change the)\b/i;

/** Normalise for comparison: lowercase, collapse whitespace, drop trailing punctuation. */
function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?,]+$/, '')
    .trim();
}

/**
 * Does this utterance name one of a blocker's candidate values?
 *
 * Substring matching is bounded by word edges so "A" cannot match "PrimarySite".
 */
function matchCandidate(utterance, candidates = []) {
  const u = norm(utterance);
  if (!u) return null;

  for (const candidate of candidates) {
    const c = norm(candidate);
    if (!c) continue;
    if (u === c) return candidate;
  }
  for (const candidate of candidates) {
    const c = norm(candidate);
    if (!c) continue;
    const bounded = new RegExp(`(^|\\W)${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i');
    if (bounded.test(u)) return candidate;
  }

  const ordinal = u.match(ORDINAL);
  if (ordinal && candidates.length) {
    const n = ORDINAL_WORDS[ordinal[1]] ?? Number(ordinal[2] ?? ordinal[3]);
    if (n && n <= candidates.length) return candidates[n - 1];
  }
  return null;
}

/**
 * Canonical answers for fields that have a fixed vocabulary.
 *
 * Runs BEFORE candidate matching, because the candidates are display labels
 * ("Open", "Guest Portal") and what gets stored has to be the value the
 * provisioning engine understands (`open`, `portal`). Matching the label and
 * storing it verbatim is how "Open" reaches an API that only accepts "open".
 */
function canonicalise(utterance, blocker) {
  const u = norm(utterance);
  if (!u) return null;

  if (blocker.requiredInformation === 'security.mode') {
    if (/\b(portal|captive|splash)\b/.test(u)) return 'portal';
    if (/\b(open|no password|passwordless|owe)\b/.test(u)) return 'open';
    if (/\bwpa ?3\b/.test(u)) return 'wpa3_personal';
    if (/\bwpa ?2\b|\bpsk\b|\bpassword\b/.test(u)) return 'wpa2_personal';
  }

  if (blocker.requiredInformation === 'vlanId') {
    const vlan = u.match(/\bvlan\s*(\d{1,4})\b/) ?? u.match(/^(\d{1,4})$/);
    if (vlan) return Number(vlan[1]);
  }

  return null;
}

/**
 * A bare name, for blockers whose candidates were never enumerated.
 *
 * Only used when no candidate list exists: if Cortex offered a list of real
 * sites and the operator typed something else, that is a correction to verify
 * downstream, not a silent match.
 */
function matchFreeText(utterance, blocker) {
  const u = norm(utterance);
  if (!u) return null;

  if (blocker.requiredInformation === 'siteId' && !blocker.candidateValues?.length) {
    // A single token with no verb reads as a name, which is how people answer
    // "which site?" — but only when it is short enough not to be a sentence.
    if (!/\s/.test(u) && u.length > 1) return utterance.trim();
  }

  return null;
}

/**
 * Route an utterance against the session's active workflow.
 *
 * @returns {{kind:string, rule:string, answers?:object[], workflowId?:string}}
 *   kind: 'new_intent' | 'answer' | 'confirm' | 'decline' | 'cancel'
 *       | 'explain' | 'recommend'
 */
export function routeUtterance(utterance, workflow) {
  const text = String(utterance ?? '').trim();

  if (!workflow) return { kind: 'new_intent', rule: 'no-active-workflow' };
  const openBlockers = (workflow.blockers ?? []).filter((b) => b.status === 'OPEN');

  // Cancellation always wins, in any state. An operator saying "stop" must not
  // have to out-argue a matcher.
  if (NEGATIVE.test(text)) {
    return {
      kind: workflow.status === 'WAITING_FOR_CONFIRMATION' ? 'decline' : 'cancel',
      rule: 'negative',
      workflowId: workflow.id,
    };
  }

  // "Why do you need that?" keeps everything exactly as it is. But "why is
  // AP-12 offline?" is a new question that merely starts with the same word.
  if (WHY.test(text) && !NEW_INTENT.test(text)) {
    return { kind: 'explain', rule: 'why', workflowId: workflow.id };
  }

  if (workflow.status === 'WAITING_FOR_CONFIRMATION') {
    if (AFFIRMATIVE.test(text)) {
      return { kind: 'confirm', rule: 'affirmative-at-confirmation', workflowId: workflow.id };
    }
    // Anything else at the confirmation gate is a change of mind, not consent.
    // Treating an unrecognised sentence as approval is how an unwanted write
    // happens, so the default is emphatically not "yes".
    if (NEW_INTENT.test(text)) {
      return { kind: 'new_intent', rule: 'new-intent-at-confirmation', workflowId: workflow.id };
    }
    return { kind: 'answer', rule: 'edit-at-confirmation', answers: [], workflowId: workflow.id };
  }

  if (!openBlockers.length) {
    return { kind: 'new_intent', rule: 'no-open-blockers', workflowId: workflow.id };
  }

  // "What do you recommend?" — answerable from the blockers' own defaults.
  if (DEFER_TO_CORTEX.test(text)) {
    return { kind: 'recommend', rule: 'defer-to-cortex', workflowId: workflow.id };
  }

  // Try to match the utterance against every open blocker. More than one can
  // match: "Portal and VLAN 30" settles two at once, and forcing that into two
  // turns is exactly the form-filling this feature exists to avoid.
  const answers = [];
  for (const blocker of openBlockers) {
    if (USE_EXISTING.test(text) && blocker.recommendedDefault != null) {
      answers.push({ blockerId: blocker.id, value: blocker.recommendedDefault, by: 'human' });
      continue;
    }
    // Canonical vocabulary first: the candidates are display labels, and the
    // stored value has to be what the provisioning engine accepts.
    const canonical = canonicalise(text, blocker);
    if (canonical !== null) {
      answers.push({ blockerId: blocker.id, value: canonical, by: 'human' });
      continue;
    }
    const candidate = matchCandidate(text, blocker.candidateValues);
    if (candidate !== null) {
      answers.push({ blockerId: blocker.id, value: candidate, by: 'human' });
      continue;
    }
    const free = matchFreeText(text, blocker);
    if (free !== null) {
      answers.push({ blockerId: blocker.id, value: free, by: 'human' });
    }
  }

  if (answers.length) {
    return { kind: 'answer', rule: 'blocker-match', answers, workflowId: workflow.id };
  }

  // An affirmative with nothing to affirm is usually "get on with it".
  if (AFFIRMATIVE.test(text)) {
    return { kind: 'confirm', rule: 'affirmative-no-blocker-match', workflowId: workflow.id };
  }

  // Nothing matched. If it reads as a question, let it be one.
  if (NEW_INTENT.test(text)) {
    return { kind: 'new_intent', rule: 'unmatched-reads-as-new-intent', workflowId: workflow.id };
  }

  return { kind: 'new_intent', rule: 'unmatched', workflowId: workflow.id };
}

export const __testing = { matchCandidate, matchFreeText, canonicalise, norm };
