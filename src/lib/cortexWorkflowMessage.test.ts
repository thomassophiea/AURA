import { describe, it, expect } from 'vitest';

import { renderWorkflowMessage } from './cortexWorkflowMessage';
import type { CortexWorkflowEvent } from '../services/cortexApiClient';

const base = { rule: 'test' } as const;

describe('a question', () => {
  it('asks one decision as a sentence, with the options', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'question',
      question: {
        style: 'single',
        decisions: [
          {
            blockerId: 'b1',
            field: 'security.mode',
            ask: 'How should clients connect to this network?',
            options: ['Open', 'WPA2/WPA3', 'Guest Portal'],
            recommended: null,
            why: [],
          },
        ],
      },
    } as CortexWorkflowEvent);

    expect(body).toContain('One decision first');
    expect(body).toContain('How should clients connect');
    expect(body).toContain('Guest Portal');
  });

  it('counts the decisions when there are several', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'question',
      question: {
        style: 'grouped',
        decisions: [
          { blockerId: 'b1', field: 'siteId', ask: 'Which site?', options: [], recommended: null, why: [] },
          { blockerId: 'b2', field: 'security.mode', ask: 'How?', options: [], recommended: null, why: [] },
        ],
      },
    } as CortexWorkflowEvent);

    expect(body).toContain('2 decisions');
  });

  it('warns when the task is only in memory', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'question',
      durable: false,
      question: {
        style: 'single',
        decisions: [
          { blockerId: 'b1', field: 'siteId', ask: 'Which site?', options: [], recommended: null, why: [] },
        ],
      },
    } as CortexWorkflowEvent);

    expect(body).toMatch(/will not survive a restart/);
  });
});

describe('a preview', () => {
  const preview = {
    ...base,
    emit: 'preview' as const,
    preview: {
      workflowId: 'w1',
      intent: 'create a guest network',
      fields: [
        { field: 'wlanName', value: 'Guest', source: 'default' as const, note: null },
        { field: 'siteId', value: 'PrimarySite', source: 'system' as const, note: null },
        { field: 'security.mode', value: 'portal', source: 'stated' as const, note: null },
        // Noise the operator never asked to see.
        { field: 'rawInstruction', value: 'create a guest network', source: 'stated' as const, note: null },
      ],
      assumptions: [{ field: 'wlanName', value: 'Guest', source: 'default' as const, note: null }],
      warnings: [],
    },
  };

  it('labels fields in words, not field names', () => {
    const body = renderWorkflowMessage(preview as CortexWorkflowEvent)!;
    expect(body).toContain('Network name: Guest');
    expect(body).toContain('Security: portal');
    expect(body).not.toContain('wlanName:');
  });

  it('says out loud what Cortex chose rather than the operator', () => {
    const body = renderWorkflowMessage(preview as CortexWorkflowEvent)!;
    expect(body).toContain('(I chose this)');
    expect(body).toMatch(/I filled in Network name for you/);
  });

  it('drops plumbing the operator never asked to see', () => {
    expect(renderWorkflowMessage(preview as CortexWorkflowEvent)).not.toContain('rawInstruction');
  });

  it('tells the operator how to proceed', () => {
    expect(renderWorkflowMessage(preview as CortexWorkflowEvent)).toMatch(/deploy/i);
  });
});

describe('a recommendation', () => {
  it('refuses to pick when there is no defensible default', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'recommendation',
      recommendations: [
        {
          field: 'security.mode',
          recommended: null,
          options: ['Open', 'Guest Portal'],
          why: [],
          hasDefault: false,
        },
      ],
    } as CortexWorkflowEvent)!;

    expect(body).toMatch(/yours to decide/);
    expect(body).toMatch(/won't pick for you/);
  });

  it('recommends where it legitimately can', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'recommendation',
      recommendations: [
        {
          field: 'vlanId',
          recommended: 30,
          options: [],
          why: ['GUEST_2026 is already used for guest traffic here'],
          hasDefault: true,
        },
      ],
    } as CortexWorkflowEvent)!;

    expect(body).toContain('30');
    expect(body).toContain('GUEST_2026');
  });
});

describe('a dead end', () => {
  it('says it is not the operator’s to fix', () => {
    const body = renderWorkflowMessage({
      ...base,
      emit: 'blocked',
      deadEnds: [{ reason: 'No access points report Empty as their site.' }],
    } as CortexWorkflowEvent)!;

    expect(body).toContain('No access points report Empty');
    expect(body).toMatch(/isn't something you can answer/);
  });
});

describe('closing states', () => {
  it('confirms', () => {
    expect(renderWorkflowMessage({ ...base, emit: 'confirmed' } as CortexWorkflowEvent)).toMatch(
      /applying the change/i
    );
  });

  it('cancels, and says nothing changed', () => {
    const body = renderWorkflowMessage({ ...base, emit: 'cancelled' } as CortexWorkflowEvent)!;
    expect(body).toMatch(/nothing was changed/i);
  });

  it('renders nothing for a passthrough', () => {
    expect(renderWorkflowMessage({ ...base, emit: 'passthrough' } as CortexWorkflowEvent)).toBeNull();
  });
});
