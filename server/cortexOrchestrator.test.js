import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CortexOrchestrator, truncateToolPayload } from './cortexOrchestrator.js';
/**
 * A local test double. The production MockLlmProvider was deleted because it
 * shipped fabricated telemetry; a stub confined to this test file carries no
 * such risk, and keeping it here makes the boundary explicit.
 */
class StubLlmProvider {
  async generateResponse({ messages }) {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    return { message: `stub reply to: ${last?.content ?? ''}` };
  }
}

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
    orchestrator = new CortexOrchestrator({ llmProvider: new StubLlmProvider() });
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

  it('processMessage forwards the per-call model override to the provider', async () => {
    const seen = [];
    const fakeProvider = {
      async generateResponse({ model }) {
        seen.push(model);
        return { message: 'ok' };
      },
    };
    const orch = new CortexOrchestrator({ llmProvider: fakeProvider, model: 'baseline-model' });
    const { sessionId } = orch.createSession(makeContext());

    await orch.processMessage(sessionId, 'hi', makeContext());
    await orch.processMessage(sessionId, 'hello', makeContext(), { model: 'override-model' });

    expect(seen).toEqual(['baseline-model', 'override-model']);
  });

  it('exposes defaultModel via getter', () => {
    const orch = new CortexOrchestrator({ llmProvider: new StubLlmProvider(), model: 'pinned' });
    expect(orch.defaultModel).toBe('pinned');
  });

  it('runs a tool-use loop: LLM requests tools, dispatcher executes, LLM synthesises', async () => {
    // First LLM turn: ask for listSites. Second LLM turn: synthesise a final answer.
    const turns = [
      {
        message: '',
        toolCalls: [{ id: 'call-1', name: 'listSites', arguments: {} }],
      },
      { message: 'I checked 2 sites; both are operational.' },
    ];
    let turnIdx = 0;
    const sentTools = [];
    const fakeProvider = {
      async generateResponse({ tools }) {
        if (tools) sentTools.push(tools.map((t) => t.name));
        return turns[turnIdx++];
      },
    };

    // Mock the controller call that the dispatcher will perform.
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ siteId: 's-1' }, { siteId: 's-2' }],
      text: async () => '[]',
      statusText: 'OK',
    }));
    // Patch globalThis.fetch for the dispatcher (which falls back to it).
    const orig = globalThis.fetch;
    globalThis.fetch = fetchFn;

    try {
      const orch = new CortexOrchestrator({ llmProvider: fakeProvider, model: 'm' });
      const { sessionId } = orch.createSession(makeContext());

      const reply = await orch.processMessage(sessionId, 'how are sites?', makeContext(), {
        authToken: 'Bearer XYZ',
        controllerUrl: 'https://ctrl.example',
      });

      expect(reply.content).toMatch(/operational/);
      expect(reply.toolCalls?.length).toBe(1);
      expect(reply.toolCalls?.[0].tool).toBe('listSites');
      expect(reply.toolCalls?.[0].ok).toBe(true);
      // The provider should have been handed the tool catalog
      expect(sentTools[0]).toContain('listSites');
      expect(fetchFn).toHaveBeenCalledWith(
        'https://ctrl.example/management/v1/state/sites',
        expect.any(Object)
      );
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('does not pass tools to the LLM when auth/controller are missing', async () => {
    const sentTools = [];
    const fakeProvider = {
      async generateResponse({ tools }) {
        sentTools.push(tools);
        return { message: 'sure' };
      },
    };
    const orch = new CortexOrchestrator({ llmProvider: fakeProvider, model: 'm' });
    const { sessionId } = orch.createSession(makeContext());
    await orch.processMessage(sessionId, 'hi', makeContext()); // no authToken/controllerUrl
    expect(sentTools[0]).toBeUndefined();
  });
});

describe('truncateToolPayload', () => {
  it('returns the payload unchanged when it fits', () => {
    const small = { a: 1, b: 'two' };
    expect(truncateToolPayload(small)).toBe(JSON.stringify(small));
  });

  it('always produces parseable JSON, even when truncating', () => {
    // The defect this replaces: JSON.stringify(x).slice(0, N) cuts at an
    // arbitrary byte, so the model received something that opened like JSON
    // and never closed.
    const big = Array.from({ length: 500 }, (_, i) => ({
      mac: `00:11:22:33:44:${i}`,
      hostname: `client-${i}-with-a-reasonably-long-name`,
      rss: -60 - (i % 30),
    }));
    const out = truncateToolPayload(big, 1000);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('truncates an array element-wise and states what was dropped', () => {
    const big = Array.from({ length: 500 }, (_, i) => ({ mac: `00:11:22:33:44:${i}`, rss: -70 }));
    const parsed = JSON.parse(truncateToolPayload(big, 1000));
    expect(parsed.__truncated__).toBe(true);
    expect(parsed.totalRows).toBe(500);
    expect(parsed.returned).toBeLessThan(500);
    expect(parsed.returned).toBe(parsed.rows.length);
    // The model must be able to say "20 of 500" rather than invent a total.
    expect(parsed.note).toMatch(/of 500 rows/);
  });

  it('withholds an oversized object rather than cutting it mid-structure', () => {
    const obj = { blob: 'x'.repeat(5000), other: 1 };
    const parsed = JSON.parse(truncateToolPayload(obj, 1000));
    expect(parsed.__truncated__).toBe(true);
    expect(parsed.keys).toContain('blob');
    expect(parsed.note).toMatch(/withheld rather than cut/);
  });

  it('handles null without throwing', () => {
    expect(truncateToolPayload(null)).toBe('null');
  });
});
