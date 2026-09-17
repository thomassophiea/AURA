import { describe, it, expect } from 'vitest';
import { buildModifyDiff } from './workflowEngine.js';
import { toWorkflowResult } from './wlanModifyEngine.js';

describe('buildModifyDiff', () => {
  it('is a field-level diff, not prose', () => {
    const d = buildModifyDiff({ changeId: 'wlan.11k', current: false, desired: true });

    expect(d.path).toBe('enabled11kSupport');
    expect(d.label).toBe('802.11k neighbour reports');
    expect(d.from).toBe(false);
    expect(d.to).toBe(true);
    expect(d.risk).toBe('low');
  });

  it('states the post-condition that will be checked afterwards', () => {
    // An operator approving a change should know what would count as it having
    // failed, before it runs.
    const d = buildModifyDiff({ changeId: 'wlan.11k', current: false, desired: true });

    expect(d.postCondition).toMatch(/re-read/i);
    expect(d.postCondition).toMatch(/enabled11kSupport/);
    expect(d.postCondition).toMatch(/failure rather than a success/i);
  });

  it('carries the medium-risk flag rather than flattening it', () => {
    const d = buildModifyDiff({ changeId: 'wlan.suppressSsid', current: false, desired: true });
    expect(d.risk).toBe('medium');
  });

  it('refuses to diff a change that is not in the catalogue', () => {
    expect(buildModifyDiff({ changeId: 'wlan.ft', current: false, desired: true })).toBeNull();
  });
});

describe('toWorkflowResult', () => {
  it('treats a proven change as completed', () => {
    const r = toWorkflowResult({ status: 'applied', before: false, after: true });
    expect(r.status).toBe('completed');
  });

  it('treats a SILENTLY DROPPED write as a failure, never a success', () => {
    // The whole point. A 200 with an unchanged field is the platform's
    // dominant failure mode, and rounding it up is how a non-change gets
    // announced as a fix.
    const r = toWorkflowResult({
      status: 'silently_dropped',
      before: false,
      after: false,
      error: 'discarded, not applied',
    });

    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/discarded|dropped/i);
  });

  it('treats a Gateway rejection as a failure and keeps its message', () => {
    const r = toWorkflowResult({ status: 'rejected', error: 'value 0 is invalid', httpStatus: 422 });
    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/0 is invalid/);
  });

  it('does not claim success OR failure when it could not check', () => {
    // read_failed is a statement about our visibility, not about the change.
    const r = toWorkflowResult({ status: 'read_failed', error: 'Exception: null' });

    expect(r.status).toBe('degraded');
    expect(r.reason).toMatch(/could not|unconfirmed|unknown/i);
  });

  it('treats a refused value as a failure without implying the Gateway saw it', () => {
    const r = toWorkflowResult({ status: 'invalid', error: 'must be between 5 and 999999' });
    expect(r.status).toBe('failed');
    expect(r.reason).toMatch(/5 and 999999/);
  });
});
