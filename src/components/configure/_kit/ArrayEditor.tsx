/**
 * Generic editor for object arrays (RADIUS servers, DHCP exclusions, band
 * settings, ...): collapsible item cards with add/remove.
 */
import React, { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible';
import { cn } from '../../ui/utils';

export interface ArrayEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Render the expanded editor body for one item. */
  renderItem: (item: T, index: number, update: (next: T) => void) => React.ReactNode;
  /** Collapsed summary title, e.g. the server IP. */
  getItemTitle: (item: T, index: number) => React.ReactNode;
  /** Factory for a new item; omit to hide the Add button. */
  createItem?: () => T;
  addLabel?: string;
  emptyText?: string;
  /** Cap the list length (Add hides at the cap). */
  maxItems?: number;
  className?: string;
}

export function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  getItemTitle,
  createItem,
  addLabel = 'Add',
  emptyText = 'No entries configured',
  maxItems,
  className,
}: ArrayEditorProps<T>) {
  // Newly added items start expanded so the user can fill them immediately.
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  const setOpen = (index: number, open: boolean) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (open) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const updateAt = (index: number, next: T) => {
    onChange(items.map((item, i) => (i === index ? next : item)));
  };

  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    setOpenIndexes((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  };

  const add = () => {
    if (!createItem) return;
    onChange([...items, createItem()]);
    setOpen(items.length, true);
  };

  const canAdd = createItem && (maxItems === undefined || items.length < maxItems);

  return (
    <div className={cn('space-y-2', className)}>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      {items.map((item, index) => {
        const open = openIndexes.has(index);
        return (
          <Collapsible
            key={index}
            open={open}
            onOpenChange={(o) => setOpen(index, o)}
            className="rounded-md border border-border"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left text-sm">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-180'
                  )}
                />
                <span className="truncate">{getItemTitle(item, index)}</span>
              </CollapsibleTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => removeAt(index)}
                aria-label="Remove entry"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent className="space-y-4 border-t border-border px-3 py-3">
              {renderItem(item, index, (next) => updateAt(index, next))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {canAdd && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
