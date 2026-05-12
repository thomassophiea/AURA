import { describe, it, expect, beforeEach } from 'vitest';
import { Ultr0nOrchestrator } from './ultr0nOrchestrator.js';
import { MockLlmProvider } from './ultr0nLlmProvider.js';

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

describe('Ultr0nOrchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new Ultr0nOrchestrator({ llmProvider: new MockLlmProvider() });
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
