/**
 * Site editor · Device Groups tab. Lists site.deviceGroups on the real keys
 * (groupName / profileId / rfMgmtPolicyId / apSerialNumbers), rows open the
 * DeviceGroupModal for edit, per-row delete is confirm-gated, and Create is
 * disabled until the site country + mode are set (gap 15).
 */
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { ConfirmDialog } from '../_kit';
import type { DeviceGroup } from '../../../types/configure';
import type { SiteTabProps } from './siteEditorTypes';
import { DeviceGroupModal } from './DeviceGroupModal';

export function SiteDeviceGroupsTab({ form, update, refs }: SiteTabProps) {
  const groups = form.deviceGroups ?? [];
  const [modal, setModal] = useState<{ index: number } | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const blocked = !form.country || form.distributed == null;

  const nameOf = (id: string, list: { id: string; name: string }[]) =>
    list.find((x) => x.id === id)?.name ?? '—';

  const apply = (dg: DeviceGroup) => {
    const next = groups.slice();
    if (modal && modal.index >= 0) next[modal.index] = dg;
    else next.push(dg);
    update('deviceGroups', next);
    setModal(null);
  };

  const remove = (i: number) => {
    update('deviceGroups', groups.filter((_, x) => x !== i));
    setDel(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Button disabled={blocked} onClick={() => setModal({ index: -1 })}>
          <Plus className="mr-1 h-4 w-4" />
          Create Device Group
        </Button>
        {blocked && (
          <span className="text-xs text-destructive">
            Set the site mode and country before adding device groups
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead>RF Management</TableHead>
            <TableHead>Access Points</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No device groups
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g, i) => (
              <TableRow key={g.id}>
                <TableCell>
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setModal({ index: i })}
                  >
                    {g.groupName || '(unnamed)'}
                  </button>
                </TableCell>
                <TableCell>
                  {nameOf(g.profileId, refs.profiles.map((p) => ({ id: p.id, name: p.name })))}
                </TableCell>
                <TableCell>
                  {nameOf(g.rfMgmtPolicyId, refs.rfPolicies.map((r) => ({ id: r.id, name: r.name })))}
                </TableCell>
                <TableCell>{(g.apSerialNumbers ?? []).length}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDel(i)}
                    aria-label="Delete device group"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {modal && (
        <DeviceGroupModal
          siteName={form.siteName}
          group={modal.index >= 0 ? groups[modal.index] : null}
          siblingNames={groups
            .filter((_, i) => i !== modal.index)
            .map((g) => g.groupName)
            .filter(Boolean)}
          profiles={refs.profiles}
          rfPolicies={refs.rfPolicies}
          onApply={apply}
          onDelete={modal.index >= 0 ? () => remove(modal.index) : undefined}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={del != null}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete device group?"
        description={`Delete "${del != null ? groups[del]?.groupName : ''}"? Its access points return to the site pool.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (del != null) remove(del);
        }}
      />
    </div>
  );
}
