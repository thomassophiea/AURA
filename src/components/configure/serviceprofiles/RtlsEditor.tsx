/**
 * RTLS Profile editor (BUILD SPEC 3b · add-edit-rtls.html + Angular Sonitor
 * block). Name (required+unique+invalid-chars) + Application vendor select
 * (AeroScout / Ekahau / Centrak / Sonitor); the selected vendor reveals its
 * Server IP / Port / Multicast MAC group. All four vendor sub-objects persist
 * regardless of the active appId (matches the API record shape).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { EditorSheet, FieldRow } from '../_kit';
import type { RtlsProfile, RtlsVendorConfig } from '../../../types/configure';
import { RE_IPV4, RE_MAC, intIn, nameError, noErrors, type NamedRecord } from './profileModel';

export const RTLS_VENDORS: { id: string; key: keyof RtlsProfile }[] = [
  { id: 'AeroScout', key: 'aeroScout' },
  { id: 'Ekahau', key: 'ekahau' },
  { id: 'Centrak', key: 'centrak' },
  { id: 'Sonitor', key: 'sonitor' },
];

export const rtlsKeyOf = (appId?: string): keyof RtlsProfile =>
  RTLS_VENDORS.find((v) => v.id === appId)?.key ?? 'aeroScout';

export interface RtlsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: RtlsProfile | null;
  seed: RtlsProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<RtlsProfile>, id?: string) => void | Promise<void>;
}

export function RtlsEditor({ open, onOpenChange, record, seed, rows, saving, onSave }: RtlsEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<RtlsProfile>(() => structuredClone(record ?? seed));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;

  const vk = rtlsKeyOf(form.appId);
  const sub = (form[vk] as RtlsVendorConfig) ?? { ip: '', port: NaN, mcast: '' };
  const updVendor = (patch: Partial<RtlsVendorConfig>) =>
    setForm((p) => ({ ...p, [vk]: { ...(p[vk] as RtlsVendorConfig), ...patch } }));

  const errs = useMemo(
    () => ({
      name: nameError(rows, form, true),
      ip: RE_IPV4.test(sub.ip ?? '') ? null : 'Enter a valid IPv4 address',
      port: intIn(sub.port, 1, 65535) ? null : 'Server Port must be an integer between 1 and 65535',
      mcast: RE_MAC.test(sub.mcast ?? '')
        ? null
        : 'Enter a valid multicast MAC (xx:xx:xx:xx:xx:xx)',
    }),
    [rows, form, sub.ip, sub.port, sub.mcast]
  );
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create RTLS Profile' : form.name || 'Edit RTLS Profile'}
      description="Real-Time Location System profile (/v1/rtlsprofile)"
      width={720}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form, record?.id)}
    >
      <div className="max-w-[600px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="rtls-name" error={dirty ? errs.name : null} required>
          <Input
            id="rtls-name"
            value={form.name ?? ''}
            disabled={ro}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow label="Application" required>
          <Select
            value={form.appId}
            disabled={ro}
            onValueChange={(v) => setForm((p) => ({ ...p, appId: v }))}
          >
            <SelectTrigger className="max-w-[240px]" aria-label="Application">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RTLS_VENDORS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>

        <fieldset className="space-y-4 rounded-md border border-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {form.appId} Server
          </legend>
          <FieldRow label="Server IP Addresses" htmlFor="rtls-ip" error={dirty ? errs.ip : null} required>
            <Input
              id="rtls-ip"
              value={sub.ip ?? ''}
              disabled={ro}
              onChange={(e) => updVendor({ ip: e.target.value })}
              className="max-w-[240px]"
            />
          </FieldRow>
          <FieldRow label="Server Port" htmlFor="rtls-port" error={errs.port} required>
            <Input
              id="rtls-port"
              type="number"
              value={Number.isFinite(sub.port) ? sub.port : ''}
              disabled={ro}
              onChange={(e) =>
                updVendor({ port: e.target.value === '' ? (NaN as number) : Number(e.target.value) })
              }
              className="max-w-[160px]"
            />
          </FieldRow>
          <FieldRow label="Multicast MAC" htmlFor="rtls-mac" error={dirty ? errs.mcast : null} required>
            <Input
              id="rtls-mac"
              value={sub.mcast ?? ''}
              disabled={ro}
              onChange={(e) => updVendor({ mcast: e.target.value })}
              className="max-w-[240px]"
            />
          </FieldRow>
        </fieldset>
      </div>
    </EditorSheet>
  );
}
