import { useRef, useState, useCallback, useEffect } from 'react';
import { whenAutoRefresh } from '../../lib/autoRefresh';
import { X, Minus, Pin, Maximize2 } from 'lucide-react';
import { cn } from '../ui/utils';
import { useCortexModel } from '../../hooks/useCortexModel';
import { useAppContext } from '../../contexts/AppContext';
import { writeAgentContext } from '../../services/agentContextService';
import { apiService } from '../../services/api';
import { ModelSelector } from './ModelSelector';
import { WirelessAssistantPanel } from './wireless/WirelessAssistantPanel';
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
  onDriftCount?: (count: number) => void;
}

/**
 * The single AURA workflow surface — read-only investigation and WLAN
 * configuration share one panel (WirelessAssistantPanel), not separate
 * Terminal/Ops tabs. Drift alerts still drive the command-bar badge (a
 * passive signal, useful on its own) but "are there drift alerts?" is now
 * answered through the read-only investigation pipeline rather than a
 * dedicated tab.
 */
export function AgentWorkspace({
  mode,
  size,
  onClose,
  onMinimize,
  onPin,
  onDismiss,
  onSetSize,
  onDriftCount,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  const { siteGroup, navigationScope } = useAppContext();

  useEffect(() => {
    if (!isVisible) return;
    writeAgentContext({
      navigationScope,
      siteGroupName: siteGroup?.name,
      controllerUrl: siteGroup?.controller_url,
    });
  }, [isVisible, navigationScope, siteGroup]);

  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const activeHandlersRef = useRef<{
    onMove: (ev: MouseEvent) => void;
    onUp: () => void;
  } | null>(null);

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
      dragRef.current = { startX: e.clientX, startW: dragWidth ?? WORKSPACE_WIDTHS[size] };
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
  const { providers, models, selectedModel, setSelectedModel, loading } = useCortexModel();

  // Drift alerts still drive the command-bar badge — read via the read-only
  // investigation pipeline's "are there drift alerts?" path for detail.
  const fetchDriftCount = useCallback(async () => {
    try {
      const token = apiService.getAccessToken();
      const resp = await fetch('/api/drift', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      onDriftCount?.((data.alerts ?? []).length);
    } catch {
      // Badge just stays at its last known value.
    }
  }, [onDriftCount]);

  useEffect(() => {
    fetchDriftCount();
    const id = setInterval(whenAutoRefresh(fetchDriftCount), 30_000);
    return () => clearInterval(id);
  }, [fetchDriftCount]);

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

        {/* Header */}
        <div className="shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground shrink-0">
              AURA
            </span>
            <ModelSelector
              providers={providers}
              models={models}
              selectedModel={selectedModel}
              onSelect={setSelectedModel}
              loading={loading}
            />
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

        <div className="flex-1 min-h-0">
          <WirelessAssistantPanel />
        </div>
      </div>
    </>
  );
}
