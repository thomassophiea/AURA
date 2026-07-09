/**
 * VLAN Groups (/v1/vlangroups with /v3 fallback) — grid (name, mode, VLAN ID,
 * member count) + VlanGroupEditor. The lab controller 404s both endpoints, so
 * the page probes vlanGroupsService.isSupported() first and renders an
 * informative unsupported state when the feature is absent.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { Boxes, Info } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { vlanGroupsService } from '../../../services/configure';
import type { VlanGroup } from '../../../types/configure';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { VlanGroupEditor } from './VlanGroupEditor';
import { withRowClick } from './gridHelpers';
import { fmtMode } from './policyUtils';
import { usePolicyRefData } from './usePolicyRefData';

type Support = 'checking' | 'supported' | 'unsupported';

interface EditorState {
  record: Partial<VlanGroup>;
  isNew: boolean;
}

/** New-group seed — no /default template exists for this resource. */
const NEW_GROUP: Partial<VlanGroup> = {
  name: '',
  mode: 'BridgedAtAp',
  vlanid: '' as unknown as number,
  members: [],
};

export function VlanGroupsPage() {
  const [support, setSupport] = useState<Support>('checking');
  const crud = useResourceCrud<VlanGroup>(vlanGroupsService, {
    resourceLabel: 'VLAN group',
    getId: (g) => g.id,
    getName: (g) => g.name,
    autoLoad: false,
  });
  const refData = usePolicyRefData({ topologies: true });
  const [editor, setEditor] = useState<EditorState | null>(null);

  useEffect(() => {
    let cancelled = false;
    vlanGroupsService
      .isSupported()
      .then((supported) => {
        if (cancelled) return;
        setSupport(supported ? 'supported' : 'unsupported');
        if (supported) void crud.refresh();
      })
      .catch(() => {
        if (!cancelled) setSupport('unsupported');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on mount
  }, []);

  const columns = useMemo<ColDef<VlanGroup>[]>(
    () =>
      withRowClick<VlanGroup>(
        [
          { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 200, sort: 'asc' },
          {
            headerName: 'Mode',
            minWidth: 130,
            valueGetter: (p) => fmtMode(p.data?.mode as string | undefined),
          },
          {
            headerName: 'VLAN ID',
            minWidth: 100,
            valueGetter: (p) => (p.data as Record<string, unknown> | undefined)?.vlanid ?? '',
          },
          {
            headerName: 'Member VLANs',
            minWidth: 130,
            type: 'numeric',
            valueGetter: (p) => (p.data?.members ?? []).length,
          },
        ],
        (row) => setEditor({ record: row, isNew: false })
      ),
    []
  );

  if (support === 'checking') {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (support === 'unsupported') {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <Boxes className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-medium">VLAN Groups</h1>
        </div>
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                VLAN Groups are not supported on this controller
              </p>
              <p className="text-sm text-muted-foreground">
                The controller answered 404 for both /v1/vlangroups and /v3/vlangroups. VLAN
                groups require a controller build that ships the feature; individual VLANs remain
                fully manageable from the VLANs tab.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <ResourceGridPage<VlanGroup>
        title="VLAN Groups"
        description="Pools of same-mode VLANs assigned as one unit"
        icon={Boxes}
        rows={crud.items}
        columnDefs={columns}
        loading={crud.loading}
        storageKey="policy-vlangroups"
        getRowId={(g) => g.id}
        getSearchText={(g) => g.name ?? ''}
        onAdd={() => setEditor({ record: structuredClone(NEW_GROUP), isNew: true })}
        onRefresh={() => void crud.refresh()}
        onDelete={async (rows) => {
          for (const row of rows) await crud.remove(row.id, row.name);
        }}
      />
      {editor && (
        <VlanGroupEditor
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
          groups={crud.items}
        />
      )}
    </>
  );
}
