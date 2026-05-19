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
import type { Ultr0nModel } from '../../hooks/useUltr0nModel';

interface ModelSelectorProps {
  provider: string;
  models: Ultr0nModel[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  loading?: boolean;
}

export function ModelSelector({
  provider,
  models,
  selectedModel,
  onSelect,
  loading = false,
}: ModelSelectorProps) {
  const current = models.find((m) => m.id === selectedModel);
  const label = current?.label ?? selectedModel ?? 'Loading…';

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
        title={`Model (provider: ${provider})`}
        data-testid="ultr0n-model-selector"
      >
        <Cpu className="h-3 w-3 text-primary/80" />
        <span className="font-medium truncate max-w-[140px]">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[99999] min-w-[260px] bg-popover border-border"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          AURA · Engine
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {models.map((m) => {
          const isActive = m.id === selectedModel;
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => onSelect(m.id)}
              className={cn(
                'flex flex-col items-start gap-0.5 py-2 cursor-pointer',
                isActive ? 'bg-primary/15 text-foreground' : 'text-foreground/80 hover:bg-accent/20'
              )}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                {m.label}
                {isActive && <span className="text-[9px] text-primary">● active</span>}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {m.notes} · {m.contextWindow.toLocaleString()} ctx
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
