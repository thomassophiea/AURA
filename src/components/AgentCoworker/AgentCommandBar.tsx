import { Sparkles } from 'lucide-react';
import { cn } from '../ui/utils';
import { ModelSelector } from './ModelSelector';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';

interface AgentCommandBarProps {
  onOpen: () => void;
  className?: string;
  driftCount?: number;
}

/**
 * Floating AURA widget: model picker + open-workspace hotkey hint.
 * No chat input, no mic, no context badge — the workspace panel owns input.
 */
export function AgentCommandBar({ onOpen, className, driftCount = 0 }: AgentCommandBarProps) {
  const { providers, models, selectedModel, setSelectedModel, loading } = useUltr0nModel();

  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]', className)}>
      <div
        className={cn(
          'relative flex items-center gap-2 h-10 px-2.5',
          'bg-card/95 backdrop-blur-md',
          'border border-border rounded-lg',
          'shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]'
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent pointer-events-none" />

        <button
          onClick={onOpen}
          className="relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
          title="Open AURA Agent"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
          <span className="font-medium">AURA</span>
          {driftCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {driftCount > 9 ? '9+' : driftCount}
            </span>
          )}
        </button>

        <div className="w-px h-5 bg-border" />

        <ModelSelector
          providers={providers}
          models={models}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
          loading={loading}
        />

        <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono text-muted-foreground bg-muted/40 border border-border">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
