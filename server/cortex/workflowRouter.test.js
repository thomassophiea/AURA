import { describe, it, expect } from 'vitest';

import { routeUtterance } from './workflowRouter.js';

/** A workflow waiting on the questions "create a guest network" actually raises. */
function waiting(blockers, status = 'WAITING_FOR_USER') {
  return {
    id: 'wf-1',
    status,
    blockers: blockers.map((b, i) => ({
      id: `b${i}`,
      status: 'OPEN',
      candidateValues: [],
      recommendedDefault: null,
      ...b,
    })),
  };
}

const securityBlocker = {
  requiredInformation: 'security.mode',
  candidateValues: ['Open', 'WPA2/WPA3', 'Guest Portal'],
};
const siteBlocker = { requiredInformation: 'siteId', candidateValues: ['PrimarySite', 'Branch'] };

describe('no active workflow', () => {
  it('routes everything to new intent', () => {
    expect(routeUtterance('create a guest network', null).kind).toBe('new_intent');
    expect(routeUtterance('yes', null).kind).toBe('new_intent');
  });
});

describe('answering an open blocker', () => {
  it('matches a named site', () => {
    const out = routeUtterance('PrimarySite', waiting([siteBlocker]));
    expect(out.kind).toBe('answer');
    expect(out.answers[0].value).toBe('PrimarySite');
  });

  it('matches a bare site name that was never offered as a candidate', () => {
    const out = routeUtterance('Warehouse', waiting([{ requiredInformation: 'siteId' }]));
    expect(out.kind).toBe('answer');
    expect(out.answers[0].value).toBe('Warehouse');
  });

  it('understands "Portal" as a security mode', () => {
    const out = routeUtterance('Portal.', waiting([securityBlocker]));
    expect(out.kind).toBe('answer');
    expect(out.answers[0].value).toBe('portal');
  });

  it('understands WPA2 and Open', () => {
    expect(routeUtterance('wpa2', waiting([securityBlocker])).answers[0].value).toBe(
      'wpa2_personal'
    );
    expect(routeUtterance('open', waiting([securityBlocker])).answers[0].value).toBe('open');
  });

  it('picks by ordinal', () => {
    const out = routeUtterance('the first one', waiting([siteBlocker]));
    expect(out.answers[0].value).toBe('PrimarySite');
  });

  it('picks by option number', () => {
    const out = routeUtterance('option 2', waiting([siteBlocker]));
    expect(out.answers[0].value).toBe('Branch');
  });

  it('settles TWO blockers from one sentence', () => {
    // "Portal and VLAN 30." — forcing this into two turns is the form-filling
    // this feature exists to avoid.
    const out = routeUtterance(
      'Portal and VLAN 30',
      waiting([securityBlocker, { requiredInformation: 'vlanId' }])
    );
    expect(out.kind).toBe('answer');
    expect(out.answers).toHaveLength(2);
    expect(out.answers.map((a) => a.value).sort()).toEqual([30, 'portal']);
  });

  it('accepts "use the existing one" against a recommended default', () => {
    const out = routeUtterance(
      'use the existing one',
      waiting([{ requiredInformation: 'vlanId', recommendedDefault: 30 }])
    );
    expect(out.answers[0].value).toBe(30);
  });

  it('does not let a short candidate match inside a longer word', () => {
    const out = routeUtterance('PrimarySite', waiting([{ requiredInformation: 'siteId', candidateValues: ['A', 'PrimarySite'] }]));
    expect(out.answers[0].value).toBe('PrimarySite');
  });
});

describe('confirmation', () => {
  const ready = waiting([], 'WAITING_FOR_CONFIRMATION');

  it.each(['yes', 'Do it', 'deploy', 'go ahead', 'ship it', 'ok'])('treats %s as consent', (word) => {
    expect(routeUtterance(word, ready).kind).toBe('confirm');
  });

  it.each(['no', 'cancel', 'stop', 'never mind'])('treats %s as a decline', (word) => {
    expect(routeUtterance(word, ready).kind).toBe('decline');
  });

  it('does NOT treat an unrecognised sentence as consent', () => {
    // Defaulting to yes at the write gate is how an unwanted change happens.
    const out = routeUtterance('actually make it WPA3', ready);
    expect(out.kind).not.toBe('confirm');
  });
});

describe('cancelling', () => {
  it('cancels from a waiting state', () => {
    expect(routeUtterance('cancel', waiting([siteBlocker])).kind).toBe('cancel');
  });

  it('cancels even when a blocker candidate could have matched', () => {
    const out = routeUtterance('no', waiting([{ requiredInformation: 'siteId', candidateValues: ['no'] }]));
    expect(out.kind).toBe('cancel');
  });
});

describe('meta-questions keep the task alive', () => {
  it('routes "why?" to an explanation, not an answer or a restart', () => {
    const out = routeUtterance('why?', waiting([siteBlocker]));
    expect(out.kind).toBe('explain');
    expect(out.workflowId).toBe('wf-1');
  });

  it('routes "why do you need that?" the same way', () => {
    expect(routeUtterance('why do you need that?', waiting([siteBlocker])).kind).toBe('explain');
  });

  it('routes "what do you recommend?" to a recommendation', () => {
    expect(routeUtterance('what do you recommend?', waiting([securityBlocker])).kind).toBe(
      'recommend'
    );
  });

  it('routes "whatever we normally use" to a recommendation', () => {
    expect(routeUtterance('whatever we normally use', waiting([securityBlocker])).kind).toBe(
      'recommend'
    );
  });
});

describe('does not over-capture', () => {
  it('releases a genuine diagnostic question mid-workflow', () => {
    // Swallowing this as an answer to "which site?" makes Cortex look deaf.
    const out = routeUtterance('why is AP-12 offline?', waiting([siteBlocker]));
    expect(out.kind).toBe('new_intent');
  });

  it('releases "how is my network doing?"', () => {
    expect(routeUtterance('how is my network doing?', waiting([siteBlocker])).kind).toBe(
      'new_intent'
    );
  });

  it('releases a fresh create request', () => {
    expect(routeUtterance('create a WLAN called Corp', waiting([siteBlocker])).kind).toBe(
      'new_intent'
    );
  });

  it('leaves the workflow id attached so the caller can decide what to do with it', () => {
    const out = routeUtterance('why is AP-12 offline?', waiting([siteBlocker]));
    expect(out.workflowId).toBe('wf-1');
  });
});

describe('every route reports which rule fired', () => {
  it.each([
    ['PrimarySite', waiting([siteBlocker])],
    ['yes', waiting([], 'WAITING_FOR_CONFIRMATION')],
    ['why?', waiting([siteBlocker])],
    ['cancel', waiting([siteBlocker])],
    ['how is my network?', waiting([siteBlocker])],
  ])('%s', (text, workflow) => {
    expect(routeUtterance(text, workflow).rule).toBeTruthy();
  });
});
