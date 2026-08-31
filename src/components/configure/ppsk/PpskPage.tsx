/**
 * Private Pre-Shared Key — "Pre-Shared Keys" management, matching the golden EP1
 * design: a DECOUPLED info banner with scope counts, status filter pills, the
 * key grid, and a toolbar (Filter · Reveal Passphrases · Audit Trail · Import ·
 * Export · Add Key).
 *
 * AURA owns the identity lifecycle; the Campus OS AP enforces it via a
 * wpa_psk_file (proven on hardware — docs/PPSK_HARDWARE_FINDINGS.md). Marked
 * Experimental because controller-driven provisioning is not yet available; the
 * wpa_psk_file preview is the out-of-band path.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridOptions, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { KeyRound, Upload, Download, ScrollText, FileCode2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AGGridWrapper, type AGGridWrapperHandle } from '../../ui/AGGridWrapper';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { servicesService, rolesService } from '../../../services/configure';
import {
  ppskService,
  ppskStatus,
  type PpskIdentity,
  type PpskInput,
  type PpskStatus,
} from '../../../services/ppskService';
import { PpskEditor } from './PpskEditor';
import { PpskImportDialog } from './PpskImportDialog';
import { PpskAuditDialog } from './PpskAuditDialog';
import { PpskKeyFileDialog } from './PpskKeyFileDialog';

type Filter = 'all' | PpskStatus | 'site-bound' | 'global';
const PERSONAL_ELEMENTS = ['WpaPskElement', 'WpaSaeElement', 'WpaPpskElement', 'WpaSaePskElement'];

function usageLabel(k: PpskIdentity): string {
  if (k.usage === 'single') {
    return k.macMode === 'specify' && k.mac ? 'Single user · MAC-bound' : 'Single user · first device';
  }
  return 'Multi-User';
}

export function PpskPage() {
  const [keys, setKeys] = useState<PpskIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<{ record: PpskIdentity | null } | null>(null);
  const [dialog, setDialog] = useState<null | 'import' | 'audit' | 'keyfile'>(null);
  const [ssidOptions, setSsidOptions] = useState<string[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);

  const gridRef = useRef<AGGridWrapperHandle>(null);
  const revealRef = useRef(false);
  const revealedRef = useRef<Map<string, string>>(new Map());
  const [revealAll, setRevealAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await ppskService.list());
    } catch {
      toast.error('Could not load Pre-Shared Keys');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Best-effort option sources; fall back to values already on the keys.
  useEffect(() => {
    let cancelled = false;
    servicesService
      .list()
      .then((svcs) => {
        if (cancelled) return;
        const psk = svcs
          .filter((s) => s.privacy && PERSONAL_ELEMENTS.some((el) => (s.privacy as Record<string, unknown>)[el]))
          .map((s) => s.ssid || s.serviceName)
          .filter(Boolean);
        if (psk.length) setSsidOptions(Array.from(new Set(psk)));
      })
      .catch(() => undefined);
    rolesService
      .list()
      .then((roles) => { if (!cancelled) setRoleOptions(Array.from(new Set(roles.map((r) => r.name).filter(Boolean)))); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const ssidChoices = useMemo(
    () => Array.from(new Set([...ssidOptions, ...keys.map((k) => k.ssid)].filter(Boolean))).sort(),
    [ssidOptions, keys]
  );
  const roleChoices = useMemo(
    () => Array.from(new Set([...roleOptions, ...keys.map((k) => k.role).filter((r): r is string => !!r)])).sort(),
    [roleOptions, keys]
  );
  const distinctSsids = useMemo(() => Array.from(new Set(keys.map((k) => k.ssid))).sort(), [keys]);

  // Scope + status counts for the banner badges and filter pills.
  const counts = useMemo(() => {
    const c = { all: keys.length, active: 0, paused: 0, expired: 0, global: 0, siteBound: 0, storedLocally: 0 };
    for (const k of keys) {
      c[ppskStatus(k)]++;
      if (k.scope === 'global') c.global++; else c.siteBound++;
      if (k.storeLocally) c.storedLocally++;
    }
    return c;
  }, [keys]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return keys.filter((k) => {
      if (filter === 'global' && k.scope !== 'global') return false;
      if (filter === 'site-bound' && k.scope === 'global') return false;
      if ((filter === 'active' || filter === 'paused' || filter === 'expired') && ppskStatus(k) !== filter) return false;
      if (needle) {
        const hay = `${k.keyid} ${k.name} ${k.description ?? ''} ${k.email ?? ''} ${k.ssid} ${k.role ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [keys, q, filter]);

  const openEdit = useCallback((record: PpskIdentity) => setEditor({ record }), []);

  const handleSave = useCallback(
    async (payload: PpskInput) => {
      setSaving(true);
      try {
        if (editor?.record) await ppskService.update(editor.record.id, payload);
        else await ppskService.create(payload);
        toast.success(editor?.record ? `Updated ${payload.name}` : `Created ${payload.name}`);
        setEditor(null);
        await load();
      } catch (err) {
        toast.error(`Could not save key`, { description: err instanceof Error ? err.message : undefined });
      } finally {
        setSaving(false);
      }
    },
    [editor, load]
  );

  const deleteSelected = useCallback(async () => {
    const api = gridRef.current?.getApi();
    const rows = (api?.getSelectedRows() as PpskIdentity[] | undefined) ?? [];
    if (!rows.length) return;
    if (!window.confirm(`Delete ${rows.length} key${rows.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    let ok = 0;
    for (const r of rows) {
      try { await ppskService.remove(r.id); ok++; } catch { /* reported in toast below */ }
    }
    toast[ok === rows.length ? 'success' : 'warning'](`Deleted ${ok} of ${rows.length}`);
    await load();
  }, [load]);

  const toggleReveal = useCallback(async () => {
    const next = !revealAll;
    setRevealAll(next);
    revealRef.current = next;
    if (next && revealedRef.current.size < keys.length) {
      try {
        const pairs = await Promise.all(
          keys.map(async (k) => [k.id, (await ppskService.reveal(k.id)).passphrase] as const)
        );
        revealedRef.current = new Map(pairs);
      } catch {
        toast.error('Could not reveal all passphrases');
      }
    }
    gridRef.current?.refreshCells();
  }, [revealAll, keys]);

  const exportCsv = useCallback(() => {
    const header = 'name,ssid,passphrase,vlan_id,mac,usage,role,email,notify_on_create_or_edit';
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = keys.map((k) =>
      [
        k.name,
        k.ssid,
        revealedRef.current.get(k.id) ?? '',
        k.vlanId ?? '',
        k.mac ?? '',
        k.usage === 'single' ? 'Single user' : 'Multiple users',
        k.role ?? '',
        k.email ?? '',
        k.notify ? 'true' : 'false',
      ].map((v) => esc(String(v))).join(',')
    );
    const blob = new Blob([`${header}\n${lines.join('\n')}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ppsk-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!revealAll) toast.info('Passphrases omitted — use Reveal Passphrases first to include them');
  }, [keys, revealAll]);

  const faint = 'italic text-muted-foreground';
  const columnDefs = useMemo<ColDef<PpskIdentity>[]>(
    () => [
      { headerName: '', colId: 'check', width: 44, minWidth: 44, maxWidth: 44, pinned: 'left',
        checkboxSelection: true, headerCheckboxSelection: true, sortable: false, resizable: false, suppressMovable: true },
      { headerName: 'Key Name', field: 'name', minWidth: 170, flex: 2,
        cellRenderer: (p: ICellRendererParams<PpskIdentity>) => p.data
          ? <button type="button" className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => p.data && openEdit(p.data)}>{p.data.name}</button>
          : null },
      { headerName: 'Key Description', field: 'description', minWidth: 160, flex: 2,
        valueGetter: (p) => p.data?.description || '—' },
      { headerName: 'Email', field: 'email', minWidth: 160, flex: 2, valueGetter: (p) => p.data?.email || '—' },
      { headerName: 'Passphrase', field: 'keyid', minWidth: 150, cellClass: 'font-mono',
        valueGetter: (p) => {
          if (!p.data) return '';
          return revealRef.current ? (revealedRef.current.get(p.data.id) ?? '••••••••') : '••••••••';
        } },
      { headerName: 'Usage', minWidth: 150, valueGetter: (p) => (p.data ? usageLabel(p.data) : '') },
      { headerName: 'SSID', field: 'ssid', minWidth: 140 },
      { headerName: 'VLAN ID', field: 'vlanId', minWidth: 110,
        valueGetter: (p) => (p.data?.vlanId != null ? p.data.vlanId : 'WLAN default'),
        cellClass: (p) => (p.data?.vlanId == null ? faint : '') },
      { headerName: 'Role', field: 'role', minWidth: 150,
        valueGetter: (p) => p.data?.role || 'WLAN default',
        cellClass: (p) => (!p.data?.role ? faint : '') },
      { headerName: 'Status', field: 'enabled', minWidth: 110,
        cellRenderer: (p: ICellRendererParams<PpskIdentity>) => {
          if (!p.data) return null;
          const s = ppskStatus(p.data);
          const variant = s === 'active' ? 'default' : s === 'expired' ? 'outline' : 'secondary';
          return <Badge variant={variant} className="capitalize">{s}</Badge>;
        } },
    ],
    [openEdit]
  );

  const gridOptions = useMemo<GridOptions<PpskIdentity>>(
    () => ({
      rowSelection: 'multiple',
      suppressRowClickSelection: true,
      suppressCellFocus: true,
      onRowClicked: (e: RowClickedEvent<PpskIdentity>) => {
        const target = e.event?.target as HTMLElement | undefined;
        if (target?.closest('.ag-selection-checkbox, [col-id="check"], button')) return;
        if (e.data) openEdit(e.data);
      },
    }),
    [openEdit]
  );

  const pill = (id: Filter, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        filter === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
      }`}
    >
      {label} · {count}
    </button>
  );

  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-xs text-muted-foreground">Configuration / Private Pre-Shared Key</p>
      </div>

      {/* DECOUPLED banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Badge variant="outline" className="shrink-0 border-primary/40 text-[10px] uppercase tracking-wider text-primary">
          Decoupled
        </Badge>
        <span className="flex-1 text-sm text-muted-foreground">
          Keys are independent objects. A key may reference a Role, but it is never owned by or inherited from one.
          Each key is available organization-wide, or bound to specific Sites or Site Groups.
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{counts.global} Global</Badge>
          <Badge variant="secondary">{counts.siteBound} Site-bound</Badge>
          <Badge variant="secondary">{counts.storedLocally} Stored locally</Badge>
        </div>
      </div>

      {/* Title + toolbar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Pre-Shared Keys</h1>
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">Experimental</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Create pre-shared keys for groups or individuals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="h-9 w-48" />
          <Button type="button" variant="ghost" size="sm" onClick={() => void toggleReveal()}>
            {revealAll ? 'Hide Passphrases' : 'Reveal Passphrases'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDialog('audit')}>
            <ScrollText className="mr-2 h-4 w-4" /> Audit Trail
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDialog('import')}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!keys.length}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDialog('keyfile')} disabled={!distinctSsids.length}>
            <FileCode2 className="mr-2 h-4 w-4" /> wpa_psk_file
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void deleteSelected()}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
          <Button type="button" size="sm" onClick={() => setEditor({ record: null })}>
            <Plus className="mr-2 h-4 w-4" /> Add Key
          </Button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        {pill('all', 'All', counts.all)}
        {pill('active', 'Active', counts.active)}
        {pill('paused', 'Paused', counts.paused)}
        {pill('expired', 'Expired', counts.expired)}
        {pill('site-bound', 'Site-bound', counts.siteBound)}
        {pill('global', 'Global', counts.global)}
      </div>

      <Card>
        <CardContent className="p-0">
          <AGGridWrapper<PpskIdentity>
            ref={gridRef}
            rowData={filtered}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            storageKey="configure.ppsk"
            height={loading ? 200 : undefined}
          />
        </CardContent>
      </Card>

      {editor && (
        <PpskEditor
          key={editor.record?.id ?? 'new'}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          record={editor.record}
          saving={saving}
          ssidOptions={ssidChoices}
          roleOptions={roleChoices}
          onSave={handleSave}
        />
      )}
      <PpskImportDialog open={dialog === 'import'} onOpenChange={(o) => !o && setDialog(null)} onImported={() => void load()} />
      <PpskAuditDialog open={dialog === 'audit'} onOpenChange={(o) => !o && setDialog(null)} />
      <PpskKeyFileDialog open={dialog === 'keyfile'} onOpenChange={(o) => !o && setDialog(null)} ssids={distinctSsids} />
    </div>
  );
}

export default PpskPage;
