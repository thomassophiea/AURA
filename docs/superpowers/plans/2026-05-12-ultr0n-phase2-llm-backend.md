# Cortex Phase 2 — LLM Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Cortex to a real LLM (OpenAI) via a pluggable backend, replacing the mock regex responses from Phase 1 for conversational queries.

**Architecture:** Three new ES-module server files (`server/cortexLlmProvider.js`, `server/cortexContextSanitizer.js`, `server/cortexOrchestrator.js`) provide the backend LLM layer. Six `/api/cortex/*` routes are added to `server.js` before the controller proxy. The frontend `cortexApiClient.ts` stubs are replaced with real `fetch` calls, and `CortexContext.tsx` switches from agentService mock responses to the LLM backend for read/conversational messages (write intents continue using local plan building via agentService).

**Tech Stack:** Node.js native `fetch` for OpenAI REST API calls (no SDK dependency), Express.js, Vitest for tests, React 19 / TypeScript 5.7 frontend.

---

## Environment Variables

Add to `.env` / Railway settings:

```
ULTR0N_LLM_PROVIDER=openai          # openai | mock (default: mock if OPENAI_API_KEY missing)
ULTR0N_LLM_MODEL=gpt-4.1            # default: gpt-4.1
OPENAI_API_KEY=sk-...               # required for openai provider
OPENAI_API_BASE=https://api.openai.com/v1  # optional override for Azure/proxies
```

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `server/cortexLlmProvider.js` | **Create** | LLM provider abstraction + OpenAI + Mock implementations |
| `server/cortexContextSanitizer.js` | **Create** | Strip secrets from CortexPageContext before sending to LLM |
| `server/cortexOrchestrator.js` | **Create** | Session store, system prompt builder, message orchestration |
| `server/cortexLlmProvider.test.js` | **Create** | Unit tests for sanitizer + Mock provider |
| `server/cortexOrchestrator.test.js` | **Create** | Unit tests for session management |
| `server.js` | **Modify** | Add 6 `/api/cortex/*` routes before the controller proxy (line ~1357) |
| `src/services/cortexApiClient.ts` | **Modify** | Replace stubs with real `fetch` calls |
| `src/contexts/CortexContext.tsx` | **Modify** | Use API client for conversational messages; keep agentService for plans |

---

## Task 1: Create `server/cortexLlmProvider.js`

**Files:**
- Create: `server/cortexLlmProvider.js`
- Test: `server/cortexLlmProvider.test.js`

- [ ] **Step 1.1: Write failing tests**

Create `server/cortexLlmProvider.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MockLlmProvider, createLlmProvider } from './cortexLlmProvider.js';

describe('MockLlmProvider', () => {
  it('returns a response with a message string', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('reflects page context in response when system message mentions a page', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [
        { role: 'system', content: 'You are on the Connected Clients page.' },
        { role: 'user', content: 'What should I look at?' },
      ],
    });
    expect(typeof result.message).toBe('string');
  });

  it('returns no toolCalls when no tools provided', async () => {
    const provider = new MockLlmProvider();
    const result = await provider.generateResponse({
      model: 'mock',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(result.toolCalls).toBeUndefined();
  });
});

describe('createLlmProvider', () => {
  it('returns MockLlmProvider when provider is "mock"', () => {
    const provider = createLlmProvider({ provider: 'mock' });
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('returns MockLlmProvider when no config provided', () => {
    const provider = createLlmProvider({});
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm failure**

```bash
npm test -- --run server/cortexLlmProvider.test.js
```

Expected: FAIL — `Cannot find module './cortexLlmProvider.js'`

- [ ] **Step 1.3: Create `server/cortexLlmProvider.js`**

```js
/**
 * Cortex LLM Provider abstraction
 * Supports OpenAI (default), Mock (dev/test), Azure stub, Anthropic stub.
 *
 * @typedef {{ role: 'system'|'user'|'assistant'|'tool', content: string, name?: string, toolCallId?: string }} LlmMessage
 * @typedef {{ name: string, description: string, parameters: Record<string,any> }} LlmToolDefinition
 * @typedef {{ message: string, toolCalls?: Array<{id:string,name:string,arguments:Record<string,any>}>, raw?: any }} LlmResponse
 */

