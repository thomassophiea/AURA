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
    <div className={className} style={{ height: resolvedHeight }}>
      <AgGridReact
        theme={darkTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: 100,
          cellStyle: { display: 'flex', alignItems: 'center' },
        }}
        animateRows
        pagination
        paginationPageSize={50}
        paginationPageSizeSelector={[25, 50, 100, 250]}
        {...gridOptions}
      />
    </div>
  );
}
