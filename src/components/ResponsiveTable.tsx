/**
 * Responsive Table Component
 *
 * Automatically renders as:
 * - Mobile: Card-based layout with essential info
 * - Desktop: Full table with all columns
 */

import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/useDeviceDetection';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { useSwipeable } from 'react-swipeable';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  cell: (item: T) => ReactNode;
  mobileVisible?: boolean; // Show in mobile card view (default: false)
  className?: string;
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: ResponsiveTableColumn<T>[];
  getKey: (item: T) => string | number;
  mobileCardRender?: (item: T) => ReactNode; // Custom mobile card rendering
  onRowClick?: (item: T) => void;
  onSwipeLeft?: (item: T) => void; // Mobile swipe action
  onSwipeRight?: (item: T) => void; // Mobile swipe action
  className?: string;
  emptyMessage?: string;
}

export function ResponsiveTable<T>({
  data,
  columns,
  getKey,
  mobileCardRender,
  onRowClick,
  onSwipeLeft,
  onSwipeRight,
  className = '',
  emptyMessage = 'No data available'
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={`space-y-3 ${className}`}>
        {data.map((item, index) => (
          <MobileCard
            key={getKey(item)}
            item={item}
            columns={columns}
            index={index}
            customRender={mobileCardRender}
            onClick={onRowClick}
            onSwipeLeft={onSwipeLeft}
            onSwipeRight={onSwipeRight}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow
              key={getKey(item)}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface MobileCardProps<T> {
  item: T;
  columns: ResponsiveTableColumn<T>[];
  index: number;
  customRender?: (item: T) => ReactNode;
  onClick?: (item: T) => void;
  onSwipeLeft?: (item: T) => void;
  onSwipeRight?: (item: T) => void;
}

function MobileCard<T>({
  item,
  columns,
  index,
  customRender,
  onClick,
  onSwipeLeft,
  onSwipeRight,
}: MobileCardProps<T>) {
  const handlers = useSwipeable({
    onSwipedLeft: () => onSwipeLeft?.(item),
    onSwipedRight: () => onSwipeRight?.(item),
    trackMouse: false,
  });

  const content = customRender ? (
    customRender(item)
  ) : (
    <div className="space-y-2">
      {columns
        .filter((col) => col.mobileVisible !== false)
        .map((col) => (
          <div key={col.key}>
            {col.cell(item)}
          </div>
        ))}
    </div>
  );

  return (
    <Card
      {...(onSwipeLeft || onSwipeRight ? handlers : {})}
      onClick={() => onClick?.(item)}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(item); }} : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`
        p-4
        hover:shadow-md transition-all duration-300
        animate-in fade-in slide-in-from-bottom-2
        ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50' : ''}
        ${onSwipeLeft || onSwipeRight ? 'touch-action-pan-y' : ''}
      `}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}
