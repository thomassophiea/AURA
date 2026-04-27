import type { ColDef, GridOptions } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

ModuleRegistry.registerModules([AllCommunityModule]);

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
  rowHeight: 40,
  headerHeight: 36,
  borderRadius: 6,
  wrapperBorderRadius: 8,
});

interface AGGridWrapperProps<TData> {
  rowData: TData[];
  columnDefs: ColDef<TData>[];
  gridOptions?: GridOptions<TData>;
  className?: string;
  height?: number | string;
}

export function AGGridWrapper<TData>({
  rowData,
  columnDefs,
  gridOptions,
  className,
  height = 500,
}: AGGridWrapperProps<TData>) {
  return (
    <div className={className} style={{ height }}>
      <AgGridReact
        theme={darkTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: 80,
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
