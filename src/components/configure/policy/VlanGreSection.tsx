/**
 * GRE tunnel-concentrator block (controller topology.html GRE mode):
 * concentrators[] capped at 3, inline concentrator create, member table with
 * row delete, and the Load Balance toggle mapping to concentratorsSelection
 * failover|loadBalance. The controller's VPN-concentrator catalog API was not
 * captured on this box, so the selectable pool is the union of concentrators
 * already referenced by topologies plus any created inline this session.
 */
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { FieldRow } from '../_kit';
import { EnumSelect, IconAction } from './fields';
import type { GreConcentratorRow, TopologyDraft } from './localTypes';
import { IP_RE } from './policyUtils';

export interface VlanGreSectionProps {
  form: TopologyDraft;
  upd: (path: string, value: unknown) => void;
  /** Concentrators referenced anywhere (derived from the topologies list). */
  knownConcentrators: GreConcentratorRow[];
  disabled?: boolean;
}

export function VlanGreSection({ form, upd, knownConcentrators, disabled }: VlanGreSectionProps) {
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<{ name: string; ipAddress: string } | null>(null);
  const [sessionPool, setSessionPool] = useState<GreConcentratorRow[]>([]);

  const members = (form.concentrators ?? []) as GreConcentratorRow[];
  const memberIds = new Set(members.map((c) => c.id ?? c.name));
  const pool = [...knownConcentrators, ...sessionPool].filter(
    (c) => !memberIds.has(c.id ?? c.name)
  );

  const addSelected = () => {
    const c = pool.find((x) => (x.id ?? x.name) === selected);
    if (!c || members.length >= 3) return;
    upd('concentrators', [
      ...members,
      { id: c.id, name: c.name, ipAddress: c.ipAddress, managed: true, secure: false },
    ]);
    setSelected('');
  };

  const draftValid = draft != null && draft.name.trim() !== '' && IP_RE.test(draft.ipAddress);

  return (
    <>
      <FieldRow label="Tunnel Concentrators" description="Up to 3 concentrators">
        <div className="flex flex-wrap items-center gap-2">
          <EnumSelect
            value={selected}
            placeholder={pool.length ? 'Select…' : 'No concentrators defined'}
            options={pool.map((c) => ({
              id: c.id ?? c.name,
              label: `${c.name} / ${c.ipAddress ?? ''}`,
            }))}
            onChange={setSelected}
            disabled={disabled}
            className="w-64"
            aria-label="Tunnel concentrator"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !selected || members.length >= 3}
            onClick={addSelected}
          >
            Add
          </Button>
          <IconAction
            title="New tunnel concentrator"
            disabled={disabled}
            onClick={() => setDraft({ name: '', ipAddress: '' })}
          >
            <Plus className="h-4 w-4" />
          </IconAction>
        </div>
      </FieldRow>

      {members.length > 0 && (
        <div className="space-y-1">
          {members.map((c, i) => (
            <div
              key={c.id ?? `${c.name}-${i}`}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="flex-1">{c.name}</span>
              <span className="text-muted-foreground">{c.ipAddress ?? ''}</span>
              <IconAction
                title="Remove concentrator"
                destructive
                disabled={disabled}
                onClick={() => {
                  const next = members.slice();
                  next.splice(i, 1);
                  upd('concentrators', next);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconAction>
            </div>
          ))}
        </div>
      )}

      {members.length > 1 && (
        <FieldRow label="Load Balance" inline description="Distribute tunnels across concentrators">
          <Switch
            checked={form.concentratorsSelection === 'loadBalance'}
            onCheckedChange={(v) => upd('concentratorsSelection', v ? 'loadBalance' : 'failover')}
            disabled={disabled}
          />
        </FieldRow>
      )}

      {draft && (
        <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Tunnel Concentrator</DialogTitle>
              <DialogDescription>Extreme Tunnel Concentrator endpoint.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <FieldRow label="Name" required>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="Termination Address" required>
                <Input
                  value={draft.ipAddress}
                  placeholder="10.9.9.1"
                  onChange={(e) => setDraft({ ...draft, ipAddress: e.target.value })}
                />
              </FieldRow>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!draftValid}
                onClick={() => {
                  const rec: GreConcentratorRow = {
                    id: `conc-${Date.now()}`,
                    name: draft.name,
                    ipAddress: draft.ipAddress,
                  };
                  setSessionPool((p) => [...p, rec]);
                  setSelected(rec.id ?? rec.name);
                  setDraft(null);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
