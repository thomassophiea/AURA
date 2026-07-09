/**
 * VLANs / Topologies (/v3/topologies with /v1 fallback) — grid (name, mode,
 * tagged, VLAN ID, I-SID, certificates) + the full VlanEditor. Internal
 * (canEdit:false) records open read-only; delete honors canDelete.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Network } from 'lucide-react';
import { topologiesService } from '../../../services/configure';
import type { Topology } from '../../../types/configure';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { VlanEditor } from './VlanEditor';
import { withRowClick } from './gridHelpers';
import { fmtMode } from './policyUtils';
import type { TopologyDraft } from './localTypes';

interface EditorState {
  record: TopologyDraft;
  isNew: boolean;
}

export function VlansPage() {
  const crud = useResourceCrud<Topology>(topologiesService, {
    resourceLabel: 'VLAN',
    getId: (t) => t.id,
    getName: (t) => t.name,
  });
  const defaults = useDefaults<Topology>(() => topologiesService.getDefault(), 'VLAN');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openAdd = async () => {
    const seed = await defaults.load();
    if (!seed) return;
    const { id: _id, ...rest } = seed;
    setEditor({ record: rest as TopologyDraft, isNew: true });
  };

  const columns = useMemo<ColDef<Topology>[]>(
    () =>
      withRowClick<Topology>(
        [
          { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 200, sort: 'asc' },
          {
            field: 'mode',
            headerName: 'Mode',
            minWidth: 130,
            valueFormatter: (p) => fmtMode(p.value as string),
          },
          {
            field: 'tagged',
            headerName: 'Tagged',
            minWidth: 100,
            valueFormatter: (p) => (p.value === true ? 'Yes' : 'No'),
          },
          { field: 'vlanid', headerName: 'VLAN ID', minWidth: 100 },
          {
            headerName: 'I-SID',
            minWidth: 100,
            valueGetter: (p) => (p.data?.isid ? p.data.isid : ''),
          },
          {
            headerName: 'Certificates',
            minWidth: 120,
            valueGetter: (p) => (p.data?.cert ? 'Yes' : ''),
          },
        ],
        (row) => setEditor({ record: row as TopologyDraft, isNew: false })
      ),
    []
  );

  return (
    <>
      <ResourceGridPage<Topology>
        title="VLANs"
        description="Topologies — bridged, fabric-attach, VXLAN and GRE VLANs"
        icon={Network}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="policy-vlans"
        getRowId={(t) => t.id}
        getSearchText={(t) => `${t.name ?? ''} ${t.vlanid ?? ''}`}
        onAdd={() => void openAdd()}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.id, row.name);
        }}
      />
      {editor && (
        <VlanEditor
          key={editor.isNew ? 'new' : String(editor.record.id)}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          initial={editor.record}
          isNew={editor.isNew}
          saving={crud.saving}
          onSubmit={async (payload, id) => {
            const saved = await crud.save(payload as Partial<Topology>, id);
            if (saved) setEditor(null);
          }}
          topologies={crud.items}
        />
      )}
    </>
  );
}
