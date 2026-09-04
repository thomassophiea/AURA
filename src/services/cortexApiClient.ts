/**
 * Cortex API Client
 * Phase 2: real fetch calls to /api/cortex/* backend routes.
 */

import type { CortexPageContext } from '@/types/cortex';
import type { AgentMessage, AgentToolCall } from '../components/AgentCoworker/agentTypes';
import type { CortexWirelessAnswer } from '@/cortex/types';
import type {
  ParsedWirelessIntent,
  WirelessConfigurationIntent,
  WirelessValidationReport,
  WirelessProvisioningResult,
} from '@/types/wirelessAssistant';
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
    const raw = await resp.text().catch(() => resp.statusText);
    // Every /api/cortex/* error body is `{ error: string }` — surface that
    // plain-text message (e.g. "AURA Cortex is disabled...") rather than the
    // raw JSON blob, since this reaches the operator directly in the panel.
    // The `${resp.status}` prefix is preserved: queryCortexWireless matches
    // on the literal substring '422' in this message.
    let msg = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error === 'string') msg = parsed.error;
    } catch {
      // Not JSON — use the raw text as-is.
    }
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

/** Deterministic, non-LLM parse of a text/voice instruction into a typed intent. */
export async function parseWirelessInstruction(
  input: string,
  source: 'voice' | 'text' = 'text'
): Promise<ParsedWirelessIntent> {
  return cortexFetch('/api/cortex/wireless/intent', { input, source });
}

/** Full pre-provision validation — returns a plan hash + signed, time-limited token. */
export async function validateWirelessIntent(
  intent: WirelessConfigurationIntent,
  ephemeralPassword?: string
): Promise<WirelessValidationReport> {
  return cortexFetch('/api/cortex/wireless/validate', { intent, ephemeralPassword });
}

/**
 * Provision an approved WLAN plan. Operator-role-gated and audited server-side.
 * IMPORTANT: only call after explicit operator approval in the UI — the server
 * independently re-verifies the plan hash and token before writing anything.
 */
export async function provisionWirelessIntent(params: {
  intent: WirelessConfigurationIntent;
  planHash: string;
  validationToken: string;
  ephemeralPassword?: string;
  /** Omit to auto-resolve from the intent's site/AP scope server-side. */
  profileIds?: string[];
  approvedBy: string;
}): Promise<WirelessProvisioningResult> {
  return cortexFetch('/api/cortex/wireless/provision', params);
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