// ── Mock Provider ────────────────────────────────────────────────────────────

export class MockLlmProvider {
  async generateResponse({ messages }) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const question = lastUser?.content?.toLowerCase() ?? '';
    const system = messages.find(m => m.role === 'system')?.content ?? '';

    // Extract page name from system prompt for context-aware mock responses
    const pageMatch = system.match(/current page:\s*([^\n.]+)/i);
    const pageName = pageMatch?.[1]?.trim() ?? 'this page';

    let message;
    if (question.includes('client') || question.includes('station')) {
      message = `[Mock Cortex] On ${pageName}: I can see client connectivity data. In a live deployment I would query the controller for real client metrics, authentication failures, and roaming events.`;
    } else if (question.includes('ap') || question.includes('access point')) {
      message = `[Mock Cortex] On ${pageName}: Access point health data would be fetched from the controller. I would report uptime, client load, and any alarms.`;
    } else if (question.includes('site')) {
      message = `[Mock Cortex] On ${pageName}: Site-level metrics would be aggregated from all APs. I would highlight any sites with degraded service levels.`;
    } else {
      message = `[Mock Cortex] On ${pageName}: I received your question. In a live deployment with OPENAI_API_KEY set, I would provide a detailed, data-driven answer using the full page context.`;
    }

    return { message };
  }
}

// ── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAiLlmProvider {
  #apiKey;
  #baseUrl;

  constructor({ apiKey, baseUrl = 'https://api.openai.com/v1' }) {
    if (!apiKey) throw new Error('OpenAiLlmProvider: apiKey is required');
    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl;
  }

  async generateResponse({ model, messages, tools, temperature = 0.3, maxTokens = 1024 }) {
    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (tools?.length) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const resp = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`OpenAI API error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('OpenAI returned no choices');

    const result = { message: choice.message?.content ?? '', raw: data };

    // Map tool calls if present
    if (choice.message?.tool_calls?.length) {
      result.toolCalls = choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }));
    }

    return result;
  }
}

// ── Azure stub ───────────────────────────────────────────────────────────────

export class AzureOpenAiLlmProvider {
  async generateResponse() {
    throw new Error('AzureOpenAiLlmProvider: not yet implemented');
  }
}

// ── Anthropic stub ───────────────────────────────────────────────────────────

export class AnthropicLlmProvider {
  async generateResponse() {
    throw new Error('AnthropicLlmProvider: not yet implemented');
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the appropriate LLM provider from environment/config.
 * Falls back to Mock if no API key is present.
 *
 * @param {{ provider?: string, apiKey?: string, baseUrl?: string }} config
 */
export function createLlmProvider(config = {}) {
  const provider = config.provider || process.env.ULTR0N_LLM_PROVIDER || 'mock';

  if (provider === 'openai') {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('[Cortex] OPENAI_API_KEY not set — falling back to MockLlmProvider');
      return new MockLlmProvider();
    }
    return new OpenAiLlmProvider({
      apiKey,
      baseUrl: config.baseUrl || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
    });
  }

  if (provider === 'azure') return new AzureOpenAiLlmProvider();
  if (provider === 'anthropic') return new AnthropicLlmProvider();

  return new MockLlmProvider();
}
```

- [ ] **Step 1.4: Run tests**

```bash
npm test -- --run server/cortexLlmProvider.test.js
```

Expected: All 4 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add server/cortexLlmProvider.js server/cortexLlmProvider.test.js
git commit -m "feat(cortex): add LLM provider abstraction (OpenAI + Mock)"
```

---

## Task 2: Create `server/cortexContextSanitizer.js`

**Files:**
- Create: `server/cortexContextSanitizer.js`
- Test: `server/cortexContextSanitizer.test.js` (added to `server/cortexLlmProvider.test.js`)

- [ ] **Step 2.1: Add sanitizer tests to existing test file**

Append to `server/cortexLlmProvider.test.js`:

```js
import { sanitizeCortexContext } from './cortexContextSanitizer.js';

describe('sanitizeCortexContext', () => {
  it('redacts top-level sensitive string fields', () => {
    const ctx = {
      route: 'configure-networks',
      pageName: 'Configure Networks',
      pageType: 'configuration',
      filters: {
        psk: 'mysecret123',
        password: 'hunter2',
        timeRange: '24h',
      },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.filters.psk).toBe('[REDACTED]');
    expect(result.filters.password).toBe('[REDACTED]');
    expect(result.filters.timeRange).toBe('24h');
  });

  it('does not mutate the original context', () => {
    const ctx = { filters: { psk: 'secret' } };
    sanitizeCortexContext(ctx);
    expect(ctx.filters.psk).toBe('secret');
  });

  it('redacts in selectedObject', () => {
    const ctx = {
      selectedObject: { name: 'SSID-Corp', psk: 'p@ssw0rd', ssid: 'Corp-WiFi' },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.selectedObject.psk).toBe('[REDACTED]');
    expect(result.selectedObject.name).toBe('SSID-Corp');
  });

  it('handles null/undefined context gracefully', () => {
    expect(sanitizeCortexContext(null)).toBeNull();
    expect(sanitizeCortexContext(undefined)).toBeUndefined();
  });

  it('truncates visibleRowsSummary sampleRows to 5', () => {
    const ctx = {
      visibleRowsSummary: {
        rowCount: 100,
        columns: ['mac', 'rssi'],
        sampleRows: Array.from({ length: 20 }, (_, i) => ({ mac: `00:${i}`, rssi: -70 })),
      },
    };
    const result = sanitizeCortexContext(ctx);
    expect(result.visibleRowsSummary.sampleRows.length).toBe(5);
    expect(result.visibleRowsSummary.rowCount).toBe(100);
  });
});
```

- [ ] **Step 2.2: Run to confirm failure**

```bash
npm test -- --run server/cortexLlmProvider.test.js
```

Expected: FAIL — `Cannot find module './cortexContextSanitizer.js'`

- [ ] **Step 2.3: Create `server/cortexContextSanitizer.js`**

```js
/**
 * Sanitizes CortexPageContext before sending to an LLM.
 * Deep-clones the context, redacts sensitive string fields,
 * and truncates large arrays to reduce token usage.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password', 'psk', 'secret', 'token', 'apiKey', 'api_key',
  'privateKey', 'private_key', 'sharedSecret', 'shared_secret',
  'radiusSecret', 'radius_secret', 'accessKey', 'access_key',
  'secretKey', 'secret_key', 'authKey', 'auth_key',
]);

function redactObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
      result[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * @param {import('../src/types/cortex.js').CortexPageContext | null | undefined} context
 * @returns {object | null | undefined}
 */
export function sanitizeCortexContext(context) {
  if (context === null || context === undefined) return context;

  const sanitized = redactObject(context);

  // Truncate sampleRows to keep LLM token usage manageable
  if (sanitized.visibleRowsSummary?.sampleRows) {
    sanitized.visibleRowsSummary.sampleRows =
      sanitized.visibleRowsSummary.sampleRows.slice(0, 5);
  }

  // Truncate selectedRows
  if (Array.isArray(sanitized.selectedRows) && sanitized.selectedRows.length > 10) {
    sanitized.selectedRows = sanitized.selectedRows.slice(0, 10);
  }

  return sanitized;
}
```

- [ ] **Step 2.4: Run tests**

```bash
npm test -- --run server/cortexLlmProvider.test.js
```

Expected: All 9 tests PASS (4 provider + 5 sanitizer).

- [ ] **Step 2.5: Commit**

```bash
git add server/cortexContextSanitizer.js
git commit -m "feat(cortex): add context sanitizer (strips secrets, truncates rows)"
```

---

## Task 3: Create `server/cortexOrchestrator.js`

**Files:**
- Create: `server/cortexOrchestrator.js`
- Test: `server/cortexOrchestrator.test.js`

- [ ] **Step 3.1: Write failing tests**

Create `server/cortexOrchestrator.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { CortexOrchestrator } from './cortexOrchestrator.js';
import { MockLlmProvider } from './cortexLlmProvider.js';

function makeContext(overrides = {}) {
  return {
    route: 'connected-clients',
    pageName: 'Connected Clients',
    pageType: 'clients',
    siteId: 'site-abc',
    siteName: 'HQ',
    userRole: 'super-user',
    timeRange: { label: '24h', start: '', end: '' },
    filters: { site: 'site-abc', timeRange: '24h' },
    ...overrides,
  };
}

describe('CortexOrchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new CortexOrchestrator({ llmProvider: new MockLlmProvider() });
  });

  it('createSession returns a sessionId string', () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('createSession stores session internally', () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    expect(orchestrator.hasSession(sessionId)).toBe(true);
  });

  it('processMessage returns an AgentMessage-shaped object', async () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    const reply = await orchestrator.processMessage(sessionId, 'How many clients?', ctx);
    expect(reply.role).toBe('agent');
    expect(typeof reply.content).toBe('string');
    expect(reply.id).toBeTruthy();
    expect(reply.timestamp instanceof Date).toBe(true);
  });

  it('processMessage appends to conversation history', async () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    await orchestrator.processMessage(sessionId, 'First message', ctx);
    await orchestrator.processMessage(sessionId, 'Second message', ctx);
    const session = orchestrator.getSession(sessionId);
    // system + user + assistant + user + assistant = 5 messages
    expect(session.messages.length).toBe(5);
  });

  it('processMessage throws for unknown sessionId', async () => {
    await expect(
      orchestrator.processMessage('bad-session-id', 'hi', makeContext())
    ).rejects.toThrow('Session not found');
  });

  it('updateContext replaces session context', () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    orchestrator.updateContext(sessionId, makeContext({ pageName: 'Access Points' }));
    const session = orchestrator.getSession(sessionId);
    expect(session.context.pageName).toBe('Access Points');
  });

  it('pruneExpiredSessions removes old sessions', () => {
    const ctx = makeContext();
    const { sessionId } = orchestrator.createSession(ctx);
    // Backdate the session
    const session = orchestrator.getSession(sessionId);
    session.lastActiveAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h ago
    orchestrator.pruneExpiredSessions();
    expect(orchestrator.hasSession(sessionId)).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run to confirm failure**

```bash
npm test -- --run server/cortexOrchestrator.test.js
```

Expected: FAIL — `Cannot find module './cortexOrchestrator.js'`

- [ ] **Step 3.3: Create `server/cortexOrchestrator.js`**

```js
import crypto from 'crypto';
import { sanitizeCortexContext } from './cortexContextSanitizer.js';
import { createLlmProvider } from './cortexLlmProvider.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const SYSTEM_PROMPT = `You are Cortex, an AI network operations and configuration copilot embedded in Extreme Platform ONE.
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
    this.#llmProvider = llmProvider ?? createLlmProvider({});
    this.#model = model ?? process.env.ULTR0N_LLM_MODEL ?? 'gpt-4.1';
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
    // Rebuild system message with updated context
    session.messages[0] = buildSystemMessage(context);
    session.lastActiveAt = new Date();
  }

  async processMessage(sessionId, message, context) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Update context if page changed
    if (context?.route && context.route !== session.context?.route) {
      this.updateContext(sessionId, context);
    }
    session.lastActiveAt = new Date();

    // Append user message
    const userMsg = { role: 'user', content: message };
    session.messages.push(userMsg);

    // Call LLM
    let llmResponse;
    try {
      llmResponse = await this.#llmProvider.generateResponse({
        model: this.#model,
        messages: session.messages,
        temperature: 0.3,
        maxTokens: 1024,
      });
    } catch (err) {
      // Remove failed user message to keep history consistent
      session.messages.pop();
      throw err;
    }

    // Append assistant message to history
    session.messages.push({ role: 'assistant', content: llmResponse.message });

    // Build AgentMessage response
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
    if (pruned > 0) console.log(`[Cortex] Pruned ${pruned} expired session(s)`);
  }
}

