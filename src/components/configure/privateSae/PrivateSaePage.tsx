/**
 * Private SAE (WPA3) — per-user WPA3-Personal (SAE) credential management. The
 * SAE sibling of the PPSK "Pre-Shared Keys" screen, matching the golden EP1
 * design: a DECOUPLED info banner with scope counts, status filter pills, the
 * credential grid, and a toolbar (Filter · Reveal Passphrases · Enroll Device ·
 * sae_password · Import · Export · Audit Trail · Add Key).
 *
 * AURA owns the credential lifecycle and the MAC-enrollment loop; the Campus OS
 * AP enforces it by selecting a per-station SAE password by MAC. Marked
 * Experimental because controller-driven provisioning is not yet available; the
 * sae_password preview is the out-of-band path.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridOptions, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { ShieldCheck, Upload, Download, ScrollText, FileCode2, Plus, Trash2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { AGGridWrapper, type AGGridWrapperHandle } from '../../ui/AGGridWrapper';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { servicesService, rolesService } from '../../../services/configure';
import {
  privateSaeService,
  saeStatus,
  type SaeCredential,
  type SaeInput,
  type SaeStatus,
  type SaeUsage,
} from '../../../services/privateSaeService';
import { PrivateSaeEditor } from './PrivateSaeEditor';
import { PrivateSaeAuditDialog } from './PrivateSaeAuditDialog';
import { PrivateSaeKeyFileDialog } from './PrivateSaeKeyFileDialog';
import { PrivateSaeEnrollDialog } from './PrivateSaeEnrollDialog';

type Filter = 'all' | SaeStatus | 'site-bound' | 'global';
const SAE_ELEMENTS = ['WpaSaeElement', 'WpaSaePskElement'];
const DEFAULT_SSID = 'AURA_PSAE';

/** Minimal CSV parser (quoted fields + commas). One row → one SaeInput. */
function parseCsv(text: string): SaeInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const cols = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const out: SaeInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) =>
      c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    ) ?? [];
    const at = (name: string) => (idx(name) >= 0 ? cells[idx(name)] ?? '' : '');
    const usage: SaeUsage = at('usage').toLowerCase().startsWith('single') ? 'single' : 'multi';
    out.push({
      name: at('name'),
      ssid: at('ssid') || DEFAULT_SSID,
      passphrase: at('passphrase'),
      vlanId: at('vlan_id') ? Number(at('vlan_id')) : null,
      maxDevices: at('max_devices') ? Number(at('max_devices')) : null,
      usage,
      role: at('role') || null,
      email: at('email') || null,
      notify: /^(true|yes|1)$/i.test(at('notify_on_create_or_edit')),
    });
  }
  return out;
}

export interface PrivateSaePageProps {
  /** Rendered inside the Private Credentials tab shell: the shell owns the
   *  page padding, breadcrumb and title, so this page shows only its tools. */
  embedded?: boolean;
}

