/**
 * Ultr0n API Client
 * Phase 2: real fetch calls to /api/ultr0n/* backend routes.
 */

import type { UltronPageContext } from '@/types/ultron';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';
import type { UltronWirelessAnswer } from '@/ultr0n/types';

function getAuthHeader(): string {
  try {
    const token = localStorage.getItem('access_token') ?? '';
    return token ? `Bearer ${token}` : '';
  } catch {
    return '';
  }
}

async function ultr0nFetch<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthHeader() ? { Authorization: getAuthHeader() } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Ultr0n API error ${resp.status}: ${msg}`);
  }

  return resp.json() as Promise<T>;
}

/** Create a new Ultr0n conversation session on the backend. */
export async function createUltr0nSession(
  context: UltronPageContext
): Promise<{ sessionId: string }> {
  return ultr0nFetch('/api/ultr0n/session', { context });
}

/** Send a message to an existing session; returns the LLM's AgentMessage reply. */
export async function sendUltr0nMessage(
  sessionId: string,
  message: string,
  context: UltronPageContext,
  model?: string
): Promise<AgentMessage> {
  const raw = await ultr0nFetch<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    reasoning?: string;
  }>('/api/ultr0n/message', { sessionId, message, context, model });

  return { ...raw, role: 'agent', timestamp: new Date(raw.timestamp) } as AgentMessage;
}

/** Refresh the backend session's page context (no-op response). */
export async function refreshUltr0nContext(
  sessionId: string,
  context: UltronPageContext
): Promise<void> {
  await ultr0nFetch('/api/ultr0n/context', { sessionId, context });
}

/** Execute a named tool call within a session (Phase 3). */
export async function executeUltr0nToolCall(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return ultr0nFetch('/api/ultr0n/tool-call', { sessionId, toolName, args });
}

/** Generate a config change preview diff (Phase 3). */
export async function previewUltr0nConfigChange(
  sessionId: string,
  changePlan: unknown
): Promise<unknown> {
  return ultr0nFetch('/api/ultr0n/config/preview', { sessionId, changePlan });
}

/**
 * Commit an approved config change (Phase 3).
 * IMPORTANT: Only call after explicit human approval in the UI.
 */
export async function commitUltr0nConfigChange(
  sessionId: string,
  approvedChangeId: string
): Promise<unknown> {
  return ultr0nFetch('/api/ultr0n/config/commit', { sessionId, approvedChangeId });
}

/** Run the wireless query pipeline; returns null if not a wireless question. */
export async function queryUltr0nWireless(
  question: string,
  pageContext: UltronPageContext,
  confirmationToken?: string,
  model?: string
): Promise<UltronWirelessAnswer | null> {
  try {
    return await ultr0nFetch<UltronWirelessAnswer>('/api/ultr0n/wireless/query', {
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
