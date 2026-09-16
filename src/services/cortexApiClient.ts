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
  /**
   * The runtime's structural summary of what came back (`digestToolResult`).
   * Numbers and verdicts only — never network-sourced text — which is why the
   * UI can render from it directly. `keyReadings` is what the readings strip
   * uses, so a measurement reaches the operator even when the prose omits it.
   */
  digest?: {
    keyReadings?: {
      rss?: number | null;
      snr?: number | null;
      rfqi?: number | null;
      downlinkLossRatio?: number | null;
      wirelessRttMs?: number | null;
      networkRttMs?: number | null;
      dnsRttMs?: number | null;
      hasIpv4?: boolean | null;
    };
    [key: string]: unknown;
  };
}

/** What the tools were actually filtered to. */
export interface CortexScope {
  level: 'entity' | 'site' | 'fleet';
  siteNames: string[] | null;
  reason: string;
  source: string;
}

/** Who is affected, measured — not parsed out of the prose. */
export interface CortexImpact {
  affected: number;
  total: number | null;
  unit: string;
  basis: string;
}

/**
 * The runtime's own verdict on the investigation.
 *
 * Rendered in preference to anything the answer text claims: confidence here is
 * computed from the evidence ledger, so a fluent paragraph cannot outrank the
 * calls that produced it.
 */
export interface CortexAssessment {
  confidence: string | null;
  primaryDomain: string | null;
  impact: CortexImpact | null;
  plumbingChecked: boolean;
  plumbingClean: boolean | null;
  independentSources: string[];
  failedReads: string[];
  capabilityGapsHit: string[];
  standard: Record<string, { answered: boolean; reason?: string; detail?: string; value?: unknown }>;
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
  assessment?: CortexAssessment | null;
  scope?: CortexScope;
}

/**
 * Cortex needs one thing from the operator before it can answer.
 *
 * Emitted BEFORE any provider call, so a clarification costs nothing. It only
 * ever fires when guessing would mislead — an ambiguous site name, or a page
 * scope that matches no telemetry and would otherwise filter to an empty
 * result that reads like good news.
 */
export interface CortexClarification {
  question: string;
  originalQuestion: string;
  candidates: Array<{ label: string; value: string }>;
  allOption: { label: string; value: string };
  unresolved: string[];
}

/** One decision Cortex still needs before it can act. */
export interface CortexDecision {
  blockerId: string;
  field: string | null;
  /** The question as an operator reads it, not a field name. */
  ask: string;
  options: (string | number)[];
  recommended: string | number | null;
  /** The evidence behind the options, so the ask can be argued with. */
  why: string[];
}

/** A field in the plan, with who decided it. */
export interface CortexPlanField {
  field: string;
  value: unknown;
  /** 'stated' by the operator, 'system' looked up, 'default' chosen by Cortex. */
  source: 'stated' | 'system' | 'default';
  note: string | null;
}

/**
 * A turn in a configuration task.
 *
 * `emit` says what the operator should be shown: a grouped question, the plan
 * to confirm, an explanation that changed nothing, a recommendation, a
 * technical dead end, or the task closing.
 */
export interface CortexWorkflowEvent {
  rule: string;
  emit:
    | 'question'
    | 'preview'
    | 'explanation'
    | 'recommendation'
    | 'confirmed'
    | 'cancelled'
    | 'blocked'
    | 'passthrough'
    | 'error';
  workflow?: { id: string; status: string; workflowType: string };
  question?: { decisions: CortexDecision[]; style: 'single' | 'grouped' } | null;
  preview?: {
    workflowId: string;
    intent: string;
    fields: CortexPlanField[];
    /** Anything Cortex chose rather than the operator — theirs to veto. */
    assumptions: CortexPlanField[];
    warnings: string[];
  } | null;
  decisions?: Pick<CortexDecision, 'field' | 'ask' | 'why'>[];
  recommendations?: {
    field: string | null;
    recommended: string | number | null;
    options: (string | number)[];
    why: string[];
    hasDefault: boolean;
  }[];
  deadEnds?: { reason: string }[];
  /**
   * False when the task is held only in memory. It will not survive a restart,
   * and the operator is about to be asked to confirm a network change.
   */
  durable?: boolean;
}

