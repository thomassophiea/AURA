/**
 * Column Selector Component
 *
 * UI for selecting which columns to show/hide in a table.
 * Supports:
 * - Toggle individual columns
 * - Group by category
 * - Search/filter columns
 * - Show all / Hide all
 * - Lock certain columns from being hidden
 */

import { useState, useMemo } from 'react';
import { Check, Search, Eye, EyeOff, Lock } from 'lucide-react';
import { ColumnConfig, ColumnId, ColumnCategory } from '@/types/table';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Checkbox } from './checkbox';
import { Badge } from './badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './accordion';

interface ColumnSelectorProps {
  /** Available columns */
  columns: ColumnConfig[];

  /** Currently visible column IDs */
  visibleColumns: ColumnId[];

  /** Callback when selection changes */
  onChange: (visibleColumns: ColumnId[]) => void;

  /** Whether to group by category */
  groupByCategory?: boolean;

  /** Show search box */
  showSearch?: boolean;

  /** Show quick actions (show all / hide all) */
  showQuickActions?: boolean;
}

export function ColumnSelector({
  columns,
  visibleColumns,
  onChange,
  groupByCategory = true,
  showSearch = true,
  showQuickActions = true
}: ColumnSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Group columns by category
  const columnsByCategory = useMemo(() => {
    const filtered = columns.filter(col =>
      col.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!groupByCategory) {
      return { all: filtered };
    }

    const grouped = filtered.reduce((acc, col) => {
      const category = col.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(col);
      return acc;
    }, {} as Record<string, ColumnConfig[]>);

    return grouped;
  }, [columns, searchQuery, groupByCategory]);

  // Get category label
  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      basic: 'Basic Information',
      devices: 'Devices',
      metrics: 'Metrics & Performance',
      status: 'Status',
      network: 'Network',
      advanced: 'Advanced',
      security: 'Security',
      performance: 'Performance',
      other: 'Other'
    };
    return labels[category] || category;
  };

  // Toggle column
  const toggleColumn = (columnId: ColumnId) => {
    if (isLocked(columnId)) return;

    const newVisible = visibleColumns.includes(columnId)
      ? visibleColumns.filter(id => id !== columnId)
      : [...visibleColumns, columnId];

    onChange(newVisible);
  };

  // Check if column is locked
  const isLocked = (columnId: ColumnId): boolean => {
    const column = columns.find(c => c.key === columnId);
    return column?.lockVisible === true;
  };

  // Show all columns
  const showAll = () => {
    const allIds = columns.map(c => c.key);
    onChange(allIds);
  };

  // Hide all (except locked)
  const hideAll = () => {
    const lockedIds = columns
      .filter(c => c.lockVisible === true)
      .map(c => c.key);
    onChange(lockedIds);
  };

  // Reset to defaults
  const resetToDefaults = () => {
    const defaultVisible = columns
      .filter(c => c.defaultVisible !== false)
      .map(c => c.key);
    onChange(defaultVisible);
  };

  // Count visible in category
  const getVisibleCount = (categoryColumns: ColumnConfig[]): number => {
    return categoryColumns.filter(c => visibleColumns.includes(c.key)).length;
  };

  return (
    <div className="space-y-4">
      {/* Header with search and quick actions */}
      {(showSearch || showQuickActions) && (
        <div className="space-y-3">
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {showQuickActions && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={showAll}
                className="flex-1"
              >
                <Eye className="mr-2 h-4 w-4" />
                Show All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={hideAll}
                className="flex-1"
              >
                <EyeOff className="mr-2 h-4 w-4" />
                Hide All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefaults}
              >
                Reset
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Column list */}
      {groupByCategory ? (
        <Accordion type="multiple" defaultValue={Object.keys(columnsByCategory)} className="w-full">
          {Object.entries(columnsByCategory).map(([category, categoryColumns]) => (
            <AccordionItem key={category} value={category}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between flex-1 pr-4">
                  <span className="font-medium">{getCategoryLabel(category)}</span>
                  <Badge variant="secondary" className="ml-2">
                    {getVisibleCount(categoryColumns)} / {categoryColumns.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {categoryColumns.map((column) => (
                    <ColumnItem
                      key={column.key}
                      column={column}
                      isVisible={visibleColumns.includes(column.key)}
                      isLocked={isLocked(column.key)}
                      onToggle={() => toggleColumn(column.key)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="space-y-2">
          {columns.map((column) => (
            <ColumnItem
              key={column.key}
              column={column}
              isVisible={visibleColumns.includes(column.key)}
              isLocked={isLocked(column.key)}
              onToggle={() => toggleColumn(column.key)}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="pt-2 border-t text-sm text-muted-foreground">
        {visibleColumns.length} of {columns.length} columns visible
      </div>
    </div>
  );
}

interface ColumnItemProps {
  column: ColumnConfig;
  isVisible: boolean;
  isLocked: boolean;
  onToggle: () => void;
}

function ColumnItem({ column, isVisible, isLocked, onToggle }: ColumnItemProps) {
  return (
    <div className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
      <Checkbox
        id={column.key}
        checked={isVisible}
        onCheckedChange={onToggle}
        disabled={isLocked}
      />
      <Label
        htmlFor={column.key}
        className="flex-1 cursor-pointer select-none flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span>{column.label}</span>
          {column.tooltip && (
            <span className="text-xs text-muted-foreground">
              ({column.tooltip})
            </span>
          )}
        </span>
        {isLocked && (
          <Lock className="h-3 w-3 text-muted-foreground" />
        )}
      </Label>
    </div>
  );
}
