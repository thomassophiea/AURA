/**
 * ExtremeGuest list page (EPB-125 §16) — live CRUD against the REAL
 * /v1/eguest resource via eguestService only (the /v1/guests routes in
 * server.js are in-memory stubs and are deliberately never called here).
 * Truthfully-empty list on the lab controller; Add seeds from /default (B4);
 * delete flows through the editor's confirm workflow and the grid (B6).
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { UserCheck } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { eguestService } from '../../../services/configure';
import type { EGuestProfile } from '../../../types/configure';
import { GuestEditor } from './GuestEditor';
import { guestServerIp } from './guestModel';

interface EditorState {
  record: EGuestProfile | null;
  seed: EGuestProfile | null;
}

export function GuestPage() {
  const crud = useResourceCrud<EGuestProfile>(eguestService, {
    resourceLabel: 'ExtremeGuest server',
    getId: (p) => p.id,
    getName: (p) => p.name,
  });
  const defaults = useDefaults<EGuestProfile>(
    useCallback(() => eguestService.getDefault(), []),
    'ExtremeGuest server'
  );
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openEdit = useCallback((record: EGuestProfile) => setEditor({ record, seed: null }), []);

  const openAdd = useCallback(async () => {
    const seed = await defaults.load();
    if (!seed) return; // toast already raised; do not open a hollow editor
    const { id: _id, ...rest } = seed;
    setEditor({ record: null, seed: rest as EGuestProfile });
  }, [defaults]);

  const columnDefs = useMemo<ColDef<EGuestProfile>[]>(
    () => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<EGuestProfile>) =>
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
      { headerName: 'FQDN', field: 'cpFqdn', flex: 2 },
      {
        headerName: 'RADIUS Server',
        flex: 1,
        valueGetter: (p) => (p.data ? guestServerIp(p.data) : ''),
      },
      {
        headerName: 'Auth Port',
        width: 110,
        valueGetter: (p) => p.data?.authenticationRadiusServer?.port ?? '',
      },
      {
        headerName: 'Acct Port',
        width: 110,
        valueGetter: (p) => p.data?.accountingRadiusServer?.port ?? '',
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: EGuestProfile[]) => {
      for (const row of rows) {
        await crud.remove(row.id, row.name);
      }
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Partial<EGuestProfile>) => {
      const saved = await crud.save(payload, editor?.record?.id);
      if (saved) setEditor(null);
    },
    [crud, editor]
  );

  const handleEditorDelete = useCallback(async () => {
    if (!editor?.record) return;
    const ok = await crud.remove(editor.record.id, editor.record.name);
    if (ok) setEditor(null);
  }, [crud, editor]);

  return (
    <>
      <ResourceGridPage<EGuestProfile>
        title="ExtremeGuest"
        description="ExtremeGuest captive-portal integration servers"
        icon={UserCheck}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="eguest"
        getRowId={(row) => row.id}
        onAdd={() => void openAdd()}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <GuestEditor
          // Remount per target so the form state reseeds cleanly.
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          saving={crud.saving}
          onSave={handleSave}
          onDelete={editor.record ? handleEditorDelete : undefined}
        />
      )}
    </>
  );
}

export default GuestPage;
