/**
 * Which model answers, at what depth, and what that cost.
 *
 * Three things live here on purpose:
 *
 * 1. THE TIER SPLIT IS A POLICY, NOT A PREFERENCE. A fleet inventory question
 *    and a five-AP intermittent-Teams-call question are not the same workload,
 *    and paying Opus rates to count APs is waste that shows up on a bill nobody
 *    reads until it is large.
 *
 * 2. ESCALATION IS DETERMINISTIC. The model does not choose to think harder
 *    about itself — the runtime decides, from the operator's words and the
 *    shape of the investigation. An LLM that can grant itself a bigger budget
 *    is a cost incident waiting to happen.
 *
 * 3. COST IS MEASURED, NOT ESTIMATED FROM REQUEST COUNT. Cache reads bill at
 *    roughly a tenth of input and cache writes at roughly 1.25x, so a turn that
 *    reuses a cached prefix is dramatically cheaper than its token count
 *    suggests. Pricing that ignores that is wrong in the direction that makes
 *    caching look pointless.
 */

/** Routine work: conversation, normal triage, tool selection, summaries. */
export const DEFAULT_MODEL = 'claude-sonnet-5';

/** Hard reasoning: ambiguous root cause, competing hypotheses, Red Queen. */
export const DEEP_MODEL = 'claude-opus-5';

/**
 * USD per million tokens, from Anthropic's published first-party rates.
 *
 * `cacheRead` / `cacheWrite` are the multipliers applied to the input rate, not
 * separate list prices — that is how the billing actually works, and writing it
 * as a multiplier keeps the two numbers from drifting apart when a rate changes.
 */
