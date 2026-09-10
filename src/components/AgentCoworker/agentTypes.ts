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
import type { CortexEvidence } from '@/services/cortexApiClient';

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
  /**
   * What the investigation agent ACTUALLY retrieved to produce this answer,
   * plus its self-audit. Carried on the message so the operator can inspect the
   * evidence behind a diagnosis rather than taking it on trust — and so a claim
   * the ledger does not support is visible instead of hidden.
   */
  cortexEvidence?: CortexEvidence;
  /** The human-readable steps taken, in order, for the activity trail. */
  cortexActivity?: string[];
}

export const WORKSPACE_WIDTHS: Record<WorkspaceSize, number> = {
  compact: 480,
  standard: 640,
  expanded: 860,
};
