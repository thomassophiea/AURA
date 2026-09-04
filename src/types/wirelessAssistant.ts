/**
 * Typed intent/session model for the unified AURA wireless assistant.
 *
 * Mirrors the interfaces in AURA-NETWORK-INTELLIGENCE-REBUILD-PROMPT.md.
 * `NetworkScope` has no canonical home elsewhere in the codebase (confirmed
 * during the migration audit) — it is a purpose-built subset of the existing
 * `NavigationContext` in `src/types/domain.ts`, not a parallel hierarchy.
 */

import type { NavigationContext } from './domain';

/** Explicit scope for a request — never silently Global. */
export type NetworkScope =
  | { kind: 'site'; organizationId: string; siteGroupId: string; siteId: string; siteName?: string }
  | { kind: 'siteGroup'; organizationId: string; siteGroupId: string }
  | { kind: 'global' };

export function scopeFromNavigation(nav: NavigationContext): NetworkScope {
  if (nav.site && nav.siteGroup && nav.organization) {
    return {
      kind: 'site',
      organizationId: nav.organization.id,
      siteGroupId: nav.siteGroup.id,
      siteId: nav.site.id,
      siteName: nav.site.name,
    };
  }
  if (nav.siteGroup && nav.organization) {
    return { kind: 'siteGroup', organizationId: nav.organization.id, siteGroupId: nav.siteGroup.id };
  }
  return { kind: 'global' };
}

export type WirelessAction =
  | 'create_wlan'
  | 'update_wlan'
  | 'delete_wlan'
  | 'assign_wlan'
  | 'schedule_wlan'
  | 'validate_only';

export type SecurityMode =
  | 'open'
  | 'wpa2_personal'
  | 'wpa3_personal'
  | 'wpa2_enterprise'
  | 'wpa3_enterprise'
  | 'owe';

export interface WirelessConfigurationIntent {
  action: WirelessAction;
  organizationId?: string;
  siteGroupId?: string;
  siteId?: string;
  siteName?: string; // resolved server-side against live sites
  accessPointIds?: string[];
  wlanName?: string;
  ssid?: string;
  vlanId?: number;

  security?: {
    mode: SecurityMode;
    /** Never the plaintext secret — a display placeholder only. */
    credentialReference?: string;
  };

  roleId?: string;
  profileId?: string;
  modelProfileId?: string;

  schedule?: {
    type: 'always' | 'recurring' | 'one_time';
    days?: string[];
    startTime?: string;
    endTime?: string;
    timezone?: string;
  };

  requestedBy: string;
  source: 'voice' | 'text';
  rawInstruction: string;
}

export interface ParsedWirelessIntent {
  intent: WirelessConfigurationIntent;
  missingFields: string[];
  ambiguities: string[];
  riskLevel: 'low' | 'medium' | 'high';
  humanReadable: string;
  /**
   * `unimplemented`: a real, API-backed configuration domain (see the
   * Ascend IQC Skills Catalog audit — Role, VLAN, AAA Policy, Profile,
   * RRM, and 26 others) that AURA recognizes but cannot yet configure
   * through natural language. `domain` names which one; `ambiguities`
   * carries the real Local Controller API and AURA's existing support
   * status for it.
   */
  classification: 'read_only' | 'mutating' | 'unimplemented';
  /** Set only when classification is 'unimplemented' — the domain id from configurationDomainCatalog.js. */
  domain?: string;
  /**
   * A password/PSK the parser pulled out of free text, held only for the
   * single validate/provision round-trip — never rendered, never included
   * in `intent` itself (which carries only the `credentialReference`
   * placeholder), never persisted client-side.
   */
  _ephemeralPassword?: string;
}

export type CheckResult = 'pass' | 'warn' | 'fail' | 'block';

export interface WirelessValidationCheck {
  name: string;
  result: CheckResult;
  evidence: string;
}

export interface WirelessValidationReport {
  intent: WirelessConfigurationIntent;
  checks: WirelessValidationCheck[];
  confidence: {
    score: number;
    band: 'LOW' | 'MEDIUM' | 'HIGH';
    blockingIssues: string[];
    warnings: string[];
  };
  recommendation: string;
  preProvisionSnapshot?: unknown;
  /** SHA-256 hash of the canonicalized plan — re-validated server-side before every write. */
  planHash: string;
  validationToken: string | null;
  expiresAt: string | null;
}

export interface ProfileBindResult {
  profileId: string;
  name: string;
  status: 'bound' | 'already_bound' | 'partial' | 'skipped' | 'failed';
  boundIndices?: number[];
  silentlyDropped?: number[];
  dropped?: number[];
  reason?: string;
  httpStatus?: number;
  error?: string;
}

export interface WirelessProvisioningResult {
  status: 'completed' | 'degraded' | 'partial' | 'failed';
  stage?: string;
  reason?: string;
  serviceId?: string;
  serviceName?: string;
  readBack?: { nameMismatch: boolean; dot1dPortNumber: number };
  profileResults?: ProfileBindResult[];
  verification?: Array<{ apSerial: string; broadcasting: boolean; error?: string }>;
  notes?: string[];
  correlationId?: string;
  error?: string;
  httpStatus?: number;
}

export type AssistantMode =
  | 'conversation'
  | 'read_only_investigation'
  | 'configuration_intake'
  | 'validation'
  | 'approval'
  | 'provisioning'
  | 'verification'
  | 'rollback';

export type WorkflowState =
  | 'idle'
  | 'capturing_voice'
  | 'entering_text'
  | 'transcribing'
  | 'missing_information'
  | 'validating'
  | 'validation_ready'
  | 'awaiting_approval'
  | 'provisioning'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ApprovalState {
  approved: boolean;
  method?: 'button' | 'voice';
  approvedBy?: string;
  approvedAt?: string;
}

export interface WirelessAssistantSession {
  sessionId: string;
  mode: AssistantMode;
  workflowState: WorkflowState;
  activeScope: NetworkScope;
  transcript?: string;
  pendingIntent?: WirelessConfigurationIntent;
  parsedIntent?: ParsedWirelessIntent;
  validationReport?: WirelessValidationReport;
  approval?: ApprovalState;
  provisioning?: WirelessProvisioningResult;
  createdAt: string;
  updatedAt: string;
}

export interface ActionAuthorization {
  allowed: boolean;
  action: string;
  scope: NetworkScope;
  reason?: string;
  requiresApproval: boolean;
  requiredPermission?: string;
}

// ---- Speech-to-text adapter (provider-neutral) ----

export type VoiceState =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'transcribing'
  | 'transcript_ready'
  | 'permission_denied'
  | 'unsupported'
  | 'error'
  | 'cancelled';

export interface AudioInput {
  audio: Blob;
  mimeType: string;
  language?: string;
  sampleRate?: number;
}

export interface SpeechTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
  language?: string;
  durationMs?: number;
  provider: string;
}

export interface SpeechToTextProvider {
  transcribeAudio(input: AudioInput): Promise<SpeechTranscript>;
}
