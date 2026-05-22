import { useCallback, useEffect, useState } from 'react';

export interface CortexModel {
  id: string;
  label: string;
  contextWindow: number;
  notes: string;
  kind?: 'llm' | 'shell';
  provider?: string;
}

interface ModelsResponse {
  /** New shape: list of providers whose credentials are configured. */
  providers?: string[];
  /** Legacy single-provider field — still accepted for back-compat. */
  provider?: string;
  defaultModel: string;
  llmDefaultModel?: string;
  models: CortexModel[];
}

const STORAGE_KEY = 'cortex_model';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* localStorage unavailable */
  }
}

export function useCortexModel() {
  const [providers, setProviders] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>('mock');
  const [models, setModels] = useState<CortexModel[]>([]);
  const [selectedModel, setSelectedModelState] = useState<string | null>(readStored);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const token = (() => {
          try {
            return localStorage.getItem('access_token') ?? '';
          } catch {
            return '';
          }
        })();
        const resp = await fetch('/api/cortex/models', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!resp.ok) throw new Error(`/api/cortex/models returned ${resp.status}`);
        const data = (await resp.json()) as ModelsResponse;
        if (cancelled) return;
        const list = Array.isArray(data.providers)
          ? data.providers
          : data.provider
            ? [data.provider]
            : [];
        setProviders(list);
        setDefaultModel(data.defaultModel);
        setModels(data.models ?? []);

        const stored = readStored();
        const storedIsValid = stored && (data.models ?? []).some((m) => m.id === stored);
        if (!storedIsValid) {
          setSelectedModelState(data.defaultModel);
          writeStored(data.defaultModel);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelectedModel = useCallback((id: string) => {
    setSelectedModelState(id);
    writeStored(id);
  }, []);

  return {
    providers,
    defaultModel,
    models,
    selectedModel: selectedModel ?? defaultModel,
    setSelectedModel,
    loading,
    error,
  };
}
