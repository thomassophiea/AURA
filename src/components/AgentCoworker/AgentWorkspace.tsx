import { useRef, useState, useCallback, useEffect } from 'react';
import {
  X,
  Minus,
  Pin,
  Maximize2,
  Terminal,
  Settings2,
  ShieldCheck,
  Activity,
  GitCompare,
  ClipboardList,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';
import { useAppContext } from '../../contexts/AppContext';
import { useUltronContext } from '../../contexts/UltronContext';
import { writeAgentContext } from '../../services/agentContextService';
import { ModelSelector } from './ModelSelector';
import { RedQueenShell } from './panels/RedQueenShell';
import { ConversationStream } from './panels/ConversationStream';
import { ValidationPanel } from './panels/ValidationPanel';
import { DriftPanel } from './panels/DriftPanel';
import type { DriftAlert } from './panels/DriftPanel';
import { ExecutionPlanView } from './panels/ExecutionPlanView';
import { ConfigDiffView } from './panels/ConfigDiffView';
import { AuditHistoryView } from './panels/AuditHistoryView';
import { APITimelineView } from './panels/APITimelineView';
import { WORKSPACE_WIDTHS } from './agentTypes';
import type { WorkspaceMode, WorkspaceSize, ActivePanel, PrimaryTab } from './agentTypes';

interface AgentWorkspaceProps {
  mode: WorkspaceMode;
  size: WorkspaceSize;
  primaryTab: PrimaryTab;
  activePanel: ActivePanel;
  onClose: () => void;
  onMinimize: () => void;
  onPin: () => void;
  onDismiss: () => void;
  onSetSize: (s: WorkspaceSize) => void;
  onSetPrimaryTab: (t: PrimaryTab) => void;
  onSetActivePanel: (p: ActivePanel) => void;
  onDriftCount?: (count: number) => void;
}

const OPS_PANELS: {
  id: ActivePanel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'conversation', label: 'Chat', icon: MessageSquare },
  { id: 'validate', label: 'Validate', icon: ShieldCheck },
  { id: 'drift', label: 'Drift', icon: Activity },
  { id: 'execution', label: 'Execution', icon: Settings2 },
  { id: 'diff', label: 'Diff', icon: GitCompare },
  { id: 'audit', label: 'Audit', icon: ClipboardList },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

export function AgentWorkspace({
  mode,
  size,
  primaryTab,
  activePanel,
  onClose,
  onMinimize,
  onPin,
  onDismiss,
  onSetSize,
  onSetPrimaryTab,
  onSetActivePanel,
  onDriftCount,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  const { siteGroup, navigationScope } = useAppContext();
  const ctx = useUltronContext();

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
  const { providers, models, selectedModel, setSelectedModel, loading } = useUltr0nModel();

  const lastDiff = [...ctx.messages].reverse().find((m) => m.diff?.length)?.diff ?? [];

  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Drift → Validate pre-fill state
  const [revalidateSsid, setRevalidateSsid] = useState<string | undefined>(undefined);
  const [revalidateVlanId, setRevalidateVlanId] = useState<number | undefined>(undefined);

  // Drift state managed centrally so the parent can show a badge and auto-switch
  const [driftAlerts, setDriftAlerts] = useState<DriftAlert[]>([]);
  const [driftLoading, setDriftLoading] = useState(false);
  const [driftError, setDriftError] = useState<string | null>(null);
  const fetchDriftAlerts = useCallback(async () => {
    setDriftLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const resp = await fetch('/api/drift', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      const alerts = data.alerts ?? [];
      setDriftAlerts(alerts);
      setDriftError(null);
      onDriftCount?.(alerts.length);
    } catch {
      setDriftError('Failed to fetch drift alerts');
    } finally {
      setDriftLoading(false);
    }
  }, [onDriftCount]);

  const clearDriftAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch('/api/drift', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await fetchDriftAlerts();
    } catch {
      // ignore
    }
  }, [fetchDriftAlerts]);

  useEffect(() => {
    fetchDriftAlerts();
    const id = setInterval(fetchDriftAlerts, 30_000);
    return () => clearInterval(id);
  }, [fetchDriftAlerts]);

  // Auto-switch to Drift panel when new alerts arrive while Ops is active
  const prevAlertCountRef = useRef(0);
  useEffect(() => {
    const prev = prevAlertCountRef.current;
    prevAlertCountRef.current = driftAlerts.length;
    if (primaryTab === 'ops' && driftAlerts.length > prev && prev === 0) {
      onSetActivePanel('drift');
    }
  }, [driftAlerts.length, primaryTab, onSetActivePanel]);

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

          {/* Primary tab bar */}
          <div className="flex border-t border-border/40" role="tablist">
            {(['terminal', 'ops'] as PrimaryTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={primaryTab === tab}
                onClick={() => onSetPrimaryTab(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors border-b-2 capitalize',
                  primaryTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === 'terminal' ? (
                  <Terminal className="h-3 w-3" />
                ) : (
                  <Settings2 className="h-3 w-3" />
                )}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'ops' && driftAlerts.length > 0 && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body — both panels stay mounted; CSS hides the inactive one so
            RedQueenShell keeps its xterm.js instance and WebSocket alive. */}
        <div className="flex-1 min-h-0 relative">
          <div
            className={cn(
              'absolute inset-0 overflow-hidden',
              primaryTab !== 'terminal' && 'hidden'
            )}
          >
            <RedQueenShell />
          </div>

          <div className={cn('absolute inset-0 flex flex-col', primaryTab !== 'ops' && 'hidden')}>
            {/* Ops secondary nav */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/40 shrink-0 overflow-x-auto">
              {OPS_PANELS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onSetActivePanel(id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors',
                    activePanel === id
                      ? 'bg-accent/40 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/20'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                  {id === 'drift' && driftAlerts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              ))}
            </div>

            {/* Ops panel content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activePanel === 'conversation' && (
                <ConversationStream
                  messages={ctx.messages}
                  isThinking={ctx.isThinking}
                  inputValue={inputValue}
                  isListening={isListening}
                  onInput={setInputValue}
                  onSubmit={() => {
                    if (inputValue.trim()) {
                      ctx.sendMessage(inputValue.trim());
                      setInputValue('');
                    }
                  }}
                  onMicToggle={() => setIsListening((l) => !l)}
                  onFeedback={ctx.addFeedback}
                  onToggleReasoning={ctx.toggleReasoning}
                  onFollowUp={(chip) => ctx.sendMessage(chip)}
                  onConfirmWireless={ctx.confirmWirelessAction}
                  wirelessStage={ctx.wirelessStage}
                  suggestedPrompts={ctx.suggestedPrompts}
                />
              )}
              {activePanel === 'validate' && (
                <ValidationPanel initialSsid={revalidateSsid} initialVlanId={revalidateVlanId} />
              )}
              {activePanel === 'drift' && (
                <DriftPanel
                  alerts={driftAlerts}
                  loading={driftLoading}
                  error={driftError}
                  onRefresh={fetchDriftAlerts}
                  onClear={clearDriftAlerts}
                  onRevalidate={() => {
                    setRevalidateSsid(undefined);
                    setRevalidateVlanId(undefined);
                    onSetActivePanel('validate');
                  }}
                />
              )}
              {activePanel === 'execution' && <ExecutionPlanView plan={ctx.pendingPlan} />}
              {activePanel === 'diff' && <ConfigDiffView diff={lastDiff} />}
              {activePanel === 'audit' && (
                <AuditHistoryView entries={ctx.auditEntries} onRollback={ctx.rollbackPlan} />
              )}
              {activePanel === 'timeline' && <APITimelineView entries={ctx.apiTimeline} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
