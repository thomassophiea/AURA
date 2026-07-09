/**
 * Networks / WLANs (EPB-125 Configure) list page: real /v1/services CRUD via
 * useResourceCrud, privacy label derived from the record's actual privacy
 * element, Default VLAN resolved against topologies, Add seeded from the
 * controller's /default template, Clone with name suffix, confirmed Delete.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Wifi } from 'lucide-react';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { servicesService } from '../../../services/configure';
import type { WlanService } from '../../../types/configure';
import { captivePortalLabel, privacyLabel } from './wlanModel';
import { useWlanRefs } from './useWlanRefs';
import { WlanEditorSheet } from './WlanEditorSheet';

const NULL_ID = '00000000-0000-0000-0000-000000000000';

interface EditorState {
  seed: WlanService;
  isEdit: boolean;
  /** Remount key so each open starts from a fresh form state. */
  key: number;
}

export function NetworksPage() {
  const crud = useResourceCrud<WlanService>(servicesService, {
    resourceLabel: 'network',
    getId: (item) => item.id,
    getName: (item) => item.serviceName,
  });
  const defaults = useDefaults<WlanService>(
    useCallback(() => servicesService.getDefault(), []),
    'network'
  );
  const refs = useWlanRefs();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openEditor = useCallback((seed: WlanService, isEdit: boolean) => {
    setEditor({ seed, isEdit, key: Date.now() });
  }, []);

  const handleAdd = async () => {
    const seed = await defaults.load();
    if (seed) openEditor({ ...seed, id: NULL_ID }, false);
  };

  const handleClone = (row: WlanService) => {
    const clone = structuredClone(row);
    clone.id = NULL_ID;
    clone.serviceName = `${row.serviceName}_copy`;
    clone.ssid = `${row.ssid}_copy`.slice(0, 32);
    openEditor(clone, false);
  };

  const handleDelete = async (rows: WlanService[]) => {
    for (const row of rows) {
      await crud.remove(row.id, row.serviceName);
    }
  };

  const columnDefs = useMemo<ColDef<WlanService>[]>(
    () => [
      {
        field: 'serviceName',
        headerName: 'Network Name',
        pinned: 'left',
        minWidth: 180,
        cellClass: 'cursor-pointer text-primary underline-offset-2 hover:underline',
        onCellClicked: (event) => {
          if (event.data) openEditor(structuredClone(event.data), true);
        },
      },
      { field: 'ssid', headerName: 'SSID', minWidth: 140 },
      {
        field: 'status',
        headerName: 'Status',
        width: 110,
        valueFormatter: (params) => (params.value === 'enabled' ? 'Enabled' : 'Disabled'),
      },
      {
        colId: 'privacy',
        headerName: 'Privacy',
        minWidth: 200,
        valueGetter: (params) => (params.data ? privacyLabel(params.data) : ''),
      },
      {
        colId: 'captivePortal',
        headerName: 'Captive Portal',
        width: 140,
        valueGetter: (params) => (params.data ? captivePortalLabel(params.data) : ''),
      },
      {
        colId: 'defaultVlan',
        headerName: 'Default VLAN',
        minWidth: 160,
        valueGetter: (params) => {
          const topologyId = params.data?.defaultTopology;
          if (!topologyId) return '';
          const topology = refs.topologies.find((t) => t.id === topologyId);
          return topology ? `${topology.name} (${topology.vlanid})` : topologyId;
        },
      },
      {
        field: 'sessionTimeout',
        headerName: 'Session Timeout',
        width: 140,
        type: 'rightAligned',
      },
    ],
    [refs.topologies, openEditor]
  );

  return (
    <>
      <ResourceGridPage<WlanService>
        title="Networks"
        description="WLAN services broadcast by this controller's access points."
        icon={Wifi}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading || defaults.loading}
        storageKey="networks"
        getRowId={(row) => row.id}
        getSearchText={(row) => `${row.serviceName} ${row.ssid}`.toLowerCase()}
        onAdd={() => void handleAdd()}
        onClone={handleClone}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
      />
      {editor && (
        <WlanEditorSheet
          key={editor.key}
          open
          onOpenChange={(next) => {
            if (!next) setEditor(null);
          }}
          seed={editor.seed}
          isEdit={editor.isEdit}
          refs={refs}
          saving={crud.saving}
          onSave={(payload, id) => crud.save(payload, id)}
        />
      )}
    </>
  );
}

export default NetworksPage;
