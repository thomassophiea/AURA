/**
 * ExtremeLocation Profiles sub-page. Live CRUD against /v3/xlocation:
 * Name / Server / Tenant ID grid with the standard ProfileSubPage chrome.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { MapPin } from 'lucide-react';
import { xlocationService } from '../../../services/configure/xlocationService';
import type { XLocationProfile } from '../../../services/configure/xlocationService';
import { ProfileSubPage } from './ProfileSubPage';
import { XLocationEditor } from './XLocationEditor';
import { seedXLocation } from './xlocationModel';

export function XLocationPage() {
  const columns = useCallback(
    (openEdit: (row: XLocationProfile) => void): ColDef<XLocationProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<XLocationProfile>) =>
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
      { headerName: 'Server', field: 'svrAddr', flex: 2 },
      { headerName: 'Tenant ID', field: 'tenantId', flex: 1 },
    ],
    []
  );

  return (
    <ProfileSubPage<XLocationProfile>
      service={xlocationService}
      label="ExtremeLocation profile"
      title="ExtremeLocation Profiles"
      description="ExtremeLocation service profiles (/v3/xlocation)"
      icon={MapPin}
      storageKey="xlocationprofiles"
      columns={columns}
      seed={seedXLocation}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <XLocationEditor
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

export default XLocationPage;
