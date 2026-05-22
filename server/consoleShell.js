/**
 * AURA Agent shell — WebSocket ↔ SSH PTY bridge.
 *
 * Each incoming WebSocket opens a brand-new SSH connection to the configured
 * host, requests an interactive PTY shell, and pipes bytes both directions
 * verbatim. Messages from the client may be either:
 *   - raw text/binary frames (treated as stdin and written to the PTY)
 *   - JSON control frames matching { type: 'resize', cols, rows }
 *
 * Internal WS path `/api/cortex/shell/ws` is stable — registered model
 * id `redq-shell` remains for backward compat. Customer-facing surface reads "AURA Console".
 *
 * ⚠️ The default credentials below are hardcoded per user direction. Rotate
 *    them and move to key-based auth (or at least a server-side env var)
 *    before this ships beyond the local lab.
 */

import { Client as SSHClient } from 'ssh2';
import { WebSocketServer } from 'ws';

// Public DDNS hostname forwarded to the lab box's port 22. Use this (not
// the LAN 192.168.100.177) so the bridge works from cloud-deployed AURA too.
const DEFAULT_HOST = process.env.RED_QUEEN_HOST || 'tsophiea.ddns.net';
const DEFAULT_PORT = Number(process.env.RED_QUEEN_PORT || 22);
// SSH username is lowercase on the box (verified live); accept env override.
const DEFAULT_USER = process.env.RED_QUEEN_USER || 'redq';
// ⚠ hardcoded — rotate / move to key auth
const DEFAULT_PASSWORD = process.env.RED_QUEEN_PASSWORD || 'Annabelladmin7';

// On connect, drop the user directly into the agent with permissions bypassed,
// running inside the AURA repo. --name sets the prompt-box label, terminal
// title, and /resume picker entry to "AURA" so the visible chrome reads
// as the product, not the upstream brand.
// Override via RED_QUEEN_LAUNCH_CMD; empty string falls back to a plain shell.
const DEFAULT_LAUNCH_CMD =
  process.env.RED_QUEEN_LAUNCH_CMD ??
  "cd /home/redq/Documents/NobaraShare/GitHub/AURA && exec /home/redq/.local/bin/claude --dangerously-skip-permissions --name 'AURA'";

const READY_TIMEOUT_MS = 15_000;
const KEEPALIVE_INTERVAL_MS = 20_000;

function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(payload);
  } catch {
    /* socket closed mid-write */
  }
}

