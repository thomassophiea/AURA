/**
 * Cortex LLM Provider abstraction
 * Supports OpenAI (default), Mock (dev/test), Azure stub, Anthropic stub.
 *
 * @typedef {{ role: 'system'|'user'|'assistant'|'tool', content: string, name?: string, toolCallId?: string }} LlmMessage
 * @typedef {{ name: string, description: string, parameters: Record<string,any> }} LlmToolDefinition
 * @typedef {{ message: string, toolCalls?: Array<{id:string,name:string,arguments:Record<string,any>}>, raw?: any }} LlmResponse
 */

// ── No mock provider ────────────────────────────────────────────────────────
//
// There was a MockLlmProvider here and it has been deliberately deleted.
//
// It fabricated telemetry-shaped prose — "Client: N/A (mock mode)",
// "RF indicators: none (mock mode)", "Likely root cause: Unable to
// determine" — and it was the DEFAULT whenever CORTEX_LLM_PROVIDER was unset
// or an API key was missing. On a deployment with no provider configured,
// Cortex would therefore have answered network questions with invented
// structure instead of refusing, which is the single failure this product
// exists to prevent.
//
// A missing provider is now a hard, named error. Callers surface it to the
// operator as "Cortex cannot reach an AI service"; AURA itself keeps working.
// Test doubles belong in test files, not in the shipped provider factory.

/**
 * No usable LLM provider is configured. Carries an actionable message because
 * this reaches an operator, not just a log.
 */
export class CortexProviderNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CortexProviderNotConfiguredError';
    this.code = 'CORTEX_PROVIDER_NOT_CONFIGURED';
    /** Signals callers to answer 503 rather than 500 — this is configuration. */
    this.status = 503;
  }
}

// ── OpenAI Provider ──────────────────────────────────────────────────────────

/**
 * Best-effort parse of "Please try again in 14.295s" out of a Groq/OpenAI 429
 * error body so we can sleep the suggested duration before retrying.
 * Returns ms, capped at 30s so we never block a request for an absurd time.
 */
