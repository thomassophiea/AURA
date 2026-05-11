import { useRef, useState, useCallback } from 'react';
import { X, Minus, Pin, Maximize2 } from 'lucide-react';
import { cn } from '../ui/utils';
import { ConversationStream } from './panels/ConversationStream';
import { ExecutionPlanView } from './panels/ExecutionPlanView';
import { ConfigDiffView } from './panels/ConfigDiffView';
import { ApprovalControls } from './panels/ApprovalControls';
import { APITimelineView } from './panels/APITimelineView';
import { AuditHistoryView } from './panels/AuditHistoryView';
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
  { id: 'conversation', label: 'Conversation' },
  { id: 'execution', label: 'Plan' },
  { id: 'diff', label: 'Diff' },
  { id: 'timeline', label: 'API' },
  { id: 'audit', label: 'Audit' },
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
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onRollback: (planId: string) => void;
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
  onSetSize,
  onSetActivePanel,
  onInput,
  onSubmit,
  onMicToggle,
  onFeedback,
  onToggleReasoning,
  onApprove,
  onReject,
  onRollback,
}: AgentWorkspaceProps) {
  const isVisible = mode === 'open' || mode === 'pinned';
  const isPinned = mode === 'pinned';

  // Drag-to-resize
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

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
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [dragWidth, size]
  );

  const panelWidth = dragWidth ?? WORKSPACE_WIDTHS[size];

  // Minimized tab strip
  if (mode === 'minimized') {
    return (
      <button
        data-testid="agent-workspace"
        className="fixed top-0 right-0 z-[99997] flex flex-col items-center justify-center gap-2 w-12 h-screen bg-[hsl(268_20%_8%)] border-l border-white/10 hover:bg-[hsl(268_20%_12%)] transition-colors"
        onClick={onPin}
        title="Expand Agent Workspace"
      >
        <img
          src="/logo.svg"
          alt="Agent"
          className="h-5 w-5 opacity-70"
          style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
        />
      </button>
    );
  }

  return (
    <>
      {isVisible && !isPinned && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[99996]"
          onClick={onClose}
        />
      )}

      <div
        data-testid="agent-workspace"
        className={cn(
          'fixed top-0 right-0 h-screen flex flex-col z-[99997]',
          'bg-[hsl(268_20%_8%)] border-l border-[hsl(268_15%_16%)]',
          'shadow-[-24px_0_64px_rgba(0,0,0,0.5),-8px_0_24px_rgba(0,0,0,0.3)]',
          'transition-transform duration-[320ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-violet-500/30 transition-colors"
          onMouseDown={onMouseDown}
        />

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <img
            src="/logo.svg"
            alt="AURA"
            className="h-5 w-5 opacity-90 shrink-0"
            style={{ filter: 'hue-rotate(260deg) saturate(1.5) brightness(1.2)' }}
          />
          <span className="text-sm font-semibold text-white/90">Agent ONE</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900/60 text-violet-300 font-medium">
            Coworker
          </span>

          <div className="ml-auto flex items-center gap-1">
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

        {/* Panel tabs */}
        <div className="shrink-0 flex border-b border-white/8 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="button"
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
          {activePanel === 'conversation' && (
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
