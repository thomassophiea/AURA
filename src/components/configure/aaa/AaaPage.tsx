/**
 * AAA Policies list page (EPB-125 §7) — live CRUD against /v1/aaapolicy via
 * aaaPolicyService: Policy Name / NAS IP / auth+acct server-count grid,
 * confirm-gated delete honoring canDelete (A13), Add seeded from the
 * controller /default template (A11), row edit via the name link.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { ShieldCheck } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { aaaPolicyService } from '../../../services/configure';
import type { AaaPolicy } from '../../../types/configure';
import { AaaEditor } from './AaaEditor';

interface EditorState {
  record: AaaPolicy | null;
  seed: AaaPolicy | null;
}

export function AaaPage() {
  const crud = useResourceCrud<AaaPolicy>(aaaPolicyService, {
    resourceLabel: 'AAA policy',
    getId: (p) => p.id,
    getName: (p) => p.name,
  });
  const defaults = useDefaults<AaaPolicy>(
    useCallback(() => aaaPolicyService.getDefault(), []),
    'AAA policy'
  );
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openEdit = useCallback((record: AaaPolicy) => setEditor({ record, seed: null }), []);

  const openAdd = useCallback(async () => {
    const seed = await defaults.load();
    if (!seed) return; // toast already raised; do not open a hollow editor
    // The /default template carries the all-zeros id — strip it for POST.
    const { id: _id, ...rest } = seed;
    setEditor({ record: null, seed: rest as AaaPolicy });
  }, [defaults]);

  const columnDefs = useMemo<ColDef<AaaPolicy>[]>(
    () => [
      {
        headerName: 'Policy Name',
        field: 'name',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<AaaPolicy>) =>
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
        headerName: 'NAS IP Address',
        flex: 1,
        valueGetter: (p) => p.data?.attributes?.nasIpAddress ?? '',
      },
      {
        headerName: 'NAS ID',
        flex: 1,
        valueGetter: (p) => p.data?.attributes?.nasId ?? '',
      },
      {
        headerName: 'Auth Servers',
        width: 130,
        type: 'numeric',
        valueGetter: (p) => p.data?.authenticationRadiusServers?.length ?? 0,
      },
      {
        headerName: 'Acct Servers',
        width: 130,
        type: 'numeric',
        valueGetter: (p) => p.data?.accountingRadiusServers?.length ?? 0,
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: AaaPolicy[]) => {
      for (const row of rows) {
        await crud.remove(row.id, row.name);
      }
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Partial<AaaPolicy>) => {
      const saved = await crud.save(payload, editor?.record?.id);
      if (saved) setEditor(null);
    },
    [crud, editor]
  );

  return (
    <>
      <ResourceGridPage<AaaPolicy>
        title="AAA Policies"
        description="RADIUS authentication and accounting policies"
        icon={ShieldCheck}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="aaa-policies"
        getRowId={(row) => row.id}
        onAdd={() => void openAdd()}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <AaaEditor
          // Remount per target so the form state reseeds cleanly.
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
    </>
  );
}

export default AaaPage;
