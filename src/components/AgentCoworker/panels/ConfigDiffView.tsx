import { cn } from '../../ui/utils';
import type { DiffEntry } from '../agentTypes';

interface ConfigDiffViewProps {
  diff: DiffEntry[];
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function ConfigDiffView({ diff }: ConfigDiffViewProps) {
  if (!diff.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No config changes staged
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-4">
        Staged Changes — {diff.length} field{diff.length !== 1 ? 's' : ''}
      </p>
      <div className="rounded-lg overflow-hidden border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 text-white/40">
              <th className="text-left px-3 py-2 font-medium">Scope</th>
              <th className="text-left px-3 py-2 font-medium">Field</th>
              <th className="text-left px-3 py-2 font-medium">Before</th>
              <th className="text-left px-3 py-2 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {diff.map((entry, i) => (
              <tr
                key={i}
                className={cn(
                  'border-t border-white/6',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-white/2'
                )}
              >
                <td className="px-3 py-2.5 text-white/40 font-mono text-[10px]">{entry.scope}</td>
                <td className="px-3 py-2.5 text-white/70 font-medium">{entry.field}</td>
                <td className="px-3 py-2.5 font-mono text-red-400/80 line-through">
                  {formatValue(entry.before)}
                </td>
                <td className="px-3 py-2.5 font-mono text-green-400">{formatValue(entry.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
