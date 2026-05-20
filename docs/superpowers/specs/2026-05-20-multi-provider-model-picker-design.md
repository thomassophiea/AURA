# Multi-Provider Model Picker — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Scope:** Add Gemini, Mistral, Cerebras, DeepSeek, and Ollama providers; refactor single-provider routing to per-model routing; group all configured providers' models in a single UI dropdown.

---

## Overview

The Red Queen agent currently supports four LLM providers (Anthropic, Groq, xAI Grok, OpenAI), selected via a single `ULTR0N_LLM_PROVIDER` env var. This spec extends the system to:

1. Add five new providers (Gemini, Mistral, Cerebras, DeepSeek, Ollama).
2. Show all configured providers' models in one dropdown — no env-var switching.
3. Route each inference request to the provider that owns the selected model.

---

## Backend Architecture

### `server/ultr0nModelRegistry.js`

**Model entry shape** gains a required `provider` field:
```js
{ id, label, contextWindow, notes, provider, kind? }
```

**New exports:**
- `getConfiguredProviders()` — scans env vars at startup/request time; returns array of provider names whose credentials are present (e.g., `["anthropic", "gemini", "ollama"]`). Ollama is included if its base URL is reachable or if `OLLAMA_ENABLED=true`.
- `getAllModelsForConfiguredProviders()` — returns `[...SHELL_MODELS, ...flatMap(configuredProviders, getAllowedModels)]`. Used by `/api/ultr0n/models`.
- `findProviderForModel(modelId)` — reverse-lookup: returns the provider name for a given model ID. Used by `createLlmProviderForModel`.
- `isModelAllowed(modelId)` — now checks across all configured providers (not just the active one).

**Existing `MODEL_REGISTRY`** keeps current entries; new keys added: `gemini`, `mistral`, `cerebras`, `deepseek`, `ollama`.

### `server/ultr0nLlmProvider.js`

**New export:** `createLlmProviderForModel(modelId)` — calls `findProviderForModel(modelId)`, then instantiates the correct provider class with env-var credentials. Returns `{ provider, model }`.

**`createLlmProvider(config)`** is kept for backwards compat (wireless query pipeline uses it) but deprecated internally.

All five new providers reuse `OpenAiLlmProvider` — they all expose OpenAI-compatible `/chat/completions` endpoints. Only the `baseUrl` and API key differ:

| Provider | Class | Base URL | API Key Env |
|---|---|---|---|
| Gemini | `OpenAiLlmProvider` | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` |
| Mistral | `OpenAiLlmProvider` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| Cerebras | `OpenAiLlmProvider` | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` |
| DeepSeek | `OpenAiLlmProvider` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| Ollama | `OpenAiLlmProvider` | `$OLLAMA_API_BASE` or `http://localhost:11434/v1` | *(none)* |

### Ollama Model Discovery

When Ollama is a configured provider, `/api/ultr0n/models` queries `GET {OLLAMA_BASE}/api/tags` to enumerate installed models dynamically. Each tag is mapped to a registry entry with `provider: "ollama"` and `notes: "local"`. If Ollama is unreachable, it is silently excluded from the model list (no server error).

### `server.js` endpoint changes

**`GET /api/ultr0n/models`:**
```js
// Before
const provider = resolveActiveProvider();
res.json({ provider, defaultModel, models: [...SHELL_MODELS, ...getAllowedModels(provider)] });

// After
const models = await getAllModelsForConfiguredProviders(); // async for Ollama discovery
res.json({ providers: getConfiguredProviders(), defaultModel: DEFAULT_PICKER_MODEL, models });
```

**`POST /api/ultr0n/message`:**
```js
// Before
const { provider } = createLlmProvider({});

// After
const { provider } = createLlmProviderForModel(model);
```

**`POST /api/ultr0n/wireless/query`:** Same change — swap to `createLlmProviderForModel`.

**`isModelAllowed` call sites:** Updated to use the new signature that checks all configured providers.

---

## Model Registry Additions

