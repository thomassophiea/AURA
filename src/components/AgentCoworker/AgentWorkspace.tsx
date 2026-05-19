import { useRef, useState, useCallback, useEffect } from 'react';
import { X, Minus, Pin, Maximize2, Sparkles } from 'lucide-react';
import { cn } from '../ui/utils';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';
import { ModelSelector } from './ModelSelector';
import { RedQueenShell } from './panels/RedQueenShell';
import { WORKSPACE_WIDTHS } from './agentTypes';
import type { WorkspaceMode, WorkspaceSize } from './agentTypes';

interface AgentWorkspaceProps {
  mode: WorkspaceMode;
  size: WorkspaceSize;
  onClose: () => void;
  onMinimize: () => void;
  onPin: () => void;
  onDismiss: () => void;
  onSetSize: (s: WorkspaceSize) => void;
}

/**
 * Dev-mode AURA Agent slideout: header (model picker + window controls)
 * + agent body. No tabs, no chat, no approval flow.
 */
export function AgentWorkspace({
  mode,
  size,
  onClose,
  onMinimize,
  onPin,
  onDismiss,
  onSetSize,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const activeHandlersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (activeHandlersRef.current) {
        window.removeEventListener('mousemove', activeHandlersRef.current.onMove);
        window.removeEventListener('mouseup', activeHandlersRef.current.onUp);
      }
    };
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startW: dragWidth ?? WORKSPACE_WIDTHS[size],
      };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        setDragWidth(Math.max(340, Math.min(900, dragRef.current.startW + delta)));
      };
      const onUp = () => {
        dragRef.current = null;
        activeHandlersRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      activeHandlersRef.current = { onMove, onUp };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [dragWidth, size]
  );

  const panelWidth = dragWidth ?? WORKSPACE_WIDTHS[size];

  const { provider, models, selectedModel, setSelectedModel, loading } = useUltr0nModel();

  if (mode === 'minimized') {
    return (
      <button
        data-testid="agent-workspace"
        className="fixed top-0 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-9 h-screen bg-card hover:bg-accent/20 border-l border-border transition-colors group"
        onClick={onPin}
        title="Expand AURA Agent"
      >
        <span className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent group-hover:via-primary/80 transition-colors" />
        <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(137,129,229,0.7)]" />
      </button>
    );
  }

  return (
    <>
      {isVisible && !isPinned && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[99996]"
          onClick={onDismiss}
        />
      )}

      <div
        data-testid="agent-workspace"
        className={cn(
          'fixed top-0 right-0 h-screen flex flex-col z-[99997]',
          'bg-card border-l border-border',
          'shadow-[-24px_0_64px_rgba(0,0,0,0.5),-8px_0_24px_rgba(0,0,0,0.3)]',
          'transition-transform duration-[320ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: panelWidth }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/70 via-primary/15 to-transparent pointer-events-none" />

        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-primary/30 transition-colors z-10"
          onMouseDown={onMouseDown}
        />

        {/* Product header — single row: AURA identity, model selector,
            window controls. Parent and terminal both use bg-card so the
            header sits flush. */}
        <div className="shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/15 border border-primary/30 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[13px] font-semibold tracking-[0.02em] text-foreground truncate">
                  AURA
                </span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground truncate">
                  AI Console
                </span>
              </div>
              <div className="ml-1.5 pl-2.5 border-l border-border/60">
                <ModelSelector
                  provider={provider}
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={setSelectedModel}
                  loading={loading}
                />
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={onMinimize}
                title="Minimize"
                className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onPin}
                title={isPinned ? 'Unpin' : 'Pin open'}
                className={cn(
                  'p-1 rounded hover:bg-accent/30 transition-colors',
                  isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onSetSize(size === 'expanded' ? 'standard' : 'expanded')}
                title="Toggle expanded"
                className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onClose}
                title="Close"
                className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <RedQueenShell />
        </div>
      </div>
    </>
  );
}
