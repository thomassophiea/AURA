/**
 * Generic BLE Scan vendor filter rows (BUILD SPEC 1b #28). 1-5 rows, each
 * ANY or CUSTOM. A saved CUSTOM row shows a name button that re-opens the
 * inline editor (vendor select + name + Company ID + Bluetooth-SIG helper +
 * OK/Cancel). Delete shows only when >1 row; Add shows only on the last row
 * when its vendor != ANY and rows < 5 (IOT-GENERIC-SCAN-MULTI-COMPANY).
 */
import React, { useEffect, useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { GenericScanVendor } from '../../../types/configure';
import { vendorDraftOk, vendorIdErr, vendorNameErr, type VendorDraft } from './iotModel';

const BLUETOOTH_SIG_URL =
  'https://www.bluetooth.com/specifications/assigned-numbers/company-identifiers/';

export interface IotVendorRowsProps {
  vendors: GenericScanVendor[];
  readOnly?: boolean;
  onChange: (vendors: GenericScanVendor[]) => void;
  /** Report whether a row is mid-edit (blocks the parent Save). */
  onEditingChange: (editing: boolean) => void;
}

export function IotVendorRows({ vendors, readOnly, onChange, onEditingChange }: IotVendorRowsProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<VendorDraft | null>(null);

  useEffect(() => {
    onEditingChange(editIdx != null);
  }, [editIdx, onEditingChange]);

  const beginEdit = (i: number, row: GenericScanVendor) => {
    setEditIdx(i);
    setDraft({ vendor: row.vendor, name: row.name ?? '', id: row.id > 0 ? row.id : '' });
  };
  const cancel = () => {
    setEditIdx(null);
    setDraft(null);
  };
  const commit = () => {
    if (editIdx == null || !draft) return;
    const next: GenericScanVendor =
      draft.vendor === 'ANY'
        ? { vendor: 'ANY', id: -1, name: '' }
        : { vendor: 'CUSTOM', name: draft.name, id: Number(draft.id) };
    onChange(vendors.map((v, j) => (j === editIdx ? next : v)));
    cancel();
  };
  const del = (i: number) => {
    onChange(vendors.filter((_, j) => j !== i));
    cancel();
  };
  const add = () => onChange([...vendors, { vendor: 'ANY', id: -1, name: '' }]);

  const last = vendors[vendors.length - 1];
  const canAdd = !readOnly && editIdx == null && vendors.length < 5 && last && last.vendor !== 'ANY';
  const nameErr = draft ? vendorNameErr(draft) : null;
  const idErr = draft ? vendorIdErr(draft) : null;

  return (
    <div className="flex max-w-[560px] flex-col">
      {vendors.map((row, i) => {
        const editing = editIdx === i;
        return (
          <div key={i} className="flex flex-col gap-1.5 border-b border-border py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-xs font-semibold text-muted-foreground">#{i + 1}</span>
              {editing && draft ? (
                <Select value={draft.vendor} onValueChange={(v) => setDraft({ ...draft, vendor: v })}>
                  <SelectTrigger className="w-[130px]" aria-label="Vendor type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">ANY</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              ) : row.vendor === 'CUSTOM' ? (
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60"
                  disabled={readOnly}
                  onClick={() => beginEdit(i, row)}
                >
                  {row.name || '(unnamed vendor)'}
                </button>
              ) : (
                <Select
                  value="ANY"
                  disabled={readOnly}
                  onValueChange={(v) => v === 'CUSTOM' && beginEdit(i, { vendor: 'CUSTOM', name: '', id: -1 })}
                >
                  <SelectTrigger className="w-[130px]" aria-label="Vendor type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANY">ANY</SelectItem>
                    <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {editing && draft?.vendor === 'CUSTOM' && (
                <>
                  <Input
                    className="w-[180px]"
                    placeholder="Vendor name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <Input
                    className="w-[120px]"
                    type="number"
                    placeholder="Company ID"
                    value={draft.id}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Bluetooth SIG company identifiers"
                    onClick={() => window.open(BLUETOOTH_SIG_URL, '_blank', 'noopener')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </>
              )}

              {editing && (
                <>
                  <Button type="button" size="sm" disabled={!draft || !vendorDraftOk(draft)} onClick={commit}>
                    OK
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={cancel}>
                    Cancel
                  </Button>
                </>
              )}
              {!editing && !readOnly && vendors.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Remove vendor"
                  onClick={() => del(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {!editing && i === vendors.length - 1 && canAdd && (
                <Button type="button" variant="outline" size="sm" onClick={add}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              )}
            </div>
            {editing && draft?.vendor === 'CUSTOM' && (nameErr || idErr) && (
              <p className="text-xs text-destructive">{nameErr || idErr}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
