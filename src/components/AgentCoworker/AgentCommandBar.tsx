import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../ui/utils';
import { useUltronContext } from '../../contexts/UltronContext';

interface AgentCommandBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onOpen: () => void;
  isListening?: boolean;
  onMicToggle?: () => void;
  isThinking?: boolean;
  className?: string;
}

const MODEL_STORAGE_KEY = 'ultr0n_model';

function readSelectedModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function shortModelLabel(id: string | null): string {
  if (!id) return 'auto';
  // Trim provider prefixes ("openai/gpt-oss-120b" → "gpt-oss-120b") and version suffixes
  return (
    id
      .split('/')
      .pop()
      ?.replace(/-versatile$|-instant$/, '') ?? id
  );
}

function formatRowCount(n?: number): string | null {
  if (!Number.isFinite(n)) return null;
  const num = n as number;
  if (num >= 1000) return `${(num / 1000).toFixed(num >= 10_000 ? 0 : 1)}k rows`;
  return `${num} rows`;
}

export function AgentCommandBar({
  value,
  onChange,
  onSubmit,
  onOpen,
  isListening = false,
  onMicToggle,
  isThinking = false,
  className,
}: AgentCommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { ultronContext } = useUltronContext();
  const [model, setModel] = useState<string | null>(readSelectedModel);

  // Refresh model chip when localStorage changes (selector lives in slideout)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MODEL_STORAGE_KEY) setModel(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const pageName = ultronContext.pageName?.trim() || 'AURA';
  const meta = useMemo(() => {
    const parts: string[] = [];
    const rows = formatRowCount(ultronContext.visibleRowsSummary?.rowCount);
    if (rows) parts.push(rows);
    if (ultronContext.timeRange?.label) parts.push(ultronContext.timeRange.label);
    if (ultronContext.siteName) parts.push(ultronContext.siteName);
    return parts.join(' · ');
  }, [ultronContext.visibleRowsSummary, ultronContext.timeRange, ultronContext.siteName]);

  const placeholder = `investigate ${pageName.toLowerCase()}…`;

  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]', className)}>
      {/* Outer wrapper carries the violet accent line on top */}
      <div
        className={cn(
          'relative flex items-stretch min-w-[560px] max-w-[760px] h-12',
          'bg-[hsl(268_22%_7%/0.92)] backdrop-blur-md',
          'border border-white/8 rounded-lg overflow-hidden',
          'shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]'
        )}
      >
        {/* Top violet accent — subtle gradient, pulses while thinking */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 h-px',
            'bg-gradient-to-r from-transparent via-violet-400/70 to-transparent',
            isThinking && 'animate-pulse'
          )}
        />

        {/* Left: context badge */}
        <button
          onClick={onOpen}
          className={cn(
            'group flex items-center gap-2 px-3.5 shrink-0',
            'text-left hover:bg-white/[0.03] transition-colors',
            'border-r border-white/8'
          )}
          title="Open Ultr0n workspace"
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0',
              isThinking ? 'animate-pulse' : 'shadow-[0_0_8px_rgba(167,139,250,0.6)]'
            )}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-semibold tracking-tight text-white/90 truncate max-w-[180px]">
              {pageName}
            </span>
            {meta && (
              <span className="text-[9px] uppercase tracking-[0.08em] text-white/40 truncate max-w-[180px]">
                {meta}
              </span>
            )}
          </div>
        </button>

        {/* Center: input */}
        <div className="flex-1 flex items-center min-w-0 px-3">
          <input
            ref={inputRef}
            className={cn(
              'flex-1 bg-transparent outline-none min-w-0',
              'text-sm text-white/90 caret-violet-300',
              'placeholder:text-white/30 placeholder:font-light placeholder:italic'
            )}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onOpen}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) {
                e.preventDefault();
                onSubmit();
              }
            }}
            aria-label="Ask Ultr0n"
          />
          {onMicToggle && (
            <button
              onClick={onMicToggle}
              className={cn(
                'p-1 rounded transition-colors shrink-0',
                isListening
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-white/25 hover:text-white/60'
              )}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Right: model chip + hotkey */}
        <div className="flex items-center gap-3 px-3.5 shrink-0 border-l border-white/8">
          <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300/80">
            {shortModelLabel(model)}
          </span>
          <kbd
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded',
              'text-[9px] font-mono text-white/40',
              'bg-white/5 border border-white/8'
            )}
          >
            ⌘K
          </kbd>
        </div>
      </div>
    </div>
  );
}
