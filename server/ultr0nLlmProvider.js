/**
 * Ultr0n LLM Provider abstraction
 * Supports OpenAI (default), Mock (dev/test), Azure stub, Anthropic stub.
 *
 * @typedef {{ role: 'system'|'user'|'assistant'|'tool', content: string, name?: string, toolCallId?: string }} LlmMessage
 * @typedef {{ name: string, description: string, parameters: Record<string,any> }} LlmToolDefinition
 * @typedef {{ message: string, toolCalls?: Array<{id:string,name:string,arguments:Record<string,any>}>, raw?: any }} LlmResponse
 */

// ── Mock Provider ────────────────────────────────────────────────────────────

export class MockLlmProvider {
  async generateResponse({ messages }) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const question = lastUser?.content?.toLowerCase() ?? '';
    const system = messages.find(m => m.role === 'system')?.content ?? '';

    // Wireless pipeline path — return structured narrative mock
    if (system.includes('You are Ultr0n') && system.includes('wireless')) {
      return {
        message: [
          'Short answer:',
          'This is a mock Ultr0n response — connect a real LLM provider (GROK_API_KEY or OPENAI_API_KEY) for live AI analysis.',
          '',
          'What I found:',
          '- Client: N/A (mock mode)',
          '- AP: N/A (mock mode)',
          '- WLAN: N/A (mock mode)',
          '- Site: N/A (mock mode)',
          '- Time window: last 24 hours',
          '- Key events: none (mock mode)',
          '- RF indicators: none (mock mode)',
          '- AP indicators: none (mock mode)',
          '- WLAN/auth indicators: none (mock mode)',
          '',
          'Likely root cause:',
          'Unable to determine — no real API data available in mock mode. Set GROK_API_KEY to enable live wireless diagnostics.',
        ].join('\n'),
      };
    }

    const pageMatch = system.match(/current page:\s*([^\n.]+)/i);
    const pageName = pageMatch?.[1]?.trim() ?? 'this page';

    let message;
    if (question.includes('client') || question.includes('station')) {
      message = `[Mock Ultr0n] On ${pageName}: I can see client connectivity data. In a live deployment I would query the controller for real client metrics, authentication failures, and roaming events.`;
    } else if (question.includes('ap') || question.includes('access point')) {
      message = `[Mock Ultr0n] On ${pageName}: Access point health data would be fetched from the controller. I would report uptime, client load, and any alarms.`;
    } else if (question.includes('site')) {
      message = `[Mock Ultr0n] On ${pageName}: Site-level metrics would be aggregated from all APs. I would highlight any sites with degraded service levels.`;
    } else {
      message = `[Mock Ultr0n] On ${pageName}: I received your question. In a live deployment with OPENAI_API_KEY set, I would provide a detailed, data-driven answer using the full page context.`;
    }

    return { message };
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
      messages,
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
          ? ' (Groq tier rate-limited — try llama-3.3-70b-versatile or llama-3.1-8b-instant which have larger TPM caps)'
          : '';
        const finalBody = await resp.text().catch(() => resp.statusText);
        throw new Error(`OpenAI API error 429${hint}: ${finalBody}`);
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

    if (choice.message?.tool_calls?.length) {
      result.toolCalls = choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }));
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

export class AnthropicLlmProvider {
  #client;

  constructor({ apiKey }) {
    if (!apiKey) throw new Error('AnthropicLlmProvider: apiKey is required');
    // The SDK blocks instantiation when it detects a browser global (jsdom
    // unit tests trip this even though we only ever run server-side in Node).
    this.#client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async generateResponse({ model, messages, tools, temperature = 0.3, maxTokens = 1024 }) {
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

    // Opus 4.7 removed temperature/top_p/top_k (400 if sent). Other Claude
    // models still accept temperature.
    if (!model.startsWith('claude-opus-4-7')) {
      params.temperature = temperature;
    }

    const response = await this.#client.messages.create(params);

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
    return result;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the appropriate LLM provider from environment/config.
 * Falls back to Mock if no API key is present.
 *
 * @param {{ provider?: string, apiKey?: string, baseUrl?: string }} config
 */
/**
 * @returns {{ provider: object, defaultModel: string }}
 */
export function createLlmProvider(config = {}) {
  let providerName = config.provider || process.env.ULTR0N_LLM_PROVIDER || 'mock';

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
    providerName !== 'mock' &&
    providerName !== 'anthropic' &&
    providerName !== 'claude'
  ) {
    console.warn(
      `[Ultr0n] sk-ant-* key found but provider=${providerName}. Routing to Anthropic.`
    );
    providerName = 'anthropic';
    config = { ...config, apiKey: anthropicKey };
  }

  if (providerName === 'openai') {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[Ultr0n] OPENAI_API_KEY not set — falling back to MockLlmProvider');
      return { provider: new MockLlmProvider(), defaultModel: 'mock' };
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
      console.warn(`[Ultr0n] ${providerName.toUpperCase()}_API_KEY not set — falling back to MockLlmProvider`);
      return { provider: new MockLlmProvider(), defaultModel: 'mock' };
    }

    // gsk_ → Groq Cloud (groq.com); xai- → xAI Grok (x.ai). Auto-correct mismatched provider.
    const looksLikeGroq = apiKey.startsWith('gsk_');
    const looksLikeXaiGrok = apiKey.startsWith('xai-');
    if (providerName === 'grok' && looksLikeGroq) {
      console.warn('[Ultr0n] API key has gsk_ prefix (Groq Cloud) but provider=grok (xAI). Routing to Groq Cloud.');
      providerName = 'groq';
    } else if (providerName === 'groq' && looksLikeXaiGrok) {
      console.warn('[Ultr0n] API key has xai- prefix (xAI Grok) but provider=groq (Groq Cloud). Routing to xAI Grok.');
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
      defaultModel: 'llama-3.3-70b-versatile',
    };
  }

  if (providerName === 'azure') return { provider: new AzureOpenAiLlmProvider(), defaultModel: 'gpt-4o' };

  if (providerName === 'anthropic' || providerName === 'claude') {
    const apiKey =
      config.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      console.warn('[Ultr0n] ANTHROPIC_API_KEY not set — falling back to MockLlmProvider');
      return { provider: new MockLlmProvider(), defaultModel: 'mock' };
    }
    return {
      provider: new AnthropicLlmProvider({ apiKey }),
      defaultModel: 'claude-sonnet-4-6',
    };
  }

  return { provider: new MockLlmProvider(), defaultModel: 'mock' };
}

// ── Per-model factory (multi-provider routing) ───────────────────────────────

import { findProviderForModel, MODEL_REGISTRY } from './ultr0nModelRegistry.js';

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
    const baseUrl = process.env.OLLAMA_API_BASE || 'http://localhost:11434/v1';
    // Ollama doesn't require a key but OpenAiLlmProvider does; use a sentinel.
    return {
      provider: new OpenAiLlmProvider({ apiKey: 'ollama-local', baseUrl }),
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
