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

// ── Anthropic stub ───────────────────────────────────────────────────────────

export class AnthropicLlmProvider {
  async generateResponse() {
    throw new Error('AnthropicLlmProvider: not yet implemented');
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
  if (providerName === 'anthropic') return { provider: new AnthropicLlmProvider(), defaultModel: 'claude-3-5-sonnet-20241022' };

  return { provider: new MockLlmProvider(), defaultModel: 'mock' };
}
