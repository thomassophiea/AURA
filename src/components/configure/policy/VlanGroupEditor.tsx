/**
 * VLAN Group editor (controller topology-group.html): Name (required),
 * Topology Mode (locked after create; changing on create clears the pool),
 * VLAN ID 1–4094, member-VLAN pool picker (same-mode / editable / not already
 * pooled, labeled "name (vlanid)") and a member table whose LAST member can
 * never be removed.
 */
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow, Section } from '../_kit';
import { EnumSelect, NumInput } from './fields';
import { TOPOLOGY_MODES } from './constants';
import { availableGroupMembers, vlanGroupErrors, vlanOptionLabel } from './policyUtils';
import { useDraft } from './useDraft';
import { IconAction } from './fields';
import type { Topology, VlanGroup } from '../../../types/configure';

export interface VlanGroupEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Partial<VlanGroup>;
  isNew: boolean;
  saving: boolean;
  onSubmit: (payload: Partial<VlanGroup>, id?: string) => void | Promise<void>;
  topologies: Topology[];
  groups: VlanGroup[];
}

export function VlanGroupEditor({
  open,
  onOpenChange,
  initial,
  isNew,
  saving,
  onSubmit,
  topologies,
  groups,
}: VlanGroupEditorProps) {
  const { form, upd, dirty } = useDraft<Partial<VlanGroup> & Record<string, unknown>>(initial);
  const [pick, setPick] = useState('');

  const mode = String(form.mode ?? 'BridgedAtAp');
  const members = (form.members as string[] | undefined) ?? [];
  const errs = vlanGroupErrors(form);
  const valid = Object.keys(errs).length === 0;

  const available = availableGroupMembers(
    topologies,
    groups,
    isNew ? undefined : (form.id as string | undefined),
    mode,
    members
  );

  const topoById = (id: string) => topologies.find((t) => t.id === id);

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Add VLAN Group' : String(form.name || 'VLAN Group')}
      description="Pool of same-mode VLANs assigned as one unit"
      width={720}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => void onSubmit(form, isNew ? undefined : (form.id as string))}
    >
      <div className="space-y-6">
        <Section title="General">
          <FieldRow label="Name" required error={errs.name}>
            <Input
              value={String(form.name ?? '')}
              placeholder="VLAN Group Name"
              maxLength={64}
              onChange={(e) => upd('name', e.target.value)}
              className="w-80"
            />
          </FieldRow>
          <FieldRow
            label="Topology Mode"
            description={isNew ? 'Changing the mode clears the member pool' : 'Locked after create'}
          >
            <EnumSelect
              value={mode}
              options={TOPOLOGY_MODES}
              disabled={!isNew}
              onChange={(v) => {
                upd('mode', v);
                if (isNew) upd('members', []);
                setPick('');
              }}
              aria-label="Topology mode"
            />
          </FieldRow>
          <FieldRow label="VLAN ID" required error={errs.vlanid}>
            <NumInput
              value={(form.vlanid as number) ?? ''}
              min={1}
              max={4094}
              placeholder="VLAN ID"
              onChange={(v) => upd('vlanid', v)}
              className="w-32"
            />
          </FieldRow>
        </Section>

        <Section title="VLANs" description="Member VLANs of this group">
          {available.length > 0 && (
            <FieldRow label="Available">
              <div className="flex items-center gap-2">
                <EnumSelect
                  value={pick}
                  placeholder="— Select —"
                  options={[
                    { id: '', label: '— Select —' },
                    ...available.map((t) => ({ id: t.id, label: vlanOptionLabel(t) })),
                  ]}
                  onChange={setPick}
                  className="w-72"
                  aria-label="Available VLANs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pick}
                  onClick={() => {
                    if (!pick) return;
                    upd('members', [...members, pick]);
                    setPick('');
                  }}
                >
                  Add
                </Button>
              </div>
            </FieldRow>
          )}
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No member VLANs yet — add from the pool above.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[2fr_1fr_50px] gap-2 border-b border-border pb-2 text-xs font-semibold">
                <span>Name</span>
                <span>VLAN ID</span>
                <span />
              </div>
              {members.map((id) => {
                const t = topoById(id);
                const last = members.length === 1;
                return (
                  <div
                    key={id}
                    className="grid grid-cols-[2fr_1fr_50px] items-center gap-2 border-b border-border py-1.5 text-sm"
                  >
                    <span>{t?.name ?? id}</span>
                    <span className="text-muted-foreground">{t?.vlanid ?? '—'}</span>
                    <IconAction
                      title={
                        last
                          ? 'A VLAN group must keep at least one member VLAN'
                          : 'Remove VLAN from group'
                      }
                      destructive
                      disabled={last}
                      onClick={() => {
                        if (last) return;
                        upd(
                          'members',
                          members.filter((m) => m !== id)
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconAction>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </EditorSheet>
  );
}
