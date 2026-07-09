/**
 * AP list column sets (aps.html grid_gridAps). General view = status dot +
 * identity + per-radio channels; AFC view = 6 GHz radio + derived AFC status
 * (gap 29). Status dot is coloured from the record (gap 25), not hardcoded.
 */
import React from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { apAfcStatus, apBandOf } from './apHelpers';
import { apOnlineState, type ApListRow } from './apsData';

function StatusDot({ data }: ICellRendererParams<ApListRow>) {
  if (!data) return null;
  const state = apOnlineState(data);
  const color =
    state === 'online'
      ? 'bg-green-500'
      : state === 'offline'
        ? 'bg-red-500'
        : 'bg-muted-foreground/40';
  const label = state === 'unknown' ? 'Status unknown' : state;
  return (
    <span className="flex h-full items-center">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} title={label} aria-label={label} />
    </span>
  );
}

function radioChannel(row: ApListRow | undefined, index: number): string {
  const r = row?.radios?.find((x) => x.radioIndex === index);
  if (!r) return '—';
  return String(r.opChannel ?? r.channel ?? '—');
}

export interface ApColumnOptions {
  onEdit: (row: ApListRow) => void;
}

export function generalColumns({ onEdit }: ApColumnOptions): ColDef<ApListRow>[] {
  return [
    { headerName: '', width: 46, cellRenderer: StatusDot, sortable: false, filter: false, resizable: false },
    {
      headerName: 'Name',
      field: 'apName',
      flex: 1.4,
      minWidth: 160,
      sort: 'asc',
      cellRenderer: (p: ICellRendererParams<ApListRow>) =>
        p.data ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => p.data && onEdit(p.data)}
          >
            {p.data.apName || p.data.serialNumber}
          </button>
        ) : null,
    },
    { headerName: 'Serial', field: 'serialNumber', minWidth: 150 },
    { headerName: 'IP Address', field: 'ipAddress', minWidth: 130 },
    { headerName: 'Site', field: 'hostSite', minWidth: 130 },
    { headerName: 'Version', field: 'softwareVersion', minWidth: 140 },
    {
      headerName: 'Model',
      minWidth: 120,
      valueGetter: (p) => p.data?.hardwareType || p.data?.platformName || '',
    },
    { headerName: 'Radio 1', minWidth: 90, valueGetter: (p) => radioChannel(p.data, 1) },
    { headerName: 'Radio 2', minWidth: 90, valueGetter: (p) => radioChannel(p.data, 2) },
    { headerName: 'Radio 3', minWidth: 90, valueGetter: (p) => radioChannel(p.data, 3) },
    { headerName: 'MAC', field: 'macAddress', minWidth: 150, hide: true },
    { headerName: 'Host Name', field: 'hostname', minWidth: 150, hide: true },
    { headerName: 'Environment', field: 'environment', minWidth: 120, hide: true },
    { headerName: 'Adopted By', field: 'adoptedBy', minWidth: 120, hide: true },
  ];
}

export function afcColumns({ onEdit }: ApColumnOptions): ColDef<ApListRow>[] {
  return [
    {
      headerName: 'Name',
      field: 'apName',
      flex: 1.2,
      minWidth: 160,
      sort: 'asc',
      cellRenderer: (p: ICellRendererParams<ApListRow>) =>
        p.data ? (
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => p.data && onEdit(p.data)}
          >
            {p.data.apName || p.data.serialNumber}
          </button>
        ) : null,
    },
    { headerName: 'Model', minWidth: 120, valueGetter: (p) => p.data?.hardwareType || p.data?.platformName || '' },
    {
      headerName: 'Radio 3 (6 GHz)',
      minWidth: 150,
      valueGetter: (p) => {
        const r6 = p.data?.radios?.find((r) => apBandOf(r) === 'Band6');
        return r6 ? (r6.opChannel ?? r6.channel ?? '—') : 'Not present';
      },
    },
    {
      headerName: 'AFC Status',
      minWidth: 170,
      valueGetter: (p) => (p.data ? apAfcStatus({ radios: p.data.radios }) : ''),
    },
  ];
}
