import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useVoiceInput } from './useVoiceInput';

vi.mock('@/services/speechToText/groqSpeechToText', () => ({
  getSpeechToTextConfig: vi.fn().mockResolvedValue({ provider: 'browser', maxDurationSeconds: 60, maxUploadBytes: 8_000_000 }),
  GroqSpeechToTextProvider: class {
    transcribeAudio = vi.fn();
  },
}));

/** A minimal fake SpeechRecognition the hook can drive through its event handlers. */
class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
}

function resultEvent(text: string, isFinal: boolean) {
  return { results: [[{ transcript: text }]].map((r) => Object.assign(r, { isFinal, 0: r[0] })) };
}

let recognitionInstance: FakeSpeechRecognition;

beforeEach(async () => {
  recognitionInstance = new FakeSpeechRecognition();
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = vi.fn(() => recognitionInstance);
  // vi.restoreAllMocks() in the previous test's afterEach wipes the factory's
  // mockResolvedValue (there is no "original" implementation to restore to
  // for a vi.mock'd module) — reassert the default before every test.
  const speechModule = await import('@/services/speechToText/groqSpeechToText');
  vi.mocked(speechModule.getSpeechToTextConfig).mockResolvedValue({
    provider: 'browser',
    maxDurationSeconds: 60,
    maxUploadBytes: 8_000_000,
  });
});

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  vi.restoreAllMocks();
});

describe('useVoiceInput — browser provider', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.state).toBe('idle');
  });

  it('transitions idle -> listening -> transcript_ready on a final result', async () => {
    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('listening');
    expect(recognitionInstance.start).toHaveBeenCalled();

    act(() => {
      recognitionInstance.onresult?.(resultEvent('create a guest wlan', true));
    });

    expect(result.current.state).toBe('transcript_ready');
    expect(result.current.transcript).toBe('create a guest wlan');
  });

  it('reports permission_denied when the browser denies microphone access', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });

    // Classification is asynchronous: `not-allowed` is ambiguous in the spec
    // (user refusal OR user-agent refusal), so the hook consults the
    // Permissions API and the document policy before deciding which it was.
    // The act() must therefore be awaited to flush that promise.
    await act(async () => {
      recognitionInstance.onerror?.({ error: 'not-allowed' });
    });

    expect(result.current.state).toBe('permission_denied');
    // And it must tell the operator what to do about it.
    expect(result.current.error).toMatch(/blocked|padlock|refused/i);
  });

  it('reports a generic error for other recognition failures', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      recognitionInstance.onerror?.({ error: 'network' });
    });

    expect(result.current.state).toBe('error');
    // The raw code ('network') is no longer surfaced verbatim — an operator
    // cannot act on it. The message names the actual cause instead.
    expect(result.current.error).toMatch(/network access/i);
  });

  it('distinguishes missing hardware from a denied permission', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      recognitionInstance.onerror?.({ error: 'audio-capture' });
    });

    // No microphone present is not the same problem as a blocked microphone,
    // and sending the operator to their browser settings for it wastes time.
    expect(result.current.state).toBe('no_microphone');
  });

  it('reports a blocked speech service as policy, not as permission', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      recognitionInstance.onerror?.({ error: 'service-not-allowed' });
    });

    expect(result.current.state).toBe('blocked_by_policy');
    expect(result.current.error).toMatch(/not a microphone permission/i);
  });

  it('cancel() marks the session cancelled rather than emitting a transcript', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toBe('cancelled');
    expect(recognitionInstance.abort).toHaveBeenCalled();
  });

  it('reports unsupported when no SpeechRecognition constructor exists', async () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('unsupported');
  });

  it('reset() returns to idle with no transcript or error', async () => {
    const { result } = renderHook(() => useVoiceInput());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      recognitionInstance.onresult?.(resultEvent('hello', true));
    });
    expect(result.current.state).toBe('transcript_ready');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeUndefined();
  });
});

describe('useVoiceInput — server provider', () => {
  it('falls back to unsupported when MediaRecorder/getUserMedia are unavailable', async () => {
    const speechModule = await import('@/services/speechToText/groqSpeechToText');
    vi.mocked(speechModule.getSpeechToTextConfig).mockResolvedValueOnce({
      provider: 'server',
      maxDurationSeconds: 60,
      maxUploadBytes: 8_000_000,
    });

    const { result } = renderHook(() => useVoiceInput());
    await waitFor(() => {}); // let the config fetch resolve
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('unsupported');
  });
});
