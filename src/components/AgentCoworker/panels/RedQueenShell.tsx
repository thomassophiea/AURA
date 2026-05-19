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
      theme: {
        background: '#0d0b14',
        foreground: '#e9e6f4',
        cursor: '#a78bfa',
        cursorAccent: '#0d0b14',
        selectionBackground: 'rgba(167,139,250,0.35)',
        black: '#1a1726',
        red: '#ff6b8a',
        green: '#7ee787',
        yellow: '#f1c673',
        blue: '#79b8ff',
        magenta: '#c8a2ff',
        cyan: '#9ee0e6',
        white: '#e9e6f4',
        brightBlack: '#5a5371',
        brightRed: '#ff8aa3',
        brightGreen: '#9ef0a3',
        brightYellow: '#ffe091',
        brightBlue: '#9ecbff',
        brightMagenta: '#d8b8ff',
        brightCyan: '#b8eef4',
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

      ws.onopen = () => {
        setStatus('open');
        sendResize();
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

  const statusLabel =
    status === 'open'
      ? 'CONNECTED'
      : status === 'connecting'
        ? 'CONNECTING'
        : status === 'closed'
          ? 'DISCONNECTED'
          : 'ERROR';
  const statusDot =
    status === 'open'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(110,231,183,0.6)]'
      : status === 'connecting'
        ? 'bg-yellow-400 animate-pulse'
        : 'bg-red-400';

  return (
    <div className={cn('flex flex-col h-full bg-[#0d0b14]', className)}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/50 border-b border-white/8 bg-black/30">
        <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
        <img src="/red-queen-icon.webp" alt="" className="h-3 w-3 object-contain" />
        <span className="font-mono">RED-QUEEN</span>
        <span className="text-white/25">·</span>
        <span>{statusLabel}</span>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 px-2 pt-2" />
    </div>
  );
}