export function PrivateSaePage({ embedded = false }: PrivateSaePageProps = {}) {
  const [keys, setKeys] = useState<SaeCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editor, setEditor] = useState<{ record: SaeCredential | null } | null>(null);
  const [enroll, setEnroll] = useState<{ credential: SaeCredential } | null>(null);
  const [dialog, setDialog] = useState<null | 'audit' | 'keyfile'>(null);
  const [ssidOptions, setSsidOptions] = useState<string[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);

  const gridRef = useRef<AGGridWrapperHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const revealRef = useRef(false);
  const revealedRef = useRef<Map<string, string>>(new Map());
  const [revealAll, setRevealAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await privateSaeService.list());
    } catch {
      toast.error('Could not load Private SAE keys');
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
        const sae = svcs
          .filter((s) => s.privacy && SAE_ELEMENTS.some((el) => (s.privacy as Record<string, unknown>)[el]))
          .map((s) => s.ssid || s.serviceName)
          .filter(Boolean);
        if (sae.length) setSsidOptions(Array.from(new Set(sae)));
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
  const distinctSsids = useMemo(
    () => Array.from(new Set([DEFAULT_SSID, ...keys.map((k) => k.ssid)])).sort(),
    [keys]
  );

  const counts = useMemo(() => {
    const c = { all: keys.length, active: 0, paused: 0, expired: 0, global: 0, siteBound: 0, storedLocally: 0 };
    for (const k of keys) {
      c[saeStatus(k)]++;
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
      if ((filter === 'active' || filter === 'paused' || filter === 'expired') && saeStatus(k) !== filter) return false;
      if (needle) {
        const hay = `${k.keyid} ${k.name} ${k.description ?? ''} ${k.email ?? ''} ${k.ssid} ${k.role ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [keys, q, filter]);

  const openEdit = useCallback((record: SaeCredential) => setEditor({ record }), []);
  const openEnroll = useCallback((record: SaeCredential) => setEnroll({ credential: record }), []);

  const handleSave = useCallback(
    async (payload: SaeInput) => {
      setSaving(true);
      try {
        if (editor?.record) await privateSaeService.update(editor.record.id, payload);
        else await privateSaeService.create(payload);
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
    const rows = (api?.getSelectedRows() as SaeCredential[] | undefined) ?? [];
    if (!rows.length) return;
    if (!window.confirm(`Delete ${rows.length} key${rows.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    let ok = 0;
    for (const r of rows) {
      try { await privateSaeService.remove(r.id); ok++; } catch { /* reported in toast below */ }
    }
    toast[ok === rows.length ? 'success' : 'warning'](`Deleted ${ok} of ${rows.length}`);
    await load();
  }, [load]);

  const enrollSelected = useCallback(() => {
    const rows = (gridRef.current?.getApi()?.getSelectedRows() as SaeCredential[] | undefined) ?? [];
    if (rows.length !== 1) {
      toast.info('Select exactly one key to enroll a device');
      return;
    }
    openEnroll(rows[0]);
  }, [openEnroll]);

  const toggleReveal = useCallback(async () => {
    const next = !revealAll;
    setRevealAll(next);
    revealRef.current = next;
    if (next && revealedRef.current.size < keys.length) {
      try {
        const pairs = await Promise.all(
          keys.map(async (k) => [k.id, (await privateSaeService.reveal(k.id)).passphrase] as const)
        );
        revealedRef.current = new Map(pairs);
      } catch {
        toast.error('Could not reveal all passphrases');
      }
    }
    gridRef.current?.refreshCells();
  }, [revealAll, keys]);

  const exportCsv = useCallback(() => {
    const header = 'name,ssid,passphrase,vlan_id,max_devices,usage,role,email,notify_on_create_or_edit';
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = keys.map((k) =>
      [
        k.name,
        k.ssid,
        revealedRef.current.get(k.id) ?? '',
        k.vlanId ?? '',
        k.maxDevices ?? '',
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
    a.download = 'private-sae-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!revealAll) toast.info('Passphrases omitted — use Reveal Passphrases first to include them');
  }, [keys, revealAll]);

  const onImportFile = useCallback(
    async (file: File) => {
      try {
        const rows = parseCsv(await file.text());
        if (!rows.length) {
          toast.error('No data rows found in the CSV');
          return;
        }
        const res = await privateSaeService.importMany(rows);
        const ok = res.filter((r) => r.ok).length;
        toast[ok === res.length ? 'success' : 'warning'](`Imported ${ok} of ${res.length} keys`);
        if (ok > 0) await load();
      } catch {
        toast.error('Could not read the CSV file');
      }
    },
    [load]
  );

  const faint = 'italic text-muted-foreground';
  const columnDefs = useMemo<ColDef<SaeCredential>[]>(
    () => [
      { headerName: '', colId: 'check', width: 44, minWidth: 44, maxWidth: 44, pinned: 'left',
        checkboxSelection: true, headerCheckboxSelection: true, sortable: false, resizable: false, suppressMovable: true },
      { headerName: 'Key Name', field: 'name', minWidth: 170, flex: 2,
        cellRenderer: (p: ICellRendererParams<SaeCredential>) => p.data
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
      { headerName: 'Bound Devices', field: 'bindingCount', minWidth: 130,
        valueGetter: (p) => {
          if (!p.data) return '';
          const max = p.data.maxDevices != null ? ` / ${p.data.maxDevices}` : '';
          return `${p.data.bindingCount}${max}`;
        } },
      { headerName: 'SSID', field: 'ssid', minWidth: 140 },
      { headerName: 'VLAN ID', field: 'vlanId', minWidth: 110,
        valueGetter: (p) => (p.data?.vlanId != null ? p.data.vlanId : 'WLAN default'),
        cellClass: (p) => (p.data?.vlanId == null ? faint : '') },
      { headerName: 'Role', field: 'role', minWidth: 150,
        valueGetter: (p) => p.data?.role || 'WLAN default',
        cellClass: (p) => (!p.data?.role ? faint : '') },
      { headerName: 'Status', field: 'enabled', minWidth: 110,
        cellRenderer: (p: ICellRendererParams<SaeCredential>) => {
          if (!p.data) return null;
          const s = saeStatus(p.data);
          const variant = s === 'active' ? 'default' : s === 'expired' ? 'outline' : 'secondary';
          return <Badge variant={variant} className="capitalize">{s}</Badge>;
        } },
    ],
    [openEdit]
  );

  const gridOptions = useMemo<GridOptions<SaeCredential>>(
    () => ({
      rowSelection: 'multiple',
      suppressRowClickSelection: true,
      suppressCellFocus: true,
      onRowClicked: (e: RowClickedEvent<SaeCredential>) => {
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
    <div className={embedded ? 'space-y-4 pt-2' : 'space-y-4 p-6'}>
      {!embedded && (
        <div>
          <p className="text-xs text-muted-foreground">Configuration / Private SAE (WPA3)</p>
        </div>
      )}

      {/* DECOUPLED banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Badge variant="outline" className="shrink-0 border-primary/40 text-[10px] uppercase tracking-wider text-primary">
          Decoupled
        </Badge>
        <span className="flex-1 text-sm text-muted-foreground">
          Keys are independent WPA3-SAE credentials. A key may reference a Role, but it is never owned by or
          inherited from one. Each key is available organization-wide, or bound to specific Sites or Site Groups.
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">{counts.global} Global</Badge>
          <Badge variant="secondary">{counts.siteBound} Site-bound</Badge>
          <Badge variant="secondary">{counts.storedLocally} Stored locally</Badge>
        </div>
      </div>

      {/* Title + toolbar (title is owned by the Private Credentials shell when embedded) */}
      <div className={`flex flex-wrap items-start gap-3 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && (
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Private SAE (WPA3)</h1>
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">Experimental</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">Per-user WPA3-Personal (SAE) credentials on one WLAN</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="h-9 w-48" />
          <Button type="button" variant="ghost" size="sm" onClick={() => void toggleReveal()}>
            {revealAll ? 'Hide Passphrases' : 'Reveal Passphrases'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={enrollSelected}>
            <Smartphone className="mr-2 h-4 w-4" /> Enroll Device
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDialog('audit')}>
            <ScrollText className="mr-2 h-4 w-4" /> Audit Trail
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ''; }} />
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!keys.length}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDialog('keyfile')} disabled={!distinctSsids.length}>
            <FileCode2 className="mr-2 h-4 w-4" /> sae_password
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
          <AGGridWrapper<SaeCredential>
            ref={gridRef}
            rowData={filtered}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            storageKey="configure.privateSae"
            height={loading ? 200 : undefined}
          />
        </CardContent>
      </Card>

      {editor && (
        <PrivateSaeEditor
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
      {enroll && (
        <PrivateSaeEnrollDialog
          open
          onOpenChange={(o) => !o && setEnroll(null)}
          credential={enroll.credential}
          onChanged={() => void load()}
        />
      )}
      <PrivateSaeAuditDialog open={dialog === 'audit'} onOpenChange={(o) => !o && setDialog(null)} />
      <PrivateSaeKeyFileDialog open={dialog === 'keyfile'} onOpenChange={(o) => !o && setDialog(null)} ssids={distinctSsids} />
    </div>
  );
}

export default PrivateSaePage;
