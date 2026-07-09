/**
 * Standard Configure list page: header + toolbar (search / Refresh / Clone /
 * Delete / Add) over an AGGridWrapper with per-grid column persistence.
 * Delete honors each record's canDelete flag and always confirms.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { ColDef, GridOptions, SelectionChangedEvent } from 'ag-grid-community';
import { Copy, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AGGridWrapper, type AGGridWrapperHandle } from '../../ui/AGGridWrapper';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { ConfirmDialog } from './ConfirmDialog';

export interface ResourceGridPageProps<T> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  rows: T[];
  columnDefs: ColDef<T>[];
  loading: boolean;
  /** Column-state persistence key; stored as `aura.grid-state.configure.<key>`. */
  storageKey: string;
  getRowId: (row: T) => string;
  /** Text the search box matches against (defaults to common name fields). */
  getSearchText?: (row: T) => string;
  /** Per-row delete gate; defaults to the record's canDelete !== false. */
  canDeleteRow?: (row: T) => boolean;
  onAdd?: () => void;
  /** Clone is enabled when exactly one row is selected. */
  onClone?: (row: T) => void;
  /** Called per selected deletable row after the user confirms. */
  onDelete?: (rows: T[]) => void | Promise<void>;
  onRefresh?: () => void;
  /** Extra toolbar content (rendered between search and the action buttons). */
  toolbarExtra?: React.ReactNode;
  headerActions?: React.ReactNode;
  gridHeight?: number;
}

const NAME_FIELDS = ['name', 'serviceName', 'siteName', 'cosName', 'userId', 'ssid'] as const;

function defaultSearchText(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const record = row as Record<string, unknown>;
  return NAME_FIELDS.map((f) => (typeof record[f] === 'string' ? (record[f] as string) : ''))
    .join(' ')
    .toLowerCase();
}

function hasCanDelete(row: unknown): boolean {
  if (!row || typeof row !== 'object') return true;
  return (row as { canDelete?: boolean | null }).canDelete !== false;
}

export function ResourceGridPage<T>({
  title,
  description,
  icon: Icon,
  rows,
  columnDefs,
  loading,
  storageKey,
  getRowId,
  getSearchText,
  canDeleteRow,
  onAdd,
  onClone,
  onDelete,
  onRefresh,
  toolbarExtra,
  headerActions,
  gridHeight,
}: ResourceGridPageProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<T[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gridRef = useRef<AGGridWrapperHandle>(null);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    const textOf = getSearchText ?? defaultSearchText;
    return rows.filter((row) => textOf(row).toLowerCase().includes(term));
  }, [rows, searchTerm, getSearchText]);

  const deletable = useMemo(
    () => selected.filter((row) => (canDeleteRow ? canDeleteRow(row) : hasCanDelete(row))),
    [selected, canDeleteRow]
  );

  const gridOptions = useMemo<GridOptions<T>>(
    () => ({
      rowSelection: { mode: 'multiRow', enableClickSelection: false },
      getRowId: (params) => getRowId(params.data),
      onSelectionChanged: (event: SelectionChangedEvent<T>) => {
        setSelected(event.api.getSelectedRows());
      },
    }),
    [getRowId]
  );

  const confirmDelete = async () => {
    setConfirmOpen(false);
    if (onDelete && deletable.length > 0) {
      await onDelete(deletable);
      gridRef.current?.getApi()?.deselectAll();
      setSelected([]);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-8 w-8 text-primary" />}
          <div className="space-y-1">
            <h1 className="text-2xl font-medium">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">{headerActions}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {toolbarExtra}
        <div className="ml-auto flex items-center gap-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {onClone && (
            <Button
              variant="outline"
              size="sm"
              disabled={selected.length !== 1}
              onClick={() => onClone(selected[0])}
            >
              <Copy className="mr-1 h-4 w-4" />
              Clone
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deletable.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
          {onAdd && (
            <Button size="sm" onClick={onAdd}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <AGGridWrapper<T>
              ref={gridRef}
              rowData={filtered}
              columnDefs={columnDefs}
              gridOptions={gridOptions}
              height={gridHeight}
              storageKey={`configure.${storageKey}`}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${deletable.length} ${deletable.length === 1 ? 'record' : 'records'}?`}
        description={
          selected.length !== deletable.length
            ? `${selected.length - deletable.length} selected record(s) are protected (canDelete=false) and will be skipped. This action cannot be undone.`
            : 'This permanently removes the selected record(s) from the controller. This action cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
