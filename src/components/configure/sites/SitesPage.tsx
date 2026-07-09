/**
 * Sites list page (EPB-125 · sites-devicegroups-parity.md). Live CRUD against
 * /v3/sites: Name / Country / Timezone / Mode / Device Groups grid,
 * confirm-gated delete honoring canDelete, Add seeded from the /default
 * record. Device groups are edited inside the Site editor (nested children).
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Building2 } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { sitesService } from '../../../services/configure';
import type { SiteConfig } from '../../../types/configure';
import { SiteEditorSheet } from './SiteEditorSheet';
import { useSiteRefs } from './useSiteRefs';
import { seedSite } from './siteModel';

interface EditorState {
  record: SiteConfig | null;
  seed: SiteConfig | null;
}

export function SitesPage() {
  const crud = useResourceCrud<SiteConfig>(sitesService, {
    resourceLabel: 'site',
    getId: (s) => s.id,
    getName: (s) => s.siteName,
  });
  const defaults = useDefaults<SiteConfig>(
    useCallback(() => sitesService.getDefault(), []),
    'site'
  );
  const refs = useSiteRefs();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openEdit = useCallback((record: SiteConfig) => setEditor({ record, seed: null }), []);
  const openAdd = useCallback(async () => {
    const def = await defaults.load();
    if (!def) return;
    setEditor({ record: null, seed: seedSite(def) });
  }, [defaults]);

  const columnDefs = useMemo<ColDef<SiteConfig>[]>(
    () => [
      {
        headerName: 'Name',
        field: 'siteName',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<SiteConfig>) =>
          params.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => params.data && openEdit(params.data)}
            >
              {params.data.siteName}
            </button>
          ) : null,
      },
      { headerName: 'Country', field: 'country', flex: 1 },
      { headerName: 'Timezone', field: 'timezone', flex: 1 },
      {
        headerName: 'Mode',
        width: 130,
        valueGetter: (p) => (p.data?.distributed ? 'Distributed' : 'Centralized'),
      },
      {
        headerName: 'Device Groups',
        width: 140,
        valueGetter: (p) => p.data?.deviceGroups?.length ?? 0,
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: SiteConfig[]) => {
      for (const row of rows) await crud.remove(row.id, row.siteName);
    },
    [crud]
  );

  const handleSave = useCallback(
    (payload: Partial<SiteConfig>, id?: string) => crud.save(payload, id ?? editor?.record?.id),
    [crud, editor]
  );

  return (
    <>
      <ResourceGridPage<SiteConfig>
        title="Sites"
        description="Sites and their device groups (/v3/sites)"
        icon={Building2}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="sites"
        getRowId={(row) => row.id}
        getSearchText={(row) => `${row.siteName} ${row.country}`}
        onAdd={() => void openAdd()}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <SiteEditorSheet
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          refs={refs}
          saving={crud.saving}
          onSave={handleSave}
          onDelete={async () => {
            if (editor.record) {
              const ok = await crud.remove(editor.record.id, editor.record.siteName);
              if (ok) setEditor(null);
            }
          }}
        />
      )}
    </>
  );
}

export default SitesPage;
