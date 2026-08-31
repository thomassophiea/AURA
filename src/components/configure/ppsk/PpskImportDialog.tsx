/**
 * Import PSKs from CSV — mirrors the golden design's bulk-import modal.
 * Header row: name, ssid, passphrase, vlan_id, mac, usage, role, email,
 * notify_on_create_or_edit. Rows are validated client-side then created one by
 * one through the audited API; a per-row result summary is shown.
 */
import React, { useRef, useState } from 'react';
import { UploadCloud, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { ppskService, type PpskInput, type PpskUsage } from '../../../services/ppskService';

const HEADER = 'name,ssid,passphrase,vlan_id,mac,usage,role,email,notify_on_create_or_edit';
const SAMPLE =
  `${HEADER}\n` +
  'Corp Laptops,Skynet,Zephyr-8f2a-Quill,1,,Multiple users,Enterprise User,,false\n' +
  'J. Rivera,Skynet,Cobalt-a90e-Miner,2,A4:83:E7:2C:19:D0,Single user,Guest Access,jrivera@corp.example,true\n';

export interface PpskImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** Minimal CSV parser (quoted fields + commas). One row → one PpskInput. */
function parseCsv(text: string): PpskInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const cols = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);
  const out: PpskInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) =>
      c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    ) ?? [];
    const at = (name: string) => (idx(name) >= 0 ? cells[idx(name)] ?? '' : '');
    const usageRaw = at('usage').toLowerCase();
    const usage: PpskUsage = usageRaw.startsWith('single') ? 'single' : 'multi';
    const mac = at('mac');
    out.push({
      name: at('name'),
      ssid: at('ssid'),
      passphrase: at('passphrase'),
      vlanId: at('vlan_id') ? Number(at('vlan_id')) : null,
      mac: mac || null,
      macMode: usage === 'single' ? (mac ? 'specify' : 'first') : null,
      usage,
      role: at('role') || null,
      email: at('email') || null,
      notify: /^(true|yes|1)$/i.test(at('notify_on_create_or_edit')),
    });
  }
  return out;
}

export function PpskImportDialog({ open, onOpenChange, onImported }: PpskImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ ok: boolean; name: string; error?: string }> | null>(null);

  const downloadSample = () => {
    const blob = new Blob([SAMPLE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ppsk-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setResults(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) {
        toast.error('No data rows found in the CSV');
        return;
      }
      const res = await ppskService.importMany(rows);
      setResults(res);
      const ok = res.filter((r) => r.ok).length;
      toast[ok === res.length ? 'success' : 'warning'](`Imported ${ok} of ${res.length} keys`);
      if (ok > 0) onImported();
    } catch {
      toast.error('Could not read the CSV file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import PSKs from CSV</DialogTitle>
          <DialogDescription>Bulk-create keys. Each row becomes one Pre-Shared Key.</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-5 py-10 text-center hover:border-primary/50"
        >
          <UploadCloud className="h-9 w-9 text-primary" />
          <span className="text-sm text-muted-foreground">
            {busy ? 'Importing…' : 'Click to select a CSV file'}
          </span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />

        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={downloadSample}>
          <Download className="mr-2 h-4 w-4" /> Download sample CSV
        </Button>

        <div className="text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">The CSV file must start with this header row:</p>
          <code className="mt-1 block overflow-x-auto rounded bg-muted p-2 font-mono">{HEADER}</code>
        </div>

        {results && (
          <div className="max-h-40 overflow-y-auto rounded border border-border text-xs">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 last:border-0">
                <span className="font-medium">{r.name || `(row ${i + 1})`}</span>
                <span className={r.ok ? 'text-primary' : 'text-destructive'}>{r.ok ? 'created' : r.error}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
