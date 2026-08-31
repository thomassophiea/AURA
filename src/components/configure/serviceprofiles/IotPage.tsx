/**
 * IoT Profiles sub-page (specialized-profiles-parity.md §1). Live CRUD
 * against /v3/iotprofile: Name / Applications / Destination grid. The live
 * list record uses the newer ble_beacon/ble_scan schema; summary helpers and
 * the editor both handle either shape.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Bluetooth } from 'lucide-react';
import { iotProfileService, profilesService } from '../../../services/configure';
import type { IotProfile } from '../../../types/configure';
import { ProfileSubPage } from './ProfileSubPage';
import { IotEditor } from './IotEditor';
import { iotAppsSummary, iotDestSummary, seedIot } from './iotModel';

export function IotPage() {
  /* IOT-MULTI-APP capability + per-app gates are read across the AP
     profiles' feature tags (union). Loaded once on mount — no polling. */
  const [apFeatures, setApFeatures] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void profilesService
      .list()
      .then((profiles) => {
        if (cancelled) return;
        const tags = new Set<string>();
        profiles.forEach((p) => (p.features ?? []).forEach((f) => tags.add(f)));
        setApFeatures(Array.from(tags));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
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
          apFeatures={apFeatures}
        />
      )}
    />
  );
}

export default IotPage;
