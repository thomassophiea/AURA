/**
 * Allowlist of LLM models the Ultr0n UI is permitted to request, keyed by
 * provider. Backend rejects anything not in this list to prevent clients from
 * naming arbitrary (potentially expensive) models.
 *
 * Each entry: { id, label, contextWindow, notes, provider }
 *   id            - exact model identifier sent to the provider API
 *   label         - human-friendly name shown in UI
 *   contextWindow - approximate token limit (for UI hints)
 *   notes         - short tag (speed / quality / context)
 *   provider      - injected by getAllowedModels (matches the registry key)
 */

const RAW_REGISTRY = {
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
      contextWindow: 128000,
      notes: 'Default · balanced reasoning',
    },
    {
      id: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B',
      contextWindow: 128000,
      notes: 'Fastest · low-latency lookups',
    },
    {
      id: 'mixtral-8x7b-32768',
      label: 'Mixtral 8×7B',
      contextWindow: 32768,
      notes: 'Wide-context analysis',
    },
    {
      id: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B',
      contextWindow: 131072,
      notes: 'Deep reasoning · rate-limited tier',
    },
  ],
  grok: [
    { id: 'grok-3', label: 'Grok 3', contextWindow: 131072, notes: 'Default' },
    { id: 'grok-3-mini', label: 'Grok 3 Mini', contextWindow: 131072, notes: 'Faster' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128000, notes: 'Default' },
    { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000, notes: 'Higher quality' },
  ],
  anthropic: [
    {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      contextWindow: 1_000_000,
      notes: 'Default · agentic tool-use',
    },
    {
      id: 'claude-opus-4-7',
      label: 'Claude Opus 4.7',
      contextWindow: 1_000_000,
      notes: 'Most capable · long-horizon work',
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      contextWindow: 200_000,
      notes: 'Fastest tier',
    },
  ],
  gemini: [
    {
      id: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      contextWindow: 1_000_000,
      notes: 'Default · free tier',
    },
    {
      id: 'gemini-1.5-flash',
      label: 'Gemini 1.5 Flash',
      contextWindow: 1_000_000,
      notes: 'Free tier · high throughput',
    },
    {
      id: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro',
      contextWindow: 2_000_000,
      notes: 'Longest context',
    },
  ],
  mistral: [
    {
      id: 'mistral-small-latest',
      label: 'Mistral Small',
      contextWindow: 32_000,
      notes: 'Default · free tier',
    },
    {
      id: 'open-mistral-7b',
      label: 'Mistral 7B',
      contextWindow: 32_000,
      notes: 'Fastest open model',
    },
    {
      id: 'mistral-large-latest',
      label: 'Mistral Large',
      contextWindow: 128_000,
      notes: 'Most capable',
    },
  ],
  cerebras: [
    {
      id: 'llama3.3-70b',
      label: 'Llama 3.3 70B (Cerebras)',
      contextWindow: 128_000,
      notes: 'Default · ultra-fast',
    },
    {
      id: 'llama3.1-8b',
      label: 'Llama 3.1 8B (Cerebras)',
      contextWindow: 128_000,
      notes: 'Fastest tier',
    },
  ],
  deepseek: [
    {
      id: 'deepseek-chat',
      label: 'DeepSeek V3',
      contextWindow: 64_000,
      notes: 'Default · ~$0.14/M tok',
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek R1',
      contextWindow: 64_000,
      notes: 'Deep reasoning',
    },
  ],

  // Ollama models are discovered dynamically from `${OLLAMA_BASE}/api/tags`;
  // no static entries here. If discovery fails the provider is silently absent.
  ollama: [],

  // No "Mock" picker entry — we don't ship mock data to users. When no LLM
  // provider is configured the picker just shows the shell agent; LLM calls
  // surface a real "configure provider" error instead of returning fakes.
  mock: [],
};

// Attach `provider` to every entry so the frontend can group without a separate
// lookup. Frozen-shallow so consumers don't accidentally mutate.
function freezeWithProvider() {
  const out = {};
  for (const [providerName, list] of Object.entries(RAW_REGISTRY)) {
    out[providerName] = list.map((m) => ({ ...m, provider: providerName }));
  }
  return out;
}

export const MODEL_REGISTRY = freezeWithProvider();

/**
 * Non-LLM "models" surfaced in the picker. These are not LLM endpoints; the
 * frontend renders a custom panel for them (e.g. an embedded SSH terminal).
 * They are returned by /api/ultr0n/models alongside the configured providers'
 * models, but are NOT accepted by /api/ultr0n/message (isModelAllowed below
 * stays LLM-only on purpose).
 */
export const SHELL_MODELS = [
  {
    id: 'redq-shell',
    label: 'Red Queen',
    kind: 'shell',
    contextWindow: 0,
    notes: 'Network operations agent · default',
    provider: 'shell',
  },
];

export const DEFAULT_PICKER_MODEL = 'redq-shell';

export function getAllowedModels(providerName) {
  return MODEL_REGISTRY[providerName] ?? MODEL_REGISTRY.mock;
}

