/**
 * Ultr0n API Client
 * Phase 2 stubs for backend LLM routes (/api/ultr0n/*)
 * Phase 1: minimal implementations for local demo mode
 */

import type { UltronPageContext } from '@/types/ultron';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';

/**
 * Create a new Ultr0n conversation session.
 * Phase 2: POST /api/ultr0n/session with context body.
 */
export async function createUltr0nSession(
  _context: UltronPageContext
): Promise<{ sessionId: string }> {
  // Phase 1: generate local session ID
  return { sessionId: crypto.randomUUID() };
}

/**
 * Send a message within an existing session.
 * Phase 2: POST /api/ultr0n/message
 */
export async function sendUltr0nMessage(
  _sessionId: string,
  _message: string,
  _context: UltronPageContext
): Promise<AgentMessage> {
  throw new Error(
    'ultr0nApiClient.sendUltr0nMessage: not yet implemented — use agentService in Phase 1'
  );
}

/**
 * Refresh the backend session's page context.
 * Phase 2: POST /api/ultr0n/context
 */
export async function refreshUltr0nContext(
  _sessionId: string,
  _context: UltronPageContext
): Promise<void> {
  // Phase 1: no-op
}

/**
 * Execute a named tool call within a session.
 * Phase 2: POST /api/ultr0n/tool-call
 */
export async function executeUltr0nToolCall(
  _sessionId: string,
  toolName: string,
  _args: Record<string, unknown>
): Promise<unknown> {
  throw new Error(`ultr0nApiClient.executeUltr0nToolCall: not yet implemented (tool: ${toolName})`);
}

/**
 * Generate a preview diff for a proposed config change.
 * Phase 2: POST /api/ultr0n/config/preview
 */
export async function previewUltr0nConfigChange(
  _sessionId: string,
  _changePlan: unknown
): Promise<unknown> {
  throw new Error('ultr0nApiClient.previewUltr0nConfigChange: not yet implemented');
}

/**
 * Commit an approved config change.
 * Phase 2: POST /api/ultr0n/config/commit
 * IMPORTANT: Only call after explicit human approval in the UI.
 */
export async function commitUltr0nConfigChange(
  _sessionId: string,
  _approvedChangeId: string
): Promise<unknown> {
  throw new Error('ultr0nApiClient.commitUltr0nConfigChange: not yet implemented');
}
