/**
 * Air Defense (ADSP) Profiles sub-page (specialized-profiles-parity.md §6).
 * Live CRUD against /v3/adsp: Name / Servers count / Server Addresses grid.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { ShieldAlert } from 'lucide-react';
import { adspService } from '../../../services/configure';
import type { AdspProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { AdspEditor, parseServers } from './AdspEditor';

function seed(def: AdspProfile): AdspProfile {
  const s = structuredClone(def);
  s.name = '';
  s.svrAddr = Array.isArray(s.svrAddr) ? s.svrAddr : [];
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

const serversSummary = (r?: AdspProfile): string =>
  parseServers(r?.svrAddr)
    .map((s) => (s.port !== 443 ? `${s.addr}:${s.port}` : s.addr))
    .join(', ');

export function AdspPage() {
  const columns = useCallback(
    (openEdit: (row: AdspProfile) => void): ColDef<AdspProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<AdspProfile>) =>
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
      {
        headerName: 'Servers',
        width: 110,
        valueGetter: (p) => (Array.isArray(p.data?.svrAddr) ? p.data.svrAddr.length : 0),
      },
      {
        headerName: 'Server Addresses',
        flex: 2,
        valueGetter: (p) => serversSummary(p.data),
      },
    ],
    []
  );

  return (
    <ProfileSubPage<AdspProfile>
      service={adspService}
      label="AirDefense profile"
      title="Air Defense Profiles"
      description="AirDefense (ADSP) profiles (/v3/adsp)"
      icon={ShieldAlert}
      storageKey="airdefenseprofiles"
      columns={columns}
      seed={seed}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <AdspEditor
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

export default AdspPage;
