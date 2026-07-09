/**
 * ArchitectureView (Feature Navigator) — the config entities arranged by
 * dependency layer with live counts and drill-through. Each node navigates via
 * the same onNavigate viewId contract as the catalog cards. No graph library:
 * a clean grouped layer layout with relationship captions between layers.
 */
import { ChevronDown } from 'lucide-react';
import { Card } from '../../ui/card';
import { cn } from '../../ui/utils';
import { ARCH_LAYERS, ACCENTS, type ArchNode } from './catalogData';
import type { FeatureCounts } from './useFeatureCounts';

interface ArchitectureViewProps {
  counts: FeatureCounts;
  onNavigate: (viewId: string) => void;
}

function countLabel(count: number | null | undefined): string {
  if (count === undefined) return '…';
  if (count === null) return '–';
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function ArchNodeCard({
  node,
  count,
  onNavigate,
}: {
  node: ArchNode;
  count: number | null | undefined;
  onNavigate: (viewId: string) => void;
}) {
  const styles = ACCENTS[node.accent];
  const Icon = node.icon;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(node.viewId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onNavigate(node.viewId);
        }
      }}
      className={cn(
        'group w-40 flex-row items-center gap-3 rounded-lg border-border px-3 py-3 shadow-none transition-colors',
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        styles.nodeRing
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors',
          styles.iconActive
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{node.label}</div>
        <div className="text-xs text-muted-foreground">{countLabel(count)}</div>
      </div>
    </Card>
  );
}

export function ArchitectureView({ counts, onNavigate }: ArchitectureViewProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-2 text-sm text-muted-foreground">
        Configuration components arranged by dependency layer. Select any component to open its
        editor.
      </p>
      {ARCH_LAYERS.map((layer, index) => (
        <div key={layer.key} className="flex flex-col gap-2">
          <Card className="gap-4 rounded-lg border-border p-4 shadow-none">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {layer.title}
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <div className="flex flex-wrap gap-3">
              {layer.nodes.map((node) => (
                <ArchNodeCard
                  key={node.id}
                  node={node}
                  count={node.countKey ? counts[node.countKey] : null}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </Card>
          {index < ARCH_LAYERS.length - 1 && (
            <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
              <ChevronDown className="size-3.5" aria-hidden />
              <span>{layer.relation}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
