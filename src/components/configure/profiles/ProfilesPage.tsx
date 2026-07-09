/**
 * Device Profiles list page — the AP device-configuration templates
 * (`/v3/profiles`). Wraps ResourceGridPage with Add (camera-filtered platform
 * picker seeding a platform clone), Clone and Delete (predefined profiles are
 * protected by canDelete=false), and mounts the full 12-tab ProfileEditorSheet.
 */
import React, { useMemo, useState } from 'react';
import { Cpu } from 'lucide-react';
import type { ColDef } from 'ag-grid-community';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { cloneProfileForPlatform, profilesService } from '../../../services/configure';
import { deriveOperationalMode, networkCount, platformCatalog } from './helpers';
import { ProfileEditorSheet } from './ProfileEditorSheet';
import { PlatformPickerDialog } from './dialogs/PlatformPickerDialog';
import { CloneDialog } from './dialogs/CloneDialog';
import type { ApProfile } from '../../../types/configure';

export function ProfilesPage() {
  const crud = useResourceCrud<ApProfile>(profilesService, {
    resourceLabel: 'profile',
    getId: (p) => p.id,
    getName: (p) => p.name,
  });
  const { items, loading, saving, refresh, save, remove } = crud;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ApProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<ApProfile | null>(null);

  const names = useMemo(() => items.map((p) => p.name), [items]);
  const platforms = useMemo(() => platformCatalog(items), [items]);
  const existingNamesFor = (exclude?: string) => names.filter((n) => n !== exclude);

  const openEdit = (profile: ApProfile) => {
    setEditing(profile);
    setIsNew(false);
    setSheetOpen(true);
  };

  const startAdd = async (platform: string, name: string) => {
    setPickerOpen(false);
    const seed = await cloneProfileForPlatform(platform, name);
    if (!seed) {
      toast.error(`No template found for platform "${platform}"`);
      return;
    }
    setEditing({ ...(seed as ApProfile), predefined: false, canDelete: true });
    setIsNew(true);
    setSheetOpen(true);
  };

  const startClone = (name: string) => {
    if (!cloneSource) return;
    const { id: _id, predefined: _pre, ...rest } = cloneSource;
    setCloneSource(null);
    setEditing({ ...(rest as ApProfile), name, predefined: false, canDelete: true });
    setIsNew(true);
    setSheetOpen(true);
  };

  const handleSave = async (form: ApProfile) => {
    const saved = await save(form, form.id || undefined);
    if (saved) setSheetOpen(false);
  };

  const handleDelete = async (rows: ApProfile[]) => {
    for (const row of rows) {
      await remove(row.id, row.name);
    }
  };

  const columnDefs = useMemo<ColDef<ApProfile>[]>(
    () => [
      {
        colId: 'name',
        field: 'name',
        headerName: 'Name',
        flex: 2,
        minWidth: 200,
        cellRenderer: (p: { data?: ApProfile; value: string }) => (
          <button
            type="button"
            className="flex items-center gap-2 text-left text-primary hover:underline"
            onClick={() => p.data && openEdit(p.data)}
          >
            <Cpu className="h-4 w-4 text-muted-foreground" />
            {p.value}
          </button>
        ),
      },
      { colId: 'apPlatform', field: 'apPlatform', headerName: 'AP Platform', flex: 1, minWidth: 130 },
      {
        colId: 'operationalMode',
        headerName: 'Operational Mode',
        flex: 1,
        minWidth: 150,
        valueGetter: (p: { data?: ApProfile }) => (p.data ? deriveOperationalMode(p.data) : '—'),
      },
      {
        colId: 'radios',
        headerName: 'Radios',
        width: 100,
        valueGetter: (p: { data?: ApProfile }) => p.data?.radios?.length ?? 0,
      },
      {
        colId: 'networks',
        headerName: 'Networks',
        width: 110,
        valueGetter: (p: { data?: ApProfile }) => (p.data ? networkCount(p.data) : 0),
      },
      {
        colId: 'predefined',
        headerName: 'Predefined',
        width: 120,
        cellRenderer: (p: { data?: ApProfile }) =>
          p.data?.predefined ? <Badge variant="secondary">Predefined</Badge> : <Badge variant="outline">Custom</Badge>,
      },
    ],
    []
  );

  return (
    <>
      <ResourceGridPage<ApProfile>
        title="Device Profiles"
        description="AP device-configuration templates — radios, networks, roles, VLANs and advanced device settings."
        icon={Cpu}
        rows={items}
        columnDefs={columnDefs}
        loading={loading}
        storageKey="profiles"
        getRowId={(p) => p.id}
        getSearchText={(p) => `${p.name} ${p.apPlatform}`}
        onAdd={() => setPickerOpen(true)}
        onClone={(row) => setCloneSource(row)}
        onDelete={handleDelete}
        onRefresh={refresh}
      />

      <PlatformPickerDialog
        open={pickerOpen}
        platforms={platforms}
        existingNames={names}
        onConfirm={startAdd}
        onClose={() => setPickerOpen(false)}
      />
      <CloneDialog
        open={!!cloneSource}
        sourceName={cloneSource?.name ?? ''}
        existingNames={names}
        onConfirm={startClone}
        onClose={() => setCloneSource(null)}
      />

      {editing && (
        <ProfileEditorSheet
          key={editing.id ?? 'new'}
          open={sheetOpen}
          record={editing}
          isNew={isNew}
          existingNames={existingNamesFor(isNew ? undefined : editing.name)}
          saving={saving}
          onOpenChange={(o) => {
            setSheetOpen(o);
            if (!o) setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
