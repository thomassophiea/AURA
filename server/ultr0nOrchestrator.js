import crypto from 'crypto';
import { sanitizeUltr0nContext } from './ultr0nContextSanitizer.js';
import { createLlmProvider } from './ultr0nLlmProvider.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const SYSTEM_PROMPT = `You are Ultr0n, an AI network operations and configuration copilot embedded in Extreme Platform ONE.
You are page-aware. You know the current page, selected objects, filters, visible data, site context, org context, and available actions.
Your job is to:
- summarize what the user is viewing
- identify important issues
- predict likely user intent
- recommend useful next actions
- answer questions conversationally

Rules:
- Do not invent data. Only use the provided page context and conversation history.
- If data is missing, say exactly what data is missing.
- Do not commit configuration changes automatically. For write actions, explain what would need to happen and ask for confirmation.
- Keep responses concise, operational, and useful.
- Prefer specific findings over generic advice.
- When on a page, make your response relevant to that page.`;

function buildSystemMessage(context) {
  const sanitized = sanitizeUltr0nContext(context);
  const lines = [
    SYSTEM_PROMPT,
    '',
    '## Current Page Context',
    `Page: ${sanitized?.pageName ?? 'Unknown'} (${sanitized?.pageType ?? 'unknown'})`,
    `Route: ${sanitized?.route ?? ''}`,
  ];

  if (sanitized?.orgName) lines.push(`Organization: ${sanitized.orgName}`);
  if (sanitized?.siteName) lines.push(`Site: ${sanitized.siteName}`);
  if (sanitized?.userRole) lines.push(`User role: ${sanitized.userRole}`);
  if (sanitized?.timeRange?.label) lines.push(`Time range: ${sanitized.timeRange.label}`);

  if (sanitized?.selectedObject) {
    lines.push('', '## Selected Object');
    lines.push(JSON.stringify(sanitized.selectedObject, null, 2));
  }

  if (sanitized?.visibleRowsSummary) {
    const { rowCount, columns, sampleRows, aggregateStats } = sanitized.visibleRowsSummary;
    lines.push('', '## Visible Data Summary');
    lines.push(`Total rows: ${rowCount}`);
    lines.push(`Columns: ${columns.join(', ')}`);
    if (aggregateStats) lines.push(`Stats: ${JSON.stringify(aggregateStats)}`);
    if (sampleRows?.length) lines.push(`Sample rows (up to 5): ${JSON.stringify(sampleRows)}`);
  }

  if (sanitized?.availableActions?.length) {
    lines.push('', '## Available Actions');
    for (const a of sanitized.availableActions) {
      lines.push(`- ${a.label} (${a.type}${a.requiresConfirmation ? ', requires confirmation' : ''})`);
    }
  }

  return { role: 'system', content: lines.join('\n') };
}

export class Ultr0nOrchestrator {
  #sessions = new Map();
  #llmProvider;
  #model;

  constructor({ llmProvider, model } = {}) {
    const { provider, defaultModel } = llmProvider ? { provider: llmProvider, defaultModel: 'mock' } : createLlmProvider({});
    this.#llmProvider = provider;
    this.#model = model ?? process.env.ULTR0N_LLM_MODEL ?? defaultModel;
  }

  createSession(context) {
    const sessionId = crypto.randomUUID();
    const systemMsg = buildSystemMessage(context);
    this.#sessions.set(sessionId, {
      sessionId,
      context,
      messages: [systemMsg],
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });
    console.log(`[Ultr0n] Session created: ${sessionId} (page: ${context?.pageName})`);
    return { sessionId };
  }

  hasSession(sessionId) {
    return this.#sessions.has(sessionId);
  }

  getSession(sessionId) {
    return this.#sessions.get(sessionId);
  }

  updateContext(sessionId, context) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.context = context;
    session.messages[0] = buildSystemMessage(context);
    session.lastActiveAt = new Date();
  }

  async processMessage(sessionId, message, context) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    if (context?.route) {
      this.updateContext(sessionId, context);
    }
    session.lastActiveAt = new Date();

    const userMsg = { role: 'user', content: message };
    session.messages.push(userMsg);

    let llmResponse;
    try {
      llmResponse = await this.#llmProvider.generateResponse({
        model: this.#model,
        messages: session.messages,
        temperature: 0.3,
        maxTokens: 1024,
      });
    } catch (err) {
      session.messages.pop();
      console.warn('[Ultr0n] LLM call failed, returning fallback response:', err.message);
      const fallback = '[Ultr0n] The AI backend is currently unavailable. Check that GROK_API_KEY or OPENAI_API_KEY is set and valid.';
      return {
        id: `agent-${crypto.randomUUID()}`,
        role: 'agent',
        content: fallback,
        timestamp: new Date(),
      };
    }

    session.messages.push({ role: 'assistant', content: llmResponse.message });

    return {
      id: `agent-${crypto.randomUUID()}`,
      role: 'agent',
      content: llmResponse.message,
      timestamp: new Date(),
      reasoning: llmResponse.toolCalls?.length
        ? `Used ${llmResponse.toolCalls.length} tool call(s)`
        : undefined,
    };
  }

  pruneExpiredSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    let pruned = 0;
    for (const [id, session] of this.#sessions) {
      if (session.lastActiveAt.getTime() < cutoff) {
        this.#sessions.delete(id);
        pruned++;
      }
    }
    if (pruned > 0) console.log(`[Ultr0n] Pruned ${pruned} expired session(s)`);
  }
}

// Singleton for use by server routes
export const ultr0nOrchestrator = new Ultr0nOrchestrator();

// Prune every 30 minutes
setInterval(() => ultr0nOrchestrator.pruneExpiredSessions(), 30 * 60 * 1000);
