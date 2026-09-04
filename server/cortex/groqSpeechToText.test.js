import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeWithGroq } from './groqSpeechToText.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.GROQ_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.GROQ_API_KEY = originalKey;
});

describe('transcribeWithGroq', () => {
  it('throws when GROQ_API_KEY is not configured', async () => {
    delete process.env.GROQ_API_KEY;
    await expect(transcribeWithGroq(Buffer.from('x'), 'audio/webm')).rejects.toThrow('GROQ_API_KEY');
  });

  it('posts multipart form data and returns the transcript text', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    let capturedInit;
    globalThis.fetch = vi.fn((_url, init) => {
      capturedInit = init;
      return Promise.resolve({ ok: true, json: async () => ({ text: 'create a guest wlan' }) });
    });

    const result = await transcribeWithGroq(Buffer.from('fake-audio-bytes'), 'audio/webm');
    expect(result.text).toBe('create a guest wlan');
    expect(result.provider).toBe('groq');
    expect(capturedInit.headers.Authorization).toBe('Bearer gsk_test');
    expect(capturedInit.body).toBeInstanceOf(FormData);
  });

  it('surfaces provider failures explicitly rather than a silent empty transcript', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'upstream error' })
    );
    await expect(transcribeWithGroq(Buffer.from('x'), 'audio/webm')).rejects.toThrow('500');
  });

  it('never returns a successful transcript when the response has no text field', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    await expect(transcribeWithGroq(Buffer.from('x'), 'audio/webm')).rejects.toThrow('no text');
  });
});
