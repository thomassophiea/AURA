import { TABLE_STYLES, STATES } from '../utils/ui-constants';
import { cn } from '../lib/utils';
import { Skeleton } from './ui/skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  getRowKey: (item: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  onRowClick,
  getRowKey,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={TABLE_STYLES.wrapper}>
        <div className={STATES.loading}>
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={TABLE_STYLES.wrapper}>
        <div className={STATES.empty}>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={TABLE_STYLES.wrapper}>
      <table className={TABLE_STYLES.table}>
        <thead className={TABLE_STYLES.header}>
          <tr className={TABLE_STYLES.headerRow}>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(TABLE_STYLES.headerCell, column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={TABLE_STYLES.body}>
          {data.map((item) => (
            <tr
              key={getRowKey(item)}
              className={cn(
                TABLE_STYLES.bodyRow,
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(TABLE_STYLES.bodyCell, column.className)}
                >
                  {column.render
                    ? column.render(item)
                    : String((item as any)[column.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
