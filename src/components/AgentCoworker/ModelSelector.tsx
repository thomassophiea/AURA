import { ChevronDown, Cpu } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../ui/utils';
import type { CortexModel } from '../../hooks/useCortexModel';

interface ModelSelectorProps {
  providers: string[];
  models: CortexModel[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  loading?: boolean;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  shell: 'AURA · Engine',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq Cloud',
  grok: 'xAI Grok',
  gemini: 'Google Gemini',
  mistral: 'Mistral AI',
  cerebras: 'Cerebras',
  deepseek: 'DeepSeek',
  ollama: 'Ollama (local)',
};

const PROVIDER_ORDER = [
  'shell',
  'anthropic',
  'openai',
  'gemini',
  'groq',
  'grok',
  'cerebras',
  'mistral',
  'deepseek',
  'ollama',
];

function groupModelsByProvider(models: CortexModel[]): Array<[string, CortexModel[]]> {
  const groups = new Map<string, CortexModel[]>();
  for (const m of models) {
    const key = m.provider ?? (m.kind === 'shell' ? 'shell' : 'other');
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  const ordered: Array<[string, CortexModel[]]> = [];
  for (const key of PROVIDER_ORDER) {
    if (groups.has(key)) {
      ordered.push([key, groups.get(key)!]);
      groups.delete(key);
    }
  }
  for (const [key, list] of groups) ordered.push([key, list]);
  return ordered;
}

export function ModelSelector({
  providers,
  models,
  selectedModel,
  onSelect,
  loading = false,
}: ModelSelectorProps) {
  const current = models.find((m) => m.id === selectedModel);
  const label = current?.label ?? selectedModel ?? 'Loading…';
  const grouped = groupModelsByProvider(models);
  const titleText =
    providers.length > 0
      ? `Configured providers: ${providers.join(', ')}`
      : 'No LLM provider configured';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={loading || models.length === 0}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]',
          'bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground',
          'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          'border border-border'
        )}
        title={titleText}
        data-testid="cortex-model-selector"
      >
        <Cpu className="h-3 w-3 text-primary/80" />
        <span className="font-medium truncate max-w-[140px]">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[99999] min-w-[280px] max-h-[70vh] overflow-y-auto bg-popover border-border"
      >
        {grouped.map(([providerKey, list], idx) => (
          <div key={providerKey}>
            {idx > 0 && <DropdownMenuSeparator className="bg-border" />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {PROVIDER_DISPLAY[providerKey] ?? providerKey}
            </DropdownMenuLabel>
            {list.map((m) => {
              const isActive = m.id === selectedModel;
              return (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => onSelect(m.id)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 py-2 cursor-pointer',
                    isActive
                      ? 'bg-primary/15 text-foreground'
                      : 'text-foreground/80 hover:bg-accent/20'
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    {m.label}
                    {isActive && <span className="text-[9px] text-primary">● active</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.notes}
                    {m.contextWindow > 0 ? ` · ${m.contextWindow.toLocaleString()} ctx` : ''}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
