/**
 * Control VLAN row for the meshpoint editor: a topology select ("name (VLAN
 * n)") with inline add / edit / delete affordances wired to the live
 * topologies service (meshpoint_config.html 83-101). Delete is confirm-gated
 * and honors canDelete.
 */
import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { ConfirmDialog } from '../_kit';
import { topologiesService } from '../../../services/configure';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import type { Topology } from '../../../types/configure';

const NONE = '__none__';

export interface ControlVlanRowProps {
  value: string | number | null;
  topologies: Topology[];
  onChange: (id: string | null) => void;
  onTopologiesChanged: () => void | Promise<void>;
  labelWidth: number;
}

export function ControlVlanRow({
  value,
  topologies,
  onChange,
  onTopologiesChanged,
  labelWidth,
}: ControlVlanRowProps) {
  const [edit, setEdit] = useState<{ topo: Topology; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const current = topologies.find((t) => t.id === value) ?? null;

  const openAdd = async () => {
    try {
      const def = await topologiesService.getDefault();
      def.name = '';
      setEdit({ topo: def, isNew: true });
    } catch (error) {
      toast.error('Failed to load topology template', { description: getUserFriendlyMessage(error) });
    }
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const { topo, isNew } = edit;
      const saved = isNew
        ? await topologiesService.create({ ...topo, id: undefined } as Partial<Topology>)
        : await topologiesService.update(topo.id, topo);
      toast.success(`${isNew ? 'Created' : 'Updated'} topology "${saved.name}"`);
      await onTopologiesChanged();
      onChange(saved.id);
      setEdit(null);
    } catch (error) {
      toast.error('Failed to save topology', { description: getUserFriendlyMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!current) return;
    try {
      await topologiesService.remove(current.id);
      toast.success(`Deleted topology "${current.name}"`);
      onChange(null);
      await onTopologiesChanged();
    } catch (error) {
      toast.error('Failed to delete topology', { description: getUserFriendlyMessage(error) });
    }
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Label className="shrink-0" style={{ width: labelWidth }}>
          Control VLAN &#8314;
        </Label>
        <Select
          value={current ? current.id : NONE}
          onValueChange={(v) => onChange(v === NONE ? null : v)}
        >
          <SelectTrigger className="w-[250px]" aria-label="Control VLAN">
            <SelectValue placeholder="— None —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— None —</SelectItem>
            {topologies.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {`${t.name} (VLAN ${t.vlanid})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => void openAdd()} aria-label="Add topology">
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={!current}
          onClick={() => current && setEdit({ topo: structuredClone(current), isNew: false })}
          aria-label="Edit topology"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          disabled={!current || current.canDelete === false}
          onClick={() => setConfirmDel(true)}
          aria-label="Delete topology"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.isNew ? 'Add Topology' : 'Edit Topology'}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="topo-name">Name</Label>
                <Input
                  id="topo-name"
                  value={edit.topo.name ?? ''}
                  onChange={(e) => setEdit({ ...edit, topo: { ...edit.topo, name: e.target.value } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="topo-vlan">VLAN ID</Label>
                <Input
                  id="topo-vlan"
                  type="number"
                  min={1}
                  max={4094}
                  value={edit.topo.vlanid ?? ''}
                  onChange={(e) =>
                    setEdit({ ...edit, topo: { ...edit.topo, vlanid: Number(e.target.value) } })
                  }
                  className="max-w-[160px]"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => void save()}
              disabled={busy || !String(edit?.topo.name ?? '').trim() || !edit?.topo.vlanid}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete topology?"
        description={`Remove "${current?.name ?? ''}" (VLAN ${current?.vlanid ?? ''})? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={doDelete}
      />
    </div>
  );
}
