/**
 * RTLS Profiles sub-page (specialized-profiles-parity.md §3). Live CRUD
 * against /v1/rtlsprofile: Name / Application / Server / Multicast MAC grid.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Radar } from 'lucide-react';
import { rtlsProfileService } from '../../../services/configure';
import type { RtlsProfile, RtlsVendorConfig } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { RtlsEditor, rtlsKeyOf } from './RtlsEditor';

function seed(def: RtlsProfile): RtlsProfile {
  const s = structuredClone(def);
  s.name = '';
  s.appId = s.appId ?? 'AeroScout';
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

const vendorOf = (r?: RtlsProfile): RtlsVendorConfig | undefined =>
  r ? (r[rtlsKeyOf(r.appId)] as RtlsVendorConfig) : undefined;

export function RtlsPage() {
  const columns = useCallback(
    (openEdit: (row: RtlsProfile) => void): ColDef<RtlsProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<RtlsProfile>) =>
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
      { headerName: 'Application', field: 'appId', width: 140 },
      {
        headerName: 'Server',
        flex: 1,
        valueGetter: (p) => {
          const v = vendorOf(p.data);
          return v?.ip ? `${v.ip}:${v.port}` : '';
        },
      },
      {
        headerName: 'Multicast MAC',
        width: 180,
        valueGetter: (p) => vendorOf(p.data)?.mcast ?? '',
      },
    ],
    []
  );

  return (
    <ProfileSubPage<RtlsProfile>
      service={rtlsProfileService}
      label="RTLS profile"
      title="RTLS Profiles"
      description="Real-Time Location System profiles (/v1/rtlsprofile)"
      icon={Radar}
      storageKey="rtlsprofiles"
      columns={columns}
      seed={seed}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <RtlsEditor
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

export default RtlsPage;
