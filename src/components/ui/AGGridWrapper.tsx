/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 36;
const PAGINATION_HEIGHT = 48;

const STORAGE_PREFIX = 'aura.grid-state.';

// Theme vars hold hex values (e.g. #1e1f2a), so pass them straight through —
// wrapping in hsl() produces invalid CSS and silently reverts to Quartz defaults.
const darkTheme = themeQuartz.withParams({
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--foreground)',
  borderColor: 'var(--border)',
  chromeBackgroundColor: 'var(--card)',
  headerBackgroundColor: 'var(--card)',
  headerTextColor: 'var(--muted-foreground)',
  accentColor: 'var(--primary)',
  rowHoverColor: 'color-mix(in srgb, var(--primary) 10%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)',
  checkboxCheckedBackgroundColor: 'var(--primary)',
  checkboxCheckedBorderColor: 'var(--primary)',
  checkboxCheckedShapeColor: 'var(--primary-foreground)',
  checkboxUncheckedBackgroundColor: 'transparent',
  checkboxUncheckedBorderColor: 'var(--muted-foreground)',
  checkboxIndeterminateBackgroundColor: 'var(--primary)',
  checkboxIndeterminateBorderColor: 'var(--primary)',
  checkboxIndeterminateShapeColor: 'var(--primary-foreground)',
  checkboxBorderRadius: 4,
  checkboxBorderWidth: 1.5,
  columnBorder: false,
  headerColumnBorder: false,
  fontFamily: 'inherit',
  fontSize: 13,
  rowHeight: ROW_HEIGHT,
  headerHeight: HEADER_HEIGHT,
  borderRadius: 6,
  wrapperBorderRadius: 8,
  cellHorizontalPaddingScale: 0.75,
});

/* Shared column types — opt in via `type: 'numeric'` / `type: 'status'` on a ColDef.
   numeric: right-aligned quantities in tabular numerals (identifiers stay left).
   status:  dot + label; map values with STATUS_TONES or pass cellRendererParams.toneOf. */
const COLUMN_TYPES: NonNullable<GridOptions['columnTypes']> = {
  numeric: {
    headerClass: 'ag-header-right',
    cellClass: 'ag-cell-numeric',
    cellStyle: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
      overflow: 'hidden',
    },
  },
  status: {
    cellRenderer: StatusCellRenderer,
  },
};

const STATUS_TONES: Record<string, string> = {
  // tone -> css color; keys matched case-insensitively by StatusCellRenderer
  connected: 'var(--success, #75bf63)',
  online: 'var(--success, #75bf63)',
  up: 'var(--success, #75bf63)',
  active: 'var(--success, #75bf63)',
  enabled: 'var(--success, #75bf63)',
  healthy: 'var(--success, #75bf63)',
  approved: 'var(--success, #75bf63)',
  warning: 'var(--warning, #E5B85C)',
  degraded: 'var(--warning, #E5B85C)',
  pending: 'var(--warning, #E5B85C)',
  disconnected: 'var(--destructive, #ed5f56)',
  offline: 'var(--destructive, #ed5f56)',
  down: 'var(--destructive, #ed5f56)',
  critical: 'var(--destructive, #ed5f56)',
  failed: 'var(--destructive, #ed5f56)',
  denied: 'var(--destructive, #ed5f56)',
  disabled: 'var(--muted-foreground, #babcce)',
  inactive: 'var(--muted-foreground, #babcce)',
  unknown: 'var(--muted-foreground, #babcce)',
};

