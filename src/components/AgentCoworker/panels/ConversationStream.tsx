import { useRef, useEffect, useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Copy,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  Send,
} from 'lucide-react';
import { cn } from '../../ui/utils';
import type { AgentMessage } from '../agentTypes';
import { CortexAnswerCard } from '@/cortex/components/CortexAnswerCard';
import { CortexProgress } from '@/cortex/components/CortexProgress';

interface ConversationStreamProps {
  messages: AgentMessage[];
  isThinking: boolean;
  inputValue: string;
  isListening: boolean;
  onInput: (v: string) => void;
  onSubmit: () => void;
  onMicToggle: () => void;
  onFeedback: (msgId: string, feedback: 'up' | 'down') => void;
  onToggleReasoning: (msgId: string) => void;
  onFollowUp: (chip: string) => void;
  onConfirmWireless: (question: string, token: string) => void;
  wirelessStage?: 'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null;
  suggestedPrompts?: string[];
}

const SUGGESTED = [
  'How many APs are online?',
  "What's the client count right now?",
  'Show me sites with issues',
  'Which APs have the most clients?',
];

export function ConversationStream({
  messages,
  isThinking,
  inputValue,
  isListening,
  onInput,
  onSubmit,
  onMicToggle,
  onFeedback,
  onToggleReasoning,
  onFollowUp,
  onConfirmWireless,
  wirelessStage,
  suggestedPrompts,
}: ConversationStreamProps) {
  const promptsToShow =
    suggestedPrompts && suggestedPrompts.length > 0 ? suggestedPrompts : SUGGESTED;
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  function handleCopy(msg: AgentMessage) {
    navigator.clipboard.writeText(msg.content).catch(() => {});
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 && !isThinking && (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-white/30 font-medium uppercase tracking-wider">Suggested</p>
            <div className="flex flex-col gap-2">
              {promptsToShow.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    onInput(q);
                    inputRef.current?.focus();
                  }}
                  className="text-left text-sm text-white/60 hover:text-white/90 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'justify-end')}>
            {msg.role === 'agent' && (
              <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0 mt-2 shadow-[0_0_8px_rgba(167,139,250,0.7)]" />
            )}
            <div className={cn('max-w-[88%] space-y-2', msg.role === 'user' && 'items-end')}>
              {msg.role === 'agent' && msg.wirelessAnswer ? (
                <CortexAnswerCard
                  answer={msg.wirelessAnswer}
                  onFollowUp={onFollowUp}
                  onConfirm={(token) => onConfirmWireless(msg.wirelessAnswer!.question, token)}
                />
              ) : (
                <div
                  className={cn(
                    'text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary/90 text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5'
                      : 'text-white/85'
                  )}
                >
                  {msg.content}
                </div>
              )}

              {msg.role === 'agent' && msg.reasoning && (
                <button
                  onClick={() => onToggleReasoning(msg.id)}
                  className="flex items-center gap-1 text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  {msg.showReasoning ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  Show Reasoning
                </button>
              )}
              {msg.showReasoning && msg.reasoning && (
                <div className="text-xs text-white/40 font-mono bg-white/5 rounded-lg px-3 py-2 leading-relaxed">
                  {msg.reasoning}
                </div>
              )}

              {msg.role === 'agent' && (
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => onFeedback(msg.id, 'up')}
                    className={cn(
                      'transition-colors',
                      msg.feedback === 'up' ? 'text-green-400' : 'text-white/25 hover:text-white/60'
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onFeedback(msg.id, 'down')}
                    className={cn(
                      'transition-colors',
                      msg.feedback === 'down' ? 'text-red-400' : 'text-white/25 hover:text-white/60'
                    )}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleCopy(msg)}
                    className="text-white/25 hover:text-white/60 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button className="text-white/25 hover:text-white/60 transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-auto text-[10px] text-white/25">
                    {copiedId === msg.id
                      ? 'Copied!'
                      : msg.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex gap-3">
            <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0 mt-2 shadow-[0_0_8px_rgba(167,139,250,0.7)]" />
            {wirelessStage ? (
              <CortexProgress stage={wirelessStage} />
            ) : (
              <div className="flex items-center gap-1.5 py-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/8">
        <div className="flex items-center gap-2 h-12 px-4 rounded-full bg-[hsl(268_15%_14%)] ring-1 ring-white/10">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-white/85 placeholder:text-white/35 outline-none caret-violet-400 min-w-0"
            placeholder="Ask me anything..."
            value={inputValue}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue.trim()) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <button
            onClick={onMicToggle}
            className={cn(
              'p-1.5 rounded-full transition-colors shrink-0',
              isListening ? 'text-red-400' : 'text-white/30 hover:text-white/60'
            )}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={() => inputValue.trim() && onSubmit()}
            disabled={!inputValue.trim()}
            className="p-1.5 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
