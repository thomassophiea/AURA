/**
 * Opening an SSE response so that it actually reaches the client.
 *
 * `res.writeHead()` does not put anything on the wire. Node buffers the head
 * until the first write, so a route that writes its headers and then goes away
 * to do work looks, to everything between it and the browser, like an upstream
 * that has produced nothing at all.
 *
 * That is exactly the shape of `/api/cortex/investigate`: the headers were
 * written, and then scope resolution read the Gateway's site and WLAN inventory
 * before the first `activity` event. When the Gateway's flex/report subsystem
 * stalls — its documented failure mode, ~31 s to a 500 — no byte had left the
 * server. Railway's edge proxy gives up on a byte-less upstream at ~32 s and
 * answers the browser itself with a 502 whose body is the two words
 *
 *     upstream error
 *
 * which `cortexApiClient` surfaces verbatim, because a non-2xx body there is
 * normally a message written for a person. So an operator asking a completely
 * ordinary question — "how is Primary site overall?" — got two words of someone
 * else's infrastructure vocabulary, and the server logged NOTHING, because
 * nothing had gone wrong yet on our side. It was still waiting.
 *
 * Measured against Integration on 2026-09-16: 502 at 32.3 s to first byte,
 * body `upstream error`, no application log line. The same question on a run
 * where the Gateway answered promptly streamed happily for 64 s total — the
 * edge caps time to FIRST BYTE, not duration, which is why this presented as
 * intermittent rather than broken.
 *
 * The fix is to make the stream real before doing any work: flush the head and
 * write one SSE comment. After that the connection is established, the edge has
 * its bytes, and a slow Gateway costs the operator a wait and an honest error
 * instead of a dead 502.
 */

/** Headers that keep an event stream unbuffered from Node to the browser. */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // nginx and most reverse proxies will happily buffer an event stream into
  // uselessness without this.
  'X-Accel-Buffering': 'no',
};

/**
 * Open an SSE stream on `res` and return the `send(event, data)` used to write
 * to it.
 *
 * Call this BEFORE any await that could block. That is the whole point: every
 * millisecond between the response starting and the first byte is a millisecond
 * an intermediary is entitled to conclude the upstream is dead.
 *
 * @param {import('http').ServerResponse} res
 * @returns {(event: string, data: unknown) => void}
 */
export function openSseStream(res) {
  if (!res.headersSent) {
    res.writeHead(200, { ...SSE_HEADERS });
  }

  // Two mechanisms, because either can be a no-op on its own: flushHeaders is
  // absent on some response doubles and can be swallowed by an intermediary,
  // and a comment frame is only reliably flushed once the head is out.
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  // An SSE comment. The client's dispatcher gathers `event:` / `data:` lines
  // and returns early on a frame with no data, so this cannot be mistaken for
  // an answer, an error, or a truncated event — it exists purely to make the
  // connection real.
  res.write(': open\n\n');

  return (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}
