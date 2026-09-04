/**
 * Pure helpers for the wireless-assistant workflow — split out of
 * useWirelessAssistant so the approval-gating rules (the safety-critical
 * part) are unit-testable without mounting a hook or mocking the network.
 */

import type { WirelessConfigurationIntent, WirelessValidationReport } from '@/types/wirelessAssistant';

/**
 * Voice approval must be an unambiguous, explicit phrase — "yes", "okay",
 * "do it", "go ahead" require a visible button press instead (spec: ambiguous
 * phrases must not confirm a live wireless-configuration write).
 */
const EXPLICIT_VOICE_CONFIRMATIONS = [
  /\bconfirm\b.*\bconfigure\b/i,
  /\bapprove\b.*\b(this|the)\b.*\bwlan\b/i,
  /\bdeploy\b.*\bconfiguration\b/i,
  /\bconfirm and (configure|deploy|provision)\b/i,
];

export function isExplicitVoiceConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return EXPLICIT_VOICE_CONFIRMATIONS.some((re) => re.test(trimmed));
}

/**
 * Fields the intent-review UI is allowed to patch in place (site selection,
 * security mode / credential entry when the parser flagged them missing).
 * Any of these changing must invalidate a prior validation.
 */
const HASHED_INTENT_FIELDS: Array<keyof WirelessConfigurationIntent> = [
  'action',
  'siteId',
  'siteName',
  'wlanName',
  'ssid',
  'vlanId',
];

function intentFingerprint(intent: WirelessConfigurationIntent): string {
  const picked: Record<string, unknown> = {};
  for (const key of HASHED_INTENT_FIELDS) picked[key] = intent[key] ?? null;
  picked.securityMode = intent.security?.mode ?? null;
  // Whether a credential was supplied is already self-described on the
  // intent (the parser and the intent-review UI both set this placeholder
  // string when a password is captured) — never the plaintext itself.
  picked.hasCredential = Boolean(intent.security?.credentialReference);
  picked.accessPointIds = [...(intent.accessPointIds ?? [])].sort();
  return JSON.stringify(picked);
}

/**
 * True when `intent` still matches what `report` was validated against —
 * i.e. approval is still safe to offer. Any drift (including the operator
 * clearing a previously-entered credential) means re-validation is
 * required, mirroring the server's independent plan-hash re-check in
 * wlanProvisioningEngine.
 */
export function intentMatchesValidatedPlan(
  intent: WirelessConfigurationIntent,
  report: WirelessValidationReport
): boolean {
  return intentFingerprint(intent) === intentFingerprint(report.intent);
}

export function validationTokenIsLive(report: WirelessValidationReport | null): boolean {
  if (!report?.validationToken || !report.expiresAt) return false;
  return Date.now() < new Date(report.expiresAt).getTime();
}

/** Approval is offered only when validation completed clean and hasn't gone stale. */
export function canApprove(
  intent: WirelessConfigurationIntent,
  report: WirelessValidationReport | null
): boolean {
  if (!report) return false;
  if (report.confidence.blockingIssues.length > 0) return false;
  if (!validationTokenIsLive(report)) return false;
  return intentMatchesValidatedPlan(intent, report);
}