// Singleton for use by server routes
export const cortexOrchestrator = new CortexOrchestrator();

// Prune every 30 minutes
setInterval(() => cortexOrchestrator.pruneExpiredSessions(), 30 * 60 * 1000);
```

- [ ] **Step 3.4: Run tests**

```bash
npm test -- --run server/cortexOrchestrator.test.js
```

Expected: All 7 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add server/cortexOrchestrator.js server/cortexOrchestrator.test.js
git commit -m "feat(cortex): add Cortex orchestrator with session management"
```

---

## Task 4: Add `/api/cortex/*` Routes to `server.js`

**Files:**
- Modify: `server.js` (insert before line ~1357, the `/api` proxy middleware)

- [ ] **Step 4.1: Add orchestrator import at top of server.js**

Find the top import block in server.js (starts with `import express from 'express'`). Add the orchestrator import after the last existing import in that group (around line 8):

```js
import { cortexOrchestrator } from './server/cortexOrchestrator.js';
```

- [ ] **Step 4.2: Add Cortex rate limiter**

After the `const jsonParser = express.json();` line (line ~198), add:

```js
// Cortex LLM endpoints — rate limited separately (LLM calls are expensive)
const cortexRateLimit = rateLimit({ windowMs: 60_000, max: 30 });
```

- [ ] **Step 4.3: Add the 6 routes**

