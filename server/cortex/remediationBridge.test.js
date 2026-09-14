import { describe, it, expect } from 'vitest';
import {
  proposeRemediation,
  formatRemediation,
  REMEDIATIONS,
  EXECUTABLE_ACTIONS,
} from './remediationBridge.js';

const withEvidence = [{ tool: 'diagnoseClient', ok: true }];

describe('proposeRemediation', () => {
  it('routes a DHCP diagnosis to another system, not to a Gateway write', () => {
    const r = proposeRemediation({
      diagnosis: 'The client associates with healthy RF but has no IPv4 address. This is DHCP.',
      ledger: withEvidence,
    });
    const dhcp = r.proposals.find((p) => p.id === 'dhcp-no-address');
    expect(dhcp).toBeTruthy();
    expect(dhcp.owner).toBe('other-system');
    expect(dhcp.executableByCortex).toBe(false);
    expect(r.executable).toHaveLength(0);
  });

  it('routes coverage to field work and says a channel change will not help', () => {
    const r = proposeRemediation({
      diagnosis: 'Weak signal at -84 dBm with low RFQI — this is a coverage problem.',
      ledger: withEvidence,
    });
    const cov = r.proposals.find((p) => p.id === 'coverage-weak-signal');
    expect(cov.owner).toBe('field');
    expect(cov.executableByCortex).toBe(false);
  });

  it('marks a radio-binding fault as something Cortex can actually carry out', () => {
    const r = proposeRemediation({
      diagnosis: 'The WLAN is not broadcasting: the radio binding was written at index 0.',
      ledger: withEvidence,
    });
    const bind = r.proposals.find((p) => p.id === 'radio-binding-missing');
    expect(bind.executableByCortex).toBe(true);
    expect(bind.gatewayChange).toBe('create_wlan');
    expect(r.executable.length).toBeGreaterThan(0);
  });

  it('marks a dangling VLAN as executable via the VLAN path', () => {
    const r = proposeRemediation({
      diagnosis: 'The service references a dangling topology; the VLAN does not resolve.',
      ledger: withEvidence,
    });
    expect(r.executable.some((p) => p.gatewayChange === 'create_vlan')).toBe(true);
  });

  it('never marks an unimplemented Gateway change as executable', () => {
    // Co-channel remediation is a real Gateway change, but there is no
    // deterministic write path for RRM — claiming otherwise is the exact
    // over-promise this module exists to prevent.
    const r = proposeRemediation({
      diagnosis: 'Airtime is saturated by co-channel interference from your own APs.',
      ledger: withEvidence,
    });
    const cc = r.proposals.find((p) => p.id === 'co-channel-contention');
    expect(cc.owner).toBe('operator');
    expect(cc.executableByCortex).toBe(false);
    expect(cc.gatewayChange).toMatch(/no deterministic write path|no write path/i);
  });

  it('refuses to back a proposal when no tool call succeeded', () => {
    const r = proposeRemediation({
      diagnosis: 'This is a coverage problem.',
      ledger: [{ tool: 'diagnoseClient', ok: false }],
    });
    expect(r.evidenceBacked).toBe(false);
    expect(r.summary).toMatch(/no tool call succeeded/i);
    expect(r.summary).toMatch(/Do not act on it/i);
  });

  it('returns an honest empty result rather than inventing a fix', () => {
    const r = proposeRemediation({
      diagnosis: 'Everything looks healthy; no findings.',
      ledger: withEvidence,
    });
    expect(r.proposals).toHaveLength(0);
    expect(r.summary).toMatch(/No remediation in the catalogue matches/i);
    expect(r.summary).toMatch(/That is a real answer/i);
  });

  it('says so plainly when nothing proposed is a write Cortex can make', () => {
    const r = proposeRemediation({
      diagnosis: 'Name resolution is the dominant latency component — this is DNS.',
      ledger: withEvidence,
    });
    expect(r.executable).toHaveLength(0);
    expect(r.summary).toMatch(/common case in wireless/i);
  });

  it('handles empty and missing input without throwing', () => {
    expect(proposeRemediation({}).proposals).toEqual([]);
    expect(proposeRemediation({ diagnosis: null }).proposals).toEqual([]);
    expect(proposeRemediation().proposals).toEqual([]);
  });
});

describe('catalogue integrity', () => {
  it('has a unique id for every remediation', () => {
    const ids = REMEDIATIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only ever claims cortex ownership for an implemented action', () => {
    // The guard that keeps this module honest as the catalogue grows.
    for (const r of REMEDIATIONS) {
      if (r.owner === 'cortex') {
        expect(EXECUTABLE_ACTIONS.has(r.gatewayChange), `${r.id} claims cortex but ${r.gatewayChange} is not implemented`).toBe(true);
      }
    }
  });

  it('agrees with the intent parser about which actions are implemented', async () => {
    // If wirelessIntentParser grows a third action, this fails and forces the
    // catalogue to be updated with it rather than silently lagging.
    // Read via a repo-relative path: under Vitest's transform `import.meta.url`
    // is not a file: URL, so readFileSync on it throws.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(process.cwd(), 'server', 'cortex', 'wirelessIntentParser.js'),
      'utf8'
    );
    const match = src.match(/IMPLEMENTED_ACTIONS\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(match, 'could not find IMPLEMENTED_ACTIONS in wirelessIntentParser.js').toBeTruthy();
    const parserActions = match[1]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean)
      // validate_only is a dry run, not a change.
      .filter((a) => a !== 'validate_only');

    for (const a of EXECUTABLE_ACTIONS) {
      expect(parserActions, `${a} is claimed executable but the parser does not implement it`).toContain(a);
    }
  });

  it('gives every entry a cause, an action and an owner', () => {
    for (const r of REMEDIATIONS) {
      expect(r.cause, `${r.id} has no cause`).toBeTruthy();
      expect(r.action, `${r.id} has no action`).toBeTruthy();
      expect(['cortex', 'operator', 'field', 'other-system', 'unsupported']).toContain(r.owner);
      expect(r.signals.length, `${r.id} has no signals`).toBeGreaterThan(0);
    }
  });
});

describe('formatRemediation', () => {
  it('labels each item with who can carry it out', () => {
    const r = proposeRemediation({
      diagnosis: 'The radio binding was written at index 0 and the VLAN is dangling.',
      ledger: withEvidence,
    });
    const text = formatRemediation(r);
    expect(text).toMatch(/Cortex can do this \(with approval\)/);
  });

  it('carries the warning forward when the diagnosis is unbacked', () => {
    const r = proposeRemediation({
      diagnosis: 'This is a coverage problem.',
      ledger: [],
    });
    expect(formatRemediation(r)).toMatch(/WARNING: no successful tool call/);
  });

  it('returns the honest summary when there is nothing to propose', () => {
    const r = proposeRemediation({ diagnosis: 'All healthy.', ledger: withEvidence });
    expect(formatRemediation(r)).toMatch(/No remediation in the catalogue/);
  });
});
