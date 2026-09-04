import { useCallback, useEffect, useRef, useState } from 'react';
import { useCortexContext } from '@/contexts/CortexContext';
import { useWirelessAssistant } from '@/hooks/useWirelessAssistant';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { CORTEX_DIAGNOSE_EVENT } from '@/lib/cortexLauncher';
import { ConversationStream } from '../panels/ConversationStream';
import { ScopeBreadcrumb } from './ScopeBreadcrumb';
import { VoiceInputControl } from './VoiceInputControl';
import { TranscriptReview } from './TranscriptReview';
import { ValidationReportView } from './ValidationReport';
import { ConfigurationPreview } from './ConfigurationPreview';
import { ApprovalControls } from './ApprovalControls';
import { ProvisioningProgress } from './ProvisioningProgress';
import { VerificationResult } from './VerificationResult';

function currentOperator(): string {
  try {
    return localStorage.getItem('user_email') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const WORKFLOW_ACTIVE_STATES = new Set([
  'entering_text',
  'transcribing',
  'missing_information',
  'validating',
  'validation_ready',
  'awaiting_approval',
  'provisioning',
  'verifying',
  'completed',
  'failed',
]);

/**
 * The single unified AURA workflow: text/voice intake -> transcript &
 * intent review -> live validation -> preview -> explicit approval ->
 * provisioning -> verification. Read-only questions are routed to the
 * existing investigation pipeline (CortexContext) and rendered with the
 * same ConversationStream used before; a mutating instruction takes over
 * this panel instead of appending to the chat.
 */
export function WirelessAssistantPanel() {
  const cortex = useCortexContext();
  const assistant = useWirelessAssistant();
  const voice = useVoiceInput();
  const [textInput, setTextInput] = useState('');
  const confirmModeRef = useRef(false);

  const routeInstruction = useCallback(
    async (text: string, source: 'voice' | 'text') => {
      const outcome = await assistant.submitInstruction(text, source);
      if (outcome === 'read_only') {
        void cortex.sendMessage(text);
      }
    },
    [assistant, cortex]
  );

  const handleSubmitText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    void routeInstruction(text, 'text');
  }, [textInput, routeInstruction]);

  const handleTalkToConfirm = useCallback(() => {
    confirmModeRef.current = true;
    void voice.start();
  }, [voice]);

  // Cross-tree launcher (alert rows, detail pages) — see cortexLauncher.ts.
  useEffect(() => {
    const diagnose = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (typeof prompt !== 'string' || !prompt) return;
      void routeInstruction(prompt, 'text');
    };
    window.addEventListener(CORTEX_DIAGNOSE_EVENT, diagnose);
    return () => window.removeEventListener(CORTEX_DIAGNOSE_EVENT, diagnose);
  }, [routeInstruction]);

  // Voice transcripts: either a fresh instruction or, when a confirmation
  // round was started via Talk to Confirm, an approval phrase.
  useEffect(() => {
    if (voice.state !== 'transcript_ready' || !voice.transcript) return;
    const text = voice.transcript;
    const wasConfirming = confirmModeRef.current;
    confirmModeRef.current = false;
    voice.reset();
    if (wasConfirming) {
      void assistant.approve('voice', currentOperator(), text);
    } else {
      void routeInstruction(text, 'voice');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voice.reset/voice.transcript intentionally tracked via voice.state
  }, [voice.state]);

  const inWorkflow = WORKFLOW_ACTIVE_STATES.has(assistant.workflowState);
  const isProvisioning = assistant.workflowState === 'provisioning';
  const canValidate = Boolean(assistant.parsedIntent && assistant.parsedIntent.missingFields.length === 0);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-border/40">
        <ScopeBreadcrumb />
      </div>

      {!inWorkflow && (
        <>
          <div className="flex-1 min-h-0">
            <ConversationStream
              messages={cortex.messages}
              isThinking={cortex.isThinking}
              inputValue={textInput}
              isListening={voice.state === 'listening'}
              onInput={setTextInput}
              onSubmit={handleSubmitText}
              onMicToggle={() => (voice.state === 'listening' ? voice.stop() : void voice.start())}
              onFeedback={cortex.addFeedback}
              onToggleReasoning={cortex.toggleReasoning}
              onFollowUp={(chip) => void routeInstruction(chip, 'text')}
              onConfirmWireless={cortex.confirmWirelessAction}
              wirelessStage={cortex.wirelessStage}
              suggestedPrompts={cortex.suggestedPrompts}
            />
          </div>
          {assistant.error && !assistant.parsedIntent && (
            <div className="shrink-0 mx-3 mb-2 px-3 py-2 rounded border border-red-700/40 bg-red-900/20 text-xs text-red-300">
              {assistant.error}
            </div>
          )}
          <div className="shrink-0 px-3 py-2 border-t border-border/40 text-xs text-muted-foreground">
            Tell AURA what wireless configuration you want — AURA previews and validates changes before configuring
            anything.
          </div>
        </>
      )}

      {inWorkflow && assistant.parsedIntent && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <TranscriptReview
            transcript={assistant.transcript}
            parsedIntent={assistant.parsedIntent}
            onEditTranscript={(text) => void routeInstruction(text, 'text')}
            onUpdateIntent={assistant.updateIntentField}
          />

          {canValidate && (
            <ValidationReportView
              report={assistant.validationReport}
              isValidating={assistant.workflowState === 'validating'}
              onValidate={() => void assistant.validate()}
              canValidate={canValidate}
            />
          )}

          {assistant.validationReport && <ConfigurationPreview report={assistant.validationReport} />}

          {assistant.validationReport && !isProvisioning && assistant.workflowState !== 'completed' && assistant.workflowState !== 'failed' && (
            <ApprovalControls
              wlanName={assistant.parsedIntent.intent.wlanName}
              siteName={assistant.parsedIntent.intent.siteName}
              canApprove={assistant.canApproveNow}
              error={assistant.error}
              onConfirm={() => void assistant.approve('button', currentOperator())}
              onTalkToConfirm={handleTalkToConfirm}
              onEdit={() => assistant.updateIntentField({})}
              onCancel={assistant.cancel}
            />
          )}

          {isProvisioning && <ProvisioningProgress />}

          {(assistant.workflowState === 'completed' || assistant.workflowState === 'failed') &&
            assistant.provisioning && (
              <VerificationResult result={assistant.provisioning} onStartOver={assistant.cancel} />
            )}
        </div>
      )}

      <div className="shrink-0 px-3 py-2 border-t border-border/40">
        <VoiceInputControl
          state={voice.state}
          onStart={() => {
            confirmModeRef.current = false;
            void voice.start();
          }}
          onStop={voice.stop}
          onCancel={voice.cancel}
          disabled={isProvisioning}
        />
      </div>
    </div>
  );
}
