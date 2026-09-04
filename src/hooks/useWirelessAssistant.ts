/**
 * WLAN-configuration workflow state machine: text/voice intake -> typed
 * intent -> live validation -> preview -> explicit approval -> provisioning
 * -> verification, all against the real backend (server/cortex/*). A
 * read-only question is detected and handed back to the caller rather than
 * entering this workflow at all — the existing wireless Q&A pipeline
 * (CortexContext.sendMessage) owns investigation, this hook owns mutation.
 *
 * No write is possible from any state before `awaiting_approval`: `approve()`
 * is the only path into `provisionWirelessIntent`, and it refuses unless
 * `canApprove` passes (live token, no blocking issues, intent unchanged
 * since validation) — see wirelessAssistantHelpers.ts.
 */

import { useCallback, useRef, useState } from 'react';
import {
  parseWirelessInstruction,
  validateWirelessIntent,
  provisionWirelessIntent,
} from '@/services/cortexApiClient';
import type {
  ParsedWirelessIntent,
  WirelessConfigurationIntent,
  WirelessValidationReport,
  WirelessProvisioningResult,
  WorkflowState,
} from '@/types/wirelessAssistant';
import { canApprove, isExplicitVoiceConfirmation } from './wirelessAssistantHelpers';

export interface UseWirelessAssistantResult {
  workflowState: WorkflowState;
  transcript: string;
  parsedIntent: ParsedWirelessIntent | null;
  validationReport: WirelessValidationReport | null;
  provisioning: WirelessProvisioningResult | null;
  error: string | null;
  /** A recognized-but-unimplemented-domain message (informational, not a failure) — see classification 'unimplemented'. */
  notice: string | null;
  canApproveNow: boolean;

  /** Returns which pipeline the instruction belongs to, so the caller can
   *  route read-only questions to the existing chat/Q&A path instead. */
  submitInstruction: (text: string, source: 'voice' | 'text') => Promise<'read_only' | 'mutating' | 'error' | 'unimplemented'>;
  /** Patch any field the operator fills in after a missing-field prompt (site, security, password). Invalidates prior validation. */
  updateIntentField: (patch: Partial<WirelessConfigurationIntent>, password?: string) => void;
  validate: () => Promise<void>;
  /** `voiceText` is required and checked for method 'voice' — ambiguous phrases ("yes", "ok") are refused. */
  approve: (method: 'button' | 'voice', approvedBy: string, voiceText?: string) => Promise<void>;
  cancel: () => void;
}

