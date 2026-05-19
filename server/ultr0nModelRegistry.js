/**
 * Allowlist of LLM models the Ultr0n UI is permitted to request, keyed by
 * provider. Backend rejects anything not in this list to prevent clients from
 * naming arbitrary (potentially expensive) models.
 *
 * Each entry: { id, label, contextWindow, notes }
 *   id            - exact model identifier sent to the provider API
 *   label         - human-friendly name shown in UI
 *   contextWindow - approximate token limit (for UI hints)
 *   notes         - short tag (speed / quality / context)
 */

// Picker labels show the real upstream model names — honest and customer-
// recognizable. The product brand ("AURA Agent") is reserved for the shell
// entry below. IDs stay original because they're how the backend routes.
export const MODEL_REGISTRY = {
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

  // No "Mock" picker entry — we don't ship mock data to users. When no LLM
  // provider is configured the picker just shows the shell agent; LLM calls
  // surface a real "configure provider" error instead of returning fakes.
  mock: [],
};

/**
 * Non-LLM "models" surfaced in the picker. These are not LLM endpoints; the
 * frontend renders a custom panel for them (e.g. an embedded SSH terminal).
 * They are returned by /api/ultr0n/models alongside the active provider's
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
  },
];

export const DEFAULT_PICKER_MODEL = 'redq-shell';

export function getAllowedModels(providerName) {
  return MODEL_REGISTRY[providerName] ?? MODEL_REGISTRY.mock;
}

export function isModelAllowed(providerName, modelId) {
  if (!modelId) return false;
  return getAllowedModels(providerName).some(m => m.id === modelId);
}

/**
 * Resolve the provider name the same way createLlmProvider does, so /models
 * reports against the currently-active provider (including gsk_/xai- prefix
 * auto-routing).
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
