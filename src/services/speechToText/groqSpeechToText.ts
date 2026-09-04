/**
 * Server-adapter side of the SpeechToTextProvider contract.
 *
 * Posts the recorded utterance (a short Blob captured by MediaRecorder during
 * a push-to-talk hold) to AURA's own backend, which forwards it to Groq
 * Whisper — the browser never talks to Groq directly and never sees an API
 * key. Only used when `GET /api/cortex/speech/config` reports
 * `provider: 'server'`; otherwise the browser-native adapter is used instead
 * (see `useVoiceInput`).
 */

import type { AudioInput, SpeechToTextProvider, SpeechTranscript } from '@/types/wirelessAssistant';
import { apiService, getDynamicControllerUrl } from '../api';

export class GroqSpeechToTextProvider implements SpeechToTextProvider {
  async transcribeAudio(input: AudioInput): Promise<SpeechTranscript> {
    const token = apiService.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': input.mimeType || 'audio/webm',
      'X-Audio-Mime-Type': input.mimeType || 'audio/webm',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const controllerUrl = getDynamicControllerUrl();
    if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
    if (input.language) headers['X-Audio-Language'] = input.language;
    if (typeof input.sampleRate === 'number') headers['X-Audio-Sample-Rate'] = String(input.sampleRate);

    const resp = await fetch('/api/cortex/speech/transcribe', {
      method: 'POST',
      headers,
      body: input.audio,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(body.error ?? `Transcription failed (${resp.status})`);
    }

    const data = (await resp.json()) as { text: string; isFinal: boolean; provider: string };
    return { text: data.text, isFinal: data.isFinal, provider: data.provider };
  }
}

export async function getSpeechToTextConfig(): Promise<{
  provider: 'browser' | 'server';
  maxDurationSeconds: number;
  maxUploadBytes: number;
}> {
  const token = apiService.getAccessToken();
  const resp = await fetch('/api/cortex/speech/config', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) return { provider: 'browser', maxDurationSeconds: 60, maxUploadBytes: 8 * 1024 * 1024 };
  return resp.json();
}
