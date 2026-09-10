/**
 * Push-to-talk voice input — provider-neutral per the SpeechToTextProvider
 * contract, but browser-native `SpeechRecognition` cannot accept a
 * pre-recorded Blob (it only listens live to the microphone), so this hook
 * branches internally:
 *
 * - `browser` (default, no server component): drives `SpeechRecognition`
 *   directly while the operator holds Talk.
 * - `server` (opt-in, `SPEECH_TO_TEXT_PROVIDER=server`): records a Blob via
 *   `MediaRecorder` while held, then sends it to `GroqSpeechToTextProvider`
 *   on Stop — this is the shape `SpeechToTextProvider.transcribeAudio`
 *   actually describes.
 *
 * Never continuous, never wake-word, never background — the microphone is
 * requested only on `start()` and released immediately on `stop()`/`cancel()`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceState } from '@/types/wirelessAssistant';
import { GroqSpeechToTextProvider, getSpeechToTextConfig } from '@/services/speechToText/groqSpeechToText';

function browserRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

function serverRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}


/**
 * Why the microphone is unavailable, checked BEFORE asking for it.
 *
 * This exists because every distinct cause used to surface as the same
 * "microphone permission denied", which sent operators to their browser
 * settings for a problem that lived in a response header. In particular a
 * Permissions-Policy of `microphone=()` denies the feature to every origin
 * including our own, and the browser then reports it identically to a user
 * who clicked Block.
 *
 * Returns null when nothing is known to be wrong.
 */
async function detectMicBlocker(): Promise<
  { state: VoiceState; error: string } | null
> {
  if (typeof window === 'undefined') return null;

  // A non-secure context has no microphone API at all. localhost counts as
  // secure, so this only fires on real http:// origins.
  if (window.isSecureContext === false) {
    return {
      state: 'insecure_context',
      error:
        'Voice input needs a secure connection (HTTPS). This page was loaded over plain HTTP.',
    };
  }

  // Permissions-Policy blocks the feature document-wide. When it does, the
  // permission cannot even be queried as "prompt" — asking is futile.
  const fp = (document as unknown as { featurePolicy?: { allowsFeature: (f: string) => boolean } })
    .featurePolicy;
  if (fp?.allowsFeature && !fp.allowsFeature('microphone')) {
    return {
      state: 'blocked_by_policy',
      error:
        'The microphone is disabled for this site by its Permissions-Policy header, so the browser ' +
        'will not prompt. This is a deployment setting, not a browser setting — it needs ' +
        'microphone=(self) rather than microphone=().',
    };
  }

  // Running inside a frame that was not granted the microphone.
  if (window.self !== window.top) {
    return {
      state: 'blocked_by_policy',
      error:
        'AURA is running inside a frame that was not granted microphone access ' +
        '(the parent needs allow="microphone").',
    };
  }

  // Is there actually an input device? Labels are empty before permission is
  // granted, but the device's presence is still visible.
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (devices && devices.length > 0 && !devices.some((d) => d.kind === 'audioinput')) {
      return { state: 'no_microphone', error: 'No microphone input device was found on this machine.' };
    }
  } catch {
    // enumerateDevices can reject in hardened contexts — not decisive.
  }

  return null;
}

/**
 * Map a Web Speech API / getUserMedia error code to a distinct state.
 *
 * `not-allowed` is deliberately ambiguous in the spec: it covers a user
 * refusal AND a user-agent refusal. We only call it a user refusal when the
 * Permissions API confirms the permission is actually denied; otherwise it is
 * reported as a policy block, which is the actionable truth.
 */
