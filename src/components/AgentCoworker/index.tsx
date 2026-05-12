import { useState, useCallback, useEffect } from 'react';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentWorkspace } from './AgentWorkspace';
import { useAgentWorkspace } from './useAgentWorkspace';
import { agentService } from '../../services/agentService';
import type { AgentMessage, ExecutionPlan, AssistantUIContext } from './agentTypes';

interface AgentCoworkerProps {
  isOpen?: boolean;
  onToggle?: () => void;
  context?: AssistantUIContext;
  onShowClientDetail?: (mac: string, name?: string) => void;
  onShowAccessPointDetail?: (serial: string, name?: string) => void;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function AgentCoworker({ isOpen, onToggle, context }: AgentCoworkerProps) {
  const ws = useAgentWorkspace();
  const [messages, setMessages] = useState<AgentMessage[]>(() => agentService.getMessages());
  const [isThinking, setIsThinking] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<ExecutionPlan | null>(null);
  const [auditEntries, setAuditEntries] = useState(() => agentService.getAuditHistory());
  const [apiTimeline, setApiTimeline] = useState(() => agentService.getAPITimeline());

  // Sync external isOpen prop with workspace state
  useEffect(() => {
    if (isOpen !== undefined) {
      if (isOpen && ws.mode === 'idle') ws.open();
      else if (!isOpen && ws.mode === 'open') ws.dismiss();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘K / Escape shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (ws.mode === 'idle' || ws.mode === 'minimized') {
          ws.open();
          onToggle?.();
        } else {
          ws.dismiss();
          onToggle?.();
        }
      }
      if (e.key === 'Escape' && ws.mode === 'open') {
        ws.dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ws, onToggle]);

  const handleSubmit = useCallback(async () => {
    const text = ws.inputValue.trim();
    if (!text || isThinking) return;
    ws.setInput('');
    setIsThinking(true);
    try {
      const reply = await agentService.sendMessage(text, context);
      setMessages(agentService.getMessages());
      if (reply.executionPlan) {
        setPendingPlan(reply.executionPlan);
        ws.setPendingPlan(reply.executionPlan.id);
        ws.setActivePanel('execution');
      }
    } finally {
      setIsThinking(false);
    }
  }, [ws, isThinking, context]);

  const handleApprove = useCallback(async (planId: string) => {
    try {
      await agentService.executeApprovedPlan(planId);
      setAuditEntries(agentService.getAuditHistory());
      setApiTimeline(agentService.getAPITimeline());
      setPendingPlan((prev) => (prev?.id === planId ? { ...prev, status: 'completed' } : prev));
    } catch {
      setPendingPlan((prev) => (prev?.id === planId ? { ...prev, status: 'failed' } : prev));
    }
  }, []);

  const handleReject = useCallback(
    (planId: string) => {
      agentService.rejectPlan(planId);
      setPendingPlan((prev) => (prev?.id === planId ? { ...prev, status: 'rejected' } : prev));
      setAuditEntries(agentService.getAuditHistory());
      ws.setPendingPlan(null);
    },
    [ws]
  );

  const handleRollback = useCallback(
    async (planId: string) => {
      await agentService.rollbackOperation(planId);
      setPendingPlan((prev) => (prev?.id === planId ? { ...prev, status: 'rolledback' } : prev));
      setAuditEntries(agentService.getAuditHistory());
      ws.setPendingPlan(null);
    },
    [ws]
  );

  const handleFeedback = useCallback((msgId: string, feedback: 'up' | 'down') => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback } : m)));
  }, []);

  const handleToggleReasoning = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, showReasoning: !m.showReasoning } : m))
    );
  }, []);

  const handleMicToggle = useCallback(() => {
    if (ws.isListening) ws.stopListening();
    else ws.startListening();
  }, [ws]);

  const diff = pendingPlan
    ? pendingPlan.impactedObjects.map((obj) => ({
        field: 'enabled',
        scope: `${obj.type}: ${obj.name}`,
        before: true,
        after: false,
      }))
    : [];

  return (
    <>
      {ws.mode === 'idle' && (
        <AgentCommandBar
          value={ws.inputValue}
          onChange={ws.setInput}
          onSubmit={handleSubmit}
          onOpen={ws.open}
          isListening={ws.isListening}
          onMicToggle={handleMicToggle}
          isThinking={isThinking}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        activePanel={ws.activePanel}
        messages={messages}
        isThinking={isThinking}
        inputValue={ws.inputValue}
        isListening={ws.isListening}
        pendingPlan={pendingPlan}
        auditEntries={auditEntries}
        apiTimelineEntries={apiTimeline}
        diff={diff}
        onClose={ws.dismiss}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={ws.dismiss}
        onSetSize={ws.setSize}
        onSetActivePanel={ws.setActivePanel}
        onInput={ws.setInput}
        onSubmit={handleSubmit}
        onMicToggle={handleMicToggle}
        onFeedback={handleFeedback}
        onToggleReasoning={handleToggleReasoning}
        onApprove={handleApprove}
        onReject={handleReject}
        onRollback={handleRollback}
      />
    </>
  );
}
