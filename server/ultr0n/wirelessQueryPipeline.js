import { isWirelessQuestion, detectIntent } from './intentDetector.js';
import { planApiCalls, getFollowUpChips } from './apiPlanner.js';
import { checkGuardrails } from './guardrails.js';
import { executeApiPlan } from './auraApiClient.js';
import { normalizeEvidence } from './evidenceNormalizer.js';
import { classifyRootCause } from './rootCauseClassifier.js';
import { scoreConfidence } from './confidenceScorer.js';
import { buildWirelessPrompt } from './wirelessSystemPrompt.js';
import crypto from 'node:crypto';

/**
 * Run the full wireless query pipeline.
 *
 * @param {object} opts
 * @param {string} opts.question
 * @param {object} opts.pageContext
 * @param {string} opts.authToken
 * @param {string} opts.controllerUrl
 * @param {string} [opts.confirmationToken]
 * @param {Function} [opts.llmFn]     - async ({systemMsg, userMsg}) => string (narrative)
 * @param {Function} [opts.fetchFn]   - injectable fetch for tests
 * @returns {Promise<import('../../src/types/ultron.js').UltronWirelessAnswer>}
 */
export async function runWirelessQuery({
  question,
  pageContext,
  authToken,
  controllerUrl,
  confirmationToken,
  llmFn,
  fetchFn,
}) {
  if (!isWirelessQuestion(question)) {
    return null; // caller should fall back to generic path
  }

  const { intent, resolved } = detectIntent(question, pageContext);
  const plan = planApiCalls(intent, resolved);

  const guardrailResult = checkGuardrails(plan, confirmationToken);
  if (guardrailResult.blocked) {
    return {
      id: crypto.randomUUID(),
      question,
      narrative: `This action requires confirmation: **${guardrailResult.action}**. ${guardrailResult.description}`,
      rootCause: { category: 'UNKNOWN', explanation: 'Action not yet confirmed.' },
      confidence: 'Low',
      apiEvidenceUsed: [],
      followUpChips: [],
      requiresConfirmation: {
        action: guardrailResult.action,
        description: guardrailResult.description,
        confirmationToken: guardrailResult.confirmationToken,
      },
    };
  }

  const raw = await executeApiPlan(plan, { authToken, controllerUrl, fetchFn });
  const evidence = normalizeEvidence(raw, intent, resolved);
  const rootCause = classifyRootCause(evidence, intent);
  const confidence = scoreConfidence(evidence, rootCause);
  const { systemMsg, userMsg } = buildWirelessPrompt({ question, pageContext, evidence, rootCause, confidence });

  let narrative = '';
  if (llmFn) {
    narrative = await llmFn({ systemMsg, userMsg });
  }

  return {
    id: crypto.randomUUID(),
    question,
    narrative,
    rootCause,
    confidence,
    apiEvidenceUsed: plan.filter(c => !c.disruptive).map(c => c.label),
    followUpChips: getFollowUpChips(intent),
    missingData: evidence.missingData,
  };
}