Find this comment in server.js:
```js
// Proxy all /api/* requests to Campus Controller (with dynamic routing support)
```

Insert the following block IMMEDIATELY BEFORE that line:

```js
// ==================== Cortex AI Copilot Routes ====================
// These must appear before the /api proxy middleware so they are
// handled server-side rather than forwarded to the controller.

app.post('/api/cortex/session', requireAuth, cortexRateLimit, jsonParser, (req, res) => {
  try {
    const context = req.body?.context ?? {};
    const result = cortexOrchestrator.createSession(context);
    res.json(result);
  } catch (err) {
    console.error('[Cortex] createSession error:', err.message);
    res.status(500).json({ error: 'Failed to create Cortex session' });
  }
});

app.post('/api/cortex/message', requireAuth, cortexRateLimit, jsonParser, async (req, res) => {
  try {
    const { sessionId, message, context } = req.body ?? {};
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }
    if (!cortexOrchestrator.hasSession(sessionId)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    const reply = await cortexOrchestrator.processMessage(sessionId, message, context ?? {});
    res.json(reply);
  } catch (err) {
    console.error('[Cortex] processMessage error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to process message' });
  }
});

app.post('/api/cortex/context', requireAuth, jsonParser, (req, res) => {
  try {
    const { sessionId, context } = req.body ?? {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!cortexOrchestrator.hasSession(sessionId)) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    cortexOrchestrator.updateContext(sessionId, context ?? {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[Cortex] updateContext error:', err.message);
    res.status(500).json({ error: 'Failed to update context' });
  }
});

app.post('/api/cortex/tool-call', requireAuth, jsonParser, (_req, res) => {
  res.status(501).json({ error: 'Tool calling not yet implemented (Phase 3)' });
});

app.post('/api/cortex/config/preview', requireAuth, jsonParser, (_req, res) => {
  res.status(501).json({ error: 'Config preview not yet implemented (Phase 3)' });
});

app.post('/api/cortex/config/commit', requireAuth, jsonParser, (_req, res) => {
  res.status(501).json({ error: 'Config commit not yet implemented (Phase 3)' });
});
// ==================== End Cortex Routes ====================
```