export interface CortexInvestigationHandlers {
  /** A human-readable step, e.g. "Looking up client…" — never a function name. */
  onActivity?: (label: string, tool: string) => void;
  onAnswer?: (text: string) => void;
  onEvidence?: (evidence: CortexEvidence) => void;
  onClarify?: (clarification: CortexClarification) => void;
  /** A configuration task started, advanced, or closed. */
  onWorkflow?: (event: CortexWorkflowEvent) => void;
  onError?: (message: string, recoverable: boolean) => void;
}

/**
 * Say what happened when the failure did not come from Cortex.
 *
 * The raw body is kept as a parenthetical rather than dropped — it is the only
 * clue to which hop failed, and hiding it makes the next report unfalsifiable.
 * It is trimmed hard because an intermediary may answer with a whole HTML
 * error page.
 */
export function describeInfrastructureFailure(status: number, raw: string): string {
  const detail = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const suffix = detail ? ` (${detail})` : '';

  if (status === 502 || status === 503 || status === 504) {
    return (
      'Cortex did not answer in time and the connection was closed before the ' +
      `investigation could report anything. Nothing was changed on the Gateway.${suffix}`
    );
  }
  if (status === 413) return `That question was too large to send.${suffix}`;
  if (status === 429) return `Too many questions at once — wait a moment and ask again.${suffix}`;
  return `Cortex could not be reached (HTTP ${status}).${suffix}`;
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
    redQueen = false,
    priorIterations = 0,
    scopeOverride,
    ...handlers
  }: CortexInvestigationHandlers & {
    scope?: Record<string, string | undefined>;
    history?: Array<{ role: string; content: string }>;
    model?: string;
    signal?: AbortSignal;
    /** Adversarial review of the diagnosis already on screen. */
    redQueen?: boolean;
    /**
     * The operator's answer to a clarification. Sent when they pick a site
     * chip; it SKIPS scope resolution entirely, so the same question cannot
     * come back asking again.
     */
    scopeOverride?: { siteNames?: string[]; level?: 'fleet' };
    /**
     * How many iterations the PREVIOUS investigation in this conversation
     * burned. The server escalates to the deep tier when a prior pass used most
     * of its budget without converging — evidence that the question is hard,
     * rather than the operator merely saying so.
     */
    priorIterations?: number;
  } = {}
): Promise<void> {
  const resp = await fetch('/api/cortex/investigate', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      question,
      scope,
      history,
      model,
      redQueen,
      priorIterations,
      scopeOverride,
    }),
    signal,
  });

  if (!resp.ok) {
    // A non-2xx here is USUALLY a setup or authorisation problem (Cortex
    // disabled, no Gateway selected, no provider configured) and the body
    // carries a message written for a person. Surface that verbatim rather than
    // a status code.
    //
    // But the response does not always come from our server. When the edge
    // proxy gives up on the upstream it answers the browser itself, and its
    // body is written for whoever operates the proxy — "upstream error", two
    // words, which an operator asking about a site read as Cortex's answer.
    // Anything that is not our `{error}` shape is infrastructure talking, and
    // the honest thing to say is what actually happened.
    const raw = await resp.text().catch(() => resp.statusText);
    let message = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.error === 'string') message = parsed.error;
    } catch {
      /* not JSON — see below */
    }
    if (!message) {
      message = describeInfrastructureFailure(resp.status, raw);
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
    else if (event === 'clarify') handlers.onClarify?.(payload as CortexClarification);
    else if (event === 'workflow') handlers.onWorkflow?.(payload as CortexWorkflowEvent);
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
