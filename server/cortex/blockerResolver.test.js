import { describe, it, expect } from 'vitest';

import {
  blockersFromMissingFields,
  blockerFromValidationFailure,
  resolveBlockerAutomatically,
  resolveAll,
} from './blockerResolver.js';

const blockerFor = (field) => blockersFromMissingFields([field])[0];

describe('blockersFromMissingFields', () => {
  it('turns the parser output for "create a guest network" into three blockers', () => {
    // Exactly what wirelessIntentParser emits for that sentence.
    const blockers = blockersFromMissingFields(['wlanName', 'siteId', 'security.mode']);
    expect(blockers.map((b) => b.requiredInformation)).toEqual([
      'wlanName',
      'siteId',
      'security.mode',
    ]);
  });

  it('asks a question an operator can answer, not a field name', () => {
    expect(blockerFor('vlanId').reason).toMatch(/which network/i);
    expect(blockerFor('vlanId').reason).not.toBe('vlanId');
  });

  it('pins security mode to a human and refuses to call it system-resolvable', () => {
    // A guest network that silently defaults to Open is a security incident
    // with a friendly tone of voice.
    const security = blockerFor('security.mode');
    expect(security.requiresHuman).toBe(true);
    expect(security.resolvableBySystem).toBe(false);
    expect(security.risk).toBe('high');
  });

  it('still produces a usable question for an unknown field', () => {
    const odd = blockerFor('someNewField');
    expect(odd.reason).toContain('someNewField');
    expect(odd.type).toBe('MISSING_REQUIRED_FIELD');
  });
});

describe('blockerFromValidationFailure', () => {
  it('turns a blocked site check into an answerable question', () => {
    const blocker = blockerFromValidationFailure({ id: 'site_exists', message: 'no such site' });
    expect(blocker.requiredInformation).toBe('siteId');
    expect(blocker.resolvableBySystem).toBe(true);
    expect(blocker.evidence[0].detail).toBe('no such site');
  });

  it('keeps a name conflict with the human, since only they can rename it', () => {
    const blocker = blockerFromValidationFailure({ id: 'wlan_name_conflict' });
    expect(blocker.requiresHuman).toBe(true);
  });

  it('falls back to the validator message for an unmapped check', () => {
    const blocker = blockerFromValidationFailure({ id: 'brand_new_check', message: 'nope' });
    expect(blocker.type).toBe('VALIDATION_FAILED');
    expect(blocker.reason).toBe('nope');
  });
});

describe('rung 1 — existing context', () => {
  it('uses a value the operator already gave', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('siteId'), {
      requestedState: { siteId: 'PrimarySite' },
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.resolution.value).toBe('PrimarySite');
  });

  it('inherits the site from the page the operator opened Cortex on', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('siteId'), {
      pageContext: { siteName: 'PrimarySite', pageName: 'AP Insights' },
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.resolution.note).toMatch(/AP Insights/);
  });

  it('does not ask a source when context already answered', async () => {
    let called = false;
    await resolveBlockerAutomatically(blockerFor('siteId'), {
      requestedState: { siteId: 'PrimarySite' },
      sources: {
        listSites: async () => {
          called = true;
          return [];
        },
      },
    });
    expect(called).toBe(false);
  });
});

describe('rung 2 — authoritative source', () => {
  it('resolves the site when the Gateway has exactly one', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('siteId'), {
      sources: { listSites: async () => [{ siteName: 'PrimarySite' }] },
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.resolution.value).toBe('PrimarySite');
  });

  it('offers candidates instead of guessing when several sites exist', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('siteId'), {
      sources: { listSites: async () => [{ siteName: 'A' }, { siteName: 'B' }] },
    });
    expect(out.status).not.toBe('RESOLVED');
    expect(out.candidateValues).toEqual(['A', 'B']);
    expect(out.requiresHuman).toBe(true);
  });

  it('resolves AP scope from hostSite', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('apScope'), {
      requestedState: { siteName: 'PrimarySite' },
      sources: { listAps: async () => [{ serialNumber: 'AP1' }, { serialNumber: 'AP2' }] },
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.resolution.value).toEqual(['AP1', 'AP2']);
    expect(out.resolution.note).toMatch(/2 access points/);
  });

  it('reuses an existing guest VLAN rather than inventing one', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('vlanId'), {
      requestedState: { siteName: 'PrimarySite' },
      sources: {
        listTopologies: async () => [
          { name: 'Guest VLAN', vlanid: 30 },
          { name: 'Corp', vlanid: 10 },
        ],
      },
    });
    expect(out.status).toBe('RESOLVED');
    expect(out.resolution.value).toBe(30);
  });
});

