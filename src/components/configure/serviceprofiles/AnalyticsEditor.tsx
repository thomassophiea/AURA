/**
 * Analytics Profile editor (BUILD SPEC 5b · add-edit-analytics.html).
 * NetFlow export: Name (required+unique+invalid-chars) / NetFlow Collector
 * Address (IPv4) / Export Interval (whole seconds 30-360, default 60). The
 * dead `reportPkt` control is intentionally NOT implemented (audit gap 5.2).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow } from '../_kit';
import type { AnalyticsProfile } from '../../../types/configure';
import { RE_IPV4, intIn, nameError, noErrors, type NamedRecord } from './profileModel';

export interface AnalyticsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AnalyticsProfile | null;
  seed: AnalyticsProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<AnalyticsProfile>, id?: string) => void | Promise<void>;
}

export function AnalyticsEditor({
  open,
  onOpenChange,
  record,
  seed,
  rows,
  saving,
  onSave,
}: AnalyticsEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<AnalyticsProfile>(() => structuredClone(record ?? seed));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;
  const upd = (patch: Partial<AnalyticsProfile>) => setForm((p) => ({ ...p, ...patch }));

  const errs = useMemo(
    () => ({
      name: nameError(rows, form, true),
      destAddr: RE_IPV4.test(form.destAddr ?? '') ? null : 'Enter a valid IPv4 address',
      reportFreq: intIn(form.reportFreq, 30, 360)
        ? null
        : 'Export Interval must be a whole number between 30 and 360',
    }),
    [rows, form]
  );
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create Analytics Profile' : form.name || 'Edit Analytics Profile'}
      description="NetFlow analytics profile (/v3/analytics)"
      width={700}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form, record?.id)}
    >
      <div className="max-w-[560px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="an-name" error={dirty ? errs.name : null} required>
          <Input
            id="an-name"
            value={form.name ?? ''}
            disabled={ro}
            onChange={(e) => upd({ name: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow
          label="NetFlow Collector Address"
          htmlFor="an-addr"
          error={dirty ? errs.destAddr : null}
          required
        >
          <Input
            id="an-addr"
            value={form.destAddr ?? ''}
            disabled={ro}
            placeholder="0.0.0.0"
            onChange={(e) => upd({ destAddr: e.target.value })}
            className="max-w-[240px]"
          />
        </FieldRow>
        <FieldRow
          label="NetFlow Export Interval (s)"
          htmlFor="an-freq"
          error={errs.reportFreq}
          required
        >
          <Input
            id="an-freq"
            type="number"
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
