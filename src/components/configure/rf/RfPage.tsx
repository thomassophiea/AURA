/**
 * RF Management list page (EPB-125 · rfmgmt-parity.md). Live CRUD against
 * /v3/rfmgmt: Name / Type / Sensitivity (SmartRf only) / Interference /
 * Neighbor grid, clone + confirm-gated delete honoring canDelete, Add seeded
 * from the controller /default record (both SmartRf and ACS branches).
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Radio } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { rfmgmtService } from '../../../services/configure';
import type { RfMgmtPolicy } from '../../../types/configure';
import { RfEditorSheet } from './RfEditorSheet';
import { seedFromDefault } from './rfModel';

interface EditorState {
  record: RfMgmtPolicy | null;
  seed: RfMgmtPolicy | null;
}

export function RfPage() {
  const crud = useResourceCrud<RfMgmtPolicy>(rfmgmtService, {
    resourceLabel: 'RF policy',
    getId: (p) => p.id,
    getName: (p) => p.name,
  });
  const defaults = useDefaults<RfMgmtPolicy>(
    useCallback(() => rfmgmtService.getDefault(), []),
    'RF policy'
  );
  const [editor, setEditor] = useState<EditorState | null>(null);

  const existingNames = useMemo(
    () => crud.items.map((p) => ({ id: p.id, name: p.name })),
    [crud.items]
  );

  const openEdit = useCallback((record: RfMgmtPolicy) => setEditor({ record, seed: null }), []);

  const openAdd = useCallback(async () => {
    const def = await defaults.load();
    if (!def) return;
    setEditor({ record: null, seed: seedFromDefault(def, 'Acs') });
  }, [defaults]);

  const openClone = useCallback((row: RfMgmtPolicy) => {
    const seed = structuredClone(row);
    seed.name = `${row.name}-copy`;
    seed.canDelete = true;
    seed.canEdit = true;
    delete (seed as { id?: string }).id;
    setEditor({ record: null, seed });
  }, []);

  const columnDefs = useMemo<ColDef<RfMgmtPolicy>[]>(
    () => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<RfMgmtPolicy>) =>
          params.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => params.data && openEdit(params.data)}
            >
              {params.data.name}
            </button>
          ) : null,
      },
      {
        headerName: 'Type',
        width: 130,
        valueGetter: (p) => (p.data?.type === 'Acs' ? 'ACS' : 'Smart RF'),
      },
      {
        headerName: 'Sensitivity',
        width: 130,
        valueGetter: (p) => p.data?.smartRf?.basic?.sensitivity ?? '—',
      },
      {
        headerName: 'Interference Recovery',
        width: 170,
        valueGetter: (p) => {
          const cfg = p.data?.type === 'Acs' ? p.data?.acs : p.data?.smartRf;
          return cfg?.basic?.interferenceRecovery ? 'Yes' : 'No';
        },
      },
      {
        headerName: 'Neighbor Recovery',
        width: 160,
        valueGetter: (p) => {
          const cfg = p.data?.type === 'Acs' ? p.data?.acs : p.data?.smartRf;
          return cfg?.basic?.neighborRecovery ? 'Yes' : 'No';
        },
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: RfMgmtPolicy[]) => {
      for (const row of rows) {
        await crud.remove(row.id, row.name);
      }
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Partial<RfMgmtPolicy>) => {
      const saved = await crud.save(payload, editor?.record?.id);
      if (saved) setEditor(null);
    },
    [crud, editor]
  );

  return (
    <>
      <ResourceGridPage<RfMgmtPolicy>
        title="RF Management"
        description="Smart RF and ACS radio management policies"
        icon={Radio}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="rf-management"
        getRowId={(row) => row.id}
        onAdd={() => void openAdd()}
        onClone={openClone}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <RfEditorSheet
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          existingNames={existingNames}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}

export default RfPage;
