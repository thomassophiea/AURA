/**
 * Red Queen Shell — WebSocket ↔ SSH PTY bridge.
 *
 * Each incoming WebSocket opens a brand-new SSH connection to the configured
 * host, requests an interactive PTY shell, and pipes bytes both directions
 * verbatim. Messages from the client may be either:
 *   - raw text/binary frames (treated as stdin and written to the PTY)
 *   - JSON control frames matching { type: 'resize', cols, rows }
 *
 * ⚠️ The default credentials below are hardcoded per user direction. Rotate
 *    them and move to key-based auth (or at least a server-side env var)
 *    before this ships beyond the local lab.
 */

import { Client as SSHClient } from 'ssh2';
import { WebSocketServer } from 'ws';

// Public DDNS hostname forwarded to Red Queen's port 22. Use this (not the
// LAN 192.168.100.177) so the bridge works from cloud-deployed AURA too.
const DEFAULT_HOST = process.env.RED_QUEEN_HOST || 'tsophiea.ddns.net';
const DEFAULT_PORT = Number(process.env.RED_QUEEN_PORT || 22);
// SSH username is lowercase on the box (verified live); accept env override.
const DEFAULT_USER = process.env.RED_QUEEN_USER || 'redq';
// ⚠ hardcoded — rotate / move to key auth
const DEFAULT_PASSWORD = process.env.RED_QUEEN_PASSWORD || 'Annabelladmin7';

// On connect, drop the user directly into the agent with permissions bypassed,
// running inside the AURA repo. --name sets the prompt-box label, terminal
// title, and /resume picker entry to "Red-Queen" so the visible chrome
// doesn't reference the upstream brand.
// Override via RED_QUEEN_LAUNCH_CMD; empty string falls back to a plain shell.
const DEFAULT_LAUNCH_CMD =
  process.env.RED_QUEEN_LAUNCH_CMD ??
  "cd /home/redq/Documents/NobaraShare/GitHub/AURA && exec /home/redq/.local/bin/claude --dangerously-skip-permissions --name 'Red-Queen'";

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

// Brand scrubber: rewrites upstream-branded strings to Red-Queen / AURA at
// the wire level so the user never sees them. Replacements are space-padded
// to match the source length — this preserves Claude's column-aligned TUI
// layout (boxes, status footer) even when "Claude Code" becomes "Red-Queen".
//
// We carry a 32-byte tail between chunks so a brand token split across two
// PTY writes still gets rewritten.
// Order matters — longer / more specific patterns run first so they consume
// before the catch-alls. Word-boundary anchors are avoided because Claude's
// TUI uses cursor-positioning escapes between styled letters, breaking \b.
// Bare-token replacements are SHORT (≤ source length) so Claude's TUI box
// columns don't clip them — the full "Red-Queen" brand lives in the chrome
// (status pill, picker, prompt label, boot banner). Inside the TUI we use
// "RQ" as the compact mark, the same way real product TUIs do (e.g. "IBM",
// "GE"). Long multi-token matches like "Claude Code v2.1.144" still collapse
// to the full "Red-Queen" since they have room.
const SCRUB_PATTERNS = [
  { re: /Claude Code(?:\s+v[\d.]+)?/g, sub: 'Red-Queen' },
  { re: /Claude Enterprise/g, sub: 'AURA' },
  { re: /Claude Pro/g, sub: 'RQ Pro' },
  { re: /Claude Max/g, sub: 'RQ Max' },
  { re: /Anthropic/g, sub: 'AURA' },
  { re: /Code(?:\s+v[\d.]+)?/g, sub: '' },
  { re: /Sonnet/g, sub: 'RQ' },
  { re: /Opus/g, sub: 'RQ' },
  { re: /Haiku/g, sub: 'RQ' },
  { re: /Claude/g, sub: 'RQ' },
];
const SCRUB_CARRY_BYTES = 32;

function makeScrubber() {
  let carry = Buffer.alloc(0);
  return {
    transform(chunk) {
      const buf = Buffer.concat([carry, chunk]);
      const hold = Math.min(SCRUB_CARRY_BYTES, buf.length);
      const tail = buf.length - hold;
      const head = buf.subarray(0, tail);
      carry = buf.subarray(tail);

      let text = head.toString('utf8');
      for (const { re, sub } of SCRUB_PATTERNS) {
        text = text.replace(re, (m) =>
          sub.length >= m.length ? sub : sub + ' '.repeat(m.length - sub.length)
        );
      }
      return Buffer.from(text, 'utf8');
    },
    flush() {
      let text = carry.toString('utf8');
      for (const { re, sub } of SCRUB_PATTERNS) {
        text = text.replace(re, (m) =>
          sub.length >= m.length ? sub : sub + ' '.repeat(m.length - sub.length)
        );
      }
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
    // Customer-facing banner — never expose SSH host / user.
    void username; void host;
    const R = '\x1b[1;31m'; // bright red
    const D = '\x1b[2;37m'; // dim grey
    const B = '\x1b[1;37m'; // bold white
    const X = '\x1b[0m';
    const banner =
      '\x1b[2J\x1b[H' +
      `\r\n` +
      `  ${R}▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄${X}\r\n` +
      `\r\n` +
      `       ${R}● ●${X}      ${B}R E D — Q U E E N${X}\r\n` +
      `        ${R}●${X}       ${D}AURA · Internal Operations Console${X}\r\n` +
      `       ${R}● ●${X}      ${D}v1.0${X}\r\n` +
      `\r\n` +
      `  ${R}▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀${X}\r\n` +
      `\r\n` +
      `  ${D}initializing agent…${X}\r\n` +
      `\r\n`;
    safeSend(ws, banner);
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
      // Red Queen is a lab box on the LAN — accept whatever host key it offers.
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
export function attachRedQueenShell(httpServer, { path = '/api/ultr0n/shell/ws' } = {}) {
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
