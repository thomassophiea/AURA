import { describe, it, expect } from 'vitest';
import { openSseStream } from './sseStream.js';

/**
 * A minimal stand-in for an Express response that records the ORDER of
 * everything, because order is the entire defect this module exists to fix.
 */
function makeRes() {
  const calls = [];
  return {
    calls,
    writableEnded: false,
    headersSent: false,
    writeHead(status, headers) {
      this.headersSent = true;
      calls.push({ kind: 'writeHead', status, headers });
      return this;
    },
    flushHeaders() {
      calls.push({ kind: 'flushHeaders' });
    },
    write(chunk) {
      calls.push({ kind: 'write', chunk });
      return true;
    },
    end() {
      this.writableEnded = true;
      calls.push({ kind: 'end' });
    },
  };
}

describe('openSseStream', () => {
  it('puts bytes on the wire before the caller does any work', () => {
    // The bug: res.writeHead() alone buffers in Node. Every byte of the
    // investigate route's real output came after a Gateway read that can block
    // for 30s+, so the edge proxy saw an upstream that had produced NOTHING and
    // returned a 502 whose body is the literal text `upstream error`.
    const res = makeRes();

    openSseStream(res);

    const kinds = res.calls.map((c) => c.kind);
    expect(kinds[0]).toBe('writeHead');
    // Both mechanisms, because flushHeaders can be a no-op behind an
    // intermediary while an actual byte never is.
    expect(kinds).toContain('flushHeaders');
    const firstWrite = res.calls.find((c) => c.kind === 'write');
    expect(firstWrite).toBeDefined();
    expect(firstWrite.chunk.length).toBeGreaterThan(0);
  });

  it('opens with an SSE comment, which carries no event and no data', () => {
    // A comment frame is the only thing safe to send before the first real
    // event: the client's dispatcher collects `event:` / `data:` lines and
    // returns early when a frame has no data, so this cannot be mistaken for
    // an answer, an error, or a partial frame.
    const res = makeRes();
    openSseStream(res);

    const firstWrite = res.calls.find((c) => c.kind === 'write').chunk;
    expect(firstWrite.startsWith(':')).toBe(true);
    expect(firstWrite.endsWith('\n\n')).toBe(true);
    expect(firstWrite).not.toContain('event:');
    expect(firstWrite).not.toContain('data:');
  });

  it('sets the headers that keep an SSE stream unbuffered end to end', () => {
    const res = makeRes();
    openSseStream(res);

    const { status, headers } = res.calls[0];
    expect(status).toBe(200);
    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(headers.Connection).toBe('keep-alive');
    // nginx and friends buffer an event stream into uselessness without this.
    expect(headers['X-Accel-Buffering']).toBe('no');
  });

  it('returns a send() that frames an event the client can parse', () => {
    const res = makeRes();
    const send = openSseStream(res);

    send('activity', { label: 'Reading service levels by site…' });

    const last = res.calls.at(-1).chunk;
    expect(last).toBe(
      'event: activity\ndata: {"label":"Reading service levels by site…"}\n\n'
    );
  });

  it('never writes to a response that has already ended', () => {
    // The operator closing the panel mid-investigation must not become an
    // ERR_STREAM_WRITE_AFTER_END that takes the process with it.
    const res = makeRes();
    const send = openSseStream(res);
    res.end();
    const before = res.calls.length;

    send('answer', { text: 'too late' });

    expect(res.calls.length).toBe(before);
  });

  it('tolerates a response object with no flushHeaders', () => {
    // Some proxies and test doubles hand over a plain writable. The explicit
    // comment byte is why this degrades instead of throwing.
    const res = makeRes();
    delete res.flushHeaders;

    expect(() => openSseStream(res)).not.toThrow();
    expect(res.calls.some((c) => c.kind === 'write')).toBe(true);
  });

  it('does not write headers twice when they are already sent', () => {
    const res = makeRes();
    res.headersSent = true;

    const send = openSseStream(res);

    expect(res.calls.some((c) => c.kind === 'writeHead')).toBe(false);
    expect(typeof send).toBe('function');
  });
});
