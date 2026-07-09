/**
 * Full-depth Device Profile editor: a 12-tab, feature-gated EditorSheet over
 * the real ApProfile record. The header carries the General block (editable /
 * predefined-locked Name, read-only AP Platform) and the Advanced + Device
 * Groups affordances; the tab strip shows only the tabs the platform's feature
 * set enables. Save is gated on a valid, dirty form.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Settings2, Boxes } from 'lucide-react';
import { EditorSheet } from '../_kit';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';
import { PROFILE_TABS, type ProfileTab } from './constants';
import {
  hasDeviceAdvErrors,
  meshpointsOf,
  radioRangeErrors,
  wiredPortsVisible,
} from './helpers';
import { setIn } from './helpers';
import { useRefPools } from './useRefPools';
import { TabRouter } from './TabRouter';
import { RadioAdvancedDialog } from './dialogs/RadioAdvancedDialog';
import { DeviceAdvancedDialog } from './dialogs/DeviceAdvancedDialog';
import { ClientBridgeDialog } from './dialogs/ClientBridgeDialog';
import { MeshAdvancedDialog } from './dialogs/MeshAdvancedDialog';
import { AssociatedDeviceGroupsDialog } from './dialogs/AssociatedDeviceGroupsDialog';
import { defaultProfileMesh } from './constants';
import type { ApProfile } from '../../../types/configure';
import type { ProfileMesh, ProfileTabContext } from './types';

export interface ProfileEditorSheetProps {
  open: boolean;
  record: ApProfile | null;
  /** True when `record` is a freshly seeded (unsaved) profile. */
  isNew: boolean;
  existingNames: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (form: ApProfile) => void | Promise<void>;
}

