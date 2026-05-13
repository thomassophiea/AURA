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

export const MODEL_REGISTRY = {
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Versatile',
      contextWindow: 128000,
      notes: 'Default — best balance',
    },
    {
      id: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B Instant',
      contextWindow: 128000,
      notes: 'Fastest, cheapest',
    },
    {
      id: 'mixtral-8x7b-32768',
      label: 'Mixtral 8x7B',
      contextWindow: 32768,
      notes: 'Large context window',
    },
    {
      id: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B',
      contextWindow: 131072,
      notes: 'Heaviest reasoning',
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
  mock: [{ id: 'mock', label: 'Mock', contextWindow: 0, notes: 'No backend' }],
};

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
  if (raw !== 'grok' && raw !== 'groq') return raw;

  const apiKey = process.env.GROK_API_KEY || process.env.GROQ_API_KEY || '';
  if (raw === 'grok' && apiKey.startsWith('gsk_')) return 'groq';
  if (raw === 'groq' && apiKey.startsWith('xai-')) return 'grok';
  return raw;
}
