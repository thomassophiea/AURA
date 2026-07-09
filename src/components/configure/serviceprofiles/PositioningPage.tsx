/**
 * Positioning Profiles sub-page (specialized-profiles-parity.md §4). Live
 * CRUD against /v3/positioning: Name / Collection grid.
 */
import React, { useCallback } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { MapPin } from 'lucide-react';
import { positioningService } from '../../../services/configure';
import type { PositioningProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { PositioningEditor, POS_COLLECTIONS } from './PositioningEditor';

function seed(def: PositioningProfile): PositioningProfile {
  const s = structuredClone(def);
  s.name = '';
  s.collection = s.collection ?? 'Off';
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

const collectionLabel = (id?: string) => POS_COLLECTIONS.find((c) => c.id === id)?.label ?? id ?? '';

export function PositioningPage() {
  const columns = useCallback(
    (openEdit: (row: PositioningProfile) => void): ColDef<PositioningProfile>[] => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<PositioningProfile>) =>
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
        headerName: 'Collection',
        flex: 1,
        valueGetter: (p) => collectionLabel(p.data?.collection),
      },
    ],
    []
  );

  return (
    <ProfileSubPage<PositioningProfile>
      service={positioningService}
      label="positioning profile"
      title="Positioning Profiles"
      description="Positioning profiles (/v3/positioning)"
      icon={MapPin}
      storageKey="positioningprofiles"
      columns={columns}
      seed={seed}
      renderEditor={({ record, seed: s, rows, saving, onSave, close }) => (
        <PositioningEditor
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

export default PositioningPage;
