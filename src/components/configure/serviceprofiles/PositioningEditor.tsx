/**
 * Positioning Profile editor (BUILD SPEC 4b · add-edit-positioning.html).
 * Name + Collection. Controller-exact option set (resolved from the
 * positioning JS bundle): Off / ActiveClients / AllClients.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { EditorSheet, FieldRow } from '../_kit';
import type { PositioningProfile } from '../../../types/configure';
import { nameError, noErrors, type NamedRecord } from './profileModel';

export const POS_COLLECTIONS: { id: string; label: string }[] = [
  { id: 'Off', label: 'Off' },
  { id: 'ActiveClients', label: 'Active Clients' },
  { id: 'AllClients', label: 'All Clients' },
];

export interface PositioningEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PositioningProfile | null;
  seed: PositioningProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<PositioningProfile>, id?: string) => void | Promise<void>;
}

export function PositioningEditor({
  open,
  onOpenChange,
  record,
  seed,
  rows,
  saving,
  onSave,
}: PositioningEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const [form, setForm] = useState<PositioningProfile>(() => structuredClone(record ?? seed));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJson.current;
  const upd = (patch: Partial<PositioningProfile>) => setForm((p) => ({ ...p, ...patch }));

  const errs = useMemo(
    () => ({
      name: nameError(rows, form),
      collection: form.collection ? null : 'Collection is required',
    }),
    [rows, form]
  );
  const valid = noErrors(errs) && !ro;

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create Positioning Profile' : form.name || 'Edit Positioning Profile'}
      description="Positioning profile (/v3/positioning)"
      width={700}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={() => onSave(form, record?.id)}
    >
      <div className="max-w-[560px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="pos-name" error={dirty ? errs.name : null} required>
          <Input
            id="pos-name"
            value={form.name ?? ''}
            disabled={ro}
            onChange={(e) => upd({ name: e.target.value })}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow label="Collection" error={errs.collection} required>
          <Select
            value={form.collection || 'Off'}
            disabled={ro}
            onValueChange={(v) => upd({ collection: v })}
          >
            <SelectTrigger className="max-w-[320px]" aria-label="Collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POS_COLLECTIONS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
    </EditorSheet>
  );
}