### Gemini (`GEMINI_API_KEY` or `GOOGLE_API_KEY`)
| ID | Label | Context | Notes |
|---|---|---|---|
| `gemini-2.0-flash` | Gemini 2.0 Flash | 1,000,000 | Default · free tier |
| `gemini-1.5-flash` | Gemini 1.5 Flash | 1,000,000 | Free tier · high throughput |
| `gemini-1.5-pro` | Gemini 1.5 Pro | 2,000,000 | Longest context |

### Mistral (`MISTRAL_API_KEY`)
| ID | Label | Context | Notes |
|---|---|---|---|
| `mistral-small-latest` | Mistral Small | 32,000 | Default · free tier |
| `open-mistral-7b` | Mistral 7B | 32,000 | Fastest open model |
| `mistral-large-latest` | Mistral Large | 128,000 | Most capable |

### Cerebras (`CEREBRAS_API_KEY`)
| ID | Label | Context | Notes |
|---|---|---|---|
| `llama3.3-70b` | Llama 3.3 70B (Cerebras) | 128,000 | Default · ultra-fast |
| `llama3.1-8b` | Llama 3.1 8B (Cerebras) | 128,000 | Fastest tier |

### DeepSeek (`DEEPSEEK_API_KEY`)
| ID | Label | Context | Notes |
|---|---|---|---|
| `deepseek-chat` | DeepSeek V3 | 64,000 | Default · ~$0.14/M tok |
| `deepseek-reasoner` | DeepSeek R1 | 64,000 | Deep reasoning |

### Ollama (no key — local)
Dynamic — discovered from `GET {OLLAMA_BASE}/api/tags`. Common models that may be present: `llama3.2`, `llama3.1:8b`, `mistral`, `deepseek-r1:7b`, `qwen2.5:7b`, `phi4`, `gemma3`. Each mapped with `notes: "local · private"`.

---

## Frontend Changes

### `useUltr0nModel.ts`

Response shape changes from `{ provider: string }` to `{ providers: string[] }`. Hook updated to read `providers` (array) for informational display. Model selection, localStorage persistence, and validity checks are unchanged.

### `ModelSelector.tsx`

Models are grouped by `provider` field, rendered with `DropdownMenuLabel` separators and a provider icon/badge. Provider names are formatted as display labels (e.g., `"gemini"` → `"Google Gemini"`). Shell entries (Red Queen) appear at the top, ungrouped.

Visual structure of the dropdown:
```
● Red Queen          (shell — always at top)
── Google Gemini ───────────────────────
  Gemini 2.0 Flash  · free tier · 1M ctx
  Gemini 1.5 Pro    · free tier · 2M ctx
── Anthropic ────────────────────────────
  Claude Sonnet 4.6 · agentic · 1M ctx
── Ollama (local) ───────────────────────
  llama3.2          · local · private
  mistral           · local · private
```

---

## Error Handling

- **Unknown model at request time:** `createLlmProviderForModel` throws; server returns 400 `"Model not found in any configured provider"`.
- **Ollama unreachable:** Discovery silently skips; no Ollama models appear in list.
- **Missing API key for provider:** Model list omits that provider entirely. If a model from an unconfigured provider is somehow requested, 400 is returned.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `server/ultr0nModelRegistry.js` | Add 5 providers; add `getConfiguredProviders`, `getAllModelsForConfiguredProviders`, `findProviderForModel`; update `isModelAllowed` |
| `server/ultr0nLlmProvider.js` | Add `createLlmProviderForModel`; add 5 provider factory branches |
| `server.js` | Update 3 endpoints to use new functions |
| `src/hooks/useUltr0nModel.ts` | Handle `providers[]` array in response |
| `src/components/AgentCoworker/ModelSelector.tsx` | Group models by provider |

---

## Out of Scope

- Streaming responses (not currently implemented for any provider)
- Per-provider rate limit UI
- API key management UI (keys stay in env vars / Railway config)
- GitHub Copilot / enterprise SSO-gated providers (separate spec if needed)
