import { Cpu } from 'lucide-react';
import { cn } from '../ui/utils';
import type { CortexModel } from '../../hooks/useCortexModel';

interface ModelSelectorProps {
  providers: string[];
  models: CortexModel[];
  selectedModel: string;
  /** Unused — kept so callers don't need to change; there is no picker to select from anymore. */
  onSelect?: (modelId: string) => void;
  loading?: boolean;
}

/**
 * A plain indicator of the active model — not a picker. The multi-provider,
 * multi-model dropdown (shell "Red Queen" entry + every configured Groq
 * model) was real clutter for what this panel is actually for right now;
 * model choice is a server/admin-level concern (CORTEX_LLM_PROVIDER /
 * CORTEX_LLM_MODEL), not something the operator needs to pick per message.
 */
export function ModelSelector({ models, selectedModel, loading = false }: ModelSelectorProps) {
  const current = models.find((m) => m.id === selectedModel);
  const label = current?.label ?? (loading ? 'Loading…' : models.length === 0 ? 'Unavailable' : selectedModel);

  return (
    <span
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]',
        'bg-muted/30 text-muted-foreground border border-border'
      )}
      title={label}
      data-testid="cortex-model-selector"
    >
      <Cpu className="h-3 w-3 text-primary/80" />
      <span className="font-medium truncate max-w-[140px]">{label}</span>
    </span>
  );
}
