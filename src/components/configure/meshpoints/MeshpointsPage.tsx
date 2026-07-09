/**
 * Meshpoints list page (EPB-125 · meshpoints-parity.md). Live CRUD against
 * /v3/meshpoints: Name / Mesh ID / Status / Privacy grid (post-audit column
 * set), confirm-gated delete honoring canDelete, Add seeded from the /default
 * record. Topology + profile refs load once for the editor's Control VLAN and
 * Associated Profiles surfaces.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Network } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import {
  meshpointsService,
  profilesService,
  topologiesService,
} from '../../../services/configure';
import { logger } from '../../../services/logger';
import type { ApProfile, Meshpoint, Topology } from '../../../types/configure';
import { MeshpointEditorSheet } from './MeshpointEditorSheet';
import { seedMeshpoint } from './meshpointModel';

interface EditorState {
  record: Meshpoint | null;
  seed: Meshpoint | null;
}

export function MeshpointsPage() {
  const crud = useResourceCrud<Meshpoint>(meshpointsService, {
    resourceLabel: 'meshpoint',
    getId: (m) => m.id,
    getName: (m) => m.name,
  });
  const defaults = useDefaults<Meshpoint>(
    useCallback(() => meshpointsService.getDefault(), []),
    'meshpoint'
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [topologies, setTopologies] = useState<Topology[]>([]);
  const [profiles, setProfiles] = useState<ApProfile[]>([]);

  const loadTopologies = useCallback(async () => {
    try {
      setTopologies(await topologiesService.list());
    } catch (error) {
      logger.warn('[configure/meshpoints] failed to load topologies', error);
    }
  }, []);
  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await profilesService.list());
    } catch (error) {
      logger.warn('[configure/meshpoints] failed to load profiles', error);
    }
  }, []);

  useEffect(() => {
    void loadTopologies();
    void loadProfiles();
  }, [loadTopologies, loadProfiles]);

  const openEdit = useCallback((record: Meshpoint) => setEditor({ record, seed: null }), []);
  const openAdd = useCallback(async () => {
    const def = await defaults.load();
    if (!def) return;
    setEditor({ record: null, seed: seedMeshpoint(def) });
  }, [defaults]);

  const columnDefs = useMemo<ColDef<Meshpoint>[]>(
    () => [
      {
        headerName: 'Name',
        field: 'name',
        flex: 2,
        cellRenderer: (params: ICellRendererParams<Meshpoint>) =>
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
      { headerName: 'Mesh ID', field: 'meshId', flex: 2 },
      {
        headerName: 'Status',
        width: 130,
        type: 'status',
        valueGetter: (p) => (p.data?.status === 'disabled' ? 'Disabled' : 'Enabled'),
      },
      {
        headerName: 'Privacy',
        width: 180,
        valueGetter: (p) => (p.data?.privacy?.PskElement ? 'WPA2-Personal (PSK)' : 'Open'),
      },
    ],
    [openEdit]
  );

  const handleDelete = useCallback(
    async (rows: Meshpoint[]) => {
      for (const row of rows) await crud.remove(row.id, row.name);
    },
    [crud]
  );

  const handleSave = useCallback(
    async (payload: Partial<Meshpoint>) => {
      const saved = await crud.save(payload, editor?.record?.id);
      if (saved) setEditor(null);
    },
    [crud, editor]
  );

  return (
    <>
      <ResourceGridPage<Meshpoint>
        title="Meshpoints"
        description="Wireless mesh network points (/v3/meshpoints)"
        icon={Network}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="meshpoints"
        getRowId={(row) => row.id}
        onAdd={() => void openAdd()}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <MeshpointEditorSheet
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          record={editor.record}
          seed={editor.seed}
          topologies={topologies}
          profiles={profiles}
          supportDistributed
          saving={crud.saving}
          onSave={handleSave}
          onTopologiesChanged={loadTopologies}
          onProfilesChanged={loadProfiles}
        />
      )}
    </>
  );
}

export default MeshpointsPage;