/** Dot + label status cell. Unmapped values render with a muted dot. */
export function StatusCellRenderer(params: { value?: unknown }) {
  const label = params.value == null || params.value === '' ? '—' : String(params.value);
  const tone =
    STATUS_TONES[label.toLowerCase()] ?? 'var(--muted-foreground, #babcce)';
  if (label === '—') return <span style={{ color: 'var(--muted-foreground)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: tone,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

const DEFAULT_SELECTION_COL_DEF: NonNullable<GridOptions['selectionColumnDef']> = {
  width: 48,
  minWidth: 48,
  maxWidth: 48,
  pinned: 'left',
  resizable: false,
  cellStyle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export interface AGGridWrapperHandle {
  /** Reset all column state (sort/filter/width/visibility/order) and clear persisted state. */
  resetState: () => void;
  /** Force-refresh visible cells (use after non-row state updates like polled side-data). */
  refreshCells: () => void;
  /** Underlying AG Grid API. */
  getApi: () => GridApi | null;
}

interface AGGridWrapperProps<TData> {
  rowData: TData[];
  columnDefs: ColDef<TData>[];
  gridOptions?: GridOptions<TData>;
  className?: string;
  /** Override auto-calculated height. Use only when auto-sizing is undesirable. */
  height?: number | string;
  maxHeight?: number;
  /**
   * Persist column state (width, order, visibility, sort, filter, pinning) to
   * localStorage under `aura.grid-state.<storageKey>`. Restored on mount via
   * `initialState`. Pass a unique key per grid (e.g. `'access-points'`).
   */
  storageKey?: string;
}

// Transient AG Grid state slices that must NOT be restored across mounts:
// `scroll` and `focusedCell` lock the body to an old viewport offset, which
// renders as a tall blank band above the actual rows (the grid is paged to
// the prior scrollTop but the new data doesn't fill it). `rangeSelection`
// + `cellSelection` re-highlight cells the user never touched.
const VOLATILE_STATE_KEYS = ['scroll', 'focusedCell', 'rangeSelection', 'cellSelection'] as const;

function sanitizeState(state: any) {
  if (!state || typeof state !== 'object') return state;
  const out = { ...state };
  for (const k of VOLATILE_STATE_KEYS) delete out[k];
  return out;
}

function readSavedState(key?: string) {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? sanitizeState(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

function AGGridWrapperInner<TData>(
  {
    rowData,
    columnDefs,
    gridOptions,
    className,
    height,
    maxHeight = 640,
    storageKey,
  }: AGGridWrapperProps<TData>,
  ref: React.Ref<AGGridWrapperHandle>
) {
  const rowCount = rowData?.length ?? 0;
  const autoHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT + PAGINATION_HEIGHT + 2;
  const resolvedHeight = height ?? Math.min(autoHeight, maxHeight);

  // Read persisted state once. Stays stable across renders so it's not re-applied.
  const savedStateRef = useRef<any>(null);
  if (savedStateRef.current === null) savedStateRef.current = readSavedState(storageKey);

  const apiRef = useRef<GridApi | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      resetState: () => {
        if (storageKey) {
          try {
            localStorage.removeItem(STORAGE_PREFIX + storageKey);
          } catch {
            /* ignore quota / disabled storage */
          }
        }
        savedStateRef.current = undefined;
        apiRef.current?.resetColumnState();
        apiRef.current?.setFilterModel(null);
      },
      refreshCells: () => apiRef.current?.refreshCells({ force: true }),
      getApi: () => apiRef.current,
    }),
    [storageKey]
  );

  const persistedHandlers: Partial<GridOptions<TData>> = storageKey
    ? {
        initialState: savedStateRef.current,
        onStateUpdated: (e: any) => {
          try {
            localStorage.setItem(
              STORAGE_PREFIX + storageKey,
              JSON.stringify(sanitizeState(e.state))
            );
          } catch {
            /* ignore quota / disabled storage */
          }
        },
      }
    : {};

  // Bridge consumer's onGridReady so we can capture the API regardless.
  // Belt-and-suspenders against stuck scroll viewports: force the body back
  // to row 0 once on ready, in case any volatile state slipped past the
  // sanitizer or the grid restored a scroll offset from a different source.
  const consumerOnGridReady = gridOptions?.onGridReady;
  const onGridReady = (e: GridReadyEvent<TData>) => {
    apiRef.current = e.api;
    consumerOnGridReady?.(e);
    if (e.api.getDisplayedRowCount() > 0) {
      try {
        e.api.ensureIndexVisible(0, 'top');
      } catch {
        /* ignore */
      }
    }
  };

  // Apply default selection column styling when consumer hasn't overridden it.
  const selectionColumnDef =
    gridOptions?.selectionColumnDef ??
    (gridOptions?.rowSelection ? DEFAULT_SELECTION_COL_DEF : undefined);

  return (
    <div
      className={className}
      style={{
        height: resolvedHeight,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <style>{`.ag-header-cell-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`}</style>
      <AgGridReact
        theme={darkTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: 100,
          cellStyle: {
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            overflow: 'hidden',
          },
        }}
        animateRows
        pagination
        paginationPageSize={50}
        paginationPageSizeSelector={[25, 50, 100, 250]}
        popupParent={typeof document !== 'undefined' ? document.body : undefined}
        columnTypes={COLUMN_TYPES}
        suppressCellFocus
        // Fill the full grid width (no dead right gutter) — but never fight
        // column widths the user has resized and persisted.
        autoSizeStrategy={
          savedStateRef.current?.columnSizing ? undefined : { type: 'fitGridWidth' }
        }
        {...gridOptions}
        selectionColumnDef={selectionColumnDef}
        {...persistedHandlers}
        onGridReady={onGridReady}
      />
    </div>
  );
}

// Cast preserves generic inference through forwardRef.
export const AGGridWrapper = forwardRef(AGGridWrapperInner) as <TData>(
  props: AGGridWrapperProps<TData> & { ref?: React.Ref<AGGridWrapperHandle> }
) => React.ReactElement;
