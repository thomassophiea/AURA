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

  const startBrowser = useCallback(() => {
    if (!browserRecognitionSupported()) {
      setState('unsupported');
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
      setState(err.error === 'not-allowed' || err.error === 'permission-denied' ? 'permission_denied' : 'error');
      setError(err.error ?? 'Speech recognition error');
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
      setState(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'permission_denied' : 'error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [releaseStream]);

  const start = useCallback(async () => {
    setTranscript('');
    setError(undefined);
    cancelledRef.current = false;
    if (providerRef.current === 'server') {
      await startServer();
    } else {
      startBrowser();
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
