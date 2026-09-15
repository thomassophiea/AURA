/**
 * The evidence-graph wiring inside the investigation loop.
 *
 * The property these protect: confidence and impact reported to the operator
 * are computed by the RUNTIME from the ledger, and a model cannot inflate them
 * by writing a confident paragraph.
 */
import { describe, it, expect } from 'vitest';
import { runInvestigation, buildSystemPrompt } from './investigationAgent.js';
import { CONFIDENCE } from './evidenceGraph.js';

const capabilities = { unusableKeys: () => ['ap.reboot_reason'] };

/**
 * A provider that calls the named tools on its first turn and then answers.
 * Records every request so the transcript can be inspected.
 */
function toolCallingProvider(toolPlan) {
  const calls = [];
  let turn = 0;
  return {
    calls,
    async generateResponse(params) {
      calls.push(params);
      turn += 1;
      if (turn === 1) {
        return {
          message: '',
          toolCalls: toolPlan.map((name, i) => ({
            id: `call-${i}`,
            name,
            arguments: {},
          })),
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        };
      }
      return {
        message: 'Twelve of 47 people at AURA_LAB have a weak signal.',
        usage: { prompt_tokens: 120, completion_tokens: 30 },
      };
    },
  };
}

const tool = (payload, risk = 'read') => ({
  risk,
  spec: { name: 'x', description: 'a diagnostic tool for testing purposes only', parameters: { type: 'object', properties: {} } },
  handler: async () => payload,
});

const PLUMBING_CLEAN = {
  basis: 'observed',
  dhcp: { associatedClients: 47, withoutIpv4: 0, share: 0 },
  dns: { clientsMeasured: 40, p50Ms: 11 },
  vlan: { danglingTopologies: [] },
};

const RF_FINDING = {
  basis: 'observed',
  findings: [{ severity: 'critical', taxonomy: 'Coverage / Weak Signal', summary: 'weak', evidence: '-88 dBm' }],
};

function tools(map) {
  const out = {};
  for (const [name, payload] of Object.entries(map)) {
    out[name] = {
      risk: 'read',
      spec: {
        name,
        description: `a diagnostic tool named ${name} used only in tests`,
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => payload,
    };
  }
  return out;
}

describe('the ledger carries a digest', () => {
  it('records findings structurally, without the free text', async () => {
    const provider = toolCallingProvider(['diagnoseClient']);
    const result = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ diagnoseClient: RF_FINDING }),
      capabilities,
      question: 'why is this client unhappy?',
    });
    const entry = result.ledger.find((l) => l.tool === 'diagnoseClient');
    expect(entry.digest.findings).toEqual([
      { severity: 'critical', taxonomy: 'Coverage / Weak Signal', domain: 'rf' },
    ]);
    expect(JSON.stringify(entry.digest)).not.toMatch(/-88 dBm/);
  });

  it('marks a scope mismatch as a FAILED read, not a successful empty one', async () => {
    // Otherwise an unmatched site name counts as evidence and the confidence
    // ladder treats "nothing came back" as "nothing is wrong".
    const provider = toolCallingProvider(['getSiteOverview']);
    const result = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({
        getSiteOverview: { basis: 'unknown', status: 'scope_matched_nothing', reason: 'no match' },
      }),
      capabilities,
      question: 'any problems at Beta?',
    });
    expect(result.ledger[0].ok).toBe(false);
    expect(result.evidence.failedReads).toContain('getSiteOverview');
  });
});

describe('the runtime tells the model what it concluded', () => {
  it('appends the computed assessment to the last tool result', async () => {
    const provider = toolCallingProvider(['checkBackendServices', 'diagnoseClient']);
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ checkBackendServices: PLUMBING_CLEAN, diagnoseClient: RF_FINDING }),
      capabilities,
      question: 'why is this client unhappy?',
    });
    // Second provider turn sees the tool results plus the assessment.
    const second = provider.calls[1];
    const toolMessages = second.messages.filter((m) => m.role === 'tool');
    const withAssessment = toolMessages.filter((m) => m.content.includes('__runtime_assessment__'));
    expect(withAssessment).toHaveLength(1);
    expect(withAssessment[0].content).toMatch(/COMPUTED CONFIDENCE/);
    expect(withAssessment[0].content).toMatch(/do not raise it/i);
  });

  it('leaves the cached system prefix untouched between turns', async () => {
    // Rewriting the system prompt each turn would miss the prompt cache on the
    // largest part of every request.
    const provider = toolCallingProvider(['checkBackendServices']);
    await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ checkBackendServices: PLUMBING_CLEAN }),
      capabilities,
      question: 'is the plumbing ok?',
    });
    const systemOf = (call) => call.messages.find((m) => m.role === 'system').content;
    expect(systemOf(provider.calls[0])).toBe(systemOf(provider.calls[1]));
  });
});