export function useWirelessAssistant(): UseWirelessAssistantResult {
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [transcript, setTranscript] = useState('');
  const [parsedIntent, setParsedIntent] = useState<ParsedWirelessIntent | null>(null);
  const [validationReport, setValidationReport] = useState<WirelessValidationReport | null>(null);
  const [provisioning, setProvisioning] = useState<WirelessProvisioningResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ephemeralPasswordRef = useRef<string | undefined>(undefined);

  const submitInstruction = useCallback(
    async (text: string, source: 'voice' | 'text'): Promise<'read_only' | 'mutating' | 'error' | 'unimplemented'> => {
      setError(null);
      setNotice(null);
      setTranscript(text);
      setWorkflowState(source === 'voice' ? 'transcribing' : 'entering_text');
      try {
        const result = await parseWirelessInstruction(text, source);

        if (result.classification === 'unimplemented') {
          // Recognized, real, API-backed — just not configurable through
          // natural language yet. Informational, not an error: stays out of
          // the workflow view (no WLAN-shaped intent to show) and out of
          // the chat pipeline (no LLM call that might paper over the gap).
          setNotice([result.humanReadable, ...result.ambiguities].join(' '));
          setWorkflowState('idle');
          return 'unimplemented';
        }

        ephemeralPasswordRef.current = result._ephemeralPassword;
        setParsedIntent(result);
        setValidationReport(null);
        setProvisioning(null);

        if (result.classification === 'read_only') {
          setWorkflowState('idle');
          return 'read_only';
        }
        setWorkflowState(result.missingFields.length > 0 ? 'missing_information' : 'entering_text');
        return 'mutating';
      } catch (err) {
        // A failure here (e.g. an admin has Cortex disabled, or a network
        // error) must never look like nothing happened — surface it and
        // fall back to idle so the chat view (and this message) stay
        // visible rather than a blank panel.
        setError(err instanceof Error ? err.message : String(err));
        setWorkflowState('idle');
        return 'error';
      }
    },
    []
  );

  const updateIntentField = useCallback(
    (patch: Partial<WirelessConfigurationIntent>, password?: string) => {
      if (!parsedIntent) return;
      if (password) ephemeralPasswordRef.current = password;

      const nextIntent: WirelessConfigurationIntent = {
        ...parsedIntent.intent,
        ...patch,
        security: patch.security
          ? {
              mode: patch.security.mode ?? parsedIntent.intent.security?.mode ?? 'wpa2_personal',
              credentialReference: password
                ? '(captured, not echoed)'
                : parsedIntent.intent.security?.credentialReference,
            }
          : password
            ? { mode: parsedIntent.intent.security?.mode ?? 'wpa2_personal', credentialReference: '(captured, not echoed)' }
            : parsedIntent.intent.security,
      };

      const stillMissing = parsedIntent.missingFields.filter((field) => {
        if (field === 'siteId' && (nextIntent.siteId || nextIntent.siteName)) return false;
        if (field === 'security.mode' && nextIntent.security?.mode) return false;
        if (field === 'security.credentialReference' && nextIntent.security?.credentialReference) return false;
        if (field === 'wlanName' && nextIntent.wlanName) return false;
        return true;
      });

      setParsedIntent({ ...parsedIntent, intent: nextIntent, missingFields: stillMissing });
      // Any edit invalidates a prior validation — re-validation is required.
      setValidationReport(null);
      setProvisioning(null);
      setWorkflowState(stillMissing.length > 0 ? 'missing_information' : 'entering_text');
    },
    [parsedIntent]
  );

  const validate = useCallback(async () => {
    if (!parsedIntent || parsedIntent.missingFields.length > 0) return;
    setError(null);
    setWorkflowState('validating');
    try {
      const report = await validateWirelessIntent(parsedIntent.intent, ephemeralPasswordRef.current);
      setValidationReport(report);
      setWorkflowState('validation_ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWorkflowState('failed');
    }
  }, [parsedIntent]);

  const approve = useCallback(
    async (method: 'button' | 'voice', approvedBy: string, voiceText?: string) => {
      if (!parsedIntent || !validationReport) return;
      if (method === 'voice' && !isExplicitVoiceConfirmation(voiceText ?? '')) {
        setError('That phrase was ambiguous — press Confirm to approve, or say a clear phrase like "confirm and configure".');
        return;
      }
      if (!canApprove(parsedIntent.intent, validationReport)) {
        setError('This plan can no longer be approved — it may have changed or expired. Re-validate and try again.');
        setWorkflowState('validation_ready');
        return;
      }

      setError(null);
      setWorkflowState('provisioning');
      try {
        const result = await provisionWirelessIntent({
          intent: parsedIntent.intent,
          planHash: validationReport.planHash,
          validationToken: validationReport.validationToken as string,
          ephemeralPassword: ephemeralPasswordRef.current,
          approvedBy,
        });
        setProvisioning(result);
        setWorkflowState(result.status === 'failed' ? 'failed' : 'completed');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setWorkflowState('failed');
      } finally {
        ephemeralPasswordRef.current = undefined; // never held past the provisioning call
      }
    },
    [parsedIntent, validationReport]
  );

  const cancel = useCallback(() => {
    ephemeralPasswordRef.current = undefined;
    setTranscript('');
    setParsedIntent(null);
    setValidationReport(null);
    setProvisioning(null);
    setError(null);
    setNotice(null);
    setWorkflowState('cancelled');
  }, []);

  const canApproveNow = Boolean(parsedIntent && validationReport && canApprove(parsedIntent.intent, validationReport));

  return {
    workflowState,
    transcript,
    parsedIntent,
    validationReport,
    provisioning,
    error,
    notice,
    canApproveNow,
    submitInstruction,
    updateIntentField,
    validate,
    approve,
    cancel,
  };
}
