/**
 * Meshpoint editor drawer (meshpoint_config.html). Name (required + pattern),
 * Mesh ID (required), Status, Root; the distributed-gated rows (Neighbor
 * Timeout, Control VLAN, Auth Type, PSK) with the AP39xx footnote. Single auth
 * type is bound to privacy.PskElement presence; PSK is masked, max 63.
 * Associated Profiles opens the assignment modal (edit mode only).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Switch } from '../../ui/switch';
import { EditorSheet, FieldRow, MaskedInput } from '../_kit';
import type { ApProfile, Meshpoint, Topology } from '../../../types/configure';
import { ControlVlanRow } from './ControlVlanRow';
import { MeshAssocProfilesModal } from './MeshAssocProfilesModal';
import { hasPrivacy, validateMeshpoint } from './meshpointModel';

export interface MeshpointEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: Meshpoint | null;
  seed: Meshpoint | null;
  topologies: Topology[];
  profiles: ApProfile[];
  /** Whether the platform supports distributed sites ($root.supportDistributed). */
  supportDistributed: boolean;
  saving: boolean;
  onSave: (payload: Partial<Meshpoint>, id?: string) => void | Promise<void>;
  onTopologiesChanged: () => void | Promise<void>;
  onProfilesChanged: () => void | Promise<void>;
}

const LW = 170;

export function MeshpointEditorSheet(props: MeshpointEditorSheetProps) {
  const {
    open,
    onOpenChange,
    record,
    seed,
    topologies,
    profiles,
    supportDistributed,
    saving,
    onSave,
    onTopologiesChanged,
    onProfilesChanged,
  } = props;
  const isNew = record == null;
  const [form, setForm] = useState<Meshpoint>(() => structuredClone((record ?? seed) as Meshpoint));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = isNew || JSON.stringify(form) !== initialJson.current;
  const [assocOpen, setAssocOpen] = useState(false);

  const errs = useMemo(
    () => validateMeshpoint(form, { supportDistributed }),
    [form, supportDistributed]
  );
  const valid = Object.keys(errs).length === 0;
  const privacyOn = hasPrivacy(form);
  const psk = form.privacy?.PskElement;

  const upd = (patch: Partial<Meshpoint>) => setForm((p) => ({ ...p, ...patch }));

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'Add Meshpoint' : form.name || 'Edit Meshpoint'}
        description="Mesh network configuration (/v3/meshpoints)"
        width={720}
        dirty={dirty}
        valid={valid}
        saving={saving}
        onSave={() => onSave(form, record?.id)}
      >
        <div className="max-w-[640px] space-y-1">
          <FieldRow label="Name" htmlFor="mp-name" error={dirty ? errs.name : null} required>
            <Input
              id="mp-name"
              value={form.name ?? ''}
              onChange={(e) => upd({ name: e.target.value })}
              className="max-w-[340px]"
            />
          </FieldRow>
          <FieldRow label="Mesh ID" htmlFor="mp-id" error={dirty ? errs.meshId : null} required>
            <Input
              id="mp-id"
              value={form.meshId ?? ''}
              onChange={(e) => upd({ meshId: e.target.value })}
              className="max-w-[340px]"
            />
          </FieldRow>
          <FieldRow label="Status">
            <Select
              value={form.status === 'disabled' ? 'disabled' : 'enabled'}
              onValueChange={(v) => upd({ status: v })}
            >
              <SelectTrigger className="max-w-[200px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Root Meshpoint" inline>
            <Switch
              checked={!!form.root}
              onCheckedChange={(v) => upd({ root: v })}
              aria-label="Root Meshpoint"
            />
          </FieldRow>

          {supportDistributed && (
            <>
              <FieldRow
                label={<span>Neighbor Timeout [s] &#8314;</span>}
                htmlFor="mp-nt"
                error={dirty ? errs.neighborTimeout : null}
              >
                <Input
                  id="mp-nt"
                  type="number"
                  min={1}
                  step={1}
                  value={form.neighborTimeout ?? 120}
                  onChange={(e) =>
                    upd({ neighborTimeout: e.target.value === '' ? 0 : Number(e.target.value) })
                  }
                  className="max-w-[160px]"
                />
              </FieldRow>

              <ControlVlanRow
                value={form.controlVlan}
                topologies={topologies}
                onChange={(id) => upd({ controlVlan: id })}
                onTopologiesChanged={onTopologiesChanged}
                labelWidth={LW}
              />

              <FieldRow label={<span>Auth Type &#8314;</span>}>
                <Select
                  value={privacyOn ? 'PskElement' : ''}
                  onValueChange={(v) => {
                    if (v === 'PskElement' && !privacyOn)
                      upd({ privacy: { PskElement: { presharedKey: '', keyHexEncoded: false } } });
                  }}
                >
                  <SelectTrigger className="max-w-[240px]" aria-label="Auth Type">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PskElement">WPA2-Personal (PSK)</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {privacyOn && (
                <FieldRow label="Pre-Shared Key" error={errs.psk}>
                  <MaskedInput
                    value={psk?.presharedKey ?? ''}
                    onChange={(v) =>
                      upd({
                        privacy: {
                          ...form.privacy,
                          PskElement: { ...psk, presharedKey: v, keyHexEncoded: !!psk?.keyHexEncoded },
                        },
                      })
                    }
                    maxLength={63}
                    placeholder={psk?.keyHexEncoded ? 'Hex-encoded key' : 'Max 63 characters'}
                    className="max-w-[300px]"
                  />
                </FieldRow>
              )}
              <p className="pt-1 text-[11.5px] text-muted-foreground" style={{ marginLeft: LW + 12 }}>
                ( &#8314; ) Does not apply to AP 39xx
              </p>
            </>
          )}

          <div className="pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isNew}
              onClick={() => setAssocOpen(true)}
            >
              Associated Profiles
            </Button>
            {isNew && (
              <p className="pt-1 text-xs text-muted-foreground">
                Save the meshpoint before assigning it to profiles.
              </p>
            )}
          </div>
        </div>
      </EditorSheet>

      {assocOpen && record && (
        <MeshAssocProfilesModal
          meshpointId={record.id}
          profiles={profiles}
          onClose={() => setAssocOpen(false)}
          onSaved={onProfilesChanged}
        />
      )}
    </>
  );
}
