// src/components/AgentCoworker/agentTypes.ts

import type { CortexWirelessAnswer } from '@/cortex/types';

export type WorkspaceSize = 'compact' | 'standard' | 'expanded';
// pixel widths:            400         520           720

export type WorkspaceMode = 'idle' | 'open' | 'minimized' | 'pinned';

export type PrimaryTab = 'terminal' | 'ops';

export type ActivePanel =
  | 'conversation'
  | 'execution'
  | 'diff'
  | 'audit'
  | 'timeline'
  | 'validate'
  | 'drift';

export type PlanStatus =
  | 'building'
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'rolledback'
  | 'failed';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

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
  executionPlan?: ExecutionPlan;
  diff?: DiffEntry[];
  feedback?: 'up' | 'down' | null;
  wirelessAnswer?: CortexWirelessAnswer;
  toolCalls?: AgentToolCall[];
}

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  status: PlanStatus;
  steps: PlanStep[];
  impactedObjects: ImpactedObject[];
  createdAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
}

export interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  apiEndpoint?: string;
  duration?: number;
}

export interface DiffEntry {
  field: string;
  scope: string;
  before: unknown;
  after: unknown;
}

export interface ImpactedObject {
  type: 'site' | 'ap' | 'ssid' | 'policy' | 'vlan';
  id: string;
  name: string;
  count?: number;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  operator: string;
  planId: string;
  status: 'completed' | 'failed' | 'rejected' | 'rolledback';
  impactedObjects: ImpactedObject[];
}

export interface APITimelineEntry {
  id: string;
  timestamp: Date;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  status: number;
  duration: number;
  planStepId?: string;
}

export interface OperationIntent {
  action: string;
  targetType: ImpactedObject['type'];
  targetIds: string[];
  parameters: Record<string, unknown>;
  requiresApproval: true;
}

export interface ExecutionResult {
  planId: string;
  success: boolean;
  completedSteps: number;
  failedStep?: string;
  error?: string;
}

export const WORKSPACE_WIDTHS: Record<WorkspaceSize, number> = {
  compact: 480,
  standard: 640,
  expanded: 860,
};
