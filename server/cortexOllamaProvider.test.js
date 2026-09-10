import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaLlmProvider, createLlmProvider } from './cortexLlmProvider.js';

/**
 * The reason this provider exists: Ollama's OpenAI-compatible /v1 shim does not
 * surface tool calls. Measured on the lab node (nobara-pc, qwen2.5:7b):
 *   /v1/chat/completions -> tool_calls: 0, the call arrives as prose
 *   /api/chat            -> message.tool_calls: 1, parsed
 * Cortex is entirely tool-driven, so the shim would silently turn a tool
 * request into a final answer.
 */
describe('OllamaLlmProvider', () => {
  let lastUrl;
  let lastBody;
  const savedFetch = globalThis.fetch;

  beforeEach(() => {
    lastUrl = null;
    lastBody = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      lastUrl = String(url);
      lastBody = init?.body ? JSON.parse(init.body) : null;
      if (lastUrl.endsWith('/api/tags')) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            role: 'assistant',
            content: '',
            // Ollama supplies NO id, and arguments is an OBJECT not a string.
            tool_calls: [{ function: { name: 'getSiteOverview', arguments: { siteName: null } } }],
          },
          prompt_eval_count: 171,
          eval_count: 21,
        }),
      };
    });
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  it('calls the NATIVE /api/chat endpoint, never the /v1 shim', async () => {
    const p = new OllamaLlmProvider({ baseUrl: 'http://127.0.0.1:11434' });
    await p.generateResponse({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'hi' }] });
    expect(lastUrl).toBe('http://127.0.0.1:11434/api/chat');
    expect(lastUrl).not.toContain('/v1');
  });

  it('normalises a /v1-suffixed base url, since OLLAMA_API_BASE is written that way', () => {
    expect(new OllamaLlmProvider({ baseUrl: 'http://host:11434/v1' }).baseUrl).toBe('http://host:11434');
    expect(new OllamaLlmProvider({ baseUrl: 'http://host:11434/v1/' }).baseUrl).toBe('http://host:11434');
    expect(new OllamaLlmProvider({ baseUrl: 'http://host:11434/' }).baseUrl).toBe('http://host:11434');
  });

  it('synthesises a tool-call id, because Ollama supplies none', async () => {
    // The transcript needs an id to pair a tool result with its call.
    const p = new OllamaLlmProvider({ baseUrl: 'http://x:11434' });
    const r = await p.generateResponse({ model: 'm', messages: [], tools: [{ name: 'getSiteOverview', description: 'd', parameters: {} }] });
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].id).toMatch(/^ollama-\d+-0$/);
    expect(r.toolCalls[0].name).toBe('getSiteOverview');
    expect(r.toolCalls[0].arguments).toEqual({ siteName: null });
  });

  it('accepts object arguments as-is and repairs string arguments', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        message: { tool_calls: [
          { function: { name: 'a', arguments: '{"x":1}' } },
          { function: { name: 'b', arguments: 'not json' } },
        ] },
      }),
    }));
    const p = new OllamaLlmProvider({ baseUrl: 'http://x:11434' });
    const r = await p.generateResponse({ model: 'm', messages: [] });
    expect(r.toolCalls[0].arguments).toEqual({ x: 1 });
    // Malformed args become {} rather than throwing and losing the whole turn.
    expect(r.toolCalls[1].arguments).toEqual({});
  });

  it('translates our OpenAI-shaped assistant tool_calls into Ollama shape', async () => {
    const p = new OllamaLlmProvider({ baseUrl: 'http://x:11434' });
    await p.generateResponse({
      model: 'm',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'getSiteOverview', arguments: '{"worst":5}' } }] },
        { role: 'tool', name: 'getSiteOverview', tool_call_id: 'c1', content: '{"clientCount":37}' },
      ],
    });
    const [, assistant, tool] = lastBody.messages;
    // arguments must be an object on the wire, not a JSON string
    expect(assistant.tool_calls[0].function.arguments).toEqual({ worst: 5 });
    expect(tool.role).toBe('tool');
    expect(tool.content).toContain('clientCount');
  });

  it('sends stream:false and maps maxTokens to num_predict', async () => {
    const p = new OllamaLlmProvider({ baseUrl: 'http://x:11434' });
    await p.generateResponse({ model: 'm', messages: [], temperature: 0.2, maxTokens: 300 });
    expect(lastBody.stream).toBe(false);
    expect(lastBody.options).toEqual({ temperature: 0.2, num_predict: 300 });
  });

  it('reports health as CONNECTED with the models actually pulled', async () => {
    const h = await new OllamaLlmProvider({ baseUrl: 'http://x:11434' }).health();
    expect(h.state).toBe('CONNECTED');
    expect(h.models).toContain('qwen2.5:7b');
    expect(typeof h.latencyMs).toBe('number');
  });

  it('reports DEGRADED when reachable but no model is pulled', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ models: [] }) }));
    const h = await new OllamaLlmProvider({ baseUrl: 'http://x:11434' }).health();
    expect(h.state).toBe('DEGRADED');
    expect(h.detail).toMatch(/no models/);
  });

  it('reports UNAVAILABLE rather than throwing when the node is down', async () => {
    // An unreachable inference node is a status for the health panel, not an
    // exception that takes down the request.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const h = await new OllamaLlmProvider({ baseUrl: 'http://x:11434' }).health();
    expect(h.state).toBe('UNAVAILABLE');
    expect(h.detail).toMatch(/ECONNREFUSED/);
  });

  it('surfaces an unreachable node with the address, not a bare stack', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const p = new OllamaLlmProvider({ baseUrl: 'http://192.168.100.50:11434' });
    await expect(p.generateResponse({ model: 'm', messages: [] })).rejects.toThrow(
      /Could not reach Ollama at http:\/\/192\.168\.100\.50:11434/
    );
  });
});

describe('createLlmProvider redqueen alias', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('routes provider=redqueen to the Ollama provider', () => {
    process.env.CORTEX_REDQUEEN_URL = 'http://127.0.0.1:11435';
    const { provider } = createLlmProvider({ provider: 'redqueen' });
    expect(provider).toBeInstanceOf(OllamaLlmProvider);
  });

  it('refuses redqueen with no address, since Ollama is localhost-bound there', () => {
    delete process.env.CORTEX_REDQUEEN_URL;
    delete process.env.OLLAMA_API_BASE;
    expect(() => createLlmProvider({ provider: 'redqueen' })).toThrow(/CORTEX_REDQUEEN_URL/);
  });
});
