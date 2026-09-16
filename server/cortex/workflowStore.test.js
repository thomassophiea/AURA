import { describe, it, expect, beforeEach, vi } from 'vitest';

// No database in unit tests. The store must degrade to memory rather than fail,
// and the degraded path is the one a dev box actually runs, so it is the path
// worth testing here. The db path is exercised against Integration.
vi.mock('../db/pool.js', () => ({
  isDatabaseConfigured: () => false,
  query: async () => {
    throw new Error('no database in unit tests');
  },
}));

const {
  claimActive,
  findActive,
  load,
  update,
  addBlocker,
  listBlockers,
  resolveBlocker,
  close,
  __clearMemory,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  BLOCKER_TYPE,
} = await import('./workflowStore.js');

beforeEach(() => __clearMemory());

describe('claimActive', () => {
  it('creates a workflow for a new session', async () => {
    const { workflow, created } = await claimActive({
      sessionId: 's1',
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });

    expect(created).toBe(true);
    expect(workflow.status).toBe('PLANNING');
    expect(workflow.userIntent).toBe('create a guest network');
    expect(workflow.workflowType).toBe('create_wlan');
  });

  it('returns the SAME workflow on a second utterance rather than starting over', async () => {
    // This is the whole point of the feature: a reply is a continuation.
    const first = await claimActive({ sessionId: 's1', userIntent: 'create a guest network' });
    const second = await claimActive({ sessionId: 's1', userIntent: 'PrimarySite' });

    expect(second.created).toBe(false);
    expect(second.workflow.id).toBe(first.workflow.id);
    // The original intent survives; it is not overwritten by the reply.
    expect(second.workflow.userIntent).toBe('create a guest network');
  });

  it('keeps different sessions apart', async () => {
    const a = await claimActive({ sessionId: 's1', userIntent: 'one' });
    const b = await claimActive({ sessionId: 's2', userIntent: 'two' });
    expect(a.workflow.id).not.toBe(b.workflow.id);
  });

  it('starts a fresh workflow once the previous one is terminal', async () => {
    const first = await claimActive({ sessionId: 's1', userIntent: 'first task' });
    await close(first.workflow.id, 'COMPLETED');

    const second = await claimActive({ sessionId: 's1', userIntent: 'second task' });
    expect(second.created).toBe(true);
    expect(second.workflow.id).not.toBe(first.workflow.id);
  });

  it('reports the store so a memory-only workflow can be disclosed', async () => {
    const { store } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    expect(store).toBe('memory');
  });

  it('refuses to work without a session id', async () => {
    await expect(claimActive({ userIntent: 'x' })).rejects.toThrow(/sessionId/);
  });
});

describe('findActive', () => {
  it('finds nothing for an unknown session', async () => {
    expect((await findActive('nobody')).workflow).toBeNull();
  });

  it('does not return a cancelled workflow', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    await close(workflow.id, 'CANCELLED');
    expect((await findActive('s1')).workflow).toBeNull();
  });
});

describe('update', () => {
  it('persists resolved fields across a reload', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });

    await update(workflow.id, {
      status: 'WAITING_FOR_USER',
      requestedState: { wlanName: 'Guest' },
      derivedState: { vlanId: 30 },
    });

    const reloaded = await load(workflow.id);
    expect(reloaded.status).toBe('WAITING_FOR_USER');
    expect(reloaded.requestedState).toEqual({ wlanName: 'Guest' });
    expect(reloaded.derivedState).toEqual({ vlanId: 30 });
  });

  it('ignores fields that are not writable', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'original' });
    await update(workflow.id, { userIntent: 'tampered', sessionId: 'other' });

    const reloaded = await load(workflow.id);
    expect(reloaded.userIntent).toBe('original');
    expect(reloaded.sessionId).toBe('s1');
  });

  it('returns null for an unknown workflow', async () => {
    expect(await update('00000000-0000-0000-0000-000000000000', { status: 'FAILED' })).toBeNull();
  });
});

describe('blockers', () => {
  it('records a blocker and lists it as open', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });

    await addBlocker(workflow.id, {
      type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
      reason: 'How should guests connect?',
      requiredInformation: 'security.mode',
      candidateValues: ['open', 'wpa2', 'portal'],
      requiresHuman: true,
    });

    const open = await listBlockers(workflow.id);
    expect(open).toHaveLength(1);
    expect(open[0].requiredInformation).toBe('security.mode');
    expect(open[0].candidateValues).toEqual(['open', 'wpa2', 'portal']);
  });

  it('drops a resolved blocker out of the open list', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    const blocker = await addBlocker(workflow.id, {
      type: BLOCKER_TYPE.MISSING_REQUIRED_FIELD,
      reason: 'which site?',
    });

    await resolveBlocker(blocker.id, { value: 'PrimarySite', by: 'human' });

    expect(await listBlockers(workflow.id)).toHaveLength(0);
    const all = await listBlockers(workflow.id, { includeResolved: true });
    expect(all[0].status).toBe('RESOLVED');
  });

  it('records WHO resolved it, because assumed and chosen are different facts', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    const assumed = await addBlocker(workflow.id, { type: 'MISSING_REQUIRED_FIELD', reason: 'a' });
    const chosen = await addBlocker(workflow.id, { type: 'MISSING_REQUIRED_FIELD', reason: 'b' });

    await resolveBlocker(assumed.id, { value: 'Guest', by: 'default' });
    await resolveBlocker(chosen.id, { value: 'portal', by: 'human' });

    const all = await listBlockers(workflow.id, { includeResolved: true });
    expect(all.find((b) => b.id === assumed.id).resolution.by).toBe('default');
    expect(all.find((b) => b.id === chosen.id).resolution.by).toBe('human');
  });

  it('defaults a blocker to requiring a human', async () => {
    // Safer default: an unclassified blocker must not silently auto-resolve.
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    const blocker = await addBlocker(workflow.id, { type: 'UNKNOWN_NETWORK_STATE', reason: 'x' });
    expect(blocker.requiresHuman).toBe(true);
    expect(blocker.resolvableBySystem).toBe(false);
  });
});

describe('close', () => {
  it('refuses a non-terminal status', async () => {
    const { workflow } = await claimActive({ sessionId: 's1', userIntent: 'x' });
    await expect(close(workflow.id, 'PLANNING')).rejects.toThrow(/terminal/);
  });

  it('has no status in both the active and terminal lists', () => {
    const overlap = ACTIVE_STATUSES.filter((s) => TERMINAL_STATUSES.includes(s));
    expect(overlap).toEqual([]);
  });
});
