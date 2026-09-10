import { Mic, MicOff, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import type { VoiceState } from '@/types/wirelessAssistant';

const STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Talk',
  requesting_permission: 'Requesting microphone…',
  listening: 'Listening — click Stop when done',
  transcribing: 'Transcribing…',
  transcript_ready: 'Talk again',
  permission_denied: 'Microphone blocked in your browser',
  // Distinct from permission_denied on purpose: the operator cannot fix this
  // one in their browser, so the label must not send them there.
  blocked_by_policy: 'Microphone disabled for this site',
  insecure_context: 'Voice needs an HTTPS connection',
  no_microphone: 'No microphone found',
  unsupported: 'Speech-to-text is not available in this browser',
  error: 'Speech recognition error',
  cancelled: 'Talk',
};

/** What the operator can actually do about each failure. */
const STATE_GUIDANCE: Partial<Record<VoiceState, string>> = {
  permission_denied:
    'Click the padlock in the address bar, set Microphone to Allow, then reload the page.',
  blocked_by_policy:
    'This is a server setting rather than a browser one — the site is sending a Permissions-Policy that denies the microphone. An administrator needs to allow it.',
  insecure_context: 'Open AURA over HTTPS. The microphone API is unavailable on plain HTTP.',
  no_microphone: 'Connect a microphone or select an input device, then try again.',
  unsupported: 'Chrome, Edge and Safari support speech recognition. Firefox does not.',
};

interface VoiceInputControlProps {
  state: VoiceState;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  /** Disables the control entirely without changing its label (e.g. while provisioning). */
  disabled?: boolean;
  /**
   * The raw browser error code (e.g. "not-allowed", "service-not-allowed",
   * "audio-capture", "network") from useVoiceInput. `permission_denied` and
   * `error` cover several distinct SpeechRecognition failure codes — without
   * this, "not-allowed" (real permission denial) and "service-not-allowed"
   * (a browser/enterprise policy blocking the speech service specifically,
   * independent of the mic permission the operator actually granted) look
   * identical, which makes a real permission grant look like it "didn't work".
   */
  error?: string;
}

/**
 * Push-to-talk only — no continuous listening, no wake word. The operator
 * presses once to start, again to stop; the mic is requested and released
 * exactly around that window (see useVoiceInput).
 */
export function VoiceInputControl({ state, onStart, onStop, onCancel, disabled, error }: VoiceInputControlProps) {
  const isListening = state === 'listening';
  const isBusy = state === 'requesting_permission' || state === 'transcribing';
  const showsError =
    state === 'permission_denied' ||
    state === 'blocked_by_policy' ||
    state === 'insecure_context' ||
    state === 'no_microphone' ||
    state === 'error';
  // The raw browser code is diagnostic noise for an operator once we have a
  // plain-language cause, so it is only appended when we have nothing better.
  const guidance = STATE_GUIDANCE[state];
  const label = STATE_LABEL[state];

  if (state === 'unsupported') {
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error ?? 'Speech-to-text is not available in this browser.'}
        </span>
        <span className="pl-[22px]">{STATE_GUIDANCE.unsupported} Text input works normally.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={isListening ? 'destructive' : 'default'}
        disabled={disabled || isBusy}
        onClick={isListening ? onStop : onStart}
        aria-pressed={isListening}
        aria-label={STATE_LABEL[state]}
      >
        {isBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isListening ? (
          <MicOff className="h-3.5 w-3.5" />
        ) : (
          <Mic className="h-3.5 w-3.5" />
        )}
        {isListening ? 'Stop' : 'Talk'}
      </Button>
      {isListening && (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <div className="flex min-w-0 flex-col">
        <span className={cn('text-xs', showsError ? 'text-red-400' : 'text-muted-foreground')}>
          {label}
        </span>
        {showsError && (guidance || error) && (
          // Always tell the operator what to DO. "Permission denied" with no
          // next step is what made this feature feel broken rather than
          // misconfigured.
          <span className="text-[11px] text-muted-foreground">{guidance ?? error}</span>
        )}
      </div>
    </div>
  );
}
