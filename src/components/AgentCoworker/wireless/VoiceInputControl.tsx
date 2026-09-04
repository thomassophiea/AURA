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
  permission_denied: 'Microphone permission denied',
  unsupported: 'Speech-to-text is not configured',
  error: 'Speech recognition error',
  cancelled: 'Talk',
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
  const showsError = state === 'permission_denied' || state === 'error';
  const label = showsError && error ? `${STATE_LABEL[state]} (${error})` : STATE_LABEL[state];

  if (state === 'unsupported') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        Speech-to-text is not configured. Text input is fully functional.
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
      <span className={cn('text-xs', showsError ? 'text-red-400' : 'text-muted-foreground')}>{label}</span>
    </div>
  );
}
