/**
 * Ordered rule rows (role L2/L3/L7 filters, ACLs): per-row edit/delete and
 * move up/down. Order is semantic — rules evaluate top-down.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';

export interface RuleListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Compact one-line summary of a rule (name, action badge, match). */
  renderSummary: (item: T, index: number) => React.ReactNode;
  /** Open the rule editor for a row; omit to hide the edit button. */
  onEdit?: (index: number) => void;
  emptyText?: string;
  className?: string;
}

export function RuleList<T>({
  items,
  onChange,
  renderSummary,
  onEdit,
  emptyText = 'No rules defined',
  className,
}: RuleListProps<T>) {
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  if (items.length === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>{emptyText}</p>;
  }

  return (
    <ol className={cn('space-y-1', className)}>
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
        >
          <span className="w-6 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1 text-sm">{renderSummary(item, index)}</div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label="Move rule up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
              aria-label="Move rule down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(index)}
                aria-label="Edit rule"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => removeAt(index)}
              aria-label="Delete rule"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
