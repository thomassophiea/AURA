/**
 * New-AP registration modal (newap.tmpl.html, gap 4): Model select -> Serial
 * (1-16 chars, shown once a model is chosen) -> Name -> Description ->
 * Compliance Region (shown when the model has multiple regions). Replaces the
 * old read-only Add path; the per-AP editor stays edit-only.
 */
import React, { useMemo, useState } from 'react';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { EditorDialog } from './EditorDialog';
import { ApSelect } from './controls';
import { AP_NAME_RE, type Opt } from './apHelpers';
import type { ApDetail, ApProfile } from '../../../types/configure';
import type { ApListRow } from './apsData';

export interface NewApModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: ApListRow[];
  profiles: ApProfile[];
  onCreate: (payload: Partial<ApDetail>) => void;
}

export function NewApModal({ open, onOpenChange, existing, profiles, onCreate }: NewApModalProps) {
  const [d, setD] = useState({
    hardwareType: '',
    serialNumber: '',
    apName: '',
    description: '',
    complianceRegion: '',
  });
  const set = (k: keyof typeof d, v: string) => setD((p) => ({ ...p, [k]: v }));

  const models = useMemo<string[]>(() => {
    const all = new Set<string>();
    existing.forEach((a) => a.hardwareType && all.add(a.hardwareType));
    profiles.forEach((p) => p.apPlatform && all.add(p.apPlatform));
    return Array.from(all).sort();
  }, [existing, profiles]);

  const regions = useMemo<string[]>(() => {
    if (!d.hardwareType) return [];
    const seen = Array.from(
      new Set(
        existing
          .filter((a) => a.hardwareType === d.hardwareType)
          .map((a) => (a as { complianceRegion?: string }).complianceRegion)
          .filter((x): x is string => !!x)
      )
    );
    if (seen.length > 1) return seen;
    const base = d.hardwareType.split('-')[0];
    return Array.from(new Set([...seen, `${base}-FCC`, `${base}-ROW`]));
  }, [d.hardwareType, existing]);

  const errs: Record<string, string> = {};
  if (!d.hardwareType) errs.model = 'Model is required';
  if (d.hardwareType && !(d.serialNumber.length >= 1 && d.serialNumber.length <= 16)) {
    errs.serial = 'Serial number must be 1 to 16 characters';
  }
  if (!d.apName.trim()) errs.name = 'Name is required';
  else if (!AP_NAME_RE.test(d.apName)) errs.name = 'Name contains invalid characters';
  if (regions.length > 1 && !d.complianceRegion) errs.region = 'Compliance region is required';
  const valid = Object.keys(errs).length === 0;

  const modelOpts: Opt[] = [{ id: '', label: '— Select —' }, ...models.map((m) => ({ id: m, label: m }))];
  const regionOpts: Opt[] = [{ id: '', label: '— Select —' }, ...regions.map((r) => ({ id: r, label: r }))];

  const create = () => {
    onCreate({
      serialNumber: d.serialNumber,
      apName: d.apName,
      description: d.description,
      hardwareType: d.hardwareType,
      complianceRegion: d.complianceRegion || regions[0] || '',
    });
  };

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Access Point"
      maxWidth={540}
      okDisabled={!valid}
      onOk={create}
    >
      <FieldRow label="Model" required error={errs.model}>
        <ApSelect
          className="w-60"
          value={d.hardwareType}
          options={modelOpts}
          onChange={(v) => {
            set('hardwareType', v);
            set('complianceRegion', '');
          }}
        />
      </FieldRow>
      {d.hardwareType && (
        <FieldRow label="Serial Number" required error={d.serialNumber ? errs.serial : undefined}>
          <Input className="w-60" maxLength={16} value={d.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
        </FieldRow>
      )}
      <FieldRow label="Name" required error={d.apName ? errs.name : undefined}>
        <Input className="w-60" value={d.apName} onChange={(e) => set('apName', e.target.value)} />
      </FieldRow>
      <FieldRow label="Description">
        <Input className="w-72" value={d.description} onChange={(e) => set('description', e.target.value)} />
      </FieldRow>
      {regions.length > 1 && (
        <FieldRow label="Compliance Region" required error={errs.region}>
          <ApSelect className="w-60" value={d.complianceRegion} options={regionOpts} onChange={(v) => set('complianceRegion', v)} />
        </FieldRow>
      )}
    </EditorDialog>
  );
}
