/**
 * ESL Profiles sub-page (specialized-profiles-parity.md §2). Live CRUD
 * against /v3/eslprofile: Name / Port / FQDN grid.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Tag } from 'lucide-react';
import { eslProfileService } from '../../../services/configure';
import type { EslProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { EslEditor } from './EslEditor';

function seed(def: EslProfile): EslProfile {
  const s = structuredClone(def);
  s.name = '';
  s.port = s.port ?? 7354;
  s.fqdn = '';
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

export function EslPage() {
  const columns = useCallback(
    (openEdit: (row: EslProfile) => void): ColDef<EslProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<EslProfile>) =>
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
      { headerName: 'Port', field: 'port', width: 120 },
      { headerName: 'FQDN', field: 'fqdn', flex: 2 },
    ],
    []
  );

  return (
    <ProfileSubPage<EslProfile>
      service={eslProfileService}
      label="ESL profile"
      title="ESL Profiles"
      description="Electronic Shelf Label profiles (/v3/eslprofile)"
      icon={Tag}
      storageKey="eslprofiles"
      columns={columns}
      seed={seed}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <EslEditor
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

export default EslPage;
