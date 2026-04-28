import type { ColDef, GridOptions } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 36;
const PAGINATION_HEIGHT = 48;

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

interface AGGridWrapperProps<TData> {
  rowData: TData[];
  columnDefs: ColDef<TData>[];
  gridOptions?: GridOptions<TData>;
  className?: string;
  /** Override auto-calculated height. Use only when auto-sizing is undesirable. */
  height?: number | string;
  maxHeight?: number;
}

export function AGGridWrapper<TData>({
  rowData,
  columnDefs,
  gridOptions,
  className,
  height,
  maxHeight = 640,
}: AGGridWrapperProps<TData>) {
  const rowCount = rowData?.length ?? 0;
  const autoHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT + PAGINATION_HEIGHT + 2;
  const resolvedHeight = height ?? Math.min(autoHeight, maxHeight);

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
      <style>{`
        .ag-body-horizontal-scroll::-webkit-scrollbar{display:none}
        .ag-body-horizontal-scroll{-ms-overflow-style:none;scrollbar-width:none}
        .ag-row,.ag-row-odd,.ag-row-even{border-bottom:1px solid rgba(255,255,255,0.09) !important;border-top:none !important}
        .ag-filter,.ag-filter-body-wrapper,.ag-simple-filter-body-wrapper,.ag-set-filter,.ag-menu{background-color:hsl(var(--card)) !important;background:hsl(var(--card)) !important;border:1px solid rgba(255,255,255,0.12) !important;border-radius:6px !important}
        .ag-popup-child,.ag-popup .ag-popup-child,.ag-menu-list,.ag-menu-option,.ag-filter-condition{background-color:hsl(var(--card)) !important;background:hsl(var(--card)) !important}
        .ag-popup>.ag-popup-child,.ag-popup-child{border:1px solid rgba(255,255,255,0.12) !important;border-radius:6px !important;box-shadow:0 4px 24px rgba(0,0,0,0.6) !important}
        .ag-select-list,.ag-list,.ag-virtual-list,.ag-picker-field-display,.ag-select .ag-picker-field-wrapper{background-color:hsl(var(--card)) !important;background:hsl(var(--card)) !important}
        .ag-list-item,.ag-select-list-item,.ag-virtual-list-item{background-color:hsl(var(--card)) !important;color:hsl(var(--foreground)) !important}
        .ag-list-item:hover,.ag-select-list-item:hover,.ag-virtual-list-item:hover{background-color:hsl(var(--accent)) !important}
        .ag-filter-select .ag-picker-field-wrapper,.ag-filter input[type="text"],.ag-text-field-input{background-color:hsl(var(--background)) !important;border:1px solid rgba(255,255,255,0.12) !important;color:hsl(var(--foreground)) !important}
        .ag-tab,.ag-tabs-header{background-color:hsl(var(--card)) !important}
        .ag-header-cell-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      `}</style>
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
      />
    </div>
  );
}
