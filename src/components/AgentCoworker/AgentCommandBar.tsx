import { cn } from '../ui/utils';
import { ModelSelector } from './ModelSelector';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';

interface AgentCommandBarProps {
  onOpen: () => void;
  className?: string;
}

/**
 * Floating Red-Queen widget: model picker + open-workspace hotkey hint.
 * No chat input, no mic, no context badge — the workspace panel owns input.
 */
export function AgentCommandBar({ onOpen, className }: AgentCommandBarProps) {
  const { provider, models, selectedModel, setSelectedModel, loading } = useUltr0nModel();

  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]', className)}>
      <div
        className={cn(
          'relative flex items-center gap-2 h-10 px-2.5',
          'bg-[hsl(268_22%_7%/0.92)] backdrop-blur-md',
          'border border-white/8 rounded-lg',
          'shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]'
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent pointer-events-none" />

        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-white/70 hover:text-white/95 hover:bg-white/8 transition-colors"
          title="Open Red-Queen"
        >
          <img
            src="/red-queen-icon.webp"
            alt=""
            className="h-4 w-4 object-contain drop-shadow-[0_0_4px_rgba(239,68,68,0.35)]"
          />
          <span className="font-medium">Red-Queen</span>
        </button>

        <div className="w-px h-5 bg-white/10" />

        <ModelSelector
          provider={provider}
          models={models}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
          loading={loading}
        />

        <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono text-white/40 bg-white/5 border border-white/8">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