function clampDim(n, lo, hi, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

// Brand scrubber: rewrites upstream-branded strings to AURA at the wire
// level so the user never sees them. Replacements are space-padded to match
// the source length — this preserves Claude's column-aligned TUI layout
// (boxes, status footer) even when "Claude Code" becomes "AURA".
//
// We carry a 32-byte tail between chunks so a brand token split across two
// PTY writes still gets rewritten.
// Order matters — longer / more specific patterns run first so they consume
// before the catch-alls. Word-boundary anchors are avoided because Claude's
// TUI uses cursor-positioning escapes between styled letters, breaking \b.
// Bare-token replacements are SHORT (≤ source length) so Claude's TUI box
// columns don't clip them. Long multi-token matches like
// "Claude Code v2.1.144" collapse to "AURA" since they have room.
const SCRUB_PATTERNS = [
  // Brand identifiers — collapse upstream model + product names to AURA or
  // a neutral tier label. Headlines get the full "AURA" since they have room;
  // inline model names just drop the brand and keep the version suffix.
  { re: /Claude.{0,20}?Code(?:\s+v[\d.]+)?/gs, sub: 'AURA' },
  { re: /Claude.{0,20}?Enterprise/gs, sub: 'AURA' },
  { re: /Claude.{0,20}?Pro\b/gs, sub: 'Pro Tier' },
  { re: /Claude.{0,20}?Max\b/gs, sub: 'Max Tier' },
  { re: /Anthropic/g, sub: 'AURA' },
  { re: /Code(?:\s+v[\d.]+)?/g, sub: '' },
  { re: /Sonnet/g, sub: '' },
  { re: /Opus/g, sub: '' },
  { re: /Haiku/g, sub: '' },
  { re: /Claude/g, sub: 'AURA' },
  // Project / session label rewrites — Claude Code stores the project label
  // from the original `--name` invocation and keeps using it after rename.
  // Catch every casing of the legacy "Red Queen" / "Red-Queen" pill before
  // the bare "Code" / "AURA" passes run, so the bottom-of-screen status
  // reads as the product.
  { re: /RED[- ]QUEEN/g, sub: 'AURA' },
  { re: /Red[- ]Queen/g, sub: 'AURA' },
  { re: /red[- ]queen/g, sub: 'AURA' },
  // Claude Code mascot — pixel-art block characters in the welcome card.
  // Each block char is its own styled span at the byte level with cursor
  // escapes between, so we use lazy wildcards to span across them. Lower-half
  // block (▐), upper-corner (▛), lower-corner (▌), etc. bracket the rows.
  { re: /▐[\s\S]{0,30}?▌/gs, sub: '       ' },
  { re: /▝▜[\s\S]{0,40}?▛▘/gs, sub: '         ' },
  { re: /▘[\s\S]{0,20}?▝▝/gs, sub: '      ' },
  // Footer / status leaks — make Claude's TUI footer read as a product
  { re: /MCP server/g, sub: 'service' },
  { re: /MCP servers/g, sub: 'services' },
  // .{0,N}? wildcards (non-greedy) between keywords catch both spaced and
  // escape-separated renderings — Claude's TUI styles adjacent text spans
  // with cursor escapes that look like non-letters but aren't whitespace.
  { re: /bypass.{0,40}?on(?![a-z])/gs, sub: 'agent armed' },
  { re: /\(.{0,40}?tab.{0,40}?\)/gs, sub: '' },
  { re: /←.{0,20}?agents/gs, sub: '' },
  { re: /\/(mcp|release-notes|model|effort|resume|help)\b/g, sub: '' },
  // Bare version strings (eg "v2.1.144") leak the upstream release tag —
  // strip wherever they appear, not only after whitespace.
  { re: /v\d+\.\d+\.\d+/g, sub: '' },
];
// Brand-token keywords. After applyPatterns runs, the only way a brand can
// leak is if its bytes were split across two PTY chunks — i.e. the buffer
// ENDS with a prefix of one of these. We hold just that suffix and emit
// everything before. This is the latency-critical bit: a blanket 32-byte
// carry stalls every keystroke echo in an interactive TUI; the original
// implementation held back any chunk under 32 bytes, causing visible lag.
// Compound patterns (e.g. `Claude.{0,20}?Code`) need no special handling
// here because the catch-all `/Claude/g` rule scrubs the leading token,
// and the trailing token (`Code`) is scrubbed when its chunk arrives.
const BRAND_KEYWORDS = [
  'Claude', 'Anthropic', 'Code', 'Sonnet', 'Opus', 'Haiku',
  'MCP server', 'MCP servers', 'bypass',
  '/mcp', '/release-notes', '/model', '/effort', '/resume', '/help',
  '(', '←', '▐', '▝', '▘',
];
const SCRUB_MAX_CARRY = 32;

function findCarryStart(text) {
  let earliest = text.length;
  const maxScan = Math.min(SCRUB_MAX_CARRY, text.length);
  for (const kw of BRAND_KEYWORDS) {
    const maxPrefix = Math.min(kw.length - 1, maxScan);
    if (maxPrefix === 0) {
      if (text.endsWith(kw)) {
        const startIdx = text.length - kw.length;
        if (startIdx < earliest) earliest = startIdx;
      }
      continue;
    }
    for (let len = maxPrefix; len >= 1; len--) {
      if (text.endsWith(kw.slice(0, len))) {
        const startIdx = text.length - len;
        if (startIdx < earliest) earliest = startIdx;
        break;
      }
    }
  }
  return earliest;
}

function makeScrubber() {
  let carry = Buffer.alloc(0);
  const applyPatterns = (text) => {
    for (const { re, sub } of SCRUB_PATTERNS) {
      text = text.replace(re, (m) =>
        sub.length >= m.length ? sub : sub + ' '.repeat(m.length - sub.length)
      );
    }
    return text;
  };
  return {
    transform(chunk) {
      const buf = Buffer.concat([carry, chunk]);
      const text = applyPatterns(buf.toString('utf8'));
      const cut = findCarryStart(text);
      const head = text.slice(0, cut);
      carry = Buffer.from(text.slice(cut), 'utf8');
      return Buffer.from(head, 'utf8');
    },
    flush() {
      const text = applyPatterns(carry.toString('utf8'));
      carry = Buffer.alloc(0);
      return Buffer.from(text, 'utf8');
    },
  };
}

function bridgeOne(ws, opts = {}) {
  const host = opts.host || DEFAULT_HOST;
  const port = opts.port || DEFAULT_PORT;
  const username = opts.username || DEFAULT_USER;
  const password = opts.password || DEFAULT_PASSWORD;
  const launchCmd = opts.launchCmd ?? DEFAULT_LAUNCH_CMD;
  const initialCols = clampDim(opts.cols, 20, 400, 100);
  const initialRows = clampDim(opts.rows, 5, 200, 32);

  const ssh = new SSHClient();
  let shell = null;
  let closed = false;

  const closeAll = (reason) => {
    if (closed) return;
    closed = true;
    try { shell?.end(); } catch { /* ignore */ }
    try { ssh.end(); } catch { /* ignore */ }
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      try { ws.close(1000, reason || 'closed'); } catch { /* ignore */ }
    }
  };

  const scrubStdout = makeScrubber();
  const scrubStderr = makeScrubber();
  const onStream = (err, stream) => {
    if (err) {
      safeSend(ws, `\r\n\x1b[31mssh stream error: ${err.message}\x1b[0m\r\n`);
      return closeAll('stream-error');
    }
    shell = stream;
    stream.on('data', (chunk) => safeSend(ws, scrubStdout.transform(chunk)));
    stream.stderr.on('data', (chunk) => safeSend(ws, scrubStderr.transform(chunk)));
    stream.on('close', () => {
      safeSend(ws, scrubStdout.flush());
      safeSend(ws, scrubStderr.flush());
      closeAll('stream-closed');
    });
  };

  ssh.on('ready', () => {
    void username; void host;
    // Just clear the screen — chrome lives in the workspace header now, not
    // the terminal. The boot banner used to live here.
    safeSend(ws, '\x1b[2J\x1b[H');
    const ptyOpts = { term: 'xterm-256color', cols: initialCols, rows: initialRows };
    if (launchCmd && launchCmd.trim()) {
      // ssh2's protocol-level remote-exec (NOT child_process.exec) — runs the
      // command on the remote SSH server inside an allocated PTY. Wrapped in
      // `bash -lc` so PATH / rc files are loaded regardless of the user's
      // login shell (the box has fish/zsh under starship).
      const wrapped = `bash -lc ${JSON.stringify(launchCmd)}`;
      const runRemote = ssh.exec.bind(ssh);
      runRemote(wrapped, { pty: ptyOpts }, onStream);
    } else {
      ssh.shell(ptyOpts, onStream);
    }
  });

  ssh.on('error', (err) => {
    safeSend(ws, `\r\n\x1b[31mssh error: ${err.message}\x1b[0m\r\n`);
    closeAll('ssh-error');
  });

  ssh.on('end', () => closeAll('ssh-end'));
  ssh.on('close', () => closeAll('ssh-close'));
  ssh.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finish) => {
    finish([password]);
  });

  ws.on('message', (raw, isBinary) => {
    if (!shell) return;
    if (!isBinary) {
      const text = raw.toString();
      // try control frame first
      if (text.startsWith('{')) {
        try {
          const msg = JSON.parse(text);
          if (msg && msg.type === 'resize') {
            const cols = Number(msg.cols) || 80;
            const rows = Number(msg.rows) || 24;
            try { shell.setWindow(rows, cols, 0, 0); } catch { /* ignore */ }
            return;
          }
        } catch {
          /* not JSON — treat as raw input */
        }
      }
      shell.write(text);
      return;
    }
    shell.write(raw);
  });

  ws.on('close', () => closeAll('ws-close'));
  ws.on('error', () => closeAll('ws-error'));

  const keepalive = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      try { ws.ping(); } catch { /* ignore */ }
    } else {
      clearInterval(keepalive);
    }
  }, KEEPALIVE_INTERVAL_MS);
  ws.once('close', () => clearInterval(keepalive));

  try {
    ssh.connect({
      host,
      port,
      username,
      password,
      tryKeyboard: true,
      readyTimeout: READY_TIMEOUT_MS,
      keepaliveInterval: 15_000,
      // Lab box on the LAN — accept whatever host key it offers.
      // Lock this down before going beyond the lab.
      algorithms: undefined,
    });
  } catch (err) {
    safeSend(ws, `\r\n\x1b[31mssh connect threw: ${err.message}\x1b[0m\r\n`);
    closeAll('ssh-throw');
  }
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Auth: a ?token=<bearer> query param is required and must be non-empty.
 * The same trust assumption as requireAuth() — token validity is delegated
 * to the controller for the real management paths; here we just refuse
 * fully-anonymous connects.
 */
export function attachConsoleShell(httpServer, { path = '/api/cortex/shell/ws' } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://placeholder');
    } catch {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    if (url.pathname !== path) return;

    const token = url.searchParams.get('token') || '';
    if (!token || token.length < 10) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const cols = url.searchParams.get('cols');
    const rows = url.searchParams.get('rows');
    wss.handleUpgrade(req, socket, head, (ws) => {
      bridgeOne(ws, { cols, rows });
    });
  });

  return wss;
}
