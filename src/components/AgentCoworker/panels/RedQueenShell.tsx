import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Radar } from 'lucide-react';
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

export function RedQueenShell({
  className,
  getContext,
}: {
  className?: string;
  getContext?: () => string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);
  const getContextRef = useRef(getContext);
  useEffect(() => {
    getContextRef.current = getContext;
  }, [getContext]);
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
      // Match the AURA dark palette exactly — background = --card (#161618)
      // so the terminal sits flush with the slideout chrome (also bg-card).
      // Accents pull from the live theme tokens (--primary, --success,
      // --warning, --destructive, --secondary).
      theme: {
        background: '#161618',
        foreground: '#ffffffde',
        cursor: '#bb86fc',
        cursorAccent: '#161618',
        selectionBackground: 'rgba(187,134,252,0.28)',
        black: '#161618',
        red: '#cf6679',
        green: '#81c784',
        yellow: '#ffb74d',
        blue: '#bb86fc',
        magenta: '#d0a3ff',
        cyan: '#03dac5',
        white: '#d6d6da',
        brightBlack: '#4a4a52',
        brightRed: '#e08597',
        brightGreen: '#9bd99e',
        brightYellow: '#ffce80',
        brightBlue: '#d0a3ff',
        brightMagenta: '#e6c6ff',
        brightCyan: '#5be6d6',
        brightWhite: '#ffffff',
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

      // ANSI splash — purple crown graphic left, info text right.
      // Uses true-colour escapes; xterm.js renders them natively.
      const P = '\x1b[38;2;187;134;252m'; // primary purple
      const P2 = '\x1b[38;2;208;163;255m'; // lighter purple
      const DIM = '\x1b[38;2;90;80;110m'; // dim purple
      const B = '\x1b[1m';
      const R = '\x1b[0m';
      const splash = [
        '',
        `  ${P}╭────────╮${R}`,
        `  ${P}│${R}${P2} ▄ ▄▄ ▄ ${R}${P}│${R}   ${B}Red Queen Shell${R}`,
        `  ${P}│${R}${P2} ███████ ${R}${P}│${R}   ${DIM}AURA · AI Console${R}`,
        `  ${P}│${R}${P2} ▀█████▀ ${R}${P}│${R}`,
        `  ${P}│${R}${P2}  ▀███▀  ${R}${P}│${R}   ${DIM}connecting…${R}`,
        `  ${P}╰────────╯${R}`,
        '',
      ].join('\r\n');
      term.write(splash);

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

      // Hide Claude's splash card + welcome chrome — fire once, 1.5 s after
      // the WS opens. A fixed delay (not reset on each message) ensures the
      // clear always fires even when Claude streams a long splash screen.
      let _splashTimer: ReturnType<typeof setTimeout> | null = null;
      let splashCleared = false;
      const clearSplash = () => {
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
            ws.send('\x0c'); // Ctrl+L — ask the agent to redraw prompt
            // Inject screen context ~400 ms later so Claude sees it at the prompt
            const ctx = getContextRef.current?.();
            if (ctx) {
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(ctx + '\n');
                  } catch {
                    /* ignore */
                  }
                }
              }, 400);
            }
          } catch {
            /* ignore */
          }
        }
      };

      ws.onopen = () => {
        setStatus('open');
        sendResize();
        _splashTimer = setTimeout(clearSplash, 1500);
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          term.write(ev.data);
        } else if (ev.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(ev.data));
        }
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
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {showStatus && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border/60">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
          <span>{statusLabel}</span>
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Terminal-art overlay — crown graphic in the top-left, permanent. */}
        <div
          className="pointer-events-none absolute z-10 select-none"
          style={{
            top: 14,
            left: 8,
            fontFamily: '"JetBrainsMono Nerd Font","JetBrains Mono","Fira Code",Menlo,monospace',
            fontSize: 13,
            lineHeight: '15.6px',
            color: '#bb86fc',
            whiteSpace: 'pre',
            backgroundColor: '#161618',
            padding: '2px 4px',
          }}
        >
          <span>{'╭──────╮'}</span>
          {'\n'}
          <span>{'│'}</span>
          <span style={{ color: '#d0a3ff' }}>{'▄████▄'}</span>
          <span>{'│'}</span>
          {'\n'}
          <span>{'│'}</span>
          <span style={{ color: '#d0a3ff' }}>{'██  ██'}</span>
          <span>{'│'}</span>
          {'\n'}
          <span>{'╰──────╯'}</span>
        </div>

        {/* Ambient radar watermark behind the PTY */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          <Radar className="h-16 w-16 text-primary/15" strokeWidth={1.25} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
