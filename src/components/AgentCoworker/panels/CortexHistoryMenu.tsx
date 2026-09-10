import { useEffect, useRef, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { CortexConversation } from '@/hooks/useCortexHistory';

/** "4m ago" reads better than a timestamp for something from this session. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * Past conversations, from this browser.
 *
 * History is what makes "Clear" safe: clearing archives rather than destroys,
 * so the only irreversible action here is an explicit delete.
 */
export function CortexHistoryMenu({
  conversations,
  activeId,
  onRestore,
  onDelete,
  onClearAll,
}: {
  conversations: CortexConversation[];
  activeId?: string;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a panel-local menu should not need
  // a second click on the trigger to dismiss.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmClearAll(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmClearAll(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={conversations.length ? `History (${conversations.length})` : 'History (empty)'}
        aria-label="Conversation history"
        aria-expanded={open}
        className={cn(
          'p-1 rounded transition-colors hover:bg-accent/30',
          open ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg',
            'border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.5)]'
          )}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              History
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              this browser only
            </span>
          </div>

          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No past conversations yet. They are saved here automatically once Cortex answers.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-start gap-2 border-b border-border/30 px-3 py-2 last:border-b-0',
                    c.id === activeId ? 'bg-primary/10' : 'hover:bg-accent/20'
                  )}
                >
                  <button
                    onClick={() => {
                      onRestore(c.id);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-xs text-foreground/90">{c.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {relativeTime(c.updatedAt)} · {c.messages.length} message
                      {c.messages.length === 1 ? '' : 's'}
                      {c.id === activeId && ' · current'}
                    </span>
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    title="Delete this conversation"
                    aria-label={`Delete conversation: ${c.title}`}
                    className="mt-0.5 shrink-0 p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {conversations.length > 0 && (
            <div className="border-t border-border/60 px-3 py-2">
              {confirmClearAll ? (
                <div className="flex items-center justify-between gap-2">
                  {/* Deleting everything is the one irreversible action here. */}
                  <span className="text-[11px] text-muted-foreground">Delete all history?</span>
                  <span className="flex gap-2">
                    <button
                      onClick={() => {
                        onClearAll();
                        setConfirmClearAll(false);
                        setOpen(false);
                      }}
                      className="text-[11px] font-medium text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmClearAll(false)}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  className="text-[11px] text-muted-foreground hover:text-red-400"
                >
                  Delete all history
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
