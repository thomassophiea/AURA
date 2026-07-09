/**
 * Roles (/v3/roles) — grid (name, default action, predefined, resolved default
 * VLAN, profile + per-group rule counts) with Add / Clone / Delete, and the
 * full RoleEditor. New records seed from the controller's /default template.
 */
import React, { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { ShieldCheck } from 'lucide-react';
import { rolesService } from '../../../services/configure';
import type { Role } from '../../../types/configure';
import { ResourceGridPage, useDefaults, useResourceCrud } from '../_kit';
import { RoleEditor } from './RoleEditor';
import { withRowClick } from './gridHelpers';
import { usePolicyRefData } from './usePolicyRefData';

const ACTION_LABELS: Record<string, string> = {
  allow: 'Allow',
  deny: 'Deny',
  containToVlan: 'Contain to VLAN',
};

interface EditorState {
  record: Partial<Role>;
  isNew: boolean;
}

export function RolesPage() {
  const crud = useResourceCrud<Role>(rolesService, {
    resourceLabel: 'role',
    getId: (r) => r.id,
    getName: (r) => r.name,
  });
  const defaults = useDefaults<Role>(() => rolesService.getDefault(), 'role');
  const refData = usePolicyRefData({ topologies: true, cos: true });
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openAdd = async () => {
    const seed = await defaults.load();
    if (!seed) return;
    const { id: _id, ...rest } = seed;
    setEditor({ record: { ...rest, predefined: false }, isNew: true });
  };

  const openClone = (row: Role) => {
    const { id: _id, ...rest } = structuredClone(row);
    setEditor({
      record: { ...rest, name: `${row.name}_copy`, predefined: false, profiles: [] },
      isNew: true,
    });
  };

  const topologies = refData.topologies;
  const columns = useMemo<ColDef<Role>[]>(() => {
    const vlanName = (id: string | null | undefined) =>
      id ? (topologies.find((t) => t.id === id)?.name ?? id) : '';
    return withRowClick<Role>(
      [
        { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 200, sort: 'asc' },
        {
          field: 'defaultAction',
          headerName: 'Default Action',
          minWidth: 140,
          valueFormatter: (p) => ACTION_LABELS[p.value as string] ?? String(p.value ?? ''),
        },
        {
          field: 'predefined',
          headerName: 'Predefined',
          minWidth: 110,
          valueFormatter: (p) => (p.value === true ? 'Yes' : 'No'),
        },
        {
          headerName: 'Default VLAN',
          minWidth: 130,
          valueGetter: (p) => vlanName(p.data?.topology),
        },
        {
          headerName: 'Profiles',
          minWidth: 100,
          valueGetter: (p) => (p.data?.profiles ?? []).length,
        },
        {
          headerName: 'L2 Rules',
          minWidth: 100,
          valueGetter: (p) => (p.data?.l2Filters ?? []).length,
        },
        {
          headerName: 'L3/L4 Rules',
          minWidth: 110,
          valueGetter: (p) => (p.data?.l3Filters ?? []).length,
        },
        {
          headerName: 'L3/L4 SD Rules',
          minWidth: 130,
          valueGetter: (p) => (p.data?.l3SrcDestFilters ?? []).length,
        },
        {
          headerName: 'L7 Rules',
          minWidth: 100,
          valueGetter: (p) => (p.data?.l7Filters ?? []).length,
        },
      ],
      (row) => setEditor({ record: row, isNew: false })
    );
  }, [topologies]);

  return (
    <>
      <ResourceGridPage<Role>
        title="Roles"
        description="Client access roles — default action, bandwidth, captive portal and firewall rules"
        icon={ShieldCheck}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="policy-roles"
        getRowId={(r) => r.id}
        getSearchText={(r) => r.name ?? ''}
        onAdd={() => void openAdd()}
        onClone={openClone}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.id, row.name);
        }}
      />
      {editor && (
        <RoleEditor
          key={editor.isNew ? 'new' : String(editor.record.id)}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          initial={editor.record}
          isNew={editor.isNew}
          saving={crud.saving}
          onSubmit={async (payload, id) => {
            const saved = await crud.save(payload, id);
            if (saved) setEditor(null);
          }}
          topologies={refData.topologies}
          cos={refData.cos}
          roles={crud.items}
          reloadTopologies={refData.reloadTopologies}
          reloadCos={refData.reloadCos}
        />
      )}
    </>
  );
}
