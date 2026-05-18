import { useRef, useState, useCallback, useEffect } from 'react';
import { X, Minus, Pin, Maximize2 } from 'lucide-react';
import { cn } from '../ui/utils';
import { useUltr0nModel } from '../../hooks/useUltr0nModel';
import { useUltronContext } from '../../contexts/UltronContext';
import { ModelSelector } from './ModelSelector';
import { ConversationStream } from './panels/ConversationStream';
import { ExecutionPlanView } from './panels/ExecutionPlanView';
import { ConfigDiffView } from './panels/ConfigDiffView';
import { ApprovalControls } from './panels/ApprovalControls';
import { APITimelineView } from './panels/APITimelineView';
import { AuditHistoryView } from './panels/AuditHistoryView';
import { RedQueenShell } from './panels/RedQueenShell';
import { WORKSPACE_WIDTHS } from './agentTypes';
import type {
  WorkspaceMode,
  WorkspaceSize,
  ActivePanel,
  AgentMessage,
  ExecutionPlan,
  DiffEntry,
  AuditEntry,
  APITimelineEntry,
} from './agentTypes';

const TABS: Array<{ id: ActivePanel; label: string }> = [
  { id: 'conversation', label: 'Observe' },
  { id: 'execution', label: 'Plan' },
  { id: 'diff', label: 'Apply' },
  { id: 'audit', label: 'Audit' },
  { id: 'timeline', label: 'API' },
];

interface AgentWorkspaceProps {
  mode: WorkspaceMode;
  size: WorkspaceSize;
  activePanel: ActivePanel;
  messages: AgentMessage[];
  isThinking: boolean;
  inputValue: string;
  isListening: boolean;
  pendingPlan: ExecutionPlan | null;
  auditEntries: AuditEntry[];
  apiTimelineEntries: APITimelineEntry[];
  diff?: DiffEntry[];
  onClose: () => void;
  onMinimize: () => void;
  onPin: () => void;
  onDismiss: () => void;
  onSetSize: (s: WorkspaceSize) => void;
  onSetActivePanel: (p: ActivePanel) => void;
  onInput: (v: string) => void;
  onSubmit: () => void;
  onMicToggle: () => void;
  onFeedback: (msgId: string, f: 'up' | 'down') => void;
  onToggleReasoning: (msgId: string) => void;
  onFollowUp: (chip: string) => void;
  onConfirmWireless: (question: string, token: string) => void;
  wirelessStage?: 'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null;
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onRollback: (planId: string) => void;
  suggestedPrompts?: string[];
}

export function AgentWorkspace({
  mode,
  size,
  activePanel,
  messages,
  isThinking,
  inputValue,
  isListening,
  pendingPlan,
  auditEntries,
  apiTimelineEntries,
  diff = [],
  onClose,
  onMinimize,
  onPin,
  onDismiss,
  onSetSize,
  onSetActivePanel,
  onInput,
  onSubmit,
  onMicToggle,
  onFeedback,
  onToggleReasoning,
  onFollowUp,
  onConfirmWireless,
  wirelessStage,
  onApprove,
  onReject,
  onRollback,
  suggestedPrompts,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  // Drag-to-resize
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

  const {
    provider,
    models,
    selectedModel,
    setSelectedModel,
    loading: modelsLoading,
  } = useUltr0nModel();

  const activeModel = models.find((m) => m.id === selectedModel);
  const isShellMode = activeModel?.kind === 'shell';

  const { ultronContext } = useUltronContext();
  const headerTitle = ultronContext.pageName?.trim() || 'AURA';
  const headerChips: string[] = [];
  if (ultronContext.timeRange?.label) headerChips.push(ultronContext.timeRange.label);
  if (ultronContext.siteName) headerChips.push(ultronContext.siteName);
  const rowCount = ultronContext.visibleRowsSummary?.rowCount;
  if (typeof rowCount === 'number') {
    headerChips.push(
      rowCount >= 1000 ? `${(rowCount / 1000).toFixed(1)}k rows` : `${rowCount} rows`
    );
  }

  // Minimized tab strip — a slim violet edge with a single accent dot, no bot icon
  if (mode === 'minimized') {
    return (
      <button
        data-testid="agent-workspace"
        className="fixed top-0 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-9 h-screen bg-[hsl(268_22%_7%)] hover:bg-[hsl(268_22%_10%)] transition-colors group"
        onClick={onPin}
        title="Expand Ultr0n workspace"
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
        {/* Violet edge — the only brand mark */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-violet-400/70 via-violet-400/15 to-transparent pointer-events-none" />

        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors z-10"
          onMouseDown={onMouseDown}
        />

        {/* Header — page context as title, no Ultr0n branding */}
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/8">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)] shrink-0" />
                <h2
                  className="text-[15px] font-semibold tracking-tight text-white/95 truncate"
                  title={headerTitle}
                >
                  {headerTitle}
                </h2>
              </div>
              {headerChips.length > 0 && (
                <div className="mt-1.5 ml-3.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {headerChips.map((chip) => (
                    <span
                      key={chip}
                      className="text-[10px] uppercase tracking-[0.08em] text-white/45 font-medium"
                    >
                      <span className="text-violet-400/70 mr-1">◆</span>
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ModelSelector
                provider={provider}
                models={models}
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
                loading={modelsLoading}
              />
              <div className="w-px h-4 bg-white/10" />
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
          </div>
        </div>

        {/* Panel tabs */}
        <div role="tablist" className="shrink-0 flex border-b border-white/8 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activePanel === tab.id}
              onClick={() => onSetActivePanel(tab.id)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium transition-colors relative',
                activePanel === tab.id ? 'text-white/90' : 'text-white/40 hover:text-white/70'
              )}
            >
              {tab.label}
              {activePanel === tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-px bg-violet-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Approval controls — shown when plan needs action */}
        {pendingPlan &&
          (pendingPlan.status === 'pending' ||
            pendingPlan.status === 'executing' ||
            pendingPlan.status === 'completed') && (
            <div className="shrink-0 border-b border-white/8">
              <ApprovalControls
                plan={pendingPlan}
                onApprove={onApprove}
                onReject={onReject}
                onRollback={onRollback}
              />
            </div>
          )}

        {/* Panel content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activePanel === 'conversation' && isShellMode && <RedQueenShell />}
          {activePanel === 'conversation' && !isShellMode && (
            <ConversationStream
              messages={messages}
              isThinking={isThinking}
              inputValue={inputValue}
              isListening={isListening}
              onInput={onInput}
              onSubmit={onSubmit}
              onMicToggle={onMicToggle}
              onFeedback={onFeedback}
              onToggleReasoning={onToggleReasoning}
              onFollowUp={onFollowUp}
              onConfirmWireless={onConfirmWireless}
              wirelessStage={wirelessStage}
              suggestedPrompts={suggestedPrompts}
            />
          )}
          {activePanel === 'execution' && <ExecutionPlanView plan={pendingPlan} />}
          {activePanel === 'diff' && <ConfigDiffView diff={diff} />}
          {activePanel === 'timeline' && <APITimelineView entries={apiTimelineEntries} />}
          {activePanel === 'audit' && <AuditHistoryView entries={auditEntries} />}
        </div>
      </div>
    </>
  );
}
