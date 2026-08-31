/**
 * PPSK / MPSK identities — one WPA2-Personal WLAN, many keys, identity from the
 * key. AURA owns the lifecycle; the Campus OS AP enforces it (proven on real
 * hardware — docs/PPSK_HARDWARE_FINDINGS.md). Marked EXPERIMENTAL because the
 * controller does not yet push the key file automatically; use the wpa_psk_file
 * preview to apply it out of band.
 */
import React, { useCallback, useMemo, useState } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { KeyRound, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResourceGridPage, useResourceCrud } from '../_kit';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { ppskService, type PpskIdentity, type PpskInput } from '../../../services/ppskService';
import { PpskEditor } from './PpskEditor';
import { PpskKeyFileDialog } from './PpskKeyFileDialog';

export function PpskPage() {
  const crud = useResourceCrud<PpskIdentity>(ppskService, {
    resourceLabel: 'PPSK identity',
    getId: (p) => p.id,
    getName: (p) => p.keyid,
  });
  const [editor, setEditor] = useState<{ record: PpskIdentity | null } | null>(null);
  const [keyFileOpen, setKeyFileOpen] = useState(false);

  const ssids = useMemo(
    () => Array.from(new Set(crud.items.map((i) => i.ssid))).sort(),
    [crud.items]
  );

  const openEdit = useCallback((record: PpskIdentity) => setEditor({ record }), []);
  const openAdd = useCallback(() => setEditor({ record: null }), []);

  const handleSave = useCallback(
    async (payload: PpskInput) => {
      const saved = await crud.save(payload, editor?.record?.id);
      if (saved) setEditor(null);
    },
    [crud, editor]
  );

  const handleDelete = useCallback(
    async (rows: PpskIdentity[]) => {
      for (const row of rows) await crud.remove(row.id, row.keyid);
    },
    [crud]
  );

  const toggleEnabled = useCallback(
    async (row: PpskIdentity) => {
      try {
        await ppskService.setEnabled(row.id, !row.enabled);
        toast.success(`${row.enabled ? 'Disabled' : 'Enabled'} ${row.keyid}`);
        await crud.refresh();
      } catch {
        toast.error(`Could not ${row.enabled ? 'disable' : 'enable'} ${row.keyid}`);
      }
    },
    [crud]
  );

  const columnDefs = useMemo<ColDef<PpskIdentity>[]>(
    () => [
      {
        headerName: 'Identity',
        field: 'keyid',
        flex: 2,
        cellRenderer: (p: ICellRendererParams<PpskIdentity>) =>
          p.data ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => p.data && openEdit(p.data)}
            >
              {p.data.keyid}
            </button>
          ) : null,
      },
      { headerName: 'SSID', field: 'ssid', flex: 2 },
      { headerName: 'Role', field: 'role', flex: 1, valueGetter: (p) => p.data?.role ?? '—' },
      { headerName: 'VLAN', field: 'vlanId', width: 90, valueGetter: (p) => p.data?.vlanId ?? '' },
      {
        headerName: 'Status',
        field: 'enabled',
        width: 130,
        cellRenderer: (p: ICellRendererParams<PpskIdentity>) => {
          if (!p.data) return null;
          const expired = p.data.expiresAt && new Date(p.data.expiresAt) < new Date();
          if (expired) return <Badge variant="outline">Expired</Badge>;
          return (
            <button type="button" onClick={() => p.data && void toggleEnabled(p.data)} title="Toggle">
              <Badge variant={p.data.enabled ? 'default' : 'secondary'}>
                {p.data.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </button>
          );
        },
      },
      {
        headerName: 'Last used',
        field: 'lastUsedAt',
        width: 150,
        valueGetter: (p) => (p.data?.lastUsedAt ? new Date(p.data.lastUsedAt).toLocaleString() : 'never'),
      },
    ],
    [openEdit, toggleEnabled]
  );

  return (
    <>
      <ResourceGridPage<PpskIdentity>
        title="Private Pre-Shared Key"
        description="Per-identity keys on one WPA2-Personal WLAN — identity comes from the key, no MAC pre-registration."
        icon={KeyRound}
        rows={crud.items}
        columnDefs={columnDefs}
        loading={crud.loading}
        storageKey="ppsk"
        getRowId={(row) => row.id}
        getSearchText={(row) => `${row.keyid} ${row.ssid} ${row.role ?? ''}`}
        onAdd={openAdd}
        onDelete={handleDelete}
        onRefresh={() => void crud.refresh()}
        headerActions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
              Experimental
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setKeyFileOpen(true)}
              disabled={ssids.length === 0}
            >
              <FileCode2 className="mr-2 h-4 w-4" /> wpa_psk_file
            </Button>
          </div>
        }
      />
      {editor && (
        <PpskEditor
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          record={editor.record}
          saving={crud.saving}
          onSave={handleSave}
        />
      )}
      <PpskKeyFileDialog open={keyFileOpen} onOpenChange={setKeyFileOpen} ssids={ssids} />
    </>
  );
}

export default PpskPage;
