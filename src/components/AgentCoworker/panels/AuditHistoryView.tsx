import { CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../ui/utils';
import type { AuditEntry } from '../agentTypes';

interface AuditHistoryViewProps {
  entries: AuditEntry[];
}

function statusIcon(status: AuditEntry['status']) {
  if (status === 'completed')
    return <CheckCircle2 aria-label="Completed" className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === 'rejected')
    return <XCircle aria-label="Rejected" className="h-4 w-4 text-red-400 shrink-0" />;
  return <RotateCcw aria-label="Rolled back" className="h-4 w-4 text-orange-400 shrink-0" />;
}

const STATUS_LABEL = {
  completed: 'text-green-400',
  rejected: 'text-red-400',
  rolledback: 'text-orange-400',
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/8 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        {statusIcon(entry.status)}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 truncate">{entry.action}</p>
          <p className="text-[10px] text-white/35">
            {entry.operator} · {new Date(entry.timestamp).toLocaleString()}
          </p>
        </div>
        <span className={cn('text-xs font-medium shrink-0', STATUS_LABEL[entry.status])}>
          {entry.status}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-white/30" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-white/30" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-white/3 border-t border-white/8 space-y-2">
          <p className="text-[10px] text-white/40">
            Plan ID: <span className="font-mono">{entry.planId}</span>
          </p>
          {entry.impactedObjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.impactedObjects.map((obj) => (
                <span
                  key={obj.id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/60"
                >
                  {obj.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditHistoryView({ entries }: AuditHistoryViewProps) {
  if (!entries.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No operations recorded yet
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-3">
        Audit History — {entries.length} operation{entries.length !== 1 ? 's' : ''}
      </p>
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
