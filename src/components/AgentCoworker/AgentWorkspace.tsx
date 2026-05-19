import { useRef, useState, useCallback, useEffect } from 'react';
import { X, Minus, Pin, Maximize2 } from 'lucide-react';
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
 * Dev-mode AURA Copilot slideout: header (model picker + window controls)
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
        className="fixed top-0 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-9 h-screen bg-[hsl(268_22%_7%)] hover:bg-[hsl(268_22%_10%)] transition-colors group"
        onClick={onPin}
        title="Expand AURA Copilot"
      >
        <span className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-violet-400/40 to-transparent group-hover:via-violet-400/80 transition-colors" />
        <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.7)]" />
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
          'bg-[hsl(268_22%_7%)] border-l border-[hsl(268_15%_14%)]',
          'shadow-[-24px_0_64px_rgba(0,0,0,0.5),-8px_0_24px_rgba(0,0,0,0.3)]',
          'transition-transform duration-[320ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: panelWidth }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-violet-400/70 via-violet-400/15 to-transparent pointer-events-none" />

        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors z-10"
          onMouseDown={onMouseDown}
        />

        <div className="shrink-0 px-3 py-2 border-b border-white/8 flex items-center justify-between gap-2">
          <ModelSelector
            provider={provider}
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            loading={loading}
          />

          <div className="flex items-center gap-0.5">
            <button
              onClick={onMinimize}
              title="Minimize"
              className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onPin}
              title={isPinned ? 'Unpin' : 'Pin open'}
              className={cn(
                'p-1.5 rounded hover:bg-white/8 transition-colors',
                isPinned ? 'text-violet-400' : 'text-white/40 hover:text-white/70'
              )}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onSetSize(size === 'expanded' ? 'standard' : 'expanded')}
              title="Toggle expanded"
              className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1.5 rounded hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <RedQueenShell />
        </div>
      </div>
    </>
  );
}