- [ ] **Step 4.4: Test the server starts without errors**

```bash
node --input-type=module <<'EOF'
import('./server.js').then(() => {
  console.log('[TEST] Server import OK');
  process.exit(0);
}).catch(e => {
  console.error('[TEST] Server import FAILED:', e.message);
  process.exit(1);
});
EOF
```

Expected: Server starts, logs `[Proxy Server] Starting...` and `[TEST] Server import OK`. Ctrl+C to stop.

- [ ] **Step 4.5: Commit**

```bash
git add server.js
git commit -m "feat(cortex): add /api/cortex/* routes to Express server"
```

---

## Task 5: Update `src/services/cortexApiClient.ts`

**Files:**
- Modify: `src/services/cortexApiClient.ts`

Replace all stub bodies with real `fetch` calls. The apiService token is in localStorage as `access_token` — read it via the same pattern used elsewhere in the codebase.

- [ ] **Step 5.1: Read current file**

Verify current content of `src/services/cortexApiClient.ts` matches the Phase 1 stubs before editing.

- [ ] **Step 5.2: Replace with real implementation**

Overwrite `src/services/cortexApiClient.ts` with:

```ts
/**
 * Cortex API Client
 * Phase 2: real fetch calls to /api/cortex/* backend routes.
 */

import type { CortexPageContext } from '@/types/cortex';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';

function getAuthHeader(): string {
  try {
    const token = localStorage.getItem('access_token') ?? '';
    return token ? `Bearer ${token}` : '';
  } catch {
    return '';
  }
}

async function cortexFetch<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
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
  context: CortexPageContext
): Promise<AgentMessage> {
  const raw = await cortexFetch<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
    reasoning?: string;
  }>('/api/cortex/message', { sessionId, message, context });

  // Coerce timestamp string to Date
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
```

- [ ] **Step 5.3: Type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 5.4: Commit**

```bash
git add src/services/cortexApiClient.ts
git commit -m "feat(cortex): wire cortexApiClient to real backend endpoints"
```

---

## Task 6: Update `src/contexts/CortexContext.tsx` — Hybrid sendMessage

**Files:**
- Modify: `src/contexts/CortexContext.tsx`

Change `sendMessage` to use a hybrid approach:
- Write intents (detected by `agentService.parseIntent`) → local plan building (Phase 1 behavior)
- Read/conversational intents → LLM backend via `sendCortexMessage`

Also update `sessionId` to start as `null` (backend assigns it on first message) and reset to `null` on `clearConversation`.

- [ ] **Step 6.1: Add sessionIdRef and import API client**

Find the imports block in `CortexContext.tsx`. Add:

```ts
import { createCortexSession, sendCortexMessage } from '../services/cortexApiClient';
import { agentService } from '../services/agentService';
```

(agentService import may already exist from Phase 1 — confirm before adding.)

- [ ] **Step 6.2: Change sessionId initial state**

Find the `useState` that initializes `sessionId`. Change:

```ts
// Before (Phase 1):
const [sessionId, setSessionId] = useState<string | null>(
  typeof crypto !== 'undefined' ? crypto.randomUUID() : null
);
```

To:

```ts
// Phase 2: null until first backend session is created
const [sessionId, setSessionId] = useState<string | null>(null);
```

- [ ] **Step 6.3: Add sessionIdRef**

After the `sessionId` useState, add a ref for stale-closure safety:

```ts
const sessionIdRef = useRef<string | null>(null);
useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
```

- [ ] **Step 6.4: Replace sendMessage**

Find the `sendMessage` useCallback in CortexContext.tsx. Replace its body with:

