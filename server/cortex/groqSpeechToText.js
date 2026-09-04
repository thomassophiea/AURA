/**
 * Server-side speech-to-text via Groq's hosted Whisper endpoint.
 *
 * Opt-in only (`SPEECH_TO_TEXT_PROVIDER=server` + `GROQ_API_KEY`) — reuses the
 * Groq key AURA already onboards for LLM chat rather than introducing a new
 * provider. The browser-native Web Speech API is the default adapter and
 * needs no server component at all; this file exists for deployments that
 * want a consistent transcript quality across browsers.
 *
 * The audio buffer passed in is never logged and is not retained by this
 * module — the caller (server.js) discards it immediately after the
 * transcription request settles.
 */

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

const EXT_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};

/**
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {{ language?: string }} [opts]
 * @returns {Promise<{ text: string, provider: string }>}
 */
export async function transcribeWithGroq(audioBuffer, mimeType, opts = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const ext = EXT_BY_MIME[mimeType?.split(';')[0]?.trim()] ?? 'webm';
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `audio.${ext}`);
  form.append('model', MODEL);
  if (opts.language) form.append('language', opts.language);

  const resp = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => resp.statusText);
    // Never echo audio content; the error body from Groq is plain text/JSON,
    // not the audio itself.
    throw new Error(`Groq transcription failed: ${resp.status} ${errorText}`);
  }

  const data = await resp.json();
  if (typeof data.text !== 'string') {
    // Never return a successful transcript when transcription actually failed.
    throw new Error('Groq transcription returned no text');
  }

  return { text: data.text, provider: 'groq' };
}
