/**
 * AG Grid helpers for the Policy list pages: row-click-to-edit column
 * decoration (the kit grid reserves click for the selection checkbox column).
 */
import type { CellClickedEvent, ColDef } from 'ag-grid-community';

/** Make every data column open the editor when its cell is clicked. */
export function withRowClick<T>(cols: ColDef<T>[], onRow: (row: T) => void): ColDef<T>[] {
  return cols.map((col) => ({
    ...col,
    onCellClicked: (event: CellClickedEvent<T>) => {
      if (event.data) onRow(event.data);
    },
    cellStyle:
      col.cellStyle && typeof col.cellStyle === 'object'
        ? { ...col.cellStyle, cursor: 'pointer' }
        : { cursor: 'pointer' },
  }));
}
