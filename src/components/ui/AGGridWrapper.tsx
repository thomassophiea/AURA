import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 36;
const PAGINATION_HEIGHT = 48;

const STORAGE_PREFIX = 'aura.grid-state.';

const darkTheme = themeQuartz.withParams({
  backgroundColor: 'hsl(var(--background))',
  foregroundColor: 'hsl(var(--foreground))',
  borderColor: 'hsl(var(--border))',
  chromeBackgroundColor: 'hsl(var(--card))',
  headerBackgroundColor: 'hsl(var(--card))',
  headerTextColor: 'hsl(var(--muted-foreground))',
  rowHoverColor: 'hsl(var(--accent))',
  selectedRowBackgroundColor: 'hsl(var(--primary) / 0.15)',
  fontFamily: 'inherit',
  fontSize: 12,
  rowHeight: ROW_HEIGHT,
  headerHeight: HEADER_HEIGHT,
  borderRadius: 6,
  wrapperBorderRadius: 8,
  cellHorizontalPaddingScale: 0.75,
});

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

function readSavedState(key?: string) {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : undefined;
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
            localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(e.state));
          } catch {
            /* ignore quota / disabled storage */
          }
        },
      }
    : {};

  // Bridge consumer's onGridReady so we can capture the API regardless.
  const consumerOnGridReady = gridOptions?.onGridReady;
  const onGridReady = (e: GridReadyEvent<TData>) => {
    apiRef.current = e.api;
    consumerOnGridReady?.(e);
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
        border: '1px solid rgba(255,255,255,0.12)',
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