```ts
const sendMessage = useCallback(async (message: string) => {
  // Add user message immediately for responsive UI
  const userMsg: AgentMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: message,
    timestamp: new Date(),
  };
  setMessages(prev => [...prev, userMsg]);
  setIsThinking(true);

  try {
    // Check for write intent — use local plan building (Phase 1 path)
    const intent = await agentService.parseIntent(message);

    if (intent) {
      const plan = await agentService.buildExecutionPlan(intent);
      const agentMsg: AgentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: `I've built an execution plan for: **${plan.title}**\n\nThis will affect ${plan.impactedObjects.map(o => o.name).join(', ')}. Review the plan and approve to proceed.`,
        timestamp: new Date(),
        executionPlan: plan,
        reasoning: `Detected write intent: "${intent.action}" targeting ${intent.targetType}. Built ${plan.steps.length}-step plan.`,
      };
      setMessages(prev => [...prev, agentMsg]);
      setPendingPlan(plan);
      return;
    }

    // Conversational/read: use LLM backend
    let sid = sessionIdRef.current;
    if (!sid) {
      const { sessionId: newId } = await createCortexSession(cortexContextRef.current);
      sid = newId;
      setSessionId(newId);
      sessionIdRef.current = newId;
    }

    const reply = await sendCortexMessage(sid, message, cortexContextRef.current);
    setMessages(prev => [...prev, reply]);
  } catch (err) {
    const errorMsg: AgentMessage = {
      id: `agent-${Date.now()}`,
      role: 'agent',
      content: 'Unable to get a response. Please check your connection and try again.',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, errorMsg]);
  } finally {
    setIsThinking(false);
  }
}, []); // stable — reads via refs
```

- [ ] **Step 6.5: Update clearConversation to reset sessionId to null**

Find `clearConversation` in the context. Change the `setSessionId(...)` line:

```ts
// Before (Phase 1):
setSessionId(typeof crypto !== 'undefined' ? crypto.randomUUID() : null);

// After (Phase 2):
setSessionId(null);
sessionIdRef.current = null;
```

Also call `agentService.clearHistory()` (it may already be there — keep it).

- [ ] **Step 6.6: Type-check and lint**

```bash
npm run type-check && npm run lint
```

Expected: 0 errors.

- [ ] **Step 6.7: Run full test suite**

```bash
npm test -- --run
```

Expected: 1861+ tests pass (new orchestrator + provider tests), 1 pre-existing VersionDisplay failure.

- [ ] **Step 6.8: Commit**

```bash
git add src/contexts/CortexContext.tsx
git commit -m "feat(cortex): wire sendMessage to LLM backend, keep local plan building"
```

---

## Verification

### Manual end-to-end test

1. Start dev server: `npm run dev`
2. Set `ULTR0N_LLM_PROVIDER=mock` (default) — no API key needed
3. Open app, press ⌘K to open Cortex
4. Type: `"How many clients are connected?"` → should get a Mock Cortex response (not the old regex response)
5. Type: `"disable AP AP-HQ-001"` → should show an execution plan (local plan building still works)
6. Switch page to Access Points → suggestedPrompts should change to device-specific prompts
7. Check browser Network tab: `/api/cortex/session` and `/api/cortex/message` should be called for #4

### With real OpenAI:

```bash
ULTR0N_LLM_PROVIDER=openai OPENAI_API_KEY=sk-... npm run dev
```

Repeat step 4 above — response should be a real GPT-4.1 answer with page context.

### Automated tests:

```bash
npm test -- --run server/cortexLlmProvider.test.js server/cortexOrchestrator.test.js
```

Expected: 16 tests pass.

---

## Phase 3 Preview (not in this plan)

- Context enrichment: orchestrator calls real controller APIs to enrich context before LLM
- Tool calling: 17 tool definitions wired to controller API calls
- Config change flow: preview → human approval → commit endpoint
- Phase 3 stubs (`/api/cortex/tool-call`, `/api/cortex/config/preview`, `/api/cortex/config/commit`) already exist in server.js from Task 4
