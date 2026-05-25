import crypto from 'crypto';
import { sanitizeCortexContext } from './cortexContextSanitizer.js';
import { createLlmProvider, createLlmProviderForModel } from './cortexLlmProvider.js';
import { discoverOllamaModels } from './cortexModelRegistry.js';
import { getToolSpecs } from './cortex/toolCatalog.js';
import { executeTool } from './cortex/toolDispatcher.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_TOOL_ROUNDS = 5;
const MAX_TOOL_CONTENT_CHARS = 3000;

const SYSTEM_PROMPT = `You are Cortex, an AI network operations copilot for Extreme Platform ONE.

You have direct access to live controller APIs through the tools provided. Investigate aggressively — chain tool calls to gather real evidence before writing a single word of your answer.

## Investigation Protocol
1. **Plan** — identify exactly which tools and arguments will answer the question.
2. **Investigate** — call tools. Chain calls when needed: listSites → getSiteHealth → listAps → getApRfStats → getAuditLogs.
3. **Cross-reference** — don't stop at one data source. If you see a problem, check related signals (audit logs, smart RF events, client events) before concluding.
4. **Synthesize** — write a structured, evidence-based answer using the format rules below.

## Answer Format Rules
- **Lead with the worst offender** — name the most critical finding first (worst site, highest-utilization AP, most affected client, most recent alarm).
- **Use markdown tables** when comparing 3 or more entities. Suggested columns: Name | Metric | Value | Status.
- **Be specific** — always include real values from the API: AP serial numbers, site names, dBm readings, percentages, client counts, timestamps.
- **Bold critical numbers** — e.g. **87% utilization**, **-82 dBm**, **14 APs offline**, **3 auth failures**.
- **End with one italicised method line** — e.g. *Investigated via: listSites → getSiteHealth × 3 → getApRfStats*
- **Never invent data.** If a tool errors or returns empty, say so explicitly rather than hedging.
- Target 150–300 words. Dense and operational beats long and verbose.
- For write/destructive actions: describe what's needed and ask for confirmation — never execute.

## Scope
The current page context is a HINT, not a constraint. Investigate beyond it whenever the question warrants.
When data is truncated (large arrays), summarise what was returned and re-call with a tighter filter.`;

function buildSystemMessage(context) {
  const sanitized = sanitizeCortexContext(context);
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

export class CortexOrchestrator {
  #sessions = new Map();
  #llmProvider;
  #model;

  constructor({ llmProvider, model } = {}) {
    const { provider, defaultModel } = llmProvider ? { provider: llmProvider, defaultModel: 'mock' } : createLlmProvider({});
    this.#llmProvider = provider;
    this.#model = model ?? process.env.CORTEX_LLM_MODEL ?? defaultModel;
  }

  // Pick the provider for the actual model the user selected. Falls back to
  // the singleton (env-configured) provider when no model id resolves.
  async #resolveProvider(modelId) {
    if (!modelId || modelId === this.#model) return { provider: this.#llmProvider, model: this.#model };
    try {
      const ollamaIds = (await discoverOllamaModels()).map((m) => m.id);
      const { provider, model } = createLlmProviderForModel(modelId, ollamaIds);
      return { provider, model };
    } catch (err) {
      console.warn(`[Cortex] per-model routing failed (${err.message}); falling back to default provider.`);
      return { provider: this.#llmProvider, model: modelId };
    }
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
    console.log(`[Cortex] Session created: ${sessionId} (page: ${context?.pageName})`);
    return { sessionId };
  }

  get defaultModel() {
    return this.#model;
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

  async processMessage(sessionId, message, context, options = {}) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    if (context?.route) {
      this.updateContext(sessionId, context);
    }
    session.lastActiveAt = new Date();

    const userMsg = { role: 'user', content: message };
    session.messages.push(userMsg);

    const { provider: activeProvider, model: modelToUse } = await this.#resolveProvider(
      options.model
    );
    const tools = options.disableTools ? undefined : getToolSpecs();
    const toolsEnabled = Boolean(tools && options.authToken && options.controllerUrl);
    const toolCallsAggregated = [];

    let finalText = '';
    let lastReasoning;
    let round = 0;

    try {
      while (round < MAX_TOOL_ROUNDS) {
        round += 1;
        const llmResponse = await activeProvider.generateResponse({
          model: modelToUse,
          messages: session.messages,
          tools: toolsEnabled ? tools : undefined,
          temperature: 0.3,
          maxTokens: 1024,
        });

        const toolCalls = llmResponse.toolCalls ?? [];

        // Always record the assistant turn so the LLM context stays consistent.
        const assistantMsg = {
          role: 'assistant',
          content: llmResponse.message ?? '',
        };
        if (toolCalls.length) {
          assistantMsg.tool_calls = toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
          }));
        }
        session.messages.push(assistantMsg);

        if (!toolsEnabled || toolCalls.length === 0) {
          finalText = llmResponse.message ?? '';
          if (toolCallsAggregated.length) {
            lastReasoning = `Investigated via ${toolCallsAggregated.length} tool call(s) across ${round} round(s)`;
          }
          break;
        }

        // Execute each requested tool in parallel
        const results = await Promise.all(
          toolCalls.map((tc) =>
            executeTool(tc.name, tc.arguments, {
              authToken: options.authToken,
              controllerUrl: options.controllerUrl,
            }).then((res) => ({ tc, res }))
          )
        );

        for (const { tc, res } of results) {
          toolCallsAggregated.push({
            id: tc.id,
            tool: tc.name,
            args: tc.arguments,
            ok: res.ok,
            error: res.ok ? undefined : res.error,
            durationMs: res.callMeta?.durationMs,
            status: res.callMeta?.status,
            path: res.callMeta?.path,
          });
          const content = res.ok
            ? JSON.stringify(res.data).slice(0, MAX_TOOL_CONTENT_CHARS)
            : JSON.stringify({ error: res.error });
          session.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content,
          });
        }
        // Loop back so the LLM can synthesize using the tool results.
      }

      if (!finalText) {
        finalText = `[Cortex] Hit the ${MAX_TOOL_ROUNDS}-round tool-use cap without producing a final answer. Tools attempted: ${toolCallsAggregated.map((t) => t.tool).join(', ')}`;
      }
    } catch (err) {
      // Roll back the user turn so a retry doesn't double-record it.
      // We keep tool turns appended for visibility but the conversation now ends
      // without a successful assistant turn.
      console.warn('[Cortex] LLM/tool loop failed:', err.message);
      finalText = `[Cortex] The AI backend hit an error: ${err.message}. Check GROK_API_KEY / GROQ_API_KEY / OPENAI_API_KEY and the controller URL.`;
    }

    return {
      id: `agent-${crypto.randomUUID()}`,
      role: 'agent',
      content: finalText,
      timestamp: new Date(),
      reasoning: lastReasoning,
      toolCalls: toolCallsAggregated.length ? toolCallsAggregated : undefined,
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
    if (pruned > 0) console.log(`[Cortex] Pruned ${pruned} expired session(s)`);
  }
}

// Singleton for use by server routes
export const cortexOrchestrator = new CortexOrchestrator();

// Prune every 30 minutes
setInterval(() => cortexOrchestrator.pruneExpiredSessions(), 30 * 60 * 1000);