describe('the returned evidence is the runtime\'s verdict', () => {
  it('computes confidence from what was retrieved', async () => {
    const provider = toolCallingProvider(['checkBackendServices', 'diagnoseClient']);
    const result = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ checkBackendServices: PLUMBING_CLEAN, diagnoseClient: RF_FINDING }),
      capabilities,
      question: 'why is this client unhappy?',
    });
    expect(result.evidence.plumbingChecked).toBe(true);
    expect(result.evidence.plumbingClean).toBe(true);
    expect(result.evidence.primaryDomain).toBe('rf');
    expect(result.evidence.confidence).toMatch(CONFIDENCE.HIGH);
  });

  it('caps an RF verdict when the plumbing was never checked', async () => {
    const provider = toolCallingProvider(['diagnoseClient']);
    const result = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ diagnoseClient: RF_FINDING }),
      capabilities,
      question: 'is this coverage?',
    });
    expect(result.evidence.confidence).toMatch(CONFIDENCE.POSSIBLE);
    expect(result.evidence.plumbingChecked).toBe(false);
  });

  it('answers the Cortex Standard, marking what it could not establish and why', async () => {
    const provider = toolCallingProvider(['checkBackendServices', 'diagnoseClient']);
    const result = await runInvestigation({
      provider,
      model: 'claude-sonnet-5',
      tools: tools({ checkBackendServices: PLUMBING_CLEAN, diagnoseClient: RF_FINDING }),
      capabilities,
      question: 'why is this client unhappy?',
    });
    const std = result.evidence.standard;
    expect(std.whatIsWrong.answered).toBe(true);
    expect(std.whenDidItStart.answered).toBe(false);
    expect(std.whenDidItStart.reason).toBe('api_gap');
    expect(std.didTheFixWork.answered).toBe(false);
  });
});

describe('the scope block replaces the advisory hint', () => {
  it('tells the model the tools are already filtered', () => {
    const prompt = buildSystemPrompt({
      capabilities,
      toolNames: ['getSiteOverview'],
      question: 'any unhappy clients?',
      resolvedScope: { level: 'site', siteNames: ['AURA_LAB'] },
    });
    expect(prompt).toMatch(/ALREADY filtered to AURA_LAB/);
    expect(prompt).not.toMatch(/UI SCOPE \(inherited/);
  });

  it('falls back to the old advisory line when no scope was resolved', () => {
    const prompt = buildSystemPrompt({
      capabilities,
      scope: { siteName: 'PrimarySite' },
      toolNames: ['getSiteOverview'],
      question: 'any unhappy clients?',
    });
    expect(prompt).toMatch(/UI SCOPE \(inherited/);
  });
});

describe('the answer shape', () => {
  const prompt = buildSystemPrompt({
    capabilities,
    toolNames: ['diagnoseClient'],
    question: 'why is this client unhappy?',
  });

  it('demands a plain-English first line with blast radius', () => {
    expect(prompt).toMatch(/THE OUTCOME, IN PLAIN ENGLISH, WITH THE BLAST RADIUS/);
    expect(prompt).toMatch(/No units, no acronyms/);
  });

  it('requires a gloss on the first use of a term of art', () => {
    expect(prompt).toMatch(/gloss of five words or fewer/);
  });

  it('forbids raising the computed confidence', () => {
    expect(prompt).toMatch(/never raise the computed level/i);
  });

  it('requires saying WHY a Standard question is unanswered', () => {
    expect(prompt).toMatch(/If you cannot establish one of those, say WHY/);
  });

  it('forbids stopping at a symptom', () => {
    expect(prompt).toMatch(/Never stop at a symptom/);
  });
});
