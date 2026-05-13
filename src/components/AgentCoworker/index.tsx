import { useState, useCallback, useEffect, useRef } from 'react';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentWorkspace } from './AgentWorkspace';
import { useAgentWorkspace } from './useAgentWorkspace';
import { useUltronContext } from '../../contexts/UltronContext';
import type { AgentMessage } from './agentTypes';

interface AgentCoworkerProps {
  onShowClientDetail?: (mac: string, name?: string) => void;
  onShowAccessPointDetail?: (serial: string, name?: string) => void;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function AgentCoworker(_props: AgentCoworkerProps) {
  const ws = useAgentWorkspace();
  const ctx = useUltronContext();

  // Local UI-only overlays for feedback and reasoning toggles
  // (UltronContext owns conversation data; these are ephemeral view tweaks)
  const [feedbackOverrides, setFeedbackOverrides] = useState<
    Record<string, 'up' | 'down' | undefined>
  >({});
  const [reasoningOverrides, setReasoningOverrides] = useState<Record<string, boolean>>({});

  // Sync workspace open/close with ctx.isOpen
  const prevIsOpen = useRef<boolean>(ctx.isOpen);
  useEffect(() => {
    if (prevIsOpen.current === ctx.isOpen) return;
    prevIsOpen.current = ctx.isOpen;
    if (ctx.isOpen && ws.mode === 'idle') ws.open();
    else if (!ctx.isOpen && (ws.mode === 'open' || ws.mode === 'pinned')) ws.dismiss();
  }, [ctx.isOpen, ws]);

  // Sync workspace panel when a pendingPlan appears
  useEffect(() => {
    if (ctx.pendingPlan) {
      ws.setPendingPlan(ctx.pendingPlan.id);
      ws.setActivePanel('execution');
    } else {
      ws.setPendingPlan(null);
    }
  }, [ctx.pendingPlan, ws]);

  // ⌘K / Escape shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (ctx.isOpen) {
          ctx.closeUltr0n();
          ws.dismiss();
        } else {
          ctx.openUltr0n();
          ws.open();
        }
      }
      if (e.key === 'Escape' && ws.mode === 'open') {
        ctx.closeUltr0n();
        ws.dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ctx, ws]);

  const handleSubmit = useCallback(async () => {
    const text = ws.inputValue.trim();
    if (!text || ctx.isThinking) return;
    ws.setInput('');
    await ctx.sendMessage(text);
  }, [ws, ctx]);

  const handleApprove = useCallback(
    async (planId: string) => {
      await ctx.approvePlan(planId);
    },
    [ctx]
  );

  const handleReject = useCallback(
    (planId: string) => {
      ctx.rejectPlan(planId);
      ws.setPendingPlan(null);
    },
    [ctx, ws]
  );

  const handleRollback = useCallback(
    async (planId: string) => {
      await ctx.rollbackPlan(planId);
      ws.setPendingPlan(null);
    },
    [ctx, ws]
  );

  const handleFeedback = useCallback((msgId: string, feedback: 'up' | 'down') => {
    setFeedbackOverrides((prev) => ({ ...prev, [msgId]: feedback }));
  }, []);

  const handleToggleReasoning = useCallback((msgId: string) => {
    setReasoningOverrides((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  }, []);

  const handleMicToggle = useCallback(() => {
    if (ws.isListening) ws.stopListening();
    else ws.startListening();
  }, [ws]);

  const handleFollowUp = useCallback(
    (chip: string) => {
      ws.setInput(chip);
      void ctx.sendMessage(chip);
    },
    [ws, ctx]
  );

  const handleConfirmWireless = useCallback(
    (question: string, token: string) => {
      void ctx.confirmWirelessAction(question, token);
    },
    [ctx]
  );

  // Merge ctx.messages with ephemeral UI overlays
  const messages: AgentMessage[] = ctx.messages.map((m) => ({
    ...m,
    feedback: feedbackOverrides[m.id] ?? m.feedback,
    showReasoning: reasoningOverrides[m.id] ?? m.showReasoning,
  }));

  const diff = ctx.pendingPlan
    ? ctx.pendingPlan.impactedObjects.map((obj) => ({
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
          onOpen={() => {
            ctx.openUltr0n();
            ws.open();
          }}
          isListening={ws.isListening}
          onMicToggle={handleMicToggle}
          isThinking={ctx.isThinking}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        activePanel={ws.activePanel}
        messages={messages}
        isThinking={ctx.isThinking}
        inputValue={ws.inputValue}
        isListening={ws.isListening}
        pendingPlan={ctx.pendingPlan}
        auditEntries={ctx.auditEntries}
        apiTimelineEntries={ctx.apiTimeline}
        diff={diff}
        onClose={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onSetSize={ws.setSize}
        onSetActivePanel={ws.setActivePanel}
        onInput={ws.setInput}
        onSubmit={handleSubmit}
        onMicToggle={handleMicToggle}
        onFeedback={handleFeedback}
        onToggleReasoning={handleToggleReasoning}
        onFollowUp={handleFollowUp}
        onConfirmWireless={handleConfirmWireless}
        wirelessStage={ctx.wirelessStage}
        onApprove={handleApprove}
        onReject={handleReject}
        onRollback={handleRollback}
        suggestedPrompts={ctx.suggestedPrompts}
      />
    </>
  );
}
