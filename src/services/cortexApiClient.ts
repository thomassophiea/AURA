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

// ============================================================================
// Aura Cortex — streamed, evidence-backed investigation
// ============================================================================

export interface CortexLedgerEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  basis: string | null;
  durationMs?: number;
  untrustedFieldCount?: number;
  suspiciousFields?: number;
}

export interface CortexEvidence {
  ledger: CortexLedgerEntry[];
  iterations: number;
  toolCalls: number;
  stoppedBecause: string;
  warnings: string[];
  /** Claims the answer made that the evidence ledger does not support. */
  audit: Array<{ severity: string; detail: string }>;
  capabilityGaps: number;
  model: string;
}

export interface CortexInvestigationHandlers {
  /** A human-readable step, e.g. "Looking up client…" — never a function name. */
  onActivity?: (label: string, tool: string) => void;
  onAnswer?: (text: string) => void;
  onEvidence?: (evidence: CortexEvidence) => void;
  onError?: (message: string, recoverable: boolean) => void;
}

/**
 * Run a Cortex investigation, consuming the server's SSE stream.
 *
 * Uses fetch + a ReadableStream reader rather than EventSource: EventSource
 * cannot issue a POST and cannot set the Authorization / X-Controller-URL
 * headers this endpoint needs to read the Gateway as the calling user.
 *
 * `signal` lets the UI's stop button abort a running investigation.
 */
export async function investigateWithCortex(
  question: string,
  {
    scope = {},
    history = [],
    model,
    signal,
    ...handlers
  }: CortexInvestigationHandlers & {
    scope?: Record<string, string | undefined>;
    history?: Array<{ role: string; content: string }>;
    model?: string;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const resp = await fetch('/api/cortex/investigate', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ question, scope, history, model }),
    signal,
  });

  if (!resp.ok) {
    // A non-2xx here is a setup or authorisation problem (Cortex disabled, no
    // Gateway selected, no provider configured) and the body carries a message
    // written for a person. Surface it verbatim rather than a status code.
    const raw = await resp.text().catch(() => resp.statusText);
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error === 'string') message = parsed.error;
    } catch {
      /* not JSON */
    }
    handlers.onError?.(message, resp.status < 500);
    return;
  }

  if (!resp.body) {
    handlers.onError?.('Cortex returned no response stream.', true);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (rawEvent: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (!dataLines.length) return;
    let payload: any;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return; // a partial frame; the buffer logic below prevents this normally
    }
    if (event === 'activity') handlers.onActivity?.(payload.label, payload.tool);
    else if (event === 'answer') handlers.onAnswer?.(payload.text);
    else if (event === 'evidence') handlers.onEvidence?.(payload as CortexEvidence);
    else if (event === 'error') handlers.onError?.(payload.message, Boolean(payload.recoverable));
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Anything after the last
      // separator is an incomplete frame and must stay buffered.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        dispatch(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) dispatch(buffer);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return; // operator pressed stop
    handlers.onError?.(
      `The connection to Cortex was interrupted: ${(err as Error).message}`,
      true
    );
  } finally {
    reader.releaseLock?.();
  }
}
