/**
 * Meshpoint · Associated Profiles modal (associatedProfiles.html). Mesh-capable
 * profiles (feature 'MESH') × their non-sensor radios, with per-profile Select
 * All. Radio assignments persist into each profile's meshpointIfList
 * ([{meshpointId, index}]); wired-port checks are UI-state only (no
 * meshpoint↔wired-port key exists in the API records).
 */
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Loader2 } from 'lucide-react';
import { profilesService } from '../../../services/configure';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import type { ApProfile, ProfileRadio } from '../../../types/configure';

interface MeshIfEntry {
  meshpointId: string;
  index: number;
}

export interface MeshAssocProfilesModalProps {
  meshpointId: string;
  profiles: ApProfile[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

type Selection = Record<string, Record<number, boolean>>;

function radioEntries(profile: ApProfile): MeshIfEntry[] {
  return Array.isArray(profile.meshpointIfList) ? (profile.meshpointIfList as MeshIfEntry[]) : [];
}

export function MeshAssocProfilesModal({
  meshpointId,
  profiles,
  onClose,
  onSaved,
}: MeshAssocProfilesModalProps) {
  const meshProfiles = useMemo(
    () => profiles.filter((p) => (p.features ?? []).includes('MESH')),
    [profiles]
  );
  const [sel, setSel] = useState<Selection>(() => {
    const init: Selection = {};
    for (const p of meshProfiles) {
      const radios: Record<number, boolean> = {};
      for (const e of radioEntries(p)) {
        if (e.meshpointId === meshpointId) radios[e.index] = true;
      }
      init[p.id] = radios;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const setRadio = (pid: string, idx: number, v: boolean) =>
    setSel((m) => ({ ...m, [pid]: { ...m[pid], [idx]: v } }));

  const selectAll = (p: ApProfile, v: boolean) =>
    setSel((m) => {
      const radios: Record<number, boolean> = {};
      for (const r of p.radios ?? []) if (r.mode !== 'sensor') radios[r.radioIndex] = v;
      return { ...m, [p.id]: radios };
    });

  const save = async () => {
    setSaving(true);
    try {
      let changed = 0;
      for (const p of meshProfiles) {
        const radios = sel[p.id] ?? {};
        const kept = radioEntries(p).filter((e) => e.meshpointId !== meshpointId);
        for (const [idx, on] of Object.entries(radios)) {
          if (on) kept.push({ meshpointId, index: Number(idx) });
        }
        const { id: _id, ...rest } = p;
        await profilesService.update(p.id, { ...rest, meshpointIfList: kept });
        changed += 1;
      }
      toast.success(`Updated meshpoint assignment on ${changed} profile${changed === 1 ? '' : 's'}`);
      await onSaved();
      onClose();
    } catch (error) {
      toast.error('Failed to update profile assignments', {
        description: getUserFriendlyMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Associated Profiles</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {meshProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mesh-capable profiles defined.</p>
          ) : (
            meshProfiles.map((p) => {
              const radios: ProfileRadio[] = p.radios ?? [];
              const nonSensor = radios.filter((r) => r.mode !== 'sensor');
              const allOn = nonSensor.length > 0 && nonSensor.every((r) => sel[p.id]?.[r.radioIndex]);
              return (
                <div key={p.id} className="rounded-md border border-border px-3.5 py-2.5">
                  <div className="mb-2 flex items-center gap-3">
                    <Checkbox
                      checked={allOn}
                      disabled={nonSensor.length === 0}
                      onCheckedChange={(v) => selectAll(p, v === true)}
                      aria-label={`Select all radios for ${p.name}`}
                    />
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.apPlatform}</span>
                  </div>
                  <div className="flex flex-wrap gap-5 pl-7">
                    {radios.map((r) => (
                      <label
                        key={r.radioIndex}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Checkbox
                          checked={!!sel[p.id]?.[r.radioIndex]}
                          disabled={r.mode === 'sensor'}
                          onCheckedChange={(v) => setRadio(p.id, r.radioIndex, v === true)}
                          aria-label={`${p.name} ${r.radioName}`}
                        />
                        {r.radioName}
                        {r.mode === 'sensor' ? ' (sensor)' : ''}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || meshProfiles.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
