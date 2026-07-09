/**
 * Role "Default Action" row (role_config.html:126–150): action select plus the
 * default/containment VLAN select with inline VLAN add/edit/delete backed by
 * the real topologies service (new records seed from /default; delete honors
 * canDelete and clears the selection when the selected VLAN is removed).
 */
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, X } from 'lucide-react';
import { ConfirmDialog, FieldRow, useDefaults } from '../_kit';
import { EnumSelect, IconAction } from './fields';
import { VlanEditor } from './VlanEditor';
import { ROLE_DEFAULT_ACTIONS } from './constants';
import { vlanOptionLabel } from './policyUtils';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { topologiesService } from '../../../services/configure';
import type { Topology } from '../../../types/configure';
import type { TopologyDraft } from './localTypes';

export interface RoleVlanFieldProps {
  defaultAction: string;
  onDefaultActionChange: (action: string) => void;
  topologyId: string | null | undefined;
  onTopologyChange: (id: string | null) => void;
  topologies: Topology[];
  reloadTopologies: () => Promise<void>;
  error?: string;
}

export function RoleVlanField({
  defaultAction,
  onDefaultActionChange,
  topologyId,
  onTopologyChange,
  topologies,
  reloadTopologies,
  error,
}: RoleVlanFieldProps) {
  const [vlanModal, setVlanModal] = useState<{ record: Topology | null } | null>(null);
  const [vlanSaving, setVlanSaving] = useState(false);
  const [vlanDel, setVlanDel] = useState<Topology | null>(null);
  const [vlanSeed, setVlanSeed] = useState<TopologyDraft | null>(null);
  const topoDefaults = useDefaults<Topology>(topologiesService.getDefault, 'VLAN');

  const selected = topologies.find((t) => t.id === topologyId);

  const openCreate = async () => {
    const seed = await topoDefaults.load();
    if (!seed) return;
    const { id: _id, ...rest } = seed;
    setVlanSeed(rest as TopologyDraft);
    setVlanModal({ record: null });
  };

  const submitVlan = async (payload: TopologyDraft, id?: string) => {
    setVlanSaving(true);
    try {
      const saved = id
        ? await topologiesService.update(id, payload as Partial<Topology>)
        : await topologiesService.create(payload as Partial<Topology>);
      toast.success(id ? `Updated VLAN "${saved.name}"` : `Created VLAN "${saved.name}"`);
      await reloadTopologies();
      onTopologyChange(saved.id);
      setVlanModal(null);
    } catch (err) {
      toast.error('Failed to save VLAN', { description: getUserFriendlyMessage(err) });
    } finally {
      setVlanSaving(false);
    }
  };

  const deleteVlan = async () => {
    if (!vlanDel) return;
    try {
      await topologiesService.remove(vlanDel.id);
      toast.success(`Deleted VLAN "${vlanDel.name}"`);
      await reloadTopologies();
      if (topologyId === vlanDel.id) onTopologyChange(null);
    } catch (err) {
      toast.error('Failed to delete VLAN', { description: getUserFriendlyMessage(err) });
    } finally {
      setVlanDel(null);
    }
  };

  return (
    <>
      <FieldRow label="Default Action" error={error}>
        <div className="flex flex-wrap items-center gap-4">
          <EnumSelect
            value={defaultAction || 'deny'}
            options={ROLE_DEFAULT_ACTIONS}
            onChange={onDefaultActionChange}
            className="w-44"
            aria-label="Default action"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">VLAN ID</span>
            <EnumSelect
              value={String(topologyId ?? '')}
              options={[
                { id: '', label: 'Use default VLAN of Network' },
                ...topologies.map((t) => ({ id: t.id, label: vlanOptionLabel(t) })),
              ]}
              onChange={(v) => onTopologyChange(v || null)}
              className="w-60"
              aria-label="Default VLAN"
            />
            <IconAction title="Add VLAN" onClick={() => void openCreate()}>
              <Plus className="h-4 w-4" />
            </IconAction>
            {selected && (
              <>
                <IconAction title="Edit VLAN" onClick={() => setVlanModal({ record: selected })}>
                  <Pencil className="h-4 w-4" />
                </IconAction>
                <IconAction title="Delete VLAN" destructive onClick={() => setVlanDel(selected)}>
                  <X className="h-4 w-4" />
                </IconAction>
              </>
            )}
          </div>
        </div>
      </FieldRow>

      {vlanModal && (
        <VlanEditor
          key={vlanModal.record?.id ?? 'new'}
          open
          onOpenChange={(next) => !next && setVlanModal(null)}
          initial={(vlanModal.record as TopologyDraft) ?? vlanSeed ?? {}}
          isNew={!vlanModal.record}
          saving={vlanSaving}
          onSubmit={submitVlan}
          topologies={topologies}
        />
      )}
      <ConfirmDialog
        open={vlanDel !== null}
        onOpenChange={(next) => !next && setVlanDel(null)}
        title={`Delete VLAN "${vlanDel?.name ?? ''}"?`}
        description={
          vlanDel?.canDelete === false
            ? `"${vlanDel.name}" cannot be deleted (predefined or in use).`
            : 'This permanently removes the VLAN from the controller. This action cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (vlanDel?.canDelete === false) {
            setVlanDel(null);
            return;
          }
          void deleteVlan();
        }}
      />
    </>
  );
}
