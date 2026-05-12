import { useRef } from 'react';
import { Bot, ExternalLink, LayoutGrid, Mic, MicOff } from 'lucide-react';
import { cn } from '../ui/utils';

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

  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-[99998]', className)}>
      <div
        className={cn(
          'flex items-center gap-3 h-14 min-w-[480px] max-w-[640px] rounded-full px-4',
          'bg-[hsl(268_20%_8%)] border border-white/10',
          'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]',
          'transition-shadow duration-300',
          isThinking &&
            'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(187,134,252,0.25),0_0_32px_rgba(187,134,252,0.12)]'
        )}
      >
        <Bot className="h-5 w-5 shrink-0 text-violet-400" />

        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/35 outline-none caret-violet-400 min-w-0"
          placeholder="Ask me anything here, search chats, or /command..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />

        <div className="flex items-center gap-2 shrink-0">
          {onMicToggle && (
            <button
              onClick={onMicToggle}
              className={cn(
                'p-1.5 rounded-full transition-colors',
                isListening
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-white/30 hover:text-white/60'
              )}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <div className="w-px h-4 bg-white/10" />
          <button
            onClick={onOpen}
            className="text-white/30 hover:text-white/60 transition-colors p-1.5"
            title="Open workspace"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={onOpen}
            className="text-white/30 hover:text-white/60 transition-colors p-1.5"
            title="Command palette"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