/**
 * Inspect environment to determine which providers have credentials present.
 * Ollama is included whenever `OLLAMA_ENABLED=true` OR an `OLLAMA_API_BASE` is
 * set — actual reachability is checked at model-list assembly time, not here.
 */
export function getConfiguredProviders() {
  const providers = [];
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) providers.push('anthropic');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.GROQ_API_KEY?.startsWith?.('gsk_') || process.env.GROK_API_KEY?.startsWith?.('gsk_')) {
    providers.push('groq');
  }
  if (process.env.GROK_API_KEY?.startsWith?.('xai-') || process.env.GROQ_API_KEY?.startsWith?.('xai-')) {
    providers.push('grok');
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) providers.push('gemini');
  if (process.env.MISTRAL_API_KEY) providers.push('mistral');
  if (process.env.CEREBRAS_API_KEY) providers.push('cerebras');
  if (process.env.DEEPSEEK_API_KEY) providers.push('deepseek');
  if (process.env.OLLAMA_ENABLED === 'true' || process.env.OLLAMA_API_BASE) providers.push('ollama');
  return providers;
}

/**
 * Reverse-lookup: which provider owns this model id?
 * Checks static registry first; Ollama models are matched by the dynamic list
 * passed in (or empty if none yet discovered).
 */
export function findProviderForModel(modelId, ollamaModelIds = []) {
  if (!modelId) return null;
  for (const [providerName, list] of Object.entries(MODEL_REGISTRY)) {
    if (list.some((m) => m.id === modelId)) return providerName;
  }
  if (ollamaModelIds.includes(modelId)) return 'ollama';
  return null;
}

/**
 * Check if a model id is allowed under any configured provider. The legacy
 * 2-arg form `isModelAllowed(providerName, modelId)` is preserved for back-
 * compat with existing call sites.
 */
export function isModelAllowed(arg1, arg2, ollamaModelIds = []) {
  // Legacy signature: (providerName, modelId)
  if (typeof arg2 === 'string') {
    if (!arg2) return false;
    return getAllowedModels(arg1).some((m) => m.id === arg2);
  }
  // New signature: (modelId, ollamaModelIds?)
  const modelId = arg1;
  if (!modelId) return false;
  const configured = getConfiguredProviders();
  if (configured.some((p) => MODEL_REGISTRY[p]?.some?.((m) => m.id === modelId))) return true;
  if (configured.includes('ollama') && (Array.isArray(arg2) ? arg2 : ollamaModelIds).includes(modelId)) {
    return true;
  }
  return false;
}

/**
 * Query the configured Ollama instance for installed models. Returns an empty
 * list if Ollama isn't enabled or the endpoint is unreachable — never throws.
 */
export async function discoverOllamaModels() {
  if (process.env.OLLAMA_ENABLED !== 'true' && !process.env.OLLAMA_API_BASE) return [];
  const base = process.env.OLLAMA_API_BASE?.replace(/\/v1\/?$/, '') || 'http://localhost:11434';
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!resp.ok) return [];
    const data = await resp.json();
    const tags = Array.isArray(data?.models) ? data.models : [];
    return tags.map((t) => ({
      id: t.name,
      label: t.name,
      contextWindow: t.details?.context_length ?? 8192,
      notes: 'local · private',
      provider: 'ollama',
    }));
  } catch {
    return [];
  }
}

/**
 * Return the union of shell models + static models for every configured
 * provider + dynamically discovered Ollama models. Used by `/api/ultr0n/models`.
 */
export async function getAllModelsForConfiguredProviders() {
  const configured = getConfiguredProviders();
  const staticModels = configured
    .filter((p) => p !== 'ollama')
    .flatMap((p) => MODEL_REGISTRY[p] ?? []);
  const ollamaModels = configured.includes('ollama') ? await discoverOllamaModels() : [];
  return [...staticModels, ...ollamaModels];
}

/**
 * Legacy single-active-provider resolver — preserved for the wireless query
 * pipeline and any code that still calls `createLlmProvider({})` without a
 * specific model. New per-model code paths should use `findProviderForModel`.
 */
export function resolveActiveProvider() {
  const raw = process.env.ULTR0N_LLM_PROVIDER || 'mock';

  // sk-ant-* keys always route to Anthropic regardless of declared provider
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY ||
    (process.env.GROK_API_KEY?.startsWith?.('sk-ant-') ? process.env.GROK_API_KEY : '') ||
    (process.env.GROQ_API_KEY?.startsWith?.('sk-ant-') ? process.env.GROQ_API_KEY : '');
  if (anthropicKey) return 'anthropic';
  if (raw === 'anthropic' || raw === 'claude') return 'anthropic';

  if (raw !== 'grok' && raw !== 'groq') return raw;

  const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY || '';
  if (raw === 'grok' && apiKey.startsWith('gsk_')) return 'groq';
  if (raw === 'groq' && apiKey.startsWith('xai-')) return 'grok';
  return raw;
}
