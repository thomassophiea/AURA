/**
 * Thread Gateway Whitelist nested modal (thread-gateway-whitelist.html).
 * Editable {longEUI, pskd} table: add/remove rows, both fields required on
 * every row, OK gated on valid + dirty.
 */
import React, { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

export interface WhitelistEntry {
  longEUI: string;
  pskd: string;
}

export interface IotWhitelistModalProps {
  list: WhitelistEntry[];
  readOnly?: boolean;
  onOk: (rows: WhitelistEntry[]) => void;
  onClose: () => void;
}

export function IotWhitelistModal({ list, readOnly, onOk, onClose }: IotWhitelistModalProps) {
  const [rows, setRows] = useState<WhitelistEntry[]>(() => structuredClone(list ?? []));
  const initial = useRef(JSON.stringify(list ?? []));
  const dirty = JSON.stringify(rows) !== initial.current;
  const valid = rows.every((r) => r.longEUI?.trim() && r.pskd?.trim());

  const setCell = (i: number, key: keyof WhitelistEntry, v: string) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Thread Gateway Whitelist</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_1fr_40px] gap-2 border-b border-border pb-2 text-xs font-semibold">
            <span>EUI</span>
            <span>PSKd</span>
            <span />
          </div>
          {rows.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">No whitelist entries.</p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_40px] items-center gap-2">
              <Input
                value={r.longEUI}
                disabled={readOnly}
                onChange={(e) => setCell(i, 'longEUI', e.target.value)}
              />
              <Input
                value={r.pskd}
                disabled={readOnly}
                onChange={(e) => setCell(i, 'pskd', e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={readOnly}
                aria-label="Remove entry"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!valid && rows.length > 0 && (
            <p className="text-xs text-destructive">EUI and PSKd are required on every row</p>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { longEUI: '', pskd: '' }])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Entry
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={readOnly || !dirty || !valid} onClick={() => onOk(rows)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
