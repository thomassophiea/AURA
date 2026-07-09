/**
 * Administrators list (/v1/administrators) — grid of the local accounts with
 * live CRUD via administratorsService (keyed by userId). Delete confirms and
 * is blocked for the built-in `admin`. Add seeds a Full-access account;
 * per-account fields are edited in AdminEditor.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Users } from 'lucide-react';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { administratorsService } from '../../../services/configure';
import type { Administrator } from '../../../types/configure';
import { AdminEditor } from './AdminEditor';
import { BUILTIN_ADMIN, ROLE_OPTIONS, buildNewAdmin } from './adminModel';

interface EditorState {
  record: Administrator | null;
  seed: Administrator | null;
}

function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((r) => r.id === role)?.label ?? role;
}

export function AdministratorsTab() {
  const crud = useResourceCrud<Administrator>(administratorsService, {
    resourceLabel: 'administrator',
    getId: (a) => a.userId,
    getName: (a) => a.userId,
  });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const existingIds = useMemo(() => crud.items.map((a) => a.userId), [crud.items]);

  const openEdit = useCallback((record: Administrator) => setEditor({ record, seed: null }), []);
  const openAdd = useCallback(() => setEditor({ record: null, seed: buildNewAdmin() }), []);

  const columnDefs = useMemo<ColDef<Administrator>[]>(
    () => [
      {
        headerName: 'Username',
        field: 'userId',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<Administrator>) =>
          params.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => params.data && openEdit(params.data)}
            >
              {params.data.userId}
            </button>
          ) : null,
      },
      { headerName: 'Role', width: 150, valueGetter: (p) => roleLabel(p.data?.adminRole ?? '') },
      { headerName: 'State', width: 130, field: 'accountState', type: 'status' },
      {
        headerName: 'Enabled',
        width: 110,
        valueGetter: (p) => (p.data?.enabled ? 'Yes' : 'No'),
      },
      {
        headerName: 'Idle Timeout (s)',
        width: 150,
        type: 'numeric',
        valueGetter: (p) => p.data?.idleTimeout ?? '',
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: Administrator[]) => {
      for (const row of rows) {
        await crud.remove(row.userId, row.userId);
      }
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Administrator, userId?: string) => {
      const saved = await crud.save(payload, userId);
      if (saved) setEditor(null);
    },
    [crud]
  );

  return (
    <>
      <ResourceGridPage<Administrator>
        title="Administrators"
        description="Controller administrator accounts"
        icon={Users}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="administrators"
        getRowId={(row) => row.userId}
        getSearchText={(row) => `${row.userId} ${row.adminRole}`}
        canDeleteRow={(row) => row.userId !== BUILTIN_ADMIN}
        onAdd={openAdd}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <AdminEditor
          key={editor.record?.userId ?? 'new'}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          existingIds={existingIds}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}

export default AdministratorsTab;
