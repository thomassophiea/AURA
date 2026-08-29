/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Column definitions for the Events & Alarms grids (EventAlarmDashboard).
 *
 * Alarm and event payloads come from non-Swagger controller endpoints, so the
 * row shapes are loose (`any`) — every accessor here is defensive. Severity
 * renders through the shared `status` column type (dot + normalized label),
 * timestamps through TimestampCell (relative, absolute in tooltip) and sort
 * by the raw epoch value, never the display label.
 */
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Button } from '@/components/ui/button';
import { TimestampCell, TruncatedCell } from '@/components/ui/cells';

/** Epoch ms for any timestamp representation; 0 for invalid/missing (sorts last on desc). */
function toEpoch(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const d = value instanceof Date ? value : new Date(value as string | number);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

const timestampComparator = (a: unknown, b: unknown) => toEpoch(a) - toEpoch(b);

/**
 * Humanize a machine event type ("UPDATE_SERVICE", "apRegistration") into a
 * title-case label ("Update Service", "Ap Registration").
 */
export function formatEventType(raw: string | null | undefined): string {
  if (!raw) return 'Audit';
  const spaced = String(raw)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return 'Audit';
  return spaced
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Full-width truncating text cell with the value recoverable via title attr. */
function TruncatedTextRenderer(params: ICellRendererParams) {
  const value = params.value === null || params.value === undefined ? '' : String(params.value);
  return <TruncatedCell value={value} maxWidthClass="max-w-full" />;
}

function TimestampRenderer(params: ICellRendererParams) {
  return <TimestampCell value={params.value} />;
}

/** Columns for the Events tab (mapped audit-log rows). */
export function buildEventColumns(): ColDef<any>[] {
  return [
    {
      colId: 'severity',
      headerName: 'Severity',
      width: 130,
      type: 'status',
      valueGetter: (params) => params.data?.severity || 'Info',
    },
    {
      colId: 'type',
      headerName: 'Type',
      minWidth: 160,
      valueGetter: (params) => formatEventType(params.data?.type),
    },
    {
      colId: 'message',
      headerName: 'Description',
      flex: 2,
      minWidth: 240,
      valueGetter: (params) => params.data?.message || params.data?.description || '',
      cellRenderer: TruncatedTextRenderer,
    },
    {
      field: 'user',
      headerName: 'User',
      minWidth: 140,
      cellRenderer: TruncatedTextRenderer,
    },
    {
      field: 'timestamp',
      headerName: 'Time',
      width: 150,
      sort: 'desc',
      filter: false,
      comparator: timestampComparator,
      cellRenderer: TimestampRenderer,
    },
  ];
}

export interface AlarmActionHandlers {
  onAcknowledge: (alarmId: string) => void;
  onClear: (alarmId: string) => void;
}

function AlarmActionsRenderer(params: ICellRendererParams & AlarmActionHandlers) {
  const alarm = params.data;
  if (!alarm?.id) return null;
  const name = alarm.title || alarm.type || 'alarm';
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          params.onAcknowledge(alarm.id);
        }}
        aria-label={`Acknowledge alarm: ${name}`}
      >
        Acknowledge
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          params.onClear(alarm.id);
        }}
        aria-label={`Clear alarm: ${name}`}
      >
        Clear
      </Button>
    </div>
  );
}

/**
 * Columns for the alarm grids. One definition serves both tabs — pass
 * `actions` to append the Acknowledge/Clear column (Active Alarms only).
 */
export function buildAlarmColumns(actions?: AlarmActionHandlers): ColDef<any>[] {
  const columns: ColDef<any>[] = [
    {
      field: 'severity',
      headerName: 'Severity',
      width: 130,
      type: 'status',
    },
    {
      colId: 'type',
      headerName: 'Type',
      minWidth: 150,
      valueGetter: (params) => params.data?.title || params.data?.type || '',
      cellRenderer: TruncatedTextRenderer,
    },
    {
      colId: 'message',
      headerName: 'Message',
      flex: 2,
      minWidth: 240,
      valueGetter: (params) => params.data?.message || params.data?.description || '',
      cellRenderer: TruncatedTextRenderer,
    },
    {
      colId: 'source',
      headerName: 'Source',
      minWidth: 140,
      valueGetter: (params) =>
        params.data?.source ||
        params.data?.deviceName ||
        params.data?.device ||
        params.data?.siteName ||
        params.data?.site ||
        '',
      cellRenderer: TruncatedTextRenderer,
    },
    {
      field: 'timestamp',
      headerName: 'Raised',
      width: 150,
      sort: 'desc',
      filter: false,
      comparator: timestampComparator,
      cellRenderer: TimestampRenderer,
    },
  ];

  if (actions) {
    columns.push({
      colId: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: AlarmActionsRenderer,
      cellRendererParams: actions,
    });
  }

  return columns;
}
