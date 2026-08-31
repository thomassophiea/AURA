/**
 * ExtremeLocation Profile editor (/v3/xlocation). Closes the referential hole
 * where the AP Profile editor's "Location Profile" reference had no editor:
 * Name / Server Address / Tenant ID / Minimum RSS [dBm] / Report Frequency
 * (1–60 s, spec-documented range; minRss is a negative dBm threshold).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow } from '../_kit';
import type { XLocationProfile } from '../../../services/configure/xlocationService';
import { noErrors, type NamedRecord } from './profileModel';
import { xlocationErrors } from './xlocationModel';

export interface XLocationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: XLocationProfile | null;
  seed: XLocationProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<XLocationProfile>, id?: string) => void | Promise<void>;
}

export function XLocationEditor({
  open,
  onOpenChange,
  record,
  seed,
  rows,
  saving,
  onSave,
}: XLocationEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<XLocationProfile>(() => structuredClone(record ?? seed));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;
  const upd = (patch: Partial<XLocationProfile>) => setForm((p) => ({ ...p, ...patch }));

  const errs = useMemo(() => xlocationErrors(rows, form), [rows, form]);
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create ExtremeLocation Profile' : form.name || 'Edit ExtremeLocation Profile'}
      description="ExtremeLocation profile (/v3/xlocation)"
      width={700}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form, record?.id)}
    >
      <div className="max-w-[560px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="xl-name" error={dirty ? errs.name : null} required>
          <Input
            id="xl-name"
            value={form.name ?? ''}
            disabled={ro}
            onChange={(e) => upd({ name: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow
          label="Server Address"
          htmlFor="xl-addr"
          error={dirty ? errs.svrAddr : null}
          required
        >
          <Input
            id="xl-addr"
            value={form.svrAddr ?? ''}
            disabled={ro}
            placeholder="feeds1.extremelocation.com"
            onChange={(e) => upd({ svrAddr: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow label="Tenant ID" htmlFor="xl-tenant">
          <Input
            id="xl-tenant"
            value={form.tenantId ?? ''}
            disabled={ro}
            onChange={(e) => upd({ tenantId: e.target.value })}
            className="max-w-[240px]"
          />
        </FieldRow>
        <FieldRow label="Minimum RSS [dBm]" htmlFor="xl-rss" error={errs.minRss} required>
          <Input
            id="xl-rss"
            type="number"
            value={form.minRss ?? ''}
            disabled={ro}
            onChange={(e) =>
              upd({ minRss: e.target.value === '' ? (NaN as number) : Number(e.target.value) })
            }
            className="max-w-[160px]"
          />
        </FieldRow>
        <FieldRow label="Report Frequency (s)" htmlFor="xl-freq" error={errs.reportFreq} required>
          <Input
            id="xl-freq"
            type="number"
            min={1}
            max={60}
            value={form.reportFreq ?? ''}
            disabled={ro}
            onChange={(e) =>
              upd({ reportFreq: e.target.value === '' ? (NaN as number) : Number(e.target.value) })
            }
            className="max-w-[160px]"
          />
        </FieldRow>
      </div>
    </EditorSheet>
  );
}