export function ProfileEditorSheet({
  open,
  record,
  isNew,
  existingNames,
  saving,
  onOpenChange,
  onSave,
}: ProfileEditorSheetProps) {
  const [form, setForm] = useState<ApProfile>(() => structuredClone(record ?? ({} as ApProfile)));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('Radios');
  const [advRadio, setAdvRadio] = useState<number | null>(null);
  const [advDev, setAdvDev] = useState(false);
  const [cbCred, setCbCred] = useState(false);
  const [meshAdv, setMeshAdv] = useState<string | null>(null);
  const [dgOpen, setDgOpen] = useState(false);

  const { pools } = useRefPools(open);

  useEffect(() => {
    if (record) {
      setForm(structuredClone(record));
      setDirty(isNew);
      setTab('Radios');
    }
  }, [record, isNew]);

  const radios = form.radios ?? [];
  const F = useMemo(() => (tag: string) => (form.features ?? []).indexOf(tag) >= 0, [form.features]);

  const mut = (fn: (draft: ApProfile) => void) => {
    setForm((prev) => {
      const clone = structuredClone(prev);
      fn(clone);
      return clone;
    });
    setDirty(true);
  };
  const setField = (key: string, value: unknown) => mut((c) => setInPlace(c, key, value));
  const setPath = (path: string, value: unknown) => {
    setForm((prev) => setIn(prev, path, value));
    setDirty(true);
  };
  const updRadio = (index: number, key: string, value: unknown) =>
    mut((c) => {
      (c.radios[index] as unknown as Record<string, unknown>)[key] = value;
    });
  const toggleInArr = (key: string, id: string) =>
    mut((c) => {
      const rec = c as unknown as Record<string, unknown>;
      const arr = Array.isArray(rec[key]) ? (rec[key] as string[]) : [];
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(id);
      rec[key] = arr;
    });

  const visibleTabs = useMemo<ProfileTab[]>(
    () =>
      PROFILE_TABS.filter((t) => {
        switch (t) {
          case 'Radios':
            return radios.length > 0;
          case 'Air Defense':
            return F('AIR-DEFENSE') || F('AIR-DEFENSE-ESSENTIALS');
          case 'IoT':
            return F('IOT');
          case 'Meshpoints':
            return F('MESH');
          case 'Wired Ports':
            return wiredPortsVisible(form.wiredPorts ?? [], F);
          case 'ESL':
            return F('ESL');
          case 'Positioning':
            return F('LOCATION-ENGINE');
          case 'Analytics':
            return F('IPFIX');
          case 'RTLS':
            return F('AEROSCOUT') || F('EKAHAU') || F('CENTRAK') || F('SONITOR');
          default:
            return true; // Networks / Roles / VLANs
        }
      }),
    [radios.length, form.wiredPorts, F]
  );
  const activeTab = visibleTabs.indexOf(tab) >= 0 ? tab : visibleTabs[0] ?? 'Radios';

  const trimmed = String(form.name ?? '').trim();
  const nameErr = !trimmed
    ? 'Name is required'
    : existingNames.indexOf(trimmed) >= 0
      ? 'A profile with this name already exists'
      : null;
  const radioErrs = radioRangeErrors(radios, F);
  const valid = !nameErr && radioErrs.length === 0 && !hasDeviceAdvErrors(form, F);

  const ctx: ProfileTabContext = {
    form,
    radios,
    F,
    pools,
    setField,
    setPath,
    updRadio,
    toggleInArr,
    mut,
    openRadioAdvanced: setAdvRadio,
    openClientBridge: () => setCbCred(true),
    openMeshAdvanced: setMeshAdv,
  };

  const applyMesh = (mesh: ProfileMesh) => {
    mut((c) => {
      const list = meshpointsOf(c);
      const i = list.findIndex((m) => m.meshpointId === mesh.meshpointId);
      if (i >= 0) list[i] = mesh;
      else list.push(mesh);
      c.meshpoints = list;
    });
    setMeshAdv(null);
  };

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'New Profile' : 'Edit Profile'}
      description={form.apPlatform ? `AP Platform: ${form.apPlatform}` : undefined}
      width={840}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form)}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">
            Name<span className="text-destructive"> *</span>
          </Label>
          <Input
            id="profile-name"
            value={form.name ?? ''}
            disabled={!!form.predefined}
            onChange={(e) => setField('name', e.target.value)}
          />
          {nameErr && <p className="text-xs text-destructive">{nameErr}</p>}
          {form.predefined && <p className="text-xs text-muted-foreground">Predefined profiles cannot be renamed.</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAdvDev(true)}>
            <Settings2 className="mr-1 h-4 w-4" />
            Advanced
          </Button>
          {!isNew && record?.id && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDgOpen(true)}>
              <Boxes className="mr-1 h-4 w-4" />
              Device Groups
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border">
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide',
                t === activeTab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="pt-1">
          <TabRouter tab={activeTab} ctx={ctx} />
        </div>

        {radioErrs.length > 0 && (
          <p className="text-xs text-destructive">Out-of-range radio settings: {radioErrs.join(' · ')}</p>
        )}
      </div>

      <RadioAdvancedDialog
        open={advRadio != null}
        radio={advRadio != null ? radios[advRadio] ?? null : null}
        radioIndex={advRadio ?? 0}
        F={F}
        updRadio={updRadio}
        onClose={() => setAdvRadio(null)}
      />
      <DeviceAdvancedDialog open={advDev} form={form} F={F} setPath={setPath} onClose={() => setAdvDev(false)} />
      <ClientBridgeDialog
        open={cbCred}
        cbUser={form.cbUser ?? ''}
        cbPassword={form.cbPassword ?? ''}
        onChange={(key, value) => setField(key, value)}
        onClose={() => setCbCred(false)}
      />
      {meshAdv && (
        <MeshAdvancedDialog
          open
          mesh={meshpointsOf(form).find((m) => m.meshpointId === meshAdv) ?? defaultProfileMesh(meshAdv)}
          F={F}
          onApply={applyMesh}
          onClose={() => setMeshAdv(null)}
        />
      )}
      <AssociatedDeviceGroupsDialog open={dgOpen} profileId={record?.id ?? null} onClose={() => setDgOpen(false)} />
    </EditorSheet>
  );
}

/** In-place dotted set used inside `mut` drafts (already-cloned objects). */
function setInPlace(obj: ApProfile, path: string, value: unknown): void {
  const keys = path.split('.');
  let cursor = obj as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const next = cursor[keys[i]];
    if (typeof next !== 'object' || next == null) cursor[keys[i]] = {};
    cursor = cursor[keys[i]] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
}
