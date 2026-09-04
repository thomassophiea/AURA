import { describe, it, expect } from 'vitest';
import {
  isExplicitVoiceConfirmation,
  intentMatchesValidatedPlan,
  validationTokenIsLive,
  canApprove,
} from './wirelessAssistantHelpers';
import type { WirelessConfigurationIntent, WirelessValidationReport } from '@/types/wirelessAssistant';

const intent: WirelessConfigurationIntent = {
  action: 'create_wlan',
  siteId: 'site-1',
  wlanName: 'Guest',
  ssid: 'Guest',
  vlanId: 40,
  security: { mode: 'wpa2_personal', credentialReference: '(captured, not echoed)' },
  requestedBy: 'u1',
  source: 'text',
  rawInstruction: 'x',
};

function report(overrides: Partial<WirelessValidationReport> = {}): WirelessValidationReport {
  return {
    intent,
    checks: [],
    confidence: { score: 90, band: 'HIGH', blockingIssues: [], warnings: [] },
    recommendation: 'ok',
    planHash: 'abc',
    validationToken: 'tok',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('isExplicitVoiceConfirmation', () => {
  it('accepts clear confirmation phrases', () => {
    expect(isExplicitVoiceConfirmation('Confirm and configure.')).toBe(true);
    expect(isExplicitVoiceConfirmation('Approve this WLAN.')).toBe(true);
    expect(isExplicitVoiceConfirmation('Deploy this configuration.')).toBe(true);
  });

  it('rejects ambiguous phrases that must fall back to a button', () => {
    expect(isExplicitVoiceConfirmation('yes')).toBe(false);
    expect(isExplicitVoiceConfirmation('okay')).toBe(false);
    expect(isExplicitVoiceConfirmation('do it')).toBe(false);
    expect(isExplicitVoiceConfirmation('go ahead')).toBe(false);
    expect(isExplicitVoiceConfirmation('')).toBe(false);
  });
});

describe('validationTokenIsLive', () => {
  it('is false with no report or no token', () => {
    expect(validationTokenIsLive(null)).toBe(false);
    expect(validationTokenIsLive(report({ validationToken: null }))).toBe(false);
  });

  it('is false once expiresAt has passed', () => {
    expect(validationTokenIsLive(report({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe(false);
  });

  it('is true for a live token', () => {
    expect(validationTokenIsLive(report())).toBe(true);
  });
});

describe('intentMatchesValidatedPlan', () => {
  it('matches an unedited intent', () => {
    expect(intentMatchesValidatedPlan(intent, report())).toBe(true);
  });

  it('detects a WLAN-name edit after validation', () => {
    const edited = { ...intent, wlanName: 'GuestV2' };
    expect(intentMatchesValidatedPlan(edited, report())).toBe(false);
  });

  it('detects a security-mode edit after validation', () => {
    const edited = { ...intent, security: { mode: 'wpa3_personal' as const, credentialReference: intent.security?.credentialReference } };
    expect(intentMatchesValidatedPlan(edited, report())).toBe(false);
  });

  it('detects the credential being cleared after validation', () => {
    const withoutCredential = { ...intent, security: { mode: intent.security!.mode, credentialReference: undefined } };
    expect(intentMatchesValidatedPlan(withoutCredential, report())).toBe(false);
  });

  it('is not fooled by access point ordering', () => {
    const a = { ...intent, accessPointIds: ['ap2', 'ap1'] };
    const b = { ...intent, accessPointIds: ['ap1', 'ap2'] };
    expect(intentMatchesValidatedPlan(a, report({ intent: b }))).toBe(true);
  });
});

describe('canApprove', () => {
  it('allows approval for a clean, live, unedited report', () => {
    expect(canApprove(intent, report())).toBe(true);
  });

  it('blocks approval when the report has blocking issues', () => {
    expect(canApprove(intent, report({ confidence: { score: 0, band: 'LOW', blockingIssues: ['site_exists'], warnings: [] } }))).toBe(false);
  });

  it('blocks approval when the token has expired', () => {
    expect(canApprove(intent, report({ expiresAt: new Date(Date.now() - 1000).toISOString() }))).toBe(false);
  });

  it('blocks approval when the intent was edited since validation', () => {
    expect(canApprove({ ...intent, vlanId: 41 }, report())).toBe(false);
  });

  it('blocks approval when there is no report at all', () => {
    expect(canApprove(intent, null)).toBe(false);
  });
});