export const MODEL_PRICING = {
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 2.0, output: 10.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * Operator phrasings that explicitly ask for more depth. Matched on the
 * operator's own message only — never on anything read off the network, which
 * is exactly the injection path a "deepen on request" rule would otherwise open.
 */
const ESCALATION_PHRASES = [
  /\bgo deeper\b/i,
  /\bdig deeper\b/i,
  /\bdeeper analysis\b/i,
  /\bdeep(er)? dive\b/i,
  /\bthink harder\b/i,
  /\bred queen\b/i,
  /\bchallenge (that|this|your) (diagnosis|conclusion|finding)/i,
  /\bare you sure\b/i,
  /\bwhat else could\b/i,
  /\bwhat am i missing\b/i,
];

/**
 * Shapes that are hard regardless of how they are phrased: several entities,
 * several symptoms, or an explicitly intermittent fault. These are the
 * investigations where a cheaper model produces a confident wrong attribution
 * rather than an honest "several causes remain open".
 */
const COMPLEXITY_SIGNALS = [
  /\bintermittent(ly)?\b/i,
  /\brandom(ly)?\b/i,
  /\bsometimes\b/i,
  /\bacross (multiple|several|all|three|\d+)\b/i,
  /\b(multiple|several) (aps?|sites?|clients?|users?|buildings?|floors?)\b/i,
  /\bevery(one|body)\b/i,
  /\bfleet[- ]wide\b/i,
  /\b\d{1,3}\s?% of (clients?|users?|aps?)\b/i,
];

export function looksLikeEscalation(text) {
  if (typeof text !== 'string') return false;
  return ESCALATION_PHRASES.some((re) => re.test(text));
}

export function looksComplex(text) {
  if (typeof text !== 'string') return false;
  return COMPLEXITY_SIGNALS.some((re) => re.test(text));
}

/**
 * Choose model + effort for one turn.
 *
 * @param {object} args
 * @param {string} [args.question]     the OPERATOR's message. Never network text.
 * @param {string} [args.intent]       CONFIGURATION | TROUBLESHOOTING | QUERY | EXPLANATION | ACTION
 * @param {boolean} [args.redQueen]    an explicit adversarial pass
 * @param {boolean} [args.continuing]  a follow-up on an existing investigation
 * @param {number}  [args.priorIterations] how many turns the last attempt burned
 * @param {string} [args.requestedModel] an explicit operator/UI choice, which wins
 * @returns {{model: string, effort: string, tier: 'default'|'deep', reason: string}}
 */
export function selectModel({
  question = '',
  intent = 'TROUBLESHOOTING',
  redQueen = false,
  continuing = false,
  priorIterations = 0,
  requestedModel = null,
} = {}) {
  // An explicit pick from the model picker is an operator decision and is not
  // second-guessed — but it still gets an effort level chosen for the workload.
  if (requestedModel) {
    const deep = requestedModel === DEEP_MODEL;
    return {
      model: requestedModel,
      effort: deep ? 'high' : 'medium',
      tier: deep ? 'deep' : 'default',
      reason: 'operator selected this model explicitly',
    };
  }

  if (redQueen) {
    return {
      model: DEEP_MODEL,
      effort: 'xhigh',
      tier: 'deep',
      reason: 'Red Queen adversarial pass — the point is to find what the first pass missed',
    };
  }

  if (looksLikeEscalation(question)) {
    return {
      model: DEEP_MODEL,
      effort: 'xhigh',
      tier: 'deep',
      reason: 'operator asked to go deeper',
    };
  }

  // A prior attempt that burned most of its budget without converging is the
  // clearest earned signal for more capability: the cheap model already tried.
  if (continuing && priorIterations >= 6) {
    return {
      model: DEEP_MODEL,
      effort: 'high',
      tier: 'deep',
      reason: `previous pass used ${priorIterations} iterations without converging`,
    };
  }

  if (intent === 'TROUBLESHOOTING' && looksComplex(question)) {
    return {
      model: DEEP_MODEL,
      effort: 'high',
      tier: 'deep',
      reason: 'multi-entity or intermittent symptom — several hypotheses will compete',
    };
  }

  // Inventory and lookups do not need reasoning depth; they need the right tool
  // called once. Low effort here is a large share of the total bill.
  if (intent === 'QUERY') {
    return {
      model: DEFAULT_MODEL,
      effort: 'low',
      tier: 'default',
      reason: 'inventory or lookup — one tool call, no competing hypotheses',
    };
  }

  if (intent === 'EXPLANATION') {
    return {
      model: DEFAULT_MODEL,
      effort: 'low',
      tier: 'default',
      reason: 'conceptual question — no network evidence required',
    };
  }

  if (intent === 'CONFIGURATION') {
    return {
      model: DEFAULT_MODEL,
      effort: 'high',
      tier: 'default',
      reason: 'configuration planning — accuracy matters, but the write path is deterministic',
    };
  }

  return {
    model: DEFAULT_MODEL,
    effort: 'medium',
    tier: 'default',
    reason: 'routine troubleshooting',
  };
}

/**
 * Cost of one turn, in USD.
 *
 * Returns `null` for a model with no published rate (Groq, Ollama, a local
 * model) rather than guessing — a fabricated cost is worse than a blank, because
 * it will be summed and reported as if it were measured.
 */
export function estimateCostUsd(usage, model) {
  const rate = MODEL_PRICING[model];
  if (!rate || !usage) return null;

  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const cost =
    (input / 1e6) * rate.input +
    (output / 1e6) * rate.output +
    (cacheRead / 1e6) * rate.input * CACHE_READ_MULTIPLIER +
    (cacheWrite / 1e6) * rate.input * CACHE_WRITE_MULTIPLIER;

  // Six decimals: a single cheap turn is genuinely worth fractions of a cent,
  // and rounding to 4 would report most QUERY turns as costing exactly zero.
  return Number(cost.toFixed(6));
}

/**
 * Accumulate usage across the turns of one investigation, keeping the per-model
 * split. A run that fell back from Opus to Sonnet mid-investigation has two
 * different rates in it and a single total would hide that.
 */
export class UsageAccumulator {
  constructor() {
    /** @type {Map<string, {promptTokens:number, completionTokens:number, cacheReadTokens:number, cacheWriteTokens:number, turns:number}>} */
    this.byModel = new Map();
  }

  record(model, usage) {
    if (!model || !usage) return;
    const e = this.byModel.get(model) ?? {
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 0,
    };
    e.promptTokens += usage.prompt_tokens ?? 0;
    e.completionTokens += usage.completion_tokens ?? 0;
    e.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    e.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    e.turns += 1;
    this.byModel.set(model, e);
  }

  /**
   * @returns {{promptTokens:number, completionTokens:number, cacheReadTokens:number,
   *            cacheWriteTokens:number, turns:number, estimatedCostUsd:number|null,
   *            perModel:object[]}}
   */
  summary() {
    let promptTokens = 0;
    let completionTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let turns = 0;
    let cost = 0;
    let anyPriced = false;
    const perModel = [];

    for (const [model, e] of this.byModel) {
      promptTokens += e.promptTokens;
      completionTokens += e.completionTokens;
      cacheReadTokens += e.cacheReadTokens;
      cacheWriteTokens += e.cacheWriteTokens;
      turns += e.turns;

      const modelCost = estimateCostUsd(
        {
          prompt_tokens: e.promptTokens,
          completion_tokens: e.completionTokens,
          cache_read_input_tokens: e.cacheReadTokens,
          cache_creation_input_tokens: e.cacheWriteTokens,
        },
        model
      );
      if (modelCost !== null) {
        cost += modelCost;
        anyPriced = true;
      }
      perModel.push({ model, ...e, estimatedCostUsd: modelCost });
    }

    return {
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      turns,
      // null, not 0, when nothing in the run had a published rate — so the
      // dashboard can say "not priced" instead of "free".
      estimatedCostUsd: anyPriced ? Number(cost.toFixed(6)) : null,
      perModel,
    };
  }
}