async function classifySpeechError(code: string | undefined): Promise<{ state: VoiceState; error: string }> {
  switch (code) {
    case 'audio-capture':
      return { state: 'no_microphone', error: 'No microphone was available to capture audio.' };
    case 'service-not-allowed':
      return {
        state: 'blocked_by_policy',
        error:
          "The browser's speech recognition service is not permitted for this page. This is a " +
          'browser or deployment policy, not a microphone permission.',
      };
    case 'network':
      return {
        state: 'error',
        error:
          'Speech recognition needs network access to the browser vendor\'s speech service and could not reach it.',
      };
    case 'no-speech':
      return { state: 'error', error: 'No speech was detected. Try again and speak after the indicator appears.' };
    case 'not-allowed':
    case 'permission-denied': {
      // Distinguish "the user said no" from "the page was never allowed to ask".
      try {
        const status = await navigator.permissions?.query?.({
          name: 'microphone' as PermissionName,
        });
        if (status?.state === 'denied') {
          return {
            state: 'permission_denied',
            error:
              'Microphone access is blocked for this site. Open the padlock in the address bar, ' +
              'set Microphone to Allow, then reload.',
          };
        }
      } catch {
        // Permissions API unavailable (Safari) — fall through.
      }
      const blocker = await detectMicBlocker();
      if (blocker) return blocker;
      return {
        state: 'permission_denied',
        error:
          'The browser refused microphone access. If you were not prompted, the microphone is ' +
          'blocked for this site in your browser settings.',
      };
    }
    default:
      return { state: 'error', error: code ?? 'Speech recognition error' };
  }
}

export interface UseVoiceInputResult {
  state: VoiceState;
  transcript: string;
  error?: string;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  reset: () => void;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const providerRef = useRef<'browser' | 'server'>('browser');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getSpeechToTextConfig()
      .then((cfg) => {
        if (!cancelled) providerRef.current = cfg.provider;
      })
      .catch(() => {
        // Config fetch failing is not fatal — browser is the safe default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setTranscript('');
    setError(undefined);
  }, []);

  const startBrowser = useCallback(async () => {
    if (!browserRecognitionSupported()) {
      setState('unsupported');
      setError(
        'This browser has no built-in speech recognition. Chrome, Edge or Safari support it; Firefox does not.'
      );
      return;
    }
    // Check for a deployment-level block first, so we report the real cause
    // instead of a misleading "permission denied" after the fact.
    const blocker = await detectMicBlocker();
    if (blocker) {
      setState(blocker.state);
      setError(blocker.error);
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setState('unsupported');
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = event.results;
      const last = results[results.length - 1];
      const text = last?.[0]?.transcript ?? '';
      setTranscript(text);
      if (last?.isFinal) {
        setState('transcript_ready');
      }
    };
    recognition.onerror = (event: Event) => {
      const err = event as unknown as { error?: string };
      // Classify asynchronously: telling the operator WHICH failure this is
      // decides whether they can fix it at all.
      void classifySpeechError(err.error).then(({ state: s, error: msg }) => {
        setState(s);
        setError(msg);
      });
    };
    recognition.onend = () => {
      setState((prev) => (prev === 'listening' ? (cancelledRef.current ? 'cancelled' : 'transcript_ready') : prev));
    };

    recognitionRef.current = recognition;
    cancelledRef.current = false;
    setState('listening');
    recognition.start();
  }, []);

  const startServer = useCallback(async () => {
    if (!serverRecordingSupported()) {
      setState('unsupported');
      setError('This browser cannot record audio (MediaRecorder or getUserMedia is unavailable).');
      return;
    }
    const blocker = await detectMicBlocker();
    if (blocker) {
      setState(blocker.state);
      setError(blocker.error);
      return;
    }
    setState('requesting_permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void (async () => {
          releaseStream();
          if (cancelledRef.current) {
            setState('cancelled');
            return;
          }
          setState('transcribing');
          try {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const provider = new GroqSpeechToTextProvider();
            const result = await provider.transcribeAudio({ audio: blob, mimeType: 'audio/webm' });
            setTranscript(result.text);
            setState('transcript_ready');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setState('error');
          }
        })();
      };
      recorderRef.current = recorder;
      cancelledRef.current = false;
      recorder.start();
      setState('listening');
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const code =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'not-allowed'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'audio-capture'
            : undefined;
      const { state: s, error: msg } = await classifySpeechError(code);
      setState(s);
      setError(code ? msg : err instanceof Error ? err.message : String(err));
      releaseStream();
    }
  }, [releaseStream]);

  const start = useCallback(async () => {
    setTranscript('');
    setError(undefined);
    cancelledRef.current = false;
    if (providerRef.current === 'server') {
      await startServer();
    } else {
      await startBrowser();
    }
  }, [startBrowser, startServer]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recognitionRef.current?.abort();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else releaseStream();
    setState('cancelled');
  }, [releaseStream]);

  useEffect(() => () => releaseStream(), [releaseStream]);

  return { state, transcript, error, start, stop, cancel, reset };
}
