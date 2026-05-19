import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { cn } from '../../ui/utils';

const RECONNECT_DELAY_MS = 1500;

type Status = 'connecting' | 'open' | 'closed' | 'error';

function readAuthToken(): string {
  try {
    return localStorage.getItem('access_token') ?? '';
  } catch {
    return '';
  }
}

function buildWsUrl(token: string, cols: number, rows: number): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return (
    `${scheme}//${window.location.host}/api/ultr0n/shell/ws` +
    `?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`
  );
}

export function RedQueenShell({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      // Prefer fonts likely to ship Nerd Font / extended-Unicode glyphs for
      // Claude Code's mascot + box-drawing chars. Falls back to plain mono.
      fontFamily:
        '"JetBrainsMono Nerd Font", "JetBrains Mono", "FiraCode Nerd Font", "Fira Code", "Cascadia Code", "MesloLGS NF", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
      // AURA palette — derived from the EP1 dashboard tokens so the
      // terminal reads as part of the product, not a separate console.
      // Background matches `--background` (#1e1f2a), cursor + accents
      // use the brand purple, status colors come from EP1 success/warn/error.
      theme: {
        background: '#1e1f2a',
        foreground: '#f8f8fb',
        cursor: '#8981e5',
        cursorAccent: '#1e1f2a',
        selectionBackground: 'rgba(137,129,229,0.30)',
        black: '#1e1f2a',
        red: '#ed5f56',
        green: '#75bf63',
        yellow: '#E5B85C',
        blue: '#8981e5',
        magenta: '#aba3fb',
        cyan: '#7eb8c9',
        white: '#D7D9E6',
        brightBlack: '#4d4f63',
        brightRed: '#f47a72',
        brightGreen: '#9bd685',
        brightYellow: '#f0c878',
        brightBlue: '#aba3fb',
        brightMagenta: '#c4beff',
        brightCyan: '#a4d4e0',
        brightWhite: '#f8f8fb',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }
    termRef.current = term;
    fitRef.current = fit;

    const sendResize = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      } catch {
        /* ignore */
      }
    };

    const dataDisp = term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
    const resizeDisp = term.onResize(sendResize);

    const refit = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };
    // The slideout can be drag-resized; the window may not resize. Observe
    // the container instead so the PTY follows the panel width.
    const ro = new ResizeObserver(refit);
    ro.observe(containerRef.current);
    window.addEventListener('resize', refit);

    const connect = () => {
      if (disposedRef.current) return;
      setStatus('connecting');
      term.write('\r\n\x1b[2m connecting…\x1b[0m\r\n');

      const token = readAuthToken();
      if (!token) {
        setStatus('error');
        term.write('\r\n\x1b[31m no access token — log in first\x1b[0m\r\n');
        return;
      }

      // Fit *now* so we can hand the server the right initial PTY size in
      // the URL — otherwise Claude renders its splash at the default 100x32
      // and our late /resize message can't undo the broken layout.
      refit();
      const cols = term.cols;
      const rows = term.rows;

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl(token, cols, rows));
      } catch (err) {
        setStatus('error');
        term.write(`\r\n\x1b[31m ws error: ${(err as Error).message}\x1b[0m\r\n`);
        return;
      }
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      // Hide Claude's splash card + welcome chrome — once the initial draw
      // settles (no incoming bytes for 800ms), clear xterm's buffer and tap
      // Ctrl+L so Claude redraws just the prompt. Fires once per session.
      let splashTimer: ReturnType<typeof setTimeout> | null = null;
      let splashCleared = false;
      const scheduleSplashClear = () => {
        if (splashCleared) return;
        if (splashTimer) clearTimeout(splashTimer);
        splashTimer = setTimeout(() => {
          if (splashCleared) return;
          splashCleared = true;
          try {
            term.clear();
            term.reset();
          } catch {
            /* ignore */
          }
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('\x0c'); // Ctrl+L — ask the agent to redraw
            } catch {
              /* ignore */
            }
          }
        }, 800);
      };

      ws.onopen = () => {
        setStatus('open');
        sendResize();
        scheduleSplashClear();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          term.write(ev.data);
        } else if (ev.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(ev.data));
        }
        scheduleSplashClear();
      };
      ws.onerror = () => {
        setStatus('error');
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (disposedRef.current) return;
        setStatus('closed');
        term.write('\r\n\x1b[33m disconnected — retrying in 1.5s…\x1b[0m\r\n');
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      disposedRef.current = true;
      window.removeEventListener('resize', refit);
      ro.disconnect();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      dataDisp.dispose();
      resizeDisp.dispose();
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Once the session is live and stable, hide the pill — connection state is
  // implicit, and the panel reads as product chrome. Only surface it for the
  // noisy states (connecting / closed / error) where the user wants feedback.
  const showStatus = status !== 'open';
  const statusLabel =
    status === 'connecting'
      ? 'Establishing link…'
      : status === 'closed'
        ? 'Reconnecting…'
        : 'Connection error';
  const statusDot = status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400';

  return (
    <div className={cn('flex flex-col h-full bg-[#1e1f2a]', className)}>
      {showStatus && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55 border-b border-white/[0.06] bg-black/40">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
          <span>{statusLabel}</span>
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 px-2 pt-2" />
    </div>
  );
}
