/**
 * Access Points page (aps.html). Controller-exact list with a status dot
 * coloured from the record, a General / AFC view toggle, and the selection-
 * gated footer Actions menu whose items open parameterized workflow modals
 * (gaps 18/19). Row click loads the full per-AP document and opens the
 * override editor (ApEditor); New AP opens the registration modal (gap 4).
 *
 * DIVERGENCE: this page composes AGGridWrapper directly rather than the shared
 * ResourceGridPage kit. The controller's Actions menu is gated on the grid
 * selection, and ResourceGridPage keeps selection private (it only exposes
 * Clone/Delete internally). Owning the grid here is the minimum needed to wire
 * a selection-aware Actions menu without editing the shared kit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridOptions, SelectionChangedEvent } from 'ag-grid-community';
import { Radio, RefreshCw, Search, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AGGridWrapper, type AGGridWrapperHandle } from '../../ui/AGGridWrapper';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { ConfirmDialog } from '../_kit';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { profilesService } from '../../../services/configure';
import type { ApDetail, ApProfile, SiteConfig } from '../../../types/configure';
import { sitesService } from '../../../services/configure';
import { apsData, type ApListRow } from './apsData';
import { generalColumns, afcColumns } from './apColumns';
import { ApActionsMenu } from './ApActionsMenu';
import { ApActionsModal, type ApActionKey } from './ApActionsModal';
import { NewApModal } from './NewApModal';
import { ApEditor } from './ApEditor';

export function ApsPage() {
  const [rows, setRows] = useState<ApListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'general' | 'afc'>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<ApListRow[]>([]);
  const [editor, setEditor] = useState<ApDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [action, setAction] = useState<{ key: ApActionKey; label: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [profiles, setProfiles] = useState<ApProfile[]>([]);
  const gridRef = useRef<AGGridWrapperHandle>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apsData.list();
      if (mounted.current) setRows(data);
    } catch (err) {
      toast.error('Failed to load access points', { description: getUserFriendlyMessage(err) });
      if (mounted.current) setRows([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void sitesService.list().then(setSites).catch(() => undefined);
    void profilesService.list().then(setProfiles).catch(() => undefined);
  }, [load]);

  const openEdit = useCallback(async (row: ApListRow) => {
    try {
      const detail = await apsData.get(row.serialNumber);
      if (mounted.current) setEditor(detail);
    } catch (err) {
      toast.error('Failed to load AP details', { description: getUserFriendlyMessage(err) });
    }
  }, []);

  const columns = useMemo(
    () => (view === 'afc' ? afcColumns({ onEdit: openEdit }) : generalColumns({ onEdit: openEdit })),
    [view, openEdit]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.apName, r.serialNumber, r.ipAddress, r.hostSite]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term))
    );
  }, [rows, searchTerm]);

  const gridOptions = useMemo<GridOptions<ApListRow>>(
    () => ({
      rowSelection: { mode: 'multiRow', enableClickSelection: false },
      getRowId: (p) => p.data.serialNumber,
      onSelectionChanged: (e: SelectionChangedEvent<ApListRow>) => setSelected(e.api.getSelectedRows()),
    }),
    []
  );

  const deletable = useMemo(() => selected.filter((r) => r.canDelete !== false), [selected]);

  const handleSave = async (payload: Partial<ApDetail>, serialNumber: string) => {
    setSaving(true);
    try {
      await apsData.update(serialNumber, payload);
      toast.success(`Updated AP "${payload.apName ?? serialNumber}"`);
      setEditor(null);
      await load();
    } catch (err) {
      toast.error('Failed to save AP', { description: getUserFriendlyMessage(err) });
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const handleCreate = async (payload: Partial<ApDetail>) => {
    try {
      await apsData.create(payload);
      toast.success(`Registered AP "${payload.apName ?? payload.serialNumber}"`);
      setNewOpen(false);
      await load();
    } catch (err) {
      toast.error('Failed to register AP', { description: getUserFriendlyMessage(err) });
    }
  };

  const handleDelete = async (targets: ApListRow[]) => {
    for (const row of targets) {
      try {
        await apsData.remove(row.serialNumber);
        toast.success(`Deleted AP "${row.apName ?? row.serialNumber}"`);
      } catch (err) {
        toast.error('Failed to delete AP', { description: getUserFriendlyMessage(err) });
      }
    }
    gridRef.current?.getApi()?.deselectAll();
    setSelected([]);
    await load();
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Radio className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-medium">Access Points</h1>
          <p className="text-sm text-muted-foreground">
            Per-AP configuration overrides, radios, AFC and adoption actions
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as 'general' | 'afc')}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="afc">AFC</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ApActionsMenu selectedCount={selected.length} onSelect={(key, label) => setAction({ key, label })} />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deletable.length === 0}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <AGGridWrapper<ApListRow>
              ref={gridRef}
              rowData={filtered}
              columnDefs={columns}
              gridOptions={gridOptions}
              storageKey={`configure.aps-${view}`}
            />
          )}
        </CardContent>
      </Card>

      {editor && (
        <ApEditor
          key={editor.serialNumber}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          initial={editor}
          saving={saving}
          onSubmit={handleSave}
          onDelete={(ap) => {
            setEditor(null);
            void handleDelete([{ serialNumber: ap.serialNumber, apName: ap.apName, canDelete: ap.canDelete }]);
          }}
        />
      )}

      {newOpen && (
        <NewApModal open onOpenChange={setNewOpen} existing={rows} profiles={profiles} onCreate={handleCreate} />
      )}

      {action && (
        <ApActionsModal
          actionKey={action.key}
          label={action.label}
          selected={selected}
          sites={sites}
          open
          onOpenChange={(o) => !o && setAction(null)}
          onDone={(msg) => {
            toast.success(msg);
            setAction(null);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${deletable.length} access point(s)?`}
        description="This permanently removes the selected AP(s) from the controller. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete(deletable);
        }}
      />
    </div>
  );
}

export default ApsPage;
