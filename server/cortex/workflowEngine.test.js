import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/pool.js', () => ({
  isDatabaseConfigured: () => false,
  query: async () => {
    throw new Error('no database in unit tests');
  },
}));

const store = await import('./workflowStore.js');
const {
  begin,
  advance,
  applyAnswers,
  buildPreview,
  requestConfirmation,
  grantConfirmation,
  declineConfirmation,
  execute,
  seedFromIntent,
  seedFromValidation,
  scrubForStorage,
  buildQuestion,
  handleRoutedTurn,
} = await import('./workflowEngine.js');
const { routeUtterance } = await import('./workflowRouter.js');

beforeEach(() => store.__clearMemory());

/** The Gateway the lab actually presents: one site, four APs, a guest VLAN. */
const LAB = {
  listSites: async () => [{ siteName: 'PrimarySite' }],
  listAps: async () => [
    { serialNumber: 'AP1' },
    { serialNumber: 'AP2' },
    { serialNumber: 'AP3' },
    { serialNumber: 'AP4' },
  ],
  listTopologies: async () => [{ name: 'Guest VLAN', vlanid: 30 }],
};

/** What wirelessIntentParser returns for "create a guest network". */
const PARSED_GUEST = {
  intent: { action: 'create_wlan' },
  missingFields: ['wlanName', 'siteId', 'security.mode'],
};

describe('secrets never reach the store', () => {
  it('scrubs an ephemeral password out of any nesting', () => {
    const scrubbed = scrubForStorage({
      wlanName: 'Guest',
      _ephemeralPassword: 'hunter2',
      security: { mode: 'wpa2_personal', password: 'hunter2' },
      list: [{ psk: 'hunter2' }],
    });

    expect(JSON.stringify(scrubbed)).not.toContain('hunter2');
    expect(scrubbed.wlanName).toBe('Guest');
    expect(scrubbed.security.mode).toBe('wpa2_personal');
  });

  it('keeps a passphrase out of the persisted workflow', async () => {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a wpa2 network',
      workflowType: 'create_wlan',
      requestedState: { wlanName: 'Corp', _ephemeralPassword: 'hunter2' },
    });

    const reloaded = await store.load(workflow.id);
    expect(JSON.stringify(reloaded)).not.toContain('hunter2');
  });
});

describe('begin', () => {
  it('adopts the existing workflow instead of starting a second one', async () => {
    const first = await begin({ sessionId: 's1', userIntent: 'create a guest network' });
    const second = await begin({ sessionId: 's1', userIntent: 'PrimarySite' });
    expect(second.created).toBe(false);
    expect(second.workflow.id).toBe(first.workflow.id);
  });
});

describe('advance — the ladder', () => {
  it('asks ONE question for "create a guest network" on a single-site Gateway', async () => {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);

    const { workflow: after, question } = await advance(workflow.id, { sources: LAB });

    expect(after.status).toBe('WAITING_FOR_USER');
    expect(question.decisions).toHaveLength(1);
    expect(question.decisions[0].field).toBe('security.mode');
    expect(question.style).toBe('single');
  });

  it('resolves name and site without asking', async () => {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    const { workflow: after } = await advance(workflow.id, { sources: LAB });

    expect(after.derivedState.wlanName).toBe('Guest');
    expect(after.derivedState.siteId).toBe('PrimarySite');
  });

  it('goes straight to preview when nothing is missing', async () => {
    const { workflow } = await begin({ sessionId: 's1', userIntent: 'x' });
    const { workflow: after, question } = await advance(workflow.id, { sources: LAB });
    expect(after.status).toBe('READY_FOR_PREVIEW');
    expect(question).toBeNull();
  });

  it('stops as technically blocked when a site has no APs, rather than asking', async () => {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a guest network at Empty',
      workflowType: 'create_wlan',
      requestedState: { siteName: 'Empty' },
    });
    await store.addBlocker(workflow.id, {
      type: 'AMBIGUOUS_SCOPE',
      reason: 'which APs?',
      requiredInformation: 'apScope',
      resolvableBySystem: true,
      requiresHuman: false,
    });

    const { workflow: after, deadEnds } = await advance(workflow.id, {
      sources: { ...LAB, listAps: async () => [] },
    });

    expect(after.status).toBe('BLOCKED_TECHNICALLY');
    expect(deadEnds).toHaveLength(1);
    // No human answer would help, so no question is asked.
    expect(after.warnings[0]).toMatch(/would not broadcast/);
  });

  it('groups several remaining decisions into one question', () => {
    const question = buildQuestion([
      { id: 'b1', requiredInformation: 'security.mode', reason: 'how?', candidateValues: ['a'] },
      { id: 'b2', requiredInformation: 'vlanId', reason: 'which network?', candidateValues: [] },
    ]);
    expect(question.style).toBe('grouped');
    expect(question.decisions).toHaveLength(2);
  });
});

