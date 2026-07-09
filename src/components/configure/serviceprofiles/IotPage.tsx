/**
 * IoT Profiles sub-page (specialized-profiles-parity.md §1). Live CRUD
 * against /v3/iotprofile: Name / Applications / Destination grid. The live
 * list record uses the newer ble_beacon/ble_scan schema; summary helpers and
 * the editor both handle either shape.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Bluetooth } from 'lucide-react';
import { iotProfileService } from '../../../services/configure';
import type { IotProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { IotEditor } from './IotEditor';
import { iotAppsSummary, iotDestSummary, seedIot } from './iotModel';

export function IotPage() {
  const columns = useCallback(
    (openEdit: (row: IotProfile) => void): ColDef<IotProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<IotProfile>) =>
          p.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => p.data && openEdit(p.data)}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      { headerName: 'Applications', flex: 2, valueGetter: (p) => iotAppsSummary(p.data) },
      { headerName: 'Destination', width: 180, valueGetter: (p) => iotDestSummary(p.data) },
    ],
    []
  );

  return (
    <ProfileSubPage<IotProfile>
      service={iotProfileService}
      label="IoT profile"
      title="IoT Profiles"
      description="IoT profiles (/v3/iotprofile)"
      icon={Bluetooth}
      storageKey="iotprofiles"
      columns={columns}
      seed={seedIot}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <IotEditor
          key={record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && close()}
          record={record}
          seed={s}
          rows={rows}
          saving={saving}
          onSave={onSave}
        />
      )}
    />
  );
}

export default IotPage;
