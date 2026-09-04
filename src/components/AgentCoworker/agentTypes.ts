// src/components/AgentCoworker/agentTypes.ts
//
// The Terminal/Ops tab types (PrimaryTab, ActivePanel) and the client-only
// plan/audit/timeline machinery (ExecutionPlan, DiffEntry, AuditEntry,
// APITimelineEntry, OperationIntent, ExecutionResult) were removed with the
// AURA Network Intelligence rebuild — the write path they backed
// (src/services/agentService.ts) sent every mutation to a literal `/unknown`
// URL and never actually configured anything. The real mutating pipeline is
// server/cortex/wirelessIntentParser.js -> wlanConfigValidator.js ->
// wlanProvisioningEngine.js, typed in src/types/wirelessAssistant.ts.

import type { CortexWirelessAnswer } from '@/cortex/types';

export type WorkspaceSize = 'compact' | 'standard' | 'expanded';
// pixel widths:            480         640           860

export type WorkspaceMode = 'idle' | 'open' | 'minimized' | 'pinned';

export interface AgentToolCall {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  ok: boolean;
  error?: string;
  status?: number;
  durationMs?: number;
  path?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
  reasoning?: string;
  showReasoning?: boolean;
  feedback?: 'up' | 'down' | null;
  wirelessAnswer?: CortexWirelessAnswer;
  toolCalls?: AgentToolCall[];
}

export const WORKSPACE_WIDTHS: Record<WorkspaceSize, number> = {
  compact: 480,
  standard: 640,
  expanded: 860,
};
