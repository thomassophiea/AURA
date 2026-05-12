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

    const resp = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify(body),
    });

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
export function createLlmProvider(config = {}) {
  const provider = config.provider || process.env.ULTR0N_LLM_PROVIDER || 'mock';

  if (provider === 'openai') {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[Ultr0n] OPENAI_API_KEY not set — falling back to MockLlmProvider');
      return new MockLlmProvider();
    }
    return new OpenAiLlmProvider({
      apiKey,
      baseUrl: config.baseUrl || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    });
  }

  if (provider === 'azure') return new AzureOpenAiLlmProvider();
  if (provider === 'anthropic') return new AnthropicLlmProvider();

  return new MockLlmProvider();
}
