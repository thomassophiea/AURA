import { describe, it, expect } from 'vitest';
import { auditAnswer, buildSystemPrompt } from './investigationAgent.js';
import { CapabilityRegistry } from './capabilityRegistry.js';
import { retrieveGuidance } from './aiFirstMethodology.js';

const ledger = (...tools) => tools.map((tool) => ({ tool, ok: true, digest: { tool } }));

/**
 * Every audit rule below is proven BOTH ways. A rule that only ever fires is a
 * false-positive generator, and a rule that never fires is decoration — the
 * codebase has learned the first one three times.
 */
describe('auditAnswer: AP CPU, memory and temperature', () => {
  it('flags an invented CPU figure', () => {
    const f = auditAnswer('AP CPU utilisation is 94% and has been for 40 minutes.', ledger('getDeviceHealth'));
    expect(f.some((x) => /CPU, memory or temperature/.test(x.detail))).toBe(true);
  });

  it('flags an invented temperature', () => {
    const f = auditAnswer('The AP temperature is 71 C, which is elevated.', ledger('getDeviceHealth'));
    expect(f.some((x) => /CPU, memory or temperature/.test(x.detail))).toBe(true);
  });

  it('does NOT flag the disclosure the answer contract requires', () => {
    // This exact sentence is mandated by the prompt. Flagging it would train the
    // operator to ignore the audit panel.
    for (const honest of [
      'CPU, memory and temperature are not exposed by this Gateway on any AP endpoint.',
      'This platform does not report AP CPU or memory, so neither was checked.',
      'I cannot read AP temperature — no thermal field exists on any AP resource.',
      'AP CPU utilisation is not available; that is a platform gap, not a clean result.',
    ]) {
      const f = auditAnswer(honest, ledger('getDeviceHealth'));
      expect(f.filter((x) => /CPU, memory or temperature/.test(x.detail))).toHaveLength(0);
    }
  });

  it('does not fire on the Gateway appliance\'s own CPU, which IS reported', () => {
    const f = auditAnswer('Everything looks fine here.', ledger('getDeviceHealth'));
    expect(f).toHaveLength(0);
  });
});

describe('auditAnswer: RMA authority', () => {
  it('flags a claim that an RMA was approved', () => {
    const f = auditAnswer('Your RMA has been approved and a replacement was dispatched.', ledger('getDeviceHealth'));
    expect(f.some((x) => /raised, approved or authorised/.test(x.detail))).toBe(true);
  });

  it('does NOT flag the assessment language Cortex is supposed to use', () => {
    for (const ok of [
      'RMA: Recommended. The evidence package is ready if you want it.',
      'RMA: Candidate — two more things need ruling out first.',
      'RMA: No RMA Indicated.',
      'No RMA has been raised or authorised; that is a separate process with Extreme support.',
    ]) {
      const f = auditAnswer(ok, ledger('getDeviceHealth'));
      expect(f.filter((x) => /raised, approved or authorised/.test(x.detail))).toHaveLength(0);
    }
  });
});

describe('auditAnswer: a health classification needs the tool that computes one', () => {
  it('flags "all APs are healthy" built from inventory alone', () => {
    const f = auditAnswer('All eight access points are healthy.', ledger('getApHealth'));
    expect(f.some((x) => /device-health classification/.test(x.detail))).toBe(true);
  });

  it('passes the same sentence when getDeviceHealth actually ran', () => {
    const f = auditAnswer('All eight access points are healthy.', ledger('getDeviceHealth'));
    expect(f.filter((x) => /device-health classification/.test(x.detail))).toHaveLength(0);
  });
});

describe('guidance retrieval', () => {
  const asks = [
    'Do I have any unhealthy APs?',
    'Are all my APs healthy?',
    'Does this AP need to be replaced?',
    'Should this AP be RMA\'d?',
    'Do I have any RMA candidates?',
    'Are my APs on consistent firmware?',
    'Check CPU health across my APs.',
    'Why does this AP keep rebooting?',
    'Which APs are having hardware problems?',
  ];

  it('routes every device-health phrasing to the device-health note', () => {
    for (const q of asks) {
      const ids = retrieveGuidance(q).map((n) => n.id);
      expect(ids, q).toContain('device-health');
    }
  });

  it('does not hijack an ordinary client question', () => {
    const ids = retrieveGuidance('Why is my laptop dropping off the wifi?').map((n) => n.id);
    expect(ids).not.toContain('device-health');
  });
});

describe('the system prompt carries the device-health obligations', () => {
  const prompt = buildSystemPrompt({
    capabilities: new CapabilityRegistry(),
    toolNames: ['getDeviceHealth'],
    question: 'Do I have any unhealthy APs?',
  });

  it('forbids folding unknown into healthy', () => {
    expect(prompt).toMatch(/never folded into healthy|MUST NOT be added to the healthy count/i);
  });

  it('requires an explicit RMA line', () => {
    expect(prompt).toMatch(/RMA: No\s*RMA Indicated/i);
  });

  it('forbids claiming an RMA was granted', () => {
    expect(prompt).toMatch(/never say an RMA has been raised, approved or authorised/i);
  });

  it('states that CPU, memory and temperature are not exposed', () => {
    expect(prompt).toMatch(/CPU, MEMORY AND TEMPERATURE ARE NOT EXPOSED/i);
  });
});

describe('auditAnswer: a conditional is not a claim about the past', () => {
  it('still flags a real unsupported historical claim', () => {
    const f = auditAnswer('This AP was fine yesterday and degraded overnight.', ledger('getDeviceHealth'));
    expect(f.some((x) => /claim about the past/i.test(x.detail))).toBe(true);
  });

  it('does not flag advice phrased as a conditional', () => {
    // Measured live: this exact shape was flagged as an unsupported claim while
    // being precisely the behaviour the contract asks for when history is out.
    for (const careful of [
      'If it was previously adopted and is now missing, confirm whether it was decommissioned.',
      'I cannot tell whether it used to be healthy — no stored history is reachable.',
      'Whether this was previously a trend cannot be established from here.',
    ]) {
      const f = auditAnswer(careful, ledger('getDeviceHealth'));
      expect(f.filter((x) => /claim about the past/i.test(x.detail)), careful).toHaveLength(0);
    }
  });
});