describe('a failed read is never an answer', () => {
  it('keeps the blocker open and names the failure when the Gateway errors', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('siteId'), {
      sources: {
        listSites: async () => {
          throw new Error('HTTP 500');
        },
      },
    });
    expect(out.status).not.toBe('RESOLVED');
    expect(out.type).toBe('API_UNAVAILABLE');
    expect(out.reason).toContain('HTTP 500');
  });

  it('distinguishes a genuine zero from a failed read', async () => {
    // Zero APs is a real answer the Gateway gave, and no human can type their
    // way out of it — so it is a technical dead end, not a question.
    const out = await resolveBlockerAutomatically(blockerFor('apScope'), {
      requestedState: { siteName: 'Empty' },
      sources: { listAps: async () => [] },
    });
    expect(out.technicalDeadEnd).toBe(true);
    expect(out.requiresHuman).toBe(false);
    expect(out.reason).toMatch(/would not broadcast/);
  });
});

describe('rung 3 — safe defaults', () => {
  it('defaults the name of a guest network, and stamps it as a default', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('wlanName'), {
      workflowType: 'create_wlan',
      userIntent: 'create a guest network',
    });
    expect(out.resolution.value).toBe('Guest');
    // The preview must be able to say Cortex chose this, not the operator.
    expect(out.resolution.by).toBe('default');
  });

  it('does not invent a name when the intent gives no hint', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('wlanName'), {
      workflowType: 'create_wlan',
      userIntent: 'make me a network',
    });
    expect(out.status).not.toBe('RESOLVED');
    expect(out.requiresHuman).toBe(true);
  });

  it('never defaults security even when everything else is known', async () => {
    const out = await resolveBlockerAutomatically(blockerFor('security.mode'), {
      workflowType: 'create_wlan',
      userIntent: 'create a guest network',
      requestedState: { 'security.mode': 'open' },
      sources: { listSites: async () => [{ siteName: 'PrimarySite' }] },
    });
    expect(out.status).not.toBe('RESOLVED');
    expect(out.requiresHuman).toBe(true);
  });
});

describe('resolveAll', () => {
  it('sorts the guest-network blockers into resolved, human and dead ends', async () => {
    const blockers = blockersFromMissingFields(['wlanName', 'siteId', 'security.mode']);

    const { resolved, needHuman, deadEnds } = await resolveAll(blockers, {
      workflowType: 'create_wlan',
      userIntent: 'create a guest network',
      sources: { listSites: async () => [{ siteName: 'PrimarySite' }] },
    });

    // Name defaulted, site resolved from the only site, security left to a human.
    expect(resolved.map((b) => b.requiredInformation).sort()).toEqual(['siteId', 'wlanName']);
    expect(needHuman.map((b) => b.requiredInformation)).toEqual(['security.mode']);
    expect(deadEnds).toEqual([]);
  });

  it('asks exactly one question for "create a guest network" at a single-site Gateway', async () => {
    const { needHuman } = await resolveAll(
      blockersFromMissingFields(['wlanName', 'siteId', 'security.mode']),
      {
        workflowType: 'create_wlan',
        userIntent: 'create a guest network',
        sources: { listSites: async () => [{ siteName: 'PrimarySite' }] },
      }
    );
    // The headline behaviour: three missing fields, one real decision.
    expect(needHuman).toHaveLength(1);
  });
});