function parseRetryDelayMs(body, headers) {
  const headerVal = headers?.get?.('retry-after');
  if (headerVal) {
    const seconds = Number(headerVal);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  const match = typeof body === 'string' && body.match(/try again in ([\d.]+)\s*s/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  return 1500; // sensible default
}

function isGroqLike(baseUrl) {
  return baseUrl?.includes('groq.com');
}

export class OpenAiLlmProvider {
  #apiKey;
  #baseUrl;

  constructor({ apiKey, baseUrl = 'https://api.openai.com/v1' }) {
    if (!apiKey) throw new Error('OpenAiLlmProvider: apiKey is required');
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl;
  }

  async generateResponse({ model, messages, tools, temperature = 0.3, maxTokens = 1024 }) {
    const body = {
      model,
      // Strip internal fields before they hit the wire. `_providerContent` is
      // carried on assistant turns so the Anthropic adapter can replay thinking
      // blocks verbatim; OpenAI-compatible APIs reject unknown message keys
      // outright (Groq answers "property 'toolCalls' is unsupported" for
      // exactly this class of mistake), so it must not travel.
      messages: messages.map(({ _providerContent, ...rest }) => rest),
      temperature,
      max_tokens: maxTokens,
    };
    if (tools?.length) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const doFetch = () =>
      fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify(body),
      });

    let resp = await doFetch();

    // Single retry on 429, respecting the server-suggested delay. Helps when a
    // small-tier Groq model briefly trips its tokens-per-minute cap mid-loop.
    if (resp.status === 429) {
      const errBody = await resp.text().catch(() => '');
      const delay = parseRetryDelayMs(errBody, resp.headers);
      await new Promise((r) => setTimeout(r, delay));
      resp = await doFetch();
      if (resp.status === 429) {
        const hint = isGroqLike(this.#baseUrl)
          ? ' (Groq tier rate-limited. Verified against Groq 2026-09-10: the llama-3.x ids this registry used to suggest are retired. Current served models are openai/gpt-oss-120b, openai/gpt-oss-20b and qwen/qwen3.8-27b; gpt-oss-20b has a smaller per-request footprint.)'
          : '';
        const finalBody = await resp.text().catch(() => resp.statusText);
        throw new Error(`OpenAI API error 429${hint}: ${finalBody}`);
      }
    }

    // `tool_use_failed` is a GENERATION failure, not a logic error: the model
    // emitted arguments its own provider then rejected, e.g.
    //   Tool call validation failed: parameters for tool getSiteOverview did
    //   not match schema: [`/siteName`: expected string, but got null]
    // Groq validates before we ever see the call, so a dispatcher-side guard
    // cannot help — but the next sample is usually valid. Measured: this fires
    // intermittently on identical input, so one retry recovers the turn instead
    // of aborting the whole investigation.
    if (resp.status === 400) {
      const body400 = await resp.text().catch(() => '');
      if (/tool_use_failed|[Tt]ool call validation failed/.test(body400)) {
        resp = await doFetch();
        if (!resp.ok) {
          const err = await resp.text().catch(() => resp.statusText);
          throw new Error(`OpenAI API error ${resp.status} (after tool-call retry): ${err}`);
        }
      } else {
        throw new Error(`OpenAI API error 400: ${body400}`);
      }
    }

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`OpenAI API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    const result = { message: choice.message?.content ?? '', raw: data };

    // Same reason as the Anthropic path: the investigation loop sums these
    // names, and returning nothing made every OpenAI-compatible provider
    // (OpenAI, Groq, xAI, Gemini, Mistral, Cerebras, DeepSeek) report zero
    // tokens for the whole investigation.
    if (data.usage) {
      // NORMALISE TO ANTHROPIC SEMANTICS, which is what the cost model assumes.
      //
      // The two schemas disagree: OpenAI's `prompt_tokens` INCLUDES
      // `cached_tokens`, while Anthropic's `input_tokens` EXCLUDES
      // `cache_read_input_tokens`. Reporting OpenAI's numbers as-is counts the
      // cached tokens twice, and `estimateCostUsd` would then bill them at
      // 1.0x + 0.1x. Harmless today only because no OpenAI-family model has a
      // published rate in MODEL_PRICING — it would start over-reporting the
      // moment one is added.
      const cached = data.usage.prompt_tokens_details?.cached_tokens ?? 0;
      result.usage = {
        prompt_tokens: Math.max(0, (data.usage.prompt_tokens ?? 0) - cached),
        completion_tokens: data.usage.completion_tokens ?? 0,
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: 0,
      };
    }
    result.stopReason = choice.finish_reason ?? null;
    if (choice.finish_reason === 'length') result.truncated = true;

    if (choice.message?.tool_calls?.length) {
      result.toolCalls = choice.message.tool_calls.map(tc => {
        // Small models emit malformed argument JSON often enough that an
        // unguarded JSON.parse turns a recoverable tool call into a thrown
        // request. Fall back to empty arguments and let the tool's own
        // validation answer, rather than losing the whole investigation.
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
          if (args === null || typeof args !== 'object' || Array.isArray(args)) args = {};
        } catch {
          args = {};
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      });
    }

    return result;
  }
}

// ── Azure stub ───────────────────────────────────────────────────────────────

export class AzureOpenAiLlmProvider {
  async generateResponse() {
    throw new Error('AzureOpenAiLlmProvider: not yet implemented');
  }
}

// ── Anthropic provider ───────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

/**
 * Translate our internal OpenAI-shape conversation into Claude's Messages API
 * shape: top-level `system`, `tool_use` / `tool_result` content blocks, and
 * consecutive tool results merged into one user turn.
 */
function toClaudeMessages(messages) {
  const out = [];
  let pendingToolResults = [];

  const flushPending = () => {
    if (pendingToolResults.length) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'system') continue; // handled separately

    // REPLAY THE ASSISTANT TURN VERBATIM WHEN WE HAVE IT.
    //
    // The current Claude generation runs adaptive thinking, so an assistant
    // turn that requested a tool also carries `thinking` blocks. Those blocks
    // are bound to the turn: reconstructing the turn from {content, tool_calls}
    // — as the branch below does — drops them, and replaying a tool_result
    // alongside a thinking-stripped assistant turn is rejected on models that
    // require the block echoed back unchanged.
    //
    // The failure mode is nasty: it would surface as a 400 on the SECOND turn
    // of every tool-using investigation, be labelled "bad request", and not be
    // retried — so it reads as an empty answer, not as a bug.
    //
    // So: keep the raw provider content on the message and send it back
    // untouched. The reconstruction path below remains for transcripts that
    // came from another provider or from stored history.
    if (m.role === 'assistant' && Array.isArray(m._providerContent) && m._providerContent.length) {
      flushPending();
      out.push({ role: 'assistant', content: m._providerContent });
      continue;
    }

    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
      continue;
    }

    flushPending();

    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const blocks = [];
      if (m.content && String(m.content).trim().length) {
        blocks.push({ type: 'text', text: String(m.content) });
      }
      for (const tc of m.tool_calls) {
        let input = {};
        try {
          input = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : (tc.function.arguments ?? {});
        } catch {
          input = {};
        }
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      out.push({ role: 'assistant', content: blocks });
    } else {
      out.push({ role: m.role, content: String(m.content ?? '') });
    }
  }
  flushPending();
  return out;
}

function extractSystemPrompt(messages) {
  return messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Effort levels the current Claude generation accepts on `output_config.effort`.
 * Anything outside this set is dropped rather than sent — an unknown value is a
 * 400, and a 400 mid-investigation reads to the operator as a network fault.
 */
const VALID_EFFORT = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * Models that still accept sampling parameters (temperature/top_p/top_k).
 *
 * Sampling was REMOVED from the current Claude generation and returns 400 if
 * sent: Opus 5, Opus 4.8, Opus 4.7, Sonnet 5 and the Fable/Mythos 5 family all
 * reject it. This was previously a denylist, which meant every newer model —
 * including claude-opus-5 — silently got temperature and 400'd on the first
 * call. An allowlist fails safe: an unrecognised or future model omits
 * temperature rather than breaking.
 */
const ACCEPTS_SAMPLING = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-3',
];

/**
 * `output_config.effort` is only honoured on the current generation. Haiku 4.5
 * and the 4.6 family error on it, so it is gated the same fail-safe way as
 * sampling: an unrecognised model gets no effort rather than a 400.
 */
const ACCEPTS_EFFORT = ['claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7'];

export class AnthropicLlmProvider {
  #client;

  constructor({ apiKey }) {
    if (!apiKey) throw new Error('AnthropicLlmProvider: apiKey is required');
    // The SDK blocks instantiation when it detects a browser global (jsdom
    // unit tests trip this even though we only ever run server-side in Node).
    this.#client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  /**
   * @param {object} args
   * @param {string} [args.effort] - low|medium|high|xhigh|max. The deep-reasoning
   *   lever: the model router raises this for "go deeper" and Red Queen passes
   *   instead of only swapping model, because effort is the cheaper half of the
   *   quality trade.
   */
  async generateResponse({ model, messages, tools, temperature = 0.3, maxTokens = 1024, effort }) {
    const systemText = extractSystemPrompt(messages);
    const claudeMessages = toClaudeMessages(messages);

    // Tools translate name/description as-is; OpenAI's `parameters` is `input_schema` for Claude.
    const claudeTools = tools?.length
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }))
      : undefined;

    // Cache the (stable) system prompt + tools as a prefix so multi-round tool
    // loops re-read instead of re-paying full price each call.
    const system = systemText
      ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
      : undefined;

    const params = {
      model,
      max_tokens: maxTokens,
      messages: claudeMessages,
    };
    if (system) params.system = system;
    if (claudeTools) params.tools = claudeTools;

    // Thinking is deliberately not configured: on Opus 5 and Sonnet 5, omitting
    // `thinking` runs adaptive thinking, which is what we want. `budget_tokens`
    // would 400 on those models.
    if (ACCEPTS_SAMPLING.some((prefix) => model.startsWith(prefix))) {
      params.temperature = temperature;
    }

    // Effort is the depth dial. It rides in `output_config`, never top-level.
    if (effort && VALID_EFFORT.has(effort) && ACCEPTS_EFFORT.some((p) => model.startsWith(p))) {
      params.output_config = { effort };
    }

    let response;
    try {
      response = await this.#client.messages.create(params);
    } catch (err) {
      throw translateAnthropicError(err, model);
    }

    // `refusal` is a 200 with no usable content. Read stop_reason BEFORE content
    // or the answer is silently empty and reads to the operator as "Cortex had
    // nothing to say about my network".
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details?.category ?? 'unspecified';
      throw new Error(
        `Anthropic declined this request (category: ${category}). This is a safety ` +
          'decision by the model, not a Gateway or network fault.'
      );
    }

    let text = '';
    const toolCalls = [];
    for (const block of response.content ?? []) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    const result = { message: text, raw: response };
    if (toolCalls.length) result.toolCalls = toolCalls;
    // The raw block list, so the caller can replay this turn unchanged rather
    // than reconstructing it and losing the thinking blocks. See
    // toClaudeMessages().
    result.providerContent = response.content ?? [];

    // USAGE. Reported in the OpenAI-shaped keys the investigation loop already
    // sums (`usage.prompt_tokens` / `completion_tokens`), because that loop is
    // provider-neutral and reads those names.
    //
    // This was the defect: AnthropicLlmProvider previously returned no `usage`
    // at all, so `investigationAgent.js` accumulated 0 + 0 on every turn and
    // every Claude-backed investigation reported zero tokens and zero cost. The
    // cost telemetry looked healthy precisely because it was measuring nothing.
    const u = response.usage ?? {};
    result.usage = {
      prompt_tokens: u.input_tokens ?? 0,
      completion_tokens: u.output_tokens ?? 0,
      // Cache accounting is separate from input_tokens in Claude's usage block:
      // a cache READ is billed ~0.1x and a cache WRITE ~1.25x, so folding them
      // into one number would misprice the turn in both directions.
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    };
    result.stopReason = response.stop_reason ?? null;
    if (response.stop_reason === 'max_tokens') {
      result.truncated = true;
    }
    return result;
  }
}

/**
 * Map an SDK exception to an Error whose message the investigation loop's
 * `shouldTryAnotherModel()` can classify. That function matches on 429 / 404 /
 * 401 / 403 as text, so the status code has to survive into the message —
 * a bare `err.message` from the SDK often does not carry it.
 */
export function translateAnthropicError(err, model) {
  const status = err?.status ?? err?.statusCode;
  const detail = err?.message ?? String(err);
  if (err instanceof Anthropic.AuthenticationError || status === 401) {
    return new Error(`Anthropic 401: the API key was rejected. ${detail}`);
  }
  if (err instanceof Anthropic.PermissionDeniedError || status === 403) {
    return new Error(`Anthropic 403: this key is not entitled to ${model}. ${detail}`);
  }
  if (err instanceof Anthropic.NotFoundError || status === 404) {
    return new Error(`Anthropic 404: model ${model} was not found or is retired. ${detail}`);
  }
  if (err instanceof Anthropic.RateLimitError || status === 429) {
    return new Error(`Anthropic 429 rate_limit on ${model}. ${detail}`);
  }
  if (status === 400) {
    return new Error(`Anthropic 400 (bad request) on ${model}: ${detail}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error(`Could not reach the Anthropic API: ${detail}`);
  }
  return new Error(`Anthropic error on ${model}${status ? ` (${status})` : ''}: ${detail}`);
}


// ── Ollama provider (native API) ─────────────────────────────────────────────

/**
 * Ollama, via its NATIVE /api/chat endpoint rather than the OpenAI-compatible
 * /v1 shim.
 *
 * WHY NOT THE SHIM
 * ----------------
 * Cortex is entirely tool-driven, and the shim does not surface tool calls.
 * Measured on the lab box (nobara-pc, Ollama + qwen2.5:7b, 2026-09-10):
 *
 *   POST /v1/chat/completions  -> tool_calls: 0, finish_reason: "stop",
 *     content: 'ombok\n {"name": "getSiteOverview", "arguments": {...}}\n</tool_call>'
 *   POST /api/chat             -> message.tool_calls: 1, parsed correctly
 *
 * The model produces a correct call either way; only the native endpoint parses
 * it into structured form. Through the shim the call arrives as prose, the loop
 * sees no toolCalls, and treats a tool request as a final answer — a silent
 * failure, which is why this class exists.
 *
 * TWO SHAPE DIFFERENCES FROM OPENAI, both handled here:
 *   - Ollama tool calls carry NO id. Our transcript needs a tool_call_id to
 *     pair a result with its call, so one is synthesised.
 *   - Ollama `arguments` is already an OBJECT, not a JSON string.
 */
export class OllamaLlmProvider {
  #baseUrl;
  #timeoutMs;

  constructor({ baseUrl, timeoutMs = 300_000 } = {}) {
    // Accept either a bare host or a /v1-suffixed URL and normalise to the root,
    // because OLLAMA_API_BASE is conventionally written with /v1 for the shim.
    const root = (baseUrl || 'http://localhost:11434').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    this.#baseUrl = root;
    // Local inference is slow: measured 6-7 s on a 7B and 67 s on a 14B for a
    // 174-token prompt. A real Cortex turn is an order of magnitude larger, so
    // the default HTTP timeout is far too short.
    this.#timeoutMs = timeoutMs;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  /** Translate our OpenAI-shaped transcript into Ollama's message shape. */
  #toOllamaMessages(messages) {
    return messages.map((m) => {
      if (m.role === 'tool') {
        // Ollama takes tool output as a plain tool-role message; it does not
        // read tool_call_id, but sending it is harmless and keeps parity.
        return { role: 'tool', content: String(m.content ?? '') };
      }
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        return {
          role: 'assistant',
          content: m.content ?? '',
          tool_calls: m.tool_calls.map((c) => ({
            function: {
              name: c.function?.name ?? c.name,
              arguments:
                typeof c.function?.arguments === 'string'
                  ? safeParseObject(c.function.arguments)
                  : (c.function?.arguments ?? c.arguments ?? {}),
            },
          })),
        };
      }
      return { role: m.role, content: String(m.content ?? '') };
    });
  }

  async generateResponse({ model, messages, tools, temperature = 0.2, maxTokens = 1024 }) {
    const body = {
      model,
      stream: false,
      messages: this.#toOllamaMessages(messages),
      options: { temperature, num_predict: maxTokens },
    };
    if (tools?.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let resp;
    try {
      resp = await fetch(`${this.#baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(
          `Ollama at ${this.#baseUrl} did not respond within ${Math.round(this.#timeoutMs / 1000)}s. ` +
            'Local inference on a large model can exceed this — try a smaller model.'
        );
      }
      throw new Error(`Could not reach Ollama at ${this.#baseUrl}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`Ollama API error ${resp.status}: ${String(text).slice(0, 400)}`);
    }

    const data = await resp.json();
    const message = data.message ?? {};
    const result = { message: message.content ?? '', raw: data };

    if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
      result.toolCalls = message.tool_calls.map((c, i) => ({
        // Ollama supplies no id; the loop needs one to pair result to call.
        id: `ollama-${Date.now()}-${i}`,
        name: c.function?.name,
        arguments:
          typeof c.function?.arguments === 'string'
            ? safeParseObject(c.function.arguments)
            : (c.function?.arguments ?? {}),
      }));
    }

    if (data.prompt_eval_count || data.eval_count) {
      result.usage = {
        prompt_tokens: data.prompt_eval_count ?? 0,
        completion_tokens: data.eval_count ?? 0,
      };
    }
    return result;
  }

  /**
   * Reachability + loaded models, for the Cortex engine health panel.
   * Never throws — an unreachable node is a status, not an exception.
   */
  async health() {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${this.#baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) {
        return { state: 'AGENT_ERROR', latencyMs: Date.now() - started, detail: `HTTP ${resp.status}` };
      }
      const data = await resp.json();
      const models = (data.models ?? []).map((m) => m.name);
      return {
        state: models.length ? 'CONNECTED' : 'DEGRADED',
        latencyMs: Date.now() - started,
        models,
        detail: models.length ? null : 'reachable but no models are pulled',
      };
    } catch (err) {
      return {
        state: 'UNAVAILABLE',
        latencyMs: Date.now() - started,
        detail: err?.name === 'AbortError' ? 'timed out' : err.message,
      };
    }
  }
}

/** Parse a JSON object, returning {} rather than throwing on malformed input. */
function safeParseObject(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the appropriate LLM provider from environment/config.
 *
 * THROWS CortexProviderNotConfiguredError when no usable provider exists. It
 * deliberately does not fall back to anything that can produce text without a
 * real model behind it.
 *
 * @param {{ provider?: string, apiKey?: string, baseUrl?: string }} config
 */
/**
 * @returns {{ provider: object, defaultModel: string }}
 */
export function createLlmProvider(config = {}) {
  // No default. An unset CORTEX_LLM_PROVIDER used to mean "mock", which made a
  // misconfigured deployment indistinguishable from a working one.
  let providerName = config.provider || process.env.CORTEX_LLM_PROVIDER || '';

  // If a sk-ant-* key is present anywhere and the provider isn't already
  // anthropic/mock, auto-route to Anthropic. Covers the case where the key
  // landed in GROK_API_KEY or GROQ_API_KEY by mistake.
  const possibleKeys = [
    typeof config.apiKey === 'string' ? config.apiKey : undefined,
    process.env.ANTHROPIC_API_KEY,
    process.env.CLAUDE_API_KEY,
    process.env.GROK_API_KEY,
    process.env.GROQ_API_KEY,
  ];
  const anthropicKey = possibleKeys.find(
    (k) => typeof k === 'string' && k.startsWith('sk-ant-')
  );
  if (
    anthropicKey &&
    providerName !== 'anthropic' &&
    providerName !== 'claude'
  ) {
    console.warn(
      `[Cortex] sk-ant-* key found but provider=${providerName}. Routing to Anthropic.`
    );
    providerName = 'anthropic';
    config = { ...config, apiKey: anthropicKey };
  }

  if (providerName === 'openai') {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new CortexProviderNotConfiguredError(
        'CORTEX_LLM_PROVIDER is set to "openai" but OPENAI_API_KEY is not set.'
      );
    }
    return {
      provider: new OpenAiLlmProvider({
        apiKey,
        baseUrl: config.baseUrl || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      }),
      defaultModel: 'gpt-4o-mini',
    };
  }

  if (providerName === 'grok' || providerName === 'groq') {
    const apiKey =
      config.apiKey ||
      process.env.GROK_API_KEY ||
      process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new CortexProviderNotConfiguredError(
        `CORTEX_LLM_PROVIDER is set to "${providerName}" but neither GROQ_API_KEY nor ` +
          'GROK_API_KEY is set.'
      );
    }

    // gsk_ → Groq Cloud (groq.com); xai- → xAI Grok (x.ai). Auto-correct mismatched provider.
    const looksLikeGroq = apiKey.startsWith('gsk_');
    const looksLikeXaiGrok = apiKey.startsWith('xai-');
    if (providerName === 'grok' && looksLikeGroq) {
      console.warn('[Cortex] API key has gsk_ prefix (Groq Cloud) but provider=grok (xAI). Routing to Groq Cloud.');
      providerName = 'groq';
    } else if (providerName === 'groq' && looksLikeXaiGrok) {
      console.warn('[Cortex] API key has xai- prefix (xAI Grok) but provider=groq (Groq Cloud). Routing to xAI Grok.');
      providerName = 'grok';
    }

    if (providerName === 'grok') {
      return {
        provider: new OpenAiLlmProvider({ apiKey, baseUrl: 'https://api.x.ai/v1' }),
        defaultModel: 'grok-3',
      };
    }
    return {
      provider: new OpenAiLlmProvider({ apiKey, baseUrl: 'https://api.groq.com/openai/v1' }),
      // Measured against Groq's live model list 2026-09-10: every llama-3.x id
      // has been retired and returns 404. gpt-oss-120b is served and supports
      // tool calling.
      defaultModel: 'openai/gpt-oss-120b',
    };
  }

  // `redqueen` is an alias for ollama, naming the lab node that hosts it
  // (nobara-pc @ 192.168.100.50). The alias describes infrastructure; the
  // product capability is Aura Cortex either way.
  if (providerName === 'ollama' || providerName === 'redqueen') {
    const baseUrl = process.env.CORTEX_REDQUEEN_URL || process.env.OLLAMA_API_BASE;
    if (!baseUrl && providerName === 'redqueen') {
      throw new CortexProviderNotConfiguredError(
        'CORTEX_LLM_PROVIDER=redqueen but neither CORTEX_REDQUEEN_URL nor OLLAMA_API_BASE is set. ' +
          'Ollama on the Red Queen node is bound to localhost by design, so this must point at a ' +
          'tunnel or private-network address that reaches it.'
      );
    }
    return {
      provider: new OllamaLlmProvider({ baseUrl }),
      // No hardcoded default: the available models depend on what has been
      // pulled on that node. Set CORTEX_LLM_MODEL explicitly.
      defaultModel: process.env.CORTEX_LLM_MODEL ?? 'qwen2.5:7b',
    };
  }

  if (providerName === 'azure') return { provider: new AzureOpenAiLlmProvider(), defaultModel: 'gpt-4o' };

  if (providerName === 'anthropic' || providerName === 'claude') {
    const apiKey =
      config.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new CortexProviderNotConfiguredError(
        'CORTEX_LLM_PROVIDER is set to "anthropic" but neither ANTHROPIC_API_KEY nor ' +
          'CLAUDE_API_KEY is set.'
      );
    }
    return {
      provider: new AnthropicLlmProvider({ apiKey }),
      // Current generation. Sonnet 4.6 was the previous default and is a
      // generation behind on tool-use quality.
      defaultModel: 'claude-opus-5',
    };
  }

  // Unknown or unset provider. Name what is wrong and what to set.
  throw new CortexProviderNotConfiguredError(
    providerName
      ? `Unknown CORTEX_LLM_PROVIDER "${providerName}". Supported: groq, grok, openai, ` +
        'groq, grok, openai, anthropic, gemini, mistral, cerebras, deepseek, ollama, redqueen, azure.'
      : 'No AI provider is configured. Set CORTEX_LLM_PROVIDER (e.g. groq) and the ' +
        'matching API key, or select a model explicitly. There is no mock fallback: ' +
        'Cortex refuses to answer rather than invent an answer.'
  );
}

// ── Per-model factory (multi-provider routing) ───────────────────────────────

import { findProviderForModel, MODEL_REGISTRY } from './cortexModelRegistry.js';

/**
 * Per-provider configuration for the new OpenAI-compatible providers added
 * alongside the multi-provider model picker. All five share OpenAiLlmProvider;
 * only baseUrl + key env name differ.
 */
const OPENAI_COMPAT_PROVIDERS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnvs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    defaultModel: 'gemini-2.0-flash',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    keyEnvs: ['MISTRAL_API_KEY'],
    defaultModel: 'mistral-small-latest',
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    keyEnvs: ['CEREBRAS_API_KEY'],
    defaultModel: 'llama3.3-70b',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    keyEnvs: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-chat',
  },
};

function firstEnv(names) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

/**
 * Resolve provider+model from a specific model id. The picker sends the model
 * the user picked; this finds which provider owns it and instantiates with the
 * right base URL + key.
 *
 * @param {string} modelId
 * @param {string[]} [ollamaModelIds] - dynamically discovered Ollama model ids
 * @returns {{ provider: object, model: string, providerName: string }}
 */
export function createLlmProviderForModel(modelId, ollamaModelIds = []) {
  if (!modelId) throw new Error('createLlmProviderForModel: modelId is required');
  const providerName = findProviderForModel(modelId, ollamaModelIds);
  if (!providerName) throw new Error(`Model not found in any configured provider: ${modelId}`);

  if (providerName === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error('Anthropic model requested but ANTHROPIC_API_KEY is not set');
    return { provider: new AnthropicLlmProvider({ apiKey }), model: modelId, providerName };
  }

  if (providerName === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI model requested but OPENAI_API_KEY is not set');
    return {
      provider: new OpenAiLlmProvider({
        apiKey,
        baseUrl: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      }),
      model: modelId,
      providerName,
    };
  }

  if (providerName === 'groq') {
    const apiKey =
      (process.env.GROQ_API_KEY?.startsWith?.('gsk_') && process.env.GROQ_API_KEY) ||
      (process.env.GROK_API_KEY?.startsWith?.('gsk_') && process.env.GROK_API_KEY);
    if (!apiKey) throw new Error('Groq model requested but no gsk_-prefixed key is set');
    return {
      provider: new OpenAiLlmProvider({ apiKey, baseUrl: 'https://api.groq.com/openai/v1' }),
      model: modelId,
      providerName,
    };
  }

  if (providerName === 'grok') {
    const apiKey =
      (process.env.GROK_API_KEY?.startsWith?.('xai-') && process.env.GROK_API_KEY) ||
      (process.env.GROQ_API_KEY?.startsWith?.('xai-') && process.env.GROQ_API_KEY);
    if (!apiKey) throw new Error('xAI Grok model requested but no xai--prefixed key is set');
    return {
      provider: new OpenAiLlmProvider({ apiKey, baseUrl: 'https://api.x.ai/v1' }),
      model: modelId,
      providerName,
    };
  }

  if (providerName === 'ollama') {
    // Native /api/chat, NOT the OpenAI /v1 shim: measured, the shim returns no
    // structured tool_calls, so Cortex would silently treat a tool request as a
    // final answer. See OllamaLlmProvider.
    return {
      provider: new OllamaLlmProvider({ baseUrl: process.env.OLLAMA_API_BASE }),
      model: modelId,
      providerName,
    };
  }

  const cfg = OPENAI_COMPAT_PROVIDERS[providerName];
  if (cfg) {
    const apiKey = firstEnv(cfg.keyEnvs);
    if (!apiKey) {
      throw new Error(
        `${providerName} model requested but ${cfg.keyEnvs.join(' / ')} is not set`
      );
    }
    return {
      provider: new OpenAiLlmProvider({ apiKey, baseUrl: cfg.baseUrl }),
      model: modelId,
      providerName,
    };
  }

  throw new Error(`Unsupported provider for model ${modelId}: ${providerName}`);
}

// Re-export so server.js can import in one shot.
export { MODEL_REGISTRY };
