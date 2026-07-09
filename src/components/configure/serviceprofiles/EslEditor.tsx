/**
 * ESL Profile editor (BUILD SPEC 2b · add-edit-esl.html). Single section,
 * no conditionals: Name (required+unique) / Port (1-65535, default 7354) /
 * FQDN (required; hostname syntax). Read-only when canEdit === false.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow } from '../_kit';
import type { EslProfile } from '../../../types/configure';
import { RE_HOST, intIn, nameError, noErrors, type NamedRecord } from './profileModel';

export interface EslEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: EslProfile | null;
  seed: EslProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<EslProfile>, id?: string) => void | Promise<void>;
}

export function EslEditor({ open, onOpenChange, record, seed, rows, saving, onSave }: EslEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<EslProfile>(() => structuredClone(record ?? seed));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;
  const upd = (patch: Partial<EslProfile>) => setForm((p) => ({ ...p, ...patch }));

  const errs = useMemo(
    () => ({
      name: nameError(rows, form),
      port: intIn(form.port, 1, 65535) ? null : 'Port must be an integer between 1 and 65535',
      fqdn: !form.fqdn
        ? 'FQDN is required'
        : RE_HOST.test(form.fqdn)
          ? null
          : 'Enter a valid FQDN',
    }),
    [rows, form]
  );
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create ESL Profile' : form.name || 'Edit ESL Profile'}
      description="Electronic Shelf Label profile (/v3/eslprofile)"
      width={700}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form, record?.id)}
    >
      <div className="max-w-[560px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="esl-name" error={dirty ? errs.name : null} required>
          <Input
            id="esl-name"
            value={form.name ?? ''}
            disabled={ro}
            onChange={(e) => upd({ name: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow label="Port" htmlFor="esl-port" error={errs.port} required>
          <Input
            id="esl-port"
            type="number"
            value={form.port ?? ''}
            disabled={ro}
            onChange={(e) => upd({ port: e.target.value === '' ? (NaN as number) : Number(e.target.value) })}
            className="max-w-[160px]"
          />
        </FieldRow>
        <FieldRow label="FQDN" htmlFor="esl-fqdn" error={dirty ? errs.fqdn : null} required>
          <Input
            id="esl-fqdn"
            value={form.fqdn ?? ''}
            disabled={ro}
            placeholder="esl.example.com"
            onChange={(e) => upd({ fqdn: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
      </div>
    </EditorSheet>
  );
}
