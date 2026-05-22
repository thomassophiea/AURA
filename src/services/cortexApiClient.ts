/**
 * Cortex API Client
 * Phase 2: real fetch calls to /api/cortex/* backend routes.
 */

import type { CortexPageContext } from '@/types/cortex';
import type { AgentMessage, AgentToolCall } from '../components/AgentCoworker/agentTypes';
import type { CortexWirelessAnswer } from '@/cortex/types';
import { apiService, getDynamicControllerUrl } from './api';

function getAuthHeader(): string {
  const token = apiService.getAccessToken();
  return token ? `Bearer ${token}` : '';
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = getAuthHeader();
  if (auth) headers.Authorization = auth;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function cortexFetch<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Cortex API error ${resp.status}: ${msg}`);
  }

  return resp.json() as Promise<T>;
}

/** Create a new Cortex conversation session on the backend. */
export async function createCortexSession(
  context: CortexPageContext
): Promise<{ sessionId: string }> {
  return cortexFetch('/api/cortex/session', { context });
}

/** Send a message to an existing session; returns the LLM's AgentMessage reply. */
export async function sendCortexMessage(
  sessionId: string,
  message: string,
  context: CortexPageContext,
  model?: string
): Promise<AgentMessage> {
  const raw = await cortexFetch<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    reasoning?: string;
    toolCalls?: AgentToolCall[];
  }>('/api/cortex/message', { sessionId, message, context, model });

  return { ...raw, role: 'agent', timestamp: new Date(raw.timestamp) } as AgentMessage;
}

/** Refresh the backend session's page context (no-op response). */
export async function refreshCortexContext(
  sessionId: string,
  context: CortexPageContext
): Promise<void> {
  await cortexFetch('/api/cortex/context', { sessionId, context });
}

/** Execute a named tool call within a session (Phase 3). */
export async function executeCortexToolCall(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return cortexFetch('/api/cortex/tool-call', { sessionId, toolName, args });
}

/** Generate a config change preview diff (Phase 3). */
export async function previewCortexConfigChange(
  sessionId: string,
  changePlan: unknown
): Promise<unknown> {
  return cortexFetch('/api/cortex/config/preview', { sessionId, changePlan });
}

/**
 * Commit an approved config change (Phase 3).
 * IMPORTANT: Only call after explicit human approval in the UI.
 */
export async function commitCortexConfigChange(
  sessionId: string,
  approvedChangeId: string
): Promise<unknown> {
  return cortexFetch('/api/cortex/config/commit', { sessionId, approvedChangeId });
}

/** Run the wireless query pipeline; returns null if not a wireless question. */
export async function queryCortexWireless(
  question: string,
  pageContext: CortexPageContext,
  confirmationToken?: string,
  model?: string
): Promise<CortexWirelessAnswer | null> {
  try {
    return await cortexFetch<CortexWirelessAnswer>('/api/cortex/wireless/query', {
      question,
      pageContext,
      confirmationToken,
      model,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('422')) return null;
    throw err;
  }
}