describe('seedFromValidation', () => {
  it('turns blocked checks into blockers instead of ending the task', async () => {
    const { workflow } = await begin({ sessionId: 's1', userIntent: 'x' });
    await seedFromValidation(workflow.id, {
      checks: [
        { id: 'site_exists', result: 'block', message: 'no such site' },
        { id: 'ssid_count_limit', result: 'pass' },
      ],
    });

    const open = await store.listBlockers(workflow.id);
    expect(open).toHaveLength(1);
    expect(open[0].requiredInformation).toBe('siteId');
  });
});

describe('the confirmation gate', () => {
  async function readyWorkflow() {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await store.update(workflow.id, { status: 'READY_FOR_PREVIEW' });
    return workflow;
  }

  it('refuses to execute without confirmation', async () => {
    const workflow = await readyWorkflow();
    const provision = vi.fn();

    const result = await execute(workflow.id, { provision });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_confirmed');
    expect(provision).not.toHaveBeenCalled();
  });

  it('refuses after a decline, even though confirmation was once requested', async () => {
    const workflow = await readyWorkflow();
    await requestConfirmation(workflow.id);
    await declineConfirmation(workflow.id);

    const provision = vi.fn();
    const result = await execute(workflow.id, { provision });
    expect(provision).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('executes once confirmation is granted', async () => {
    const workflow = await readyWorkflow();
    await requestConfirmation(workflow.id);
    await grantConfirmation(workflow.id);

    const provision = vi.fn(async () => ({ status: 'completed' }));
    const result = await execute(workflow.id, { provision });

    expect(provision).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('COMPLETED');
  });

  it('does not read the passphrase back out of the store', async () => {
    const workflow = await readyWorkflow();
    await requestConfirmation(workflow.id);
    await grantConfirmation(workflow.id);

    const provision = vi.fn(async () => ({ status: 'completed' }));
    await execute(workflow.id, { provision, ephemeralPassword: 'hunter2' });

    // It arrives from the request, not from persisted state.
    expect(provision.mock.calls[0][0].ephemeralPassword).toBe('hunter2');
    expect(JSON.stringify(provision.mock.calls[0][0].requestedState)).not.toContain('hunter2');
  });
});

describe('execute — honest about what was verified', () => {
  async function confirmed() {
    const { workflow } = await begin({ sessionId: 's1', userIntent: 'x' });
    await requestConfirmation(workflow.id);
    await grantConfirmation(workflow.id);
    return workflow;
  }

  it('records a degraded provision as completed WITH WARNINGS, not completed', async () => {
    // The write landed but broadcast was never observed. Rounding that up to
    // success is how a WLAN that never went on air gets reported as done.
    const workflow = await confirmed();
    const result = await execute(workflow.id, {
      provision: async () => ({ status: 'degraded', note: 'no AP observed broadcasting' }),
    });
    expect(result.status).toBe('COMPLETED_WITH_WARNINGS');
  });

  it('records a failed provision as FAILED', async () => {
    const workflow = await confirmed();
    const result = await execute(workflow.id, { provision: async () => ({ status: 'failed' }) });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('FAILED');
  });

  it('closes the workflow when the provisioner throws', async () => {
    const workflow = await confirmed();
    const result = await execute(workflow.id, {
      provision: async () => {
        throw new Error('gateway unreachable');
      },
    });
    expect(result.reason).toBe('provision_threw');
    expect((await store.load(workflow.id)).status).toBe('FAILED');
  });
});

describe('preview provenance', () => {
  it('separates what the operator stated from what Cortex chose', async () => {
    const { workflow } = await begin({
      sessionId: 's1',
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    await advance(workflow.id, { sources: LAB });

    const preview = await buildPreview(workflow.id);
    const name = preview.fields.find((f) => f.field === 'wlanName');

    expect(name.source).toBe('default');
    expect(preview.assumptions.map((a) => a.field)).toContain('wlanName');
  });
});

describe('END TO END: create a guest network', () => {
  it('completes from three missing fields, one question and one confirmation', async () => {
    const sessionId = 'operator-1';

    // 1. "Create a guest network."
    const { workflow } = await begin({
      sessionId,
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    const first = await advance(workflow.id, { sources: LAB });

    expect(first.question.decisions).toHaveLength(1);
    expect(first.question.decisions[0].field).toBe('security.mode');

    // 2. Operator replies "Portal." — routed to the SAME task, not re-parsed.
    const active = (await store.findActive(sessionId)).workflow;
    const route = routeUtterance('Portal.', active);
    expect(route.kind).toBe('answer');

    const second = await applyAnswers(workflow.id, route.answers, { sources: LAB });
    expect(second.workflow.status).toBe('READY_FOR_PREVIEW');
    expect(second.question).toBeNull();

    // 3. Preview, with the assumption disclosed.
    const preview = await buildPreview(workflow.id);
    expect(preview.fields.find((f) => f.field === 'security.mode').value).toBe('portal');
    expect(preview.assumptions.length).toBeGreaterThan(0);

    // 4. "Deploy." — consent, then the write.
    await requestConfirmation(workflow.id);
    const confirmRoute = routeUtterance('Deploy', (await store.findActive(sessionId)).workflow);
    expect(confirmRoute.kind).toBe('confirm');
    await grantConfirmation(workflow.id);

    const provision = vi.fn(async () => ({ status: 'completed' }));
    const result = await execute(workflow.id, { provision });

    expect(result.status).toBe('COMPLETED');
    // The task is over, so the session is free for the next one.
    expect((await store.findActive(sessionId)).workflow).toBeNull();
  });

  it('survives the operator asking "why?" in the middle', async () => {
    const sessionId = 'operator-2';
    const { workflow } = await begin({
      sessionId,
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    await advance(workflow.id, { sources: LAB });

    const active = (await store.findActive(sessionId)).workflow;
    expect(routeUtterance('why?', active).kind).toBe('explain');

    // The task is untouched and still waiting on the same decision.
    const after = (await store.findActive(sessionId)).workflow;
    expect(after.status).toBe('WAITING_FOR_USER');
    expect(after.blockers.filter((b) => b.status === 'OPEN')).toHaveLength(1);
  });

  it('lets the operator cancel, freeing the session', async () => {
    const sessionId = 'operator-3';
    const { workflow } = await begin({
      sessionId,
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    await advance(workflow.id, { sources: LAB });

    const active = (await store.findActive(sessionId)).workflow;
    expect(routeUtterance('cancel', active).kind).toBe('cancel');
    await store.close(workflow.id, 'CANCELLED');

    expect((await store.findActive(sessionId)).workflow).toBeNull();
  });
});

describe('handleRoutedTurn — the continuation path', () => {
  async function waitingOnSecurity(sessionId = 's-turn') {
    const { workflow } = await begin({
      sessionId,
      userIntent: 'create a guest network',
      workflowType: 'create_wlan',
    });
    await seedFromIntent(workflow.id, PARSED_GUEST);
    await advance(workflow.id, { sources: LAB });
    return (await store.findActive(sessionId)).workflow;
  }

  it('applies an answer and moves straight to preview', async () => {
    const workflow = await waitingOnSecurity();
    const route = routeUtterance('Portal', workflow);

    const turn = await handleRoutedTurn(route, { sources: LAB });

    expect(turn.emit).toBe('preview');
    expect(turn.preview.fields.find((f) => f.field === 'security.mode').value).toBe('portal');
    // Preview implies the confirmation gate is now open.
    expect(turn.workflow.status).toBe('WAITING_FOR_CONFIRMATION');
  });

  it('explains without resolving anything', async () => {
    const workflow = await waitingOnSecurity('s-why');
    const turn = await handleRoutedTurn(routeUtterance('why?', workflow), { sources: LAB });

    expect(turn.emit).toBe('explanation');
    expect(turn.decisions[0].field).toBe('security.mode');
    // Still open: explaining a question is not answering it.
    expect(await store.listBlockers(workflow.id)).toHaveLength(1);
  });

  it('recommends, and admits when there is no defensible default', async () => {
    const workflow = await waitingOnSecurity('s-rec');
    const turn = await handleRoutedTurn(routeUtterance('what do you recommend?', workflow), {
      sources: LAB,
    });

    expect(turn.emit).toBe('recommendation');
    // Security mode is pinned to a human, so Cortex must not pretend to have
    // a recommendation for it.
    expect(turn.recommendations[0].hasDefault).toBe(false);
  });

  it('cancels the task', async () => {
    const workflow = await waitingOnSecurity('s-cancel');
    const turn = await handleRoutedTurn(routeUtterance('cancel', workflow), { sources: LAB });

    expect(turn.emit).toBe('cancelled');
    expect((await store.findActive('s-cancel')).workflow).toBeNull();
  });

  it('refuses to treat consent as valid when nothing was previewed', async () => {
    const workflow = await waitingOnSecurity('s-premature');
    // Force a confirm route against a workflow still waiting on a decision.
    const turn = await handleRoutedTurn(
      { kind: 'confirm', workflowId: workflow.id, rule: 'test' },
      { sources: LAB }
    );

    expect(turn.note).toBe('nothing_to_confirm');
    expect((await store.load(workflow.id)).confirmationState).toBe('none');
  });

  it('passes a new intent through untouched', async () => {
    const turn = await handleRoutedTurn({ kind: 'new_intent', rule: 'x' }, {});
    expect(turn.emit).toBe('passthrough');
  });
});
